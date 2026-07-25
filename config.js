// Backend API — reverse proxy on a RU VPS (Timeweb) -> Railway backend.
// Railway's edge IPs are not routable from many RU ISPs without a VPN, so we
// go through api.loza-club.ru which proxies to loza-backend-production.up.railway.app.
window.__LOZA_API_URL__ = window.__LOZA_API_URL__ || 'https://api.loza-club.ru/api';
// All static images are local WebP under /assets/webp/ on GitHub Pages.
// Do NOT point this at a remote host — mobile RU networks often can't reach it.
window.__LOZA_FRONTEND_BASE__ = window.__LOZA_FRONTEND_BASE__ || '';