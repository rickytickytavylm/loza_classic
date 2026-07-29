/* global window */
(function () {
  const TOKEN_KEY = 'loza_session_token';
  const GUEST_KEY = 'loza_chat_guest_id';

  function normalizeApiUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
    url = url.replace(/\/+$/, '');
    if (!/\/api$/i.test(url)) url = `${url}/api`;
    return url;
  }

  const API_URL = normalizeApiUrl(window.__LOZA_API_URL__) || 'https://api.loza-club.ru/api';
  const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  function getGuestId() {
    try {
      let value = localStorage.getItem(GUEST_KEY);
      if (!value) {
        value = globalThis.crypto?.randomUUID?.()
          || `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(GUEST_KEY, value);
      }
      return value;
    } catch {
      return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  async function request(path, init) {
    const response = await fetch(`${API_URL}${path}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(init && init.headers ? init.headers : {}),
      },
      ...init,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `API ${response.status}`);
    }
    return response.json();
  }

  window.LOZA_API = {
    API_URL,
    API_ORIGIN,
    yandexLoginUrl: `${API_ORIGIN}/api/auth/yandex`,
    getToken,
    setToken,
    getGuestId,
    me: () => request('/me'),
    acceptConsents: (payload) =>
      request('/me/consents', { method: 'PATCH', body: JSON.stringify(payload) }),
    logout: () => request('/auth/logout', { method: 'POST', body: '{}' }),
    deleteAccount: () => request('/me', { method: 'DELETE' }),
    publicConfig: () => request('/config/public'),
    content: () => request('/content'),
    feedComments: (postId) => request(`/feed/${postId}/comments`),
    feed: () => request('/feed'),
    addFeedComment: (postId, body) =>
      request(`/feed/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    chatRooms: () => request(`/chat/rooms?guestId=${encodeURIComponent(getGuestId())}`),
    sendChatMessage: (roomId, body, replyToId) =>
      request(`/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body,
          replyToId: replyToId || undefined,
          guestId: getGuestId(),
        }),
      }),
    editChatMessage: (messageId, body) =>
      request(`/chat/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body, guestId: getGuestId() }),
      }),
    deleteChatMessage: (messageId) =>
      request(`/chat/messages/${messageId}`, {
        method: 'DELETE',
        body: JSON.stringify({ guestId: getGuestId() }),
      }),
    toggleChatReaction: (messageId, emoji) =>
      request(`/chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji, guestId: getGuestId() }),
      }),
    chatStreamUrl: () => {
      const params = new URLSearchParams({ guestId: getGuestId() });
      // EventSource cannot send headers, and Safari blocks third-party cookies.
      if (getToken()) params.set('access_token', getToken());
      return `${API_URL}/chat/stream?${params.toString()}`;
    },
    createPayment: (planCode, returnUrl) =>
      request('/payments/yookassa/create', {
        method: 'POST',
        body: JSON.stringify({ planCode, returnUrl }),
      }),
    paymentStatus: (paymentId) => request(`/payments/${paymentId}/status`),
    completeMockPayment: (paymentId) =>
      request(`/payments/yookassa/mock-complete/${paymentId}`, {
        method: 'POST',
        body: '{}',
      }),
    askAiPublic: (messages, signal) =>
      fetch(`${API_ORIGIN}/api/ai/chat/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ messages }),
        signal,
      }).then(async (r) => {
        if (!r.ok) {
          const p = await r.json().catch(() => ({}));
          throw new Error(p.error || 'AI_ERROR');
        }
        return r.json();
      }),
    async askAiStream(messages, onEvent, signal) {
      const authed = Boolean(getToken());
      const path = authed ? '/ai/chat/stream' : '/ai/chat/public/stream';
      const response = await fetch(`${API_ORIGIN}/api${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(authed ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ messages }),
        signal,
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        const err = new Error(payload.error || 'AI_STREAM_ERROR');
        err.code = payload.error;
        err.meta = payload;
        throw err;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';

      const emit = (block) => {
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          if (!line.startsWith('data:')) continue;
          const payload = JSON.parse(line.slice(5).trim());
          onEvent(eventName, payload);
          eventName = 'message';
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop();
        blocks.filter(Boolean).forEach(emit);
        if (done) break;
      }
      if (buffer.trim()) emit(buffer);
    },
    askAiPublicStream(messages, onEvent, signal) {
      return this.askAiStream(messages, onEvent, signal);
    },
  };
})();
