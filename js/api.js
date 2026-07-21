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

  const API_URL = normalizeApiUrl(window.__LOZA_API_URL__) || 'https://loza-backend-production.up.railway.app/api';
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
    getToken,
    setToken,
    getGuestId,
    me: () => request('/me'),
    publicConfig: () => request('/config/public'),
    content: () => request('/content'),
    feedComments: (postId) => request(`/feed/${postId}/comments`),
    feed: () => request('/feed'),
    addFeedComment: (postId, body) =>
      request(`/feed/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    chatRooms: () => request('/chat/rooms'),
    sendChatMessage: (roomId, body) =>
      request(`/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body, guestId: getGuestId() }),
      }),
    chatStreamUrl: () => `${API_URL}/chat/stream`,
    askAiPublic: (messages) =>
      fetch(`${API_ORIGIN}/api/ai/chat/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ messages }),
      }).then(async (r) => {
        if (!r.ok) {
          const p = await r.json().catch(() => ({}));
          throw new Error(p.error || 'AI_ERROR');
        }
        return r.json();
      }),
  };
})();
