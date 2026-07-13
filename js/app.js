/* global LOZA_DATA, LOZA_API, LOZA_MEDIA */
(function () {
  const D = window.LOZA_DATA;
  const API = window.LOZA_API;
  const M = window.LOZA_MEDIA;
  const ASSET_BASE = window.__LOZA_FRONTEND_BASE__ || '';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function asset(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${ASSET_BASE}${path}`;
  }

  // Render a lucide-style SVG icon by name (matches React lucide-react icons)
  function ic(name, size = 24, opts = {}) {
    const paths = D.ICON_PATHS[name];
    if (!paths) return '';
    const fill = opts.fill || 'none';
    const sw = opts.strokeWidth || 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  const state = {
    tab: 'home',
    booting: true,
    selectedItemId: '',
    feedPosts: [...D.FEED_POSTS],
    librarySections: [...D.LIBRARY_SECTIONS],
    libraryItems: [...D.LIBRARY_ITEMS],
    movies: [...D.MOVIES],
    chatRooms: [],
    chatView: 'rooms',
    selectedRoomId: '',
    chatBg: localStorage.getItem('chat-bg') || 'aurora',
    mediaSection: 'all',
    mediaQuery: '',
    mediaLikes: JSON.parse(localStorage.getItem('media-likes') || '[]'),
    aiMessages: [],
    aiSending: false,
    feedLikes: {},
    feedComments: {},
  };

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pseudoLikes(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return 178 + (hash % 177);
  }

  function formatFeedTime(v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function sectionTitle(id) {
    return D.LIBRARY_SECTIONS.find((s) => s.id === id)?.title || id;
  }

  function bgImage(i) {
    return asset(D.EDITORIAL_BACKGROUNDS[Math.abs(i) % D.EDITORIAL_BACKGROUNDS.length]);
  }

  function setImmersive() {
    const app = $('#app');
    app.classList.toggle('immersive-ai', state.tab === 'ai');
    app.classList.toggle('immersive-chat', state.tab === 'chat' && state.chatView === 'thread');
  }

  function setTab(tab) {
    state.tab = tab;
    state.selectedItemId = '';
    document.body.classList.remove('material-immersive-open');
    $('#portal').innerHTML = '';
    if (tab !== 'chat') {
      state.chatView = 'rooms';
      state.selectedRoomId = '';
    }
    const shell = $('#page-shell');
    shell.scrollTop = 0;
    shell.className = 'page-shell' + (
      tab === 'media' ? ' page-shell-media'
        : tab === 'feed' ? ' page-shell-feed'
          : tab === 'movies' ? ' page-shell-movies'
            : tab === 'ai' ? ' page-shell-ai'
              : tab === 'chat' ? ' page-shell-chat' : ''
    );
    shell.setAttribute('aria-label', D.TAB_TITLES[tab] || tab);
    renderNav();
    renderScreen();
    setImmersive();
  }

  function renderNav() {
    const desk = $('#desktop-nav');
    const mobile = $('#mobile-nav');
    desk.innerHTML = D.NAV.map((n) =>
      `<button type="button" class="${state.tab === n.id ? 'active' : ''}" data-tab="${n.id}">${esc(n.label)}</button>`,
    ).join('');
    mobile.innerHTML = D.NAV.map((n) =>
      `<button type="button" class="${state.tab === n.id ? 'active' : ''}" data-tab="${n.id}">${ic(n.id, 20)}<span>${esc(n.label)}</span></button>`,
    ).join('');
    $$('[data-tab]').forEach((btn) => {
      btn.onclick = () => setTab(btn.dataset.tab);
    });
    const initial = 'В';
    $('#header-initial').textContent = initial;
  }

  function renderScreen() {
    const shell = $('#page-shell');
    if (state.selectedItemId) {
      const item = state.libraryItems.find((x) => x.id === state.selectedItemId);
      if (item) {
        if (M.itemHasMediaLayout(item)) {
          $('#portal').innerHTML = renderMaterialDetail(item);
          bindMaterialDetail($('#portal'), item);
          document.body.classList.add('material-immersive-open');
          return;
        }
        $('#portal').innerHTML = '';
        document.body.classList.remove('material-immersive-open');
        shell.innerHTML = renderMaterialDetail(item);
        bindMaterialDetail(shell, item);
        return;
      }
      state.selectedItemId = '';
      document.body.classList.remove('material-immersive-open');
      $('#portal').innerHTML = '';
    }
    switch (state.tab) {
      case 'home': shell.innerHTML = renderHome(); bindHome(shell); break;
      case 'feed': shell.innerHTML = renderFeed(); bindFeed(shell); break;
      case 'media': shell.innerHTML = renderMedia(); bindMedia(shell); break;
      case 'chat': shell.innerHTML = renderChat(); bindChat(shell); break;
      case 'movies': shell.innerHTML = renderMovies(); bindMovies(shell); break;
      case 'ai': shell.innerHTML = renderAi(); bindAi(shell); break;
      case 'profile': shell.innerHTML = renderProfile(); bindProfile(shell); break;
      default: shell.innerHTML = '';
    }
  }

  function renderHome() {
    const cards = state.libraryItems.slice(0, 3).map((item, i) => `
      <article class="editorial-card">
        <div class="editorial-card-art" style="background-image:url(${bgImage(i + 2)})"></div>
        <div class="editorial-card-body">
          <span class="editorial-kicker">${i === 0 ? 'Новое в клубе' : 'Материал дня'}</span>
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.description || '')}</p>
        </div>
        <footer class="editorial-card-footer">
          <img alt="" class="editorial-icon" src="${asset('/images/new_logo.png')}" />
          <div class="editorial-meta"><strong>${esc(item.meta || '')}</strong><span>${item.kind === 'video' ? 'Видеоответ' : item.kind === 'audio' ? 'Аудио' : 'Текст'}</span></div>
          <button class="editorial-cta" type="button" data-open-media="${esc(item.id)}">Читать</button>
        </footer>
      </article>`).join('');

    return `<div class="stack">
      <section class="hero glass-panel">
        <div class="hero-copy">
          <div class="eyebrow">Психологический клуб для родителей</div>
          <h1>Бережная опора, когда подростковый возраст становится штормом.</h1>
          <p>Лекции, разборы и практики от психологов клуба, киноклуб и живой чат с родителями, которые проходят через то же самое.</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-tab-link="media">Открыть медиатеку ${ic('arrowRight', 18)}</button>
            <button class="secondary-button" type="button" data-tab-link="feed">Смотреть ленту</button>
          </div>
        </div>
        <div class="hero-art">
          <img src="${asset('/images/hero_section-logo.png')}" alt="Лоза" />
          <div class="hero-note">${ic('shieldCheck', 18)} Лента и превью открыты</div>
        </div>
      </section>
      <section class="section">
        <header class="section-header"><span>Сегодня для вас</span><h2>Материалы, которые помогают не срываться в контроль</h2></header>
        <div class="editorial-rail editorial-rail-featured">${cards}</div>
      </section>
    </div>`;
  }

  function bindHome(root) {
    $$('[data-tab-link]', root).forEach((b) => { b.onclick = () => setTab(b.dataset.tabLink); });
    $$('[data-open-media]', root).forEach((b) => {
      b.onclick = () => openItem(b.dataset.openMedia);
    });
  }

  function renderFeed() {
    const posts = state.feedPosts.map((post, index) => {
      const liked = state.feedLikes[post.id];
      const likes = (liked ? pseudoLikes(post.id) + 1 : pseudoLikes(post.id));
      const comments = (state.feedComments[post.id] || []).length + (post.comments || 0);
      const image = asset(post.imageUrl) || bgImage(index);
      return `<article class="insta-post" data-post="${esc(post.id)}">
        <header class="insta-post-head">
          <div class="insta-post-avatar">${esc((post.authorName || post.author || '?')[0])}</div>
          <div class="insta-post-meta"><strong>${esc(post.authorName || post.author)}</strong><span>${esc(post.authorRole || 'клуб Лозы')} · ${formatFeedTime(post.createdAt || post.time)}</span></div>
        </header>
        <div class="insta-post-media"><img alt="" src="${esc(image)}" loading="lazy" /></div>
        <div class="insta-post-actions">
          <button class="insta-action${liked ? ' insta-liked' : ''}" type="button" data-like="${esc(post.id)}">${ic('heart', 24, { fill: liked ? 'currentColor' : 'none' })}<span>${likes}</span></button>
          <button class="insta-action" type="button" data-comments="${esc(post.id)}">${ic('messageCircle', 24)}<span>${comments}</span></button>
          <button class="insta-action insta-action-share" type="button" data-share="${esc(post.id)}">${ic('send', 24)}</button>
        </div>
        <div class="insta-post-caption"><strong>${esc(post.authorName || post.author)}</strong> ${esc(post.body || post.text).replace(/\n/g, '<br>')}</div>
      </article>`;
    }).join('');
    return `<div class="feed-page"><div class="feed-list insta-feed">${posts}</div></div>`;
  }

  function bindFeed(root) {
    $$('[data-like]', root).forEach((b) => {
      b.onclick = () => { state.feedLikes[b.dataset.like] = !state.feedLikes[b.dataset.like]; renderScreen(); };
    });
    $$('[data-comments]', root).forEach((b) => {
      b.onclick = () => openComments(b.dataset.comments);
    });
    $$('[data-share]', root).forEach((b) => {
      b.onclick = () => {
        const post = state.feedPosts.find((p) => p.id === b.dataset.share);
        if (post && navigator.share) navigator.share({ title: 'Лоза', text: (post.body || post.text || '').slice(0, 300) }).catch(() => {});
      };
    });
  }

  function openComments(postId) {
    const post = state.feedPosts.find((p) => p.id === postId);
    if (!post) return;
    const list = (state.feedComments[postId] || []).map((c) =>
      `<li class="comments-item"><div class="comments-item-avatar">${esc(c.author[0])}</div><div class="comments-item-copy"><strong>${esc(c.author)}</strong><p>${esc(c.body)}</p></div></li>`,
    ).join('');
    $('#portal').innerHTML = `<div class="comments-backdrop" id="modal-close">
      <div class="comments-sheet" onclick="event.stopPropagation()">
        <div class="comments-sheet-handle"></div>
        <div class="comments-sheet-header"><span class="comments-sheet-title">Комментарии</span><button class="comments-sheet-close" type="button" id="modal-x">${ic('x', 20)}</button></div>
        <div class="comments-sheet-body">${list ? `<ul class="comments-list">${list}</ul>` : `<div class="comments-empty">${ic('messageCircle', 40, { strokeWidth: 1.5 })}<p>Пока нет комментариев</p><span>Будьте первым</span></div>`}</div>
        <form class="comments-sheet-input" id="comment-form"><input placeholder="Написать комментарий…" id="comment-draft" /><button type="submit">${ic('send', 18)}</button></form>
      </div></div>`;
    $('#modal-close').onclick = closePortal;
    $('#modal-x').onclick = closePortal;
    $('#comment-form').onsubmit = (e) => {
      e.preventDefault();
      const body = $('#comment-draft').value.trim();
      if (!body) return;
      if (!state.feedComments[postId]) state.feedComments[postId] = [];
      state.feedComments[postId].push({ id: `l-${Date.now()}`, author: 'Вы', body });
      API.addFeedComment(postId, body).catch(() => {});
      closePortal();
      renderScreen();
    };
  }

  function renderMedia() {
    const cats = Object.entries(D.MEDIA_SECTION_LABELS).map(([id, label]) =>
      `<button type="button" class="${state.mediaSection === id ? 'active' : ''}" data-cat="${id}">${label}</button>`,
    ).join('');
    const items = state.libraryItems.filter((item) => {
      const sec = state.mediaSection === 'all' || item.sectionId === state.mediaSection;
      const q = state.mediaQuery.trim().toLowerCase();
      const query = !q || `${item.title} ${item.meta} ${item.description}`.toLowerCase().includes(q);
      return sec && query;
    });
    const cards = items.map((item, i) => {
      const liked = state.mediaLikes.includes(item.id);
      const kind = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Текст';
      return `<article class="media-feed-card" data-item="${esc(item.id)}">
        <div class="media-feed-card-head"><img class="media-feed-card-logo" src="${asset('/images/new_logo.png')}" alt="" /><span>Лоза · ${esc(sectionTitle(item.sectionId))} · ${kind}</span></div>
        <button class="media-feed-card-visual" type="button" data-open-item="${esc(item.id)}"><img alt="" src="${bgImage(i)}" loading="lazy" /></button>
        <button class="media-feed-card-title" type="button" data-open-item="${esc(item.id)}">${esc(item.title)}</button>
        <p class="media-feed-card-desc">${esc(item.description || '')}</p>
        <div class="media-feed-card-actions">
          <button type="button" data-open-item="${esc(item.id)}">${ic('play', 18)}<span>Открыть</span></button>
          <button class="${liked ? 'media-action-liked' : ''}" type="button" data-like-item="${esc(item.id)}">${ic('heart', 18, { fill: liked ? 'currentColor' : 'none' })}</button>
          <button type="button" data-share-item="${esc(item.id)}">${ic('share2', 18)}</button>
        </div>
      </article>`;
    }).join('');
    return `<div class="media-feed-page">
      <div class="media-feed-controls">
        <label class="media-feed-search"><span>${ic('search', 18)}</span><input placeholder="Поиск материалов…" value="${esc(state.mediaQuery)}" id="media-search" /><button type="button" id="media-clear" ${state.mediaQuery ? '' : 'hidden'}>${ic('x', 16)}</button></label>
        <div class="media-feed-categories">${cats}</div>
      </div>
      <div class="media-feed-scroll"><div class="media-feed-list">${cards || '<div class="media-feed-empty"><p>Ничего не найдено</p></div>'}</div></div>
    </div>`;
  }

  function bindMedia(root) {
    const search = $('#media-search', root);
    if (search) {
      search.oninput = () => { state.mediaQuery = search.value; renderScreen(); };
    }
    $('#media-clear', root)?.addEventListener('click', () => { state.mediaQuery = ''; renderScreen(); });
    $$('[data-cat]', root).forEach((b) => { b.onclick = () => { state.mediaSection = b.dataset.cat; renderScreen(); }; });
    $$('[data-like-item]', root).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.likeItem;
        if (state.mediaLikes.includes(id)) state.mediaLikes = state.mediaLikes.filter((x) => x !== id);
        else state.mediaLikes.push(id);
        localStorage.setItem('media-likes', JSON.stringify(state.mediaLikes));
        renderScreen();
      };
    });
    $$('[data-open-item]', root).forEach((b) => {
      b.onclick = () => openItem(b.dataset.openItem);
    });
    $$('[data-share-item]', root).forEach((b) => {
      b.onclick = () => {
        const item = state.libraryItems.find((x) => x.id === b.dataset.shareItem);
        if (item && navigator.share) navigator.share({ title: item.title, text: `${item.title} — Лоза` }).catch(() => {});
      };
    });
  }

  function openItem(id) {
    const item = state.libraryItems.find((x) => x.id === id);
    if (!item) return;
    if (item.kind === 'audio' && M.resolveAudioUrl(item)) {
      openAudioPlayerModal(item);
      return;
    }
    state.selectedItemId = id;
    $('#page-shell').scrollTop = 0;
    renderScreen();
  }

  function closeMaterial() {
    state.selectedItemId = '';
    document.body.classList.remove('material-immersive-open');
    $('#portal').innerHTML = '';
    renderScreen();
  }

  function materialBodyHtml(text) {
    return esc(text).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  }

  function renderMaterialMedia(item, immersive) {
    const kinescopeEmbedUrl = item.mediaUrl && item.mediaUrl.includes('kinescope.io')
      ? M.kinescopeEmbed(item.mediaUrl)
      : '';
    const audioUrl = item.kind === 'audio' ? M.resolveAudioUrl(item) : '';
    const frameClass = immersive ? 'video-frame material-video material-video-immersive' : 'video-frame material-video';

    if (kinescopeEmbedUrl) {
      return `<div class="${frameClass}"><iframe allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen src="${esc(kinescopeEmbedUrl)}" title="${esc(M.cleanDisplayText(item.title))}"></iframe></div>`;
    }
    if (audioUrl) {
      const title = esc(M.cleanDisplayText(item.title));
      const meta = esc(M.cleanDisplayText(item.meta) || 'Аудио клуба');
      return `<button class="music-card" type="button" id="material-audio-open"><div class="music-card-art">${ic('audioLines', 28)}</div><div class="music-card-info"><strong>${title}</strong><span>${meta}</span></div><div class="music-card-play-btn">${ic('play', 18)}</div></button>`;
    }
    const phClass = immersive ? 'media-placeholder media-placeholder-immersive' : 'media-placeholder';
    return `<div class="${phClass}">${ic('play', 28)}<h3>${item.kind === 'audio' ? 'Аудио недоступно' : 'Видео скоро появится'}</h3><p>Текст и описание материала доступны ниже.</p></div>`;
  }

  function renderMaterialDetail(item) {
    const hasMediaLayout = M.itemHasMediaLayout(item);
    const materialBody = M.getMaterialBody(item);
    const materialSummary = M.getMaterialSummary(item);
    const displayTitle = esc(M.cleanDisplayText(item.title));
    const displayMeta = esc(M.cleanDisplayText(item.meta));
    const kindLabel = item.kind === 'video' ? 'Видеоответ' : item.kind === 'audio' ? 'Аудиоответ' : 'Текст';
    const questionChip = item.questionNumber ? `<small>Вопрос ${esc(item.questionNumber)}</small>` : '';
    const bodyParagraphs = `<p>${materialBodyHtml(materialBody)}</p>`;

    if (hasMediaLayout) {
      return `<div class="material-page material-page-immersive">
        <div class="material-immersive-media">${renderMaterialMedia(item, true)}</div>
        <div class="material-immersive-body">
          <button class="glass-back-btn" type="button" id="material-back">${ic('chevronLeft', 18)} Назад</button>
          <span class="material-kicker">${displayMeta}</span>
          <h1>${displayTitle}</h1>
          <p>${esc(materialSummary)}</p>
          <div class="material-chips"><small>${kindLabel}</small>${questionChip}</div>
          <section class="material-section material-section-plain">
            <h2>${item.kind === 'audio' ? 'О подкасте' : 'Описание'}</h2>
            ${bodyParagraphs}
          </section>
        </div>
      </div>`;
    }

    return `<div class="material-page">
      <button class="detail-back" type="button" id="material-back">← Назад в медиатеку</button>
      <section class="material-hero glass-panel">
        <span>${displayMeta}</span>
        <h1>${displayTitle}</h1>
        <p>${esc(materialSummary)}</p>
        <div class="material-chips"><small>${kindLabel}</small>${questionChip}</div>
      </section>
      <section class="material-section glass-card">
        <h2>Описание материала</h2>
        ${bodyParagraphs}
      </section>
      <section class="material-section glass-card">
        <h2>Медиа</h2>
        ${renderMaterialMedia(item, false)}
      </section>
    </div>`;
  }

  function bindMaterialDetail(root, item) {
    $('#material-back', root)?.addEventListener('click', closeMaterial);
    $('#material-audio-open', root)?.addEventListener('click', () => openAudioPlayerModal(item));
  }

  function openAudioPlayerModal(item) {
    const src = M.resolveAudioUrl(item);
    if (!src) return;
    const title = esc(M.cleanDisplayText(item.title));
    const meta = esc(M.cleanDisplayText(item.meta) || 'Аудио клуба');
    const subtitle = item.sectionId === 'podcasts' ? 'Подкаст закрытого клуба' : 'Аудиоответ эксперта';
    const bgImage = bgImageForItem(item.id);

    $('#portal').innerHTML = `<div class="audio-modal-backdrop" id="modal-close">
      <div class="audio-modal" role="dialog" aria-modal="true" aria-label="${title}" onclick="event.stopPropagation()">
        <audio id="audio-player-el" preload="metadata" src="${esc(src)}"></audio>
        <div class="audio-modal-bg" style="background-image:url(${esc(bgImage)})"></div>
        <div class="audio-modal-overlay"></div>
        <div class="audio-modal-content">
          <button class="audio-modal-close" type="button" id="modal-x">${ic('chevronDown', 26)}</button>
          <div class="audio-modal-art">${ic('audioLines', 64)}</div>
          <div class="audio-modal-info"><span>${meta}</span><h2>${title}</h2><p>${subtitle}</p></div>
          <div class="audio-modal-controls" id="audio-controls">
            <input aria-label="Перемотка" class="audio-modal-seek" id="audio-seek" max="100" min="0" type="range" value="0" />
            <div class="audio-modal-times"><span id="audio-time-current">0:00</span><span id="audio-time-duration">0:00</span></div>
            <button aria-label="Воспроизвести" class="audio-modal-play-btn" id="audio-play" type="button">${ic('play', 34)}</button>
          </div>
          <div class="audio-modal-error" id="audio-error" hidden>
            <p>Не удалось загрузить аудио. Проверьте доступность файлов в хранилище.</p>
            <a href="${esc(src)}" rel="noreferrer" target="_blank">Открыть напрямую ↗</a>
          </div>
        </div>
      </div>
    </div>`;

    bindModalClose();
    bindAudioPlayer(item);
  }

  function bgImageForItem(id) {
    let hash = 0;
    for (let i = 0; i < (id || '').length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return asset(D.EDITORIAL_BACKGROUNDS[hash % D.EDITORIAL_BACKGROUNDS.length]);
  }

  function bindAudioPlayer(item) {
    const audio = $('#audio-player-el');
    const seek = $('#audio-seek');
    const playBtn = $('#audio-play');
    const timeCurrent = $('#audio-time-current');
    const timeDuration = $('#audio-time-duration');
    const controls = $('#audio-controls');
    const errorBox = $('#audio-error');
    if (!audio || !seek || !playBtn) return;

    let isPlaying = false;

    function showError() {
      if (controls) controls.hidden = true;
      if (errorBox) errorBox.hidden = false;
    }

    function syncUi() {
      const duration = audio.duration || 0;
      const current = audio.currentTime || 0;
      seek.max = String(duration || 100);
      seek.value = String(current);
      timeCurrent.textContent = M.formatAudioTime(current);
      timeDuration.textContent = M.formatAudioTime(duration);
      playBtn.innerHTML = isPlaying ? ic('pause', 34) : ic('play', 34);
      playBtn.setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
    }

    audio.addEventListener('loadedmetadata', syncUi);
    audio.addEventListener('timeupdate', syncUi);
    audio.addEventListener('play', () => { isPlaying = true; syncUi(); });
    audio.addEventListener('pause', () => { isPlaying = false; syncUi(); });
    audio.addEventListener('ended', () => { isPlaying = false; audio.currentTime = 0; syncUi(); });
    audio.addEventListener('error', showError);

    seek.addEventListener('input', () => {
      audio.currentTime = Number(seek.value);
      syncUi();
    });

    playBtn.addEventListener('click', () => {
      if (isPlaying) audio.pause();
      else audio.play().catch(showError);
    });

    audio.play().catch(showError);
    syncUi();
  }

  function renderChat() {
    if (state.chatView === 'thread') {
      const room = state.chatRooms.find((r) => r.id === state.selectedRoomId) || state.chatRooms[0];
      const preset = D.CHAT_BG_PRESETS.find((p) => p.id === state.chatBg) || D.CHAT_BG_PRESETS[0];
      const msgs = (room?.messages || []).map((m) => {
        const mine = Boolean(m.isMe);
        return `<div class="chat-bubble-row ${mine ? 'mine' : 'incoming'}"><div class="chat-bubble ${mine ? 'mine' : 'incoming'}">${!mine ? `<strong>${esc(m.authorName || m.author)}</strong>` : ''}<p>${esc(m.body || m.text)}</p><small>${new Date(m.createdAt || Date.now()).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</small></div></div>`;
      }).join('');
      return `<div class="telegram-chat-layout thread-open"><div class="telegram-thread">
        <header class="telegram-thread-head"><button type="button" id="chat-back">${ic('chevronLeft', 22)}</button><div><strong>${esc(room?.title || 'Чат')}</strong><span>${esc(room?.description || '')}</span></div><button type="button" id="chat-settings">${ic('settings', 20)}</button></header>
        <div class="telegram-messages" style="background:linear-gradient(135deg,${preset.colors.join(',')})">${msgs || '<p class="chat-muted">Напишите первое сообщение.</p>'}</div>
        <form class="telegram-composer" id="chat-form"><input placeholder="Сообщение" id="chat-draft" /><button type="submit">${ic('send', 18)}</button></form>
      </div></div>`;
    }
    const rooms = state.chatRooms.map((room, i) => {
      const last = room.messages?.[room.messages.length - 1];
      return `<button type="button" class="telegram-room${room.id === state.selectedRoomId ? ' active' : ''}" data-room="${esc(room.id)}">
        <img class="telegram-room-avatar" src="${bgImage(i)}" alt="" />
        <div><strong>${esc(room.title)}</strong><span>${esc(last?.body || last?.text || 'Нет сообщений')}</span></div>
      </button>`;
    }).join('');
    return `<div class="telegram-chat-layout rooms-open"><aside class="telegram-room-list">
      <div class="telegram-room-list-head"><img class="telegram-room-list-logo" src="${asset('/images/new_logo.png')}" alt="" /><h2>Чаты клуба</h2></div>
      ${rooms || '<p class="chat-muted">Загружаем комнаты…</p>'}
    </aside></div>`;
  }

  function bindChat(root) {
    $$('[data-room]', root).forEach((b) => {
      b.onclick = () => { state.selectedRoomId = b.dataset.room; state.chatView = 'thread'; renderScreen(); setImmersive(); };
    });
    $('#chat-back', root)?.addEventListener('click', () => { state.chatView = 'rooms'; renderScreen(); setImmersive(); });
    $('#chat-settings', root)?.addEventListener('click', () => openChatBgPicker());
    $('#chat-form', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = $('#chat-draft', root)?.value.trim();
      if (!body || !state.selectedRoomId) return;
      try {
        await API.sendChatMessage(state.selectedRoomId, body);
        await loadChatRooms();
        renderScreen();
      } catch {
        /* ignore */
      }
    });
  }

  function openChatBgPicker() {
    const swatches = D.CHAT_BG_PRESETS.map((p) =>
      `<button type="button" class="chat-bg-swatch${state.chatBg === p.id ? ' active' : ''}" data-bg="${p.id}" style="background:linear-gradient(135deg,${p.colors.join(',')})">${esc(p.label)}</button>`,
    ).join('');
    $('#portal').innerHTML = `<div class="player-backdrop" id="modal-close"><section class="chat-bg-picker glass-panel" onclick="event.stopPropagation()">
      <h3>Настройки чата</h3><p>Фон сообщений</p><div class="chat-bg-grid">${swatches}</div>
    </section></div>`;
    bindModalClose();
    $$('[data-bg]', $('#portal')).forEach((b) => {
      b.onclick = () => { state.chatBg = b.dataset.bg; localStorage.setItem('chat-bg', state.chatBg); closePortal(); renderScreen(); };
    });
  }

  function renderMovies() {
    const cards = state.movies.map((m, i) => `
      <button class="movie-card" type="button" data-movie="${esc(m.id)}" style="background-image:url('${esc(asset(m.poster) || bgImage(i))}')">
        <div class="movie-card-info"><span>${esc(m.year)}</span><strong>${esc(m.title)}</strong><small>${esc(m.theme)}</small></div>
      </button>`).join('');
    return `<section class="section"><header class="section-header"><span>Киноклуб</span><h2>Фильмы для разговоров с подростками</h2><p>Нажмите на фильм, чтобы открыть описание и вопрос для обсуждения</p></header><div class="movie-grid">${cards}</div></section>`;
  }

  function bindMovies(root) {
    $$('[data-movie]', root).forEach((b) => {
      b.onclick = () => {
        const m = state.movies.find((x) => x.id === b.dataset.movie);
        if (!m) return;
        $('#portal').innerHTML = `<div class="movie-modal-backdrop" id="modal-close"><div class="movie-modal" onclick="event.stopPropagation()">
          <div class="movie-modal-hero" style="background-image:url('${esc(asset(m.poster) || bgImage(0))}')"><button class="movie-modal-close" type="button" id="modal-x">${ic('x', 18)}</button></div>
          <div class="movie-modal-body"><p class="movie-modal-meta">${esc(m.year)} · ${esc(m.theme.toUpperCase())}</p><h2>${esc(m.title)}</h2><p>${esc(m.description)}</p>
          <div class="prompt"><span>Вопрос для обсуждения</span><p>${esc(m.prompt)}</p></div>
          <button class="primary-button" type="button" id="movie-chat">Открыть обсуждение в чате →</button></div></div></div>`;
        bindModalClose();
        $('#movie-chat').onclick = () => { closePortal(); setTab('chat'); };
      };
    });
  }

  function renderAi() {
    const chatting = state.aiMessages.length > 0;
    const hero = !chatting ? `<div class="ai-coach-hero"><span class="eyebrow">AI-наставник Лозы</span><h1>Разбор семейной ситуации с опорой на материалы клуба</h1><p>Опишите ситуацию с подростком — я помогу разложить динамику и предложить бережные шаги.</p></div>` : '';
    const starters = !chatting ? `<div class="ai-starters">${D.AI_STARTERS.map((s) => `<button type="button" data-starter="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
    const msgs = state.aiMessages.map((m, i) => `<article class="ai-message ${m.role}"><span>${m.role === 'assistant' ? 'Лоза AI' : 'Вы'}</span><p>${esc(m.content) || (state.aiSending && i === state.aiMessages.length - 1 ? 'Думаю над ситуацией...' : '')}</p></article>`).join('');
    return `<section class="ai-coach-page">
      <header class="ai-fullscreen-head"><button type="button" data-tab-link="home">${ic('chevronLeft', 22)}</button><div><strong>Лоза AI</strong><span>бережный разбор ситуации</span></div></header>
      <div class="ai-coach-shell${chatting ? ' is-chatting' : ''}">${hero}<div class="ai-chat-window">${msgs}</div>${starters}
      <form class="ai-composer" id="ai-form"><textarea rows="1" placeholder="Сообщение" id="ai-draft"></textarea><button type="submit">${ic('send', 18)}</button></form></div></section>`;
  }

  function bindAi(root) {
    $$('[data-tab-link]', root).forEach((b) => { b.onclick = () => setTab(b.dataset.tabLink); });
    $$('[data-starter]', root).forEach((b) => { b.onclick = () => sendAi(b.dataset.starter); });
    $('#ai-form', root)?.addEventListener('submit', (e) => {
      e.preventDefault();
      sendAi($('#ai-draft', root).value);
      $('#ai-draft', root).value = '';
    });
  }

  async function sendAi(text) {
    const body = String(text || '').trim();
    if (!body || state.aiSending) return;
    state.aiMessages.push({ role: 'user', content: body });
    state.aiMessages.push({ role: 'assistant', content: '' });
    state.aiSending = true;
    renderScreen();
    try {
      const res = await API.askAiPublic(state.aiMessages.slice(-10));
      state.aiMessages[state.aiMessages.length - 1].content = res.answer || '';
    } catch {
      state.aiMessages.pop();
      state.aiMessages.pop();
    } finally {
      state.aiSending = false;
      renderScreen();
    }
  }

  function renderProfile() {
    const plans = D.PLANS.map((p) => `<article class="plan-card"><h3>${esc(p.planName)}</h3><p>${esc(p.description)}</p><strong>${p.priceRub.toLocaleString('ru-RU')} ₽</strong></article>`).join('');
    return `<div class="profile-grid">
      <section class="profile-hero glass-panel"><div class="avatar large">В</div><h1>Гость</h1>
      <p>Вход и оплата будут подключены позже</p>
      </section>
      <section class="profile-plans glass-card"><header class="section-header"><span>Подписка</span><h2>Тарифы клуба</h2></header><div class="plan-grid">${plans}</div></section>
      <section class="profile-links glass-card"><h3>Что открыто без подписки</h3><ul class="profile-free-list"><li>Лента клуба</li><li>Киноклуб</li><li>2 подкаста, превью вопросов, 1 эфир</li></ul><button class="secondary-button" type="button" data-tab-link="feed">Перейти в ленту</button></section>
    </div>`;
  }

  function bindProfile(root) {
    $$('[data-tab-link]', root).forEach((b) => { b.onclick = () => setTab(b.dataset.tabLink); });
  }

  function closePortal() { $('#portal').innerHTML = ''; }
  function bindModalClose() {
    $('#modal-close')?.addEventListener('click', closePortal);
    $('#modal-x')?.addEventListener('click', closePortal);
  }

  async function loadContent() {
    try {
      const data = await API.content();
      if (data.sections) state.librarySections = data.sections;
      if (data.items?.length) state.libraryItems = data.items;
    } catch {
      /* fallback data */
    }
  }

  async function loadFeed() {
    try {
      const data = await API.feed();
      if (data.posts?.length) {
        state.feedPosts = data.posts.map((p) => ({
          id: p.id,
          authorName: p.authorName,
          authorRole: p.authorRole,
          createdAt: p.createdAt,
          body: p.body,
          imageUrl: p.imageUrl,
          likes: p.likes || 0,
          comments: p.comments || 0,
        }));
      }
    } catch {
      /* fallback */
    }
  }

  async function loadChatRooms() {
    try {
      const data = await API.chatRooms();
      state.chatRooms = data.rooms || [];
      if (!state.selectedRoomId && state.chatRooms[0]) state.selectedRoomId = state.chatRooms[0].id;
    } catch {
      state.chatRooms = [];
    }
  }

  async function init() {
    renderNav();
    setTab('home');
    await Promise.all([loadContent(), loadFeed(), loadChatRooms()]);
    renderScreen();
    setTimeout(() => {
      state.booting = false;
      $('#splash')?.remove();
    }, 900);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
