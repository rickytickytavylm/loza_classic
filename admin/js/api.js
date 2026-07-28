/* global window */
(function () {
  const TOKEN_KEY = 'loza_admin_token';

  function normalizeApiUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return 'https://api.loza-club.ru/api';
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
    url = url.replace(/\/+$/, '');
    if (!/\/api$/i.test(url)) url = `${url}/api`;
    return url;
  }

  const API_URL = normalizeApiUrl(window.__LOZA_API_URL__);

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* ignore */ }
  }

  function clearToken() {
    setToken('');
  }

  async function request(path, init) {
    const headers = {
      ...(init && init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(init && init.headers ? init.headers : {}),
    };
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...init,
      headers,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `API ${response.status}`);
    }
    return response.json();
  }

  window.LOZA_ADMIN_API = {
    API_URL,
    getToken,
    setToken,
    clearToken,
    login: async (email, password) => {
      const payload = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (payload.token) setToken(payload.token);
      return payload;
    },
    me: () => request('/me'),
    summary: () => request('/admin/summary'),
    users: () => request('/admin/users'),
    payments: () => request('/admin/payments'),
    chatRooms: () => request('/admin/chat/rooms'),
    createChatRoom: (data) =>
      request('/admin/chat/rooms', { method: 'POST', body: JSON.stringify(data) }),
    updateChatRoom: (roomId, data) =>
      request(`/admin/chat/rooms/${roomId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteChatRoom: (roomId) =>
      request(`/admin/chat/rooms/${roomId}`, { method: 'DELETE' }),
    updateChatMessage: (messageId, data) =>
      request(`/admin/chat/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    deleteChatMessage: (messageId) =>
      request(`/admin/chat/messages/${messageId}`, { method: 'DELETE' }),
    createPost: (data) =>
      request('/feed', { method: 'POST', body: JSON.stringify(data) }),
    uploadImage: async (file) => {
      const body = new FormData();
      body.append('file', file);
      return request('/admin/upload', { method: 'POST', body });
    },
  };
})();
