/* global LOZA_DATA, LOZA_API, LOZA_MEDIA, LOZA_LIBRARY_CONTENT */
(function () {
  const D = window.LOZA_DATA;
  const API = window.LOZA_API;
  const M = window.LOZA_MEDIA;
  const LIBRARY = window.LOZA_LIBRARY_CONTENT || {
    sections: D.LIBRARY_SECTIONS,
    items: D.LIBRARY_ITEMS,
  };
  const ASSET_BASE = window.__LOZA_FRONTEND_BASE__ || '';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function asset(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith('/assets/')) return localAsset(`.${path}`);
    return `${ASSET_BASE}${path}`;
  }

  function localAsset(path) {
    return new URL(path, window.location.href).toString();
  }

  function brandMark(className = '') {
    return `<img class="brand-mark ${className}" src="${localAsset('assets/favicon.png')}" alt="" />`;
  }

  function innerBrand(label) {
    return `<div class="inner-page-brand">${brandMark('inner-page-logo')}<div><strong>Лоза</strong><span>${esc(label)}</span></div></div>`;
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
    selectedMovieId: '',
    feedPosts: [...D.FEED_POSTS],
    librarySections: [...LIBRARY.sections],
    libraryItems: [...LIBRARY.items],
    movies: [...D.MOVIES],
    chatRooms: [],
    chatStream: null,
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

  function roleLabel(role) {
    if (role === 'ADMIN' || role === 'OWNER') return 'команда Лозы';
    if (role === 'CURATOR') return 'куратор клуба';
    if (!role) return 'клуб Лозы';
    return role;
  }

  function isTeamRole(role) {
    return role === 'ADMIN' || role === 'OWNER';
  }

  function sectionTitle(id) {
    return state.librarySections.find((s) => s.id === id)?.title || id;
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
    state.selectedMovieId = '';
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
    if (state.selectedMovieId) {
      const movie = state.movies.find((x) => x.id === state.selectedMovieId);
      if (movie) {
        $('#portal').innerHTML = renderMovieDetail(movie);
        bindMovieDetail($('#portal'), movie);
        document.body.classList.add('material-immersive-open');
        return;
      }
      state.selectedMovieId = '';
      document.body.classList.remove('material-immersive-open');
      $('#portal').innerHTML = '';
    }
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
          <p>${esc(M.getMaterialSummary(item))}</p>
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
      const authorName = post.authorName || post.author || 'Лоза';
      const showBrandLogo = authorName === 'Лоза' || isTeamRole(post.authorRole);
      const liked = state.feedLikes[post.id];
      const likes = (liked ? pseudoLikes(post.id) + 1 : pseudoLikes(post.id));
      const localOnly = (state.feedComments[post.id] || []).filter((c) => String(c.id).startsWith('l-')).length;
      const comments = (post.comments || 0) + localOnly;
      const image = asset(post.imageUrl) || bgImage(index);
      return `<article class="insta-post" data-post="${esc(post.id)}">
        <header class="insta-post-head">
          <div class="insta-post-avatar${showBrandLogo ? ' is-brand' : ''}">${showBrandLogo ? `<img class="insta-post-brand-mark" src="${localAsset('assets/brand-avatar.png')}" alt="Лоза" />` : esc(authorName[0])}</div>
          <div class="insta-post-meta"><strong>${esc(authorName)}</strong><span>${esc(post.authorRole || 'клуб Лозы')} · ${formatFeedTime(post.createdAt || post.time)}</span></div>
        </header>
        <div class="insta-post-media"><img alt="" src="${esc(image)}" loading="lazy" /></div>
        <div class="insta-post-actions">
          <button class="insta-action${liked ? ' insta-liked' : ''}" type="button" data-like="${esc(post.id)}">${ic('heart', 24, { fill: liked ? 'currentColor' : 'none' })}<span>${likes}</span></button>
          <button class="insta-action" type="button" data-comments="${esc(post.id)}">${ic('messageCircle', 24)}<span>${comments}</span></button>
          <button class="insta-action insta-action-share" type="button" data-share="${esc(post.id)}">${ic('send', 24)}</button>
        </div>
        <div class="insta-post-caption"><strong>${esc(authorName)}</strong> ${esc(post.body || post.text).replace(/\n/g, '<br>')}</div>
      </article>`;
    }).join('');
    return `<div class="feed-page"><div class="feed-list insta-feed">${posts}</div></div>`;
  }

  function bindFeed(root) {
    $$('[data-like]', root).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.like;
        const liked = !(state.feedLikes[id]);
        state.feedLikes[id] = liked;
        b.classList.toggle('insta-liked', liked);
        b.innerHTML = `${ic('heart', 24, { fill: liked ? 'currentColor' : 'none' })}<span>${pseudoLikes(id) + (liked ? 1 : 0)}</span>`;
      };
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

  function commentItemHtml(c) {
    const name = c.author || 'Участник клуба';
    return `<li class="comments-item"><div class="comments-item-avatar">${esc((name[0] || '?').toUpperCase())}</div><div class="comments-item-copy"><strong>${esc(name)}</strong><p>${esc(c.body)}</p></div></li>`;
  }

  function renderCommentsBody(postId, loading) {
    const list = (state.feedComments[postId] || []).map(commentItemHtml).join('');
    if (list) return `<ul class="comments-list">${list}</ul>`;
    if (loading) return `<div class="comments-empty">${ic('messageCircle', 40, { strokeWidth: 1.5 })}<p>Загружаем комментарии…</p></div>`;
    return `<div class="comments-empty">${ic('messageCircle', 40, { strokeWidth: 1.5 })}<p>Пока нет комментариев</p><span>Будьте первым</span></div>`;
  }

  async function loadComments(postId) {
    try {
      const data = await API.feedComments(postId);
      const server = (data.comments || []).map((c) => {
        const role = c.author?.role;
        const name = isTeamRole(role) ? 'Лоза' : (c.author?.name || 'Участник клуба');
        return { id: c.id, author: name, body: c.body };
      });
      const local = (state.feedComments[postId] || []).filter((c) => String(c.id).startsWith('l-'));
      state.feedComments[postId] = [...server, ...local];
    } catch {
      /* keep whatever local comments exist */
    }
  }

  function openComments(postId) {
    const post = state.feedPosts.find((p) => p.id === postId);
    if (!post) return;
    const hasServerComments = (post.comments || 0) > 0;
    const needsLoad = hasServerComments && !(state.feedComments[postId] || []).some((c) => !String(c.id).startsWith('l-'));

    $('#portal').innerHTML = `<div class="comments-backdrop" id="modal-close">
      <div class="comments-sheet" onclick="event.stopPropagation()">
        <div class="comments-sheet-handle"></div>
        <div class="comments-sheet-header"><span class="comments-sheet-title">Комментарии</span><button class="comments-sheet-close" type="button" id="modal-x">${ic('x', 20)}</button></div>
        <div class="comments-sheet-body" id="comments-body">${renderCommentsBody(postId, needsLoad)}</div>
        <form class="comments-sheet-input" id="comment-form"><input placeholder="Написать комментарий…" id="comment-draft" /><button type="submit" aria-label="Отправить комментарий">${ic('arrowUp', 18)}</button></form>
      </div></div>`;
    bindModalClose();

    function refreshBody() {
      const body = $('#comments-body');
      if (body) body.innerHTML = renderCommentsBody(postId, false);
    }

    if (needsLoad) loadComments(postId).then(refreshBody);

    $('#comment-form').onsubmit = (e) => {
      e.preventDefault();
      const input = $('#comment-draft');
      const body = input.value.trim();
      if (!body) return;
      if (!state.feedComments[postId]) state.feedComments[postId] = [];
      state.feedComments[postId].push({ id: `l-${Date.now()}`, author: 'Вы', body });
      input.value = '';
      API.addFeedComment(postId, body).catch(() => {});
      refreshBody();
      renderScreen();
    };
  }

  function filteredMediaItems() {
    return state.libraryItems.filter((item) => {
      const sec = state.mediaSection === 'all' || item.sectionId === state.mediaSection;
      const q = state.mediaQuery.trim().toLowerCase();
      const query = !q || `${item.title} ${item.meta} ${item.description}`.toLowerCase().includes(q);
      return sec && query;
    });
  }

  function mediaCardsHtml(items) {
    return items.map((item, i) => {
      const liked = state.mediaLikes.includes(item.id);
      const kind = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Текст';
      return `<article class="media-feed-card" data-item="${esc(item.id)}">
        <div class="media-feed-card-head"><img class="media-feed-card-logo" src="${asset('/images/new_logo.png')}" alt="" /><span>Лоза · ${esc(sectionTitle(item.sectionId))} · ${kind}</span></div>
        <button class="media-feed-card-visual" type="button" data-open-item="${esc(item.id)}"><img alt="" src="${bgImage(i)}" loading="lazy" /></button>
        <button class="media-feed-card-title" type="button" data-open-item="${esc(item.id)}">${esc(item.title)}</button>
      <p class="media-feed-card-desc">${esc(M.getMaterialSummary(item))}</p>
        <div class="media-feed-card-actions">
          <button type="button" data-open-item="${esc(item.id)}">${ic('play', 18)}<span>Открыть</span></button>
          <button class="${liked ? 'media-action-liked' : ''}" type="button" data-like-item="${esc(item.id)}">${ic('heart', 18, { fill: liked ? 'currentColor' : 'none' })}</button>
          <button type="button" data-share-item="${esc(item.id)}">${ic('share2', 18)}</button>
        </div>
      </article>`;
    }).join('');
  }

  function bindMediaCardActions(root) {
    $$('[data-like-item]', root).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.likeItem;
        if (state.mediaLikes.includes(id)) state.mediaLikes = state.mediaLikes.filter((x) => x !== id);
        else state.mediaLikes.push(id);
        localStorage.setItem('media-likes', JSON.stringify(state.mediaLikes));
        // Soft refresh cards only — keep search focus/caret
        refreshMediaResults(root);
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

  function refreshMediaResults(root) {
    const items = filteredMediaItems();
    const list = $('.media-feed-list', root);
    const noteHost = $('.media-feed-search-note', root);
    const header = $('.media-feed-header', root);
    const clearBtn = $('#media-clear', root);
    if (clearBtn) clearBtn.hidden = !state.mediaQuery;
    if (list) {
      list.innerHTML = mediaCardsHtml(items) || '<div class="media-feed-empty"><p>Ничего не найдено</p></div>';
      bindMediaCardActions(list);
    }
    const noteHtml = state.mediaQuery.trim()
      ? `<p class="media-feed-search-note">Найдено ${items.length} материалов по запросу «${esc(state.mediaQuery.trim())}»</p>`
      : '';
    if (noteHost) {
      if (noteHtml) noteHost.outerHTML = noteHtml;
      else noteHost.remove();
    } else if (noteHtml && header) {
      header.insertAdjacentHTML('beforeend', noteHtml);
    }
  }

  function renderMedia() {
    const cats = Object.entries(D.MEDIA_SECTION_LABELS).map(([id, label]) =>
      `<button type="button" class="${state.mediaSection === id ? 'active' : ''}" data-cat="${id}">${label}</button>`,
    ).join('');
    const items = filteredMediaItems();
    const note = state.mediaQuery.trim()
      ? `<p class="media-feed-search-note">Найдено ${items.length} материалов по запросу «${esc(state.mediaQuery.trim())}»</p>`
      : '';
    return `<div class="media-feed-page">
      <div class="media-feed-controls">
        <header class="media-feed-header">
          <label class="media-feed-search media-feed-search-top"><span>${ic('search', 18)}</span><input placeholder="Поиск материалов…" value="${esc(state.mediaQuery)}" id="media-search" autocomplete="off" /><button class="media-feed-search-clear" type="button" id="media-clear" ${state.mediaQuery ? '' : 'hidden'}>${ic('x', 16)}</button></label>
          <nav class="media-feed-categories" aria-label="Разделы медиатеки">${cats}</nav>
          ${note}
        </header>
      </div>
      <div class="media-feed-scroll"><div class="media-feed-list">${mediaCardsHtml(items) || '<div class="media-feed-empty"><p>Ничего не найдено</p></div>'}</div></div>
    </div>`;
  }

  function bindMedia(root) {
    const search = $('#media-search', root);
    if (search) {
      // Soft filter: update list only. Full renderScreen() on every keystroke
      // remounts the input and kicks the keyboard/caret out.
      search.oninput = () => {
        state.mediaQuery = search.value;
        refreshMediaResults(root);
      };
    }
    $('#media-clear', root)?.addEventListener('click', () => {
      state.mediaQuery = '';
      if (search) search.value = '';
      refreshMediaResults(root);
      search?.focus();
    });
    $$('[data-cat]', root).forEach((b) => { b.onclick = () => { state.mediaSection = b.dataset.cat; renderScreen(); }; });
    bindMediaCardActions(root);
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
    return String(text || '').split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${esc(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function innerHeader(label) {
    return `<header class="inner-page-header">
      <button class="inner-page-back" type="button" id="material-back" aria-label="Назад">${ic('chevronLeft', 22)}</button>
      ${innerBrand(label)}
      <span class="inner-page-spacer" aria-hidden="true"></span>
    </header>`;
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

  function materialLessonExtrasHtml(item) {
    if (item.kind !== 'video' && item.kind !== 'audio') return '';
    const duration = M.getMaterialDurationLabel(item);
    const kindLabel = item.kind === 'video' ? 'Видео' : 'Аудио';
    const topics = M.getMaterialTopics(item);
    const takeaways = M.getMaterialTakeaways(item);
    const minutes = parseInt(String(duration).replace(/\D/g, ''), 10) || 12;
    const chips = topics.map((t) => `<small>${esc(t)}</small>`).join('');
    const points = takeaways.map((p) =>
      `<li><span class="material-takeaway-check">${ic('check', 16)}</span><span>${esc(p)}</span></li>`,
    ).join('');
    const ctaLabel = item.kind === 'audio' ? 'Слушать' : 'Смотреть';
    return `
      <div class="material-meta-row">
        <span>${ic('clock', 15)} ${esc(duration)}</span>
        <span>${ic(item.kind === 'audio' ? 'audioLines' : 'play', 15)} ${kindLabel}</span>
      </div>
      <div class="material-chips">${chips}</div>
      <section class="material-takeaways" aria-label="Что узнаете">
        <h2>За ${minutes} минут вы узнаете</h2>
        <ul>${points}</ul>
      </section>
      <button type="button" class="material-cta" id="material-cta">
        <span class="material-cta-copy"><strong>${ctaLabel}</strong></span>
        ${ic('play', 18)}
      </button>`;
  }

  function renderMaterialDetail(item) {
    const hasMediaLayout = M.itemHasMediaLayout(item);
    const materialBody = M.getMaterialBody(item);
    const displayTitle = esc(M.cleanDisplayText(item.title));
    const displayMeta = esc(M.cleanDisplayText(item.meta));
    const kindLabel = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Материал';
    const bodyParagraphs = materialBodyHtml(materialBody);

    if (hasMediaLayout) {
      return `<div class="material-page material-page-immersive">
        ${innerHeader(kindLabel)}
        <div class="material-immersive-media" id="material-player">${renderMaterialMedia(item, true)}</div>
        <div class="material-immersive-body">
          <span class="material-kicker">${displayMeta}</span>
          <h1>${displayTitle}</h1>
          ${materialLessonExtrasHtml(item)}
          <section class="material-section material-section-plain">
            <h2>${item.kind === 'audio' ? 'О выпуске' : 'О материале'}</h2>
            ${bodyParagraphs}
          </section>
        </div>
      </div>`;
    }

    return `<div class="material-page">
      ${innerHeader('Медиатека')}
      <section class="material-hero glass-panel">
        <span>${displayMeta}</span>
        <h1>${displayTitle}</h1>
        <p>${esc(M.getMaterialSummary(item))}</p>
        <small class="material-type-label">${kindLabel}</small>
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
    $('#material-cta', root)?.addEventListener('click', () => {
      if (item.kind === 'audio') {
        openAudioPlayerModal(item);
        return;
      }
      const player = $('#material-player', root) || $('.material-immersive-media', root);
      player?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function openAudioPlayerModal(item) {
    const src = M.resolveAudioUrl(item);
    if (!src) return;
    const title = esc(M.cleanDisplayText(item.title));
    const meta = esc(M.cleanDisplayText(item.meta) || 'Аудио клуба');
    const subtitle = item.sectionId === 'podcasts' ? 'Подкаст закрытого клуба' : 'Аудиоответ эксперта';
    const bgImage = bgImageForItem(item.id);
    const coverImage = audioCoverForItem(item.id);

    $('#portal').innerHTML = `<div class="audio-modal-backdrop" id="modal-close">
      <div class="audio-modal" role="dialog" aria-modal="true" aria-label="${title}" onclick="event.stopPropagation()">
        <audio id="audio-player-el" preload="metadata" src="${esc(src)}"></audio>
        <div class="audio-modal-bg" style="background-image:url(${esc(bgImage)})"></div>
        <div class="audio-modal-overlay"></div>
        <div class="audio-modal-content">
          <button class="audio-modal-close" type="button" id="modal-x">${ic('chevronDown', 26)}</button>
          <div class="audio-modal-art"><img src="${esc(coverImage)}" alt="" /></div>
          <div class="audio-modal-info"><span>${meta}</span><h2>${title}</h2><p>${subtitle}</p></div>
          <div class="audio-modal-controls" id="audio-controls">
            <input aria-label="Перемотка" class="audio-modal-seek" id="audio-seek" max="100" min="0" type="range" value="0" />
            <div class="audio-modal-times"><span id="audio-time-current">0:00</span><span id="audio-time-duration">0:00</span></div>
            <button aria-label="Воспроизвести" class="audio-modal-play-btn" id="audio-play" type="button">${ic('play', 34)}</button>
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

  function audioCoverForItem(id) {
    let hash = 0;
    for (let i = 0; i < (id || '').length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return localAsset(`assets/webp/audio-cover-0${(hash % 6) + 1}.webp`);
  }

  function bindAudioPlayer(item) {
    const audio = $('#audio-player-el');
    const seek = $('#audio-seek');
    const playBtn = $('#audio-play');
    const timeCurrent = $('#audio-time-current');
    const timeDuration = $('#audio-time-duration');
    if (!audio || !seek || !playBtn) return;

    let isPlaying = false;
    let isScrubbing = false;

    function paint() {
      const duration = audio.duration || 0;
      const value = Number(seek.value);
      const pct = duration ? (value / duration) * 100 : 0;
      seek.style.background = `linear-gradient(90deg, #fff ${pct}%, rgba(255,255,255,0.25) ${pct}%)`;
    }

    function syncUi() {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const current = audio.currentTime || 0;
      seek.max = String(duration || 0);
      if (!isScrubbing) seek.value = String(current);
      timeCurrent.textContent = M.formatAudioTime(isScrubbing ? Number(seek.value) : current);
      timeDuration.textContent = M.formatAudioTime(duration);
      playBtn.innerHTML = isPlaying ? ic('pause', 34) : ic('play', 34);
      playBtn.setAttribute('aria-label', isPlaying ? 'Пауза' : 'Воспроизвести');
      paint();
    }

    audio.addEventListener('loadedmetadata', syncUi);
    audio.addEventListener('durationchange', syncUi);
    audio.addEventListener('timeupdate', syncUi);
    audio.addEventListener('play', () => { isPlaying = true; syncUi(); });
    audio.addEventListener('pause', () => { isPlaying = false; syncUi(); });
    audio.addEventListener('ended', () => { isPlaying = false; audio.currentTime = 0; syncUi(); });

    const startScrub = () => { isScrubbing = true; };
    const endScrub = () => {
      if (!isScrubbing) return;
      audio.currentTime = Number(seek.value);
      isScrubbing = false;
      syncUi();
    };
    seek.addEventListener('pointerdown', startScrub);
    seek.addEventListener('input', () => {
      isScrubbing = true;
      timeCurrent.textContent = M.formatAudioTime(Number(seek.value));
      paint();
    });
    seek.addEventListener('change', endScrub);
    seek.addEventListener('pointerup', endScrub);
    seek.addEventListener('pointercancel', endScrub);

    playBtn.addEventListener('click', () => {
      if (isPlaying) audio.pause();
      else audio.play().catch(() => {});
    });

    syncUi();
    // Auto-start playback when the player opens (best-effort; browsers may block
    // until the user interacts, in which case the play button stays available).
    audio.play().then(() => { isPlaying = true; syncUi(); }).catch(() => {});
  }

  function chatBgVars(preset) {
    return `--chat-bg-a:${preset.colors[0]};--chat-bg-b:${preset.colors[1]};--chat-bg-c:${preset.colors[2]};--chat-bg-accent:${preset.accent}`;
  }

  function formatBubbleTime(value) {
    const d = new Date(value || Date.now());
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function chatDateLabel(value) {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Сегодня';
    if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function renderChatBubble(message, mine) {
    const author = !mine ? `<strong class="bubble-author">${esc(message.authorName || message.author || 'Участник клуба')}</strong>` : '';
    const check = mine ? ic('checkCheck', 15) : '';
    return `<article class="chat-bubble ${mine ? 'mine' : 'incoming'}"><div class="bubble-body">${author}<p>${esc(message.body || message.text || '')}</p><div class="bubble-meta"><time>${formatBubbleTime(message.createdAt)}</time>${check}</div></div></article>`;
  }

  function renderChat() {
    const guestId = API.getGuestId();
    const selectedRoom = state.chatRooms.find((r) => r.id === state.selectedRoomId) || state.chatRooms[0];
    const preset = D.CHAT_BG_PRESETS.find((p) => p.id === state.chatBg) || D.CHAT_BG_PRESETS[0];

    const roomButtons = state.chatRooms.map((room, i) => {
      const last = room.messages?.[room.messages.length - 1];
      const preview = last ? (last.body || last.text || '') : (room.description || 'Пока нет сообщений');
      const time = last ? `<time>${formatBubbleTime(last.createdAt)}</time>` : '';
      return `<button type="button" class="${room.id === selectedRoom?.id ? 'active' : ''}" data-room="${esc(room.id)}">
        <span class="telegram-room-avatar" style="background-image:url(${bgImage(i)})"></span>
        <span class="telegram-room-copy"><strong>${esc(room.title)}</strong><small>${esc(preview)}</small></span>
        ${time}
      </button>`;
    }).join('');

    const timeline = [];
    let lastDateKey = '';
    (selectedRoom?.messages || []).forEach((message) => {
      const dateKey = new Date(message.createdAt || Date.now()).toDateString();
      if (dateKey !== lastDateKey) {
        timeline.push(`<div class="telegram-date-pill">${esc(chatDateLabel(message.createdAt || Date.now()))}</div>`);
        lastDateKey = dateKey;
      }
      timeline.push(renderChatBubble(message, message.authorId === guestId));
    });

    const emptyThread = !(selectedRoom?.messages || []).length
      ? '<div class="empty-chat"><p>Напишите первое сообщение.</p></div>'
      : '';

    const roomsListInner = roomButtons
      ? `<div class="telegram-room-group">${roomButtons}</div>`
      : '<p class="chat-muted">Комнаты пока не созданы в базе.</p>';

    return `<div class="telegram-chat-layout ${state.chatView === 'rooms' ? 'rooms-open' : 'thread-open'}">
      <aside class="telegram-room-list">
        <div class="telegram-room-list-head"><img class="telegram-room-list-logo" src="${asset('/images/new_logo.png')}" alt="" /><h2>Чаты клуба</h2></div>
        ${roomsListInner}
      </aside>
      <section class="telegram-thread">
        <header class="telegram-header">
          <button class="telegram-header-back" type="button" id="chat-back" aria-label="К списку чатов">${ic('chevronLeft', 22)}</button>
          <div class="telegram-header-pill"><strong>${esc(selectedRoom?.title || 'Чат клуба')}</strong><span>${esc(selectedRoom?.description || 'Живое общение участников')}</span></div>
          <button class="telegram-header-settings" type="button" id="chat-settings" aria-label="Настройки фона чата">${ic('settings', 20)}</button>
        </header>
        <div class="telegram-messages">
          <div class="chat-background chat-background-${esc(preset.id)}" style="${chatBgVars(preset)}"></div>
          ${timeline.join('')}
          ${emptyThread}
        </div>
        <form class="telegram-composer" id="chat-form">
          <input placeholder="Сообщение" id="chat-draft" />
          <button class="telegram-composer-send" type="submit" aria-label="Отправить">${ic('arrowUp', 20)}</button>
        </form>
      </section>
    </div>`;
  }

  function bindChat(root) {
    $$('[data-room]', root).forEach((b) => {
      b.onclick = () => { state.selectedRoomId = b.dataset.room; state.chatView = 'thread'; renderScreen(); setImmersive(); };
    });
    $('#chat-back', root)?.addEventListener('click', () => { state.chatView = 'rooms'; renderScreen(); setImmersive(); });
    $('#chat-settings', root)?.addEventListener('click', () => openChatBgPicker());
    const messages = $('.telegram-messages', root);
    if (messages) messages.scrollTop = messages.scrollHeight;
    $('#chat-form', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#chat-draft', root);
      const body = input?.value.trim();
      if (!body || !state.selectedRoomId) return;
      try {
        await API.sendChatMessage(state.selectedRoomId, body);
        input.value = '';
        await loadChatRooms();
        renderScreen();
      } catch {
        window.alert('Не удалось отправить сообщение. Попробуйте ещё раз.');
      }
    });
  }

  function openChatBgPicker() {
    const swatches = D.CHAT_BG_PRESETS.map((p) =>
      `<button type="button" class="${state.chatBg === p.id ? 'active' : ''}" data-bg="${p.id}">
        <span class="chat-bg-swatch chat-bg-swatch-${p.id}" style="${chatBgVars(p)}"></span>
        <strong>${esc(p.label)}</strong>
      </button>`,
    ).join('');
    $('#portal').innerHTML = `<div class="chat-bg-picker-backdrop" id="modal-close"><section class="chat-bg-picker" aria-label="Настройки фона чата" onclick="event.stopPropagation()">
      <div class="chat-bg-picker-handle"></div>
      <header class="chat-bg-picker-head"><div><span>Настройки чата</span><h2>Фон сообщений</h2></div><button type="button" id="modal-x" aria-label="Закрыть настройки">${ic('x', 20)}</button></header>
      <div class="chat-bg-grid">${swatches}</div>
    </section></div>`;
    bindModalClose();
    $$('[data-bg]', $('#portal')).forEach((b) => {
      b.onclick = () => { state.chatBg = b.dataset.bg; localStorage.setItem('chat-bg', state.chatBg); closePortal(); renderScreen(); };
    });
  }

  function moviePosterHtml(m) {
    const poster = asset(m.poster);
    return poster ? `<img alt="" src="${esc(poster)}" loading="lazy" decoding="async" />` : '<div class="poster-fallback"></div>';
  }

  function renderMovies() {
    const cards = state.movies.map((m) => `
      <button class="movie-card" type="button" data-movie="${esc(m.id)}">
        ${moviePosterHtml(m)}
        <div class="movie-info"><span>${esc(m.year)}</span><h3>${esc(m.title)}</h3><p>${esc(m.theme)}</p></div>
      </button>`).join('');
    return `<section class="section"><header class="section-header"><span>Киноклуб</span><h2>Фильмы для разговоров с подростками</h2><p>Нажмите на карточку — откроется описание и вопрос для семейного разговора.</p></header><div class="movie-grid">${cards}</div></section>`;
  }

  function bindMovies(root) {
    $$('[data-movie]', root).forEach((b) => {
      b.onclick = () => openMovie(b.dataset.movie);
    });
  }

  function openMovie(id) {
    const movie = state.movies.find((x) => x.id === id);
    if (!movie) return;
    state.selectedMovieId = id;
    renderScreen();
  }

  function closeMovie() {
    state.selectedMovieId = '';
    document.body.classList.remove('material-immersive-open');
    $('#portal').innerHTML = '';
    renderScreen();
  }

  function renderMovieDetail(m) {
    const facts = [
      m.director ? `<div class="movie-fact"><span>Режиссёр</span><strong>${esc(m.director)}</strong></div>` : '',
      m.genre ? `<div class="movie-fact"><span>Жанр</span><strong>${esc(m.genre)}</strong></div>` : '',
      m.runtime ? `<div class="movie-fact"><span>Хронометраж</span><strong>${esc(m.runtime)}</strong></div>` : '',
      m.year ? `<div class="movie-fact"><span>Год</span><strong>${esc(m.year)}</strong></div>` : '',
    ].filter(Boolean).join('');
    return `<div class="movie-detail-page">
      <header class="inner-page-header movie-detail-header">
        <button class="inner-page-back" type="button" id="movie-back" aria-label="Назад">${ic('chevronLeft', 22)}</button>
        ${innerBrand('Киноклуб')}
        <span class="inner-page-spacer" aria-hidden="true"></span>
      </header>
      <div class="movie-detail-body">
        <div class="movie-detail-poster">${moviePosterHtml(m)}</div>
        <span class="movie-detail-kicker">${esc(m.year)} · ${esc(m.theme)}</span>
        <h1>${esc(m.title)}</h1>
        ${facts ? `<div class="movie-facts">${facts}</div>` : ''}
        <p class="movie-detail-desc">${esc(m.description)}</p>
        <div class="prompt movie-modal-prompt"><strong>Вопрос для обсуждения</strong><p>${esc(m.prompt)}</p></div>
        <button class="primary-button movie-modal-cta" type="button" id="movie-chat">Открыть обсуждение в чате ${ic('arrowRight', 18)}</button>
      </div>
    </div>`;
  }

  function bindMovieDetail(root, _m) {
    $('#movie-back', root)?.addEventListener('click', closeMovie);
    $('#movie-chat', root)?.addEventListener('click', () => { closeMovie(); setTab('chat'); });
  }

  function cleanAiLinkTitle(s) {
    return String(s || '')
      .replace(/^\s*\[[^\]]*\]\s*/, '') // drop a leading "[тип]" copied from the knowledge base
      .replace(/\s*\([^)]*\)\s*$/, '') // drop a trailing "(год, тема)"
      .trim();
  }

  function parseAiContent(raw) {
    const text = String(raw || '');
    const linkRe = /\[\[\s*(?:открыть|open)\s*\|\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/gi;
    const links = [];
    let visible = text.replace(linkRe, (_match, type, title) => {
      const clean = cleanAiLinkTitle(title);
      if (clean) links.push({ type: type.trim().toLowerCase(), title: clean });
      return '';
    });
    // Hide a still-incomplete "[[..." fragment while streaming.
    visible = visible.replace(/\[\[[^\]]*$/, '');
    visible = visible.replace(/\n{3,}/g, '\n\n').trim();
    return { visible, links };
  }

  function aiLinkIcon(type) {
    if (/(кино|фильм|movie)/.test(type)) return ic('movies', 16);
    if (/(чат|chat)/.test(type)) return ic('chat', 16);
    if (/(раздел|section|медиа)/.test(type)) return ic('media', 16);
    return ic('play', 16);
  }

  function aiLinksHtml(links) {
    if (!links.length) return '';
    const chips = links.map((l) =>
      `<button type="button" class="ai-link-chip" data-ai-open data-ai-type="${esc(l.type)}" data-ai-title="${esc(l.title)}">${aiLinkIcon(l.type)}<span>${esc(l.title)}</span>${ic('arrowRight', 15)}</button>`,
    ).join('');
    return `<div class="ai-links">${chips}</div>`;
  }

  function aiMessagesHtml() {
    return state.aiMessages.map((m) => {
      const typing = state.aiSending && m.role === 'assistant' && !m.content;
      if (m.role === 'assistant' && !typing) {
        const { visible, links } = parseAiContent(m.content);
        return `<article class="ai-message assistant">
          <span>Лоза AI</span>
          ${visible ? `<p>${esc(visible)}</p>` : ''}
          ${aiLinksHtml(links)}
        </article>`;
      }
      return `<article class="ai-message ${m.role}">
        <span>${m.role === 'assistant' ? 'Лоза AI' : 'Вы'}</span>
        ${typing
          ? '<div class="ai-typing" aria-label="Лоза AI печатает"><i></i><i></i><i></i></div>'
          : `<p>${esc(m.content)}</p>`}
      </article>`;
    }).join('');
  }

  function openAiRecommendation(type, title) {
    const norm = (s) => String(s || '')
      .toLowerCase()
      .replace(/[«»"'`ё]/g, (c) => (c === 'ё' ? 'е' : ''))
      .replace(/[.,!?:;()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const t = norm(title);
    if (!t) { setTab('media'); return; }
    const findBy = (arr, key) =>
      arr.find((x) => norm(x[key]) === t)
      || arr.find((x) => norm(x[key]) && (norm(x[key]).includes(t) || t.includes(norm(x[key]))));

    if (/(кино|фильм|movie)/.test(type)) {
      const mv = findBy(state.movies, 'title');
      if (mv) { openMovie(mv.id); return; }
      setTab('movies');
      return;
    }
    if (/(чат|chat)/.test(type)) { setTab('chat'); return; }
    if (/(раздел|section)/.test(type)) {
      setTab('media');
      const sec = state.librarySections.find(
        (s) => norm(s.title) && (norm(s.title).includes(t) || t.includes(norm(s.title))),
      );
      if (sec) state.mediaSection = sec.id;
      else state.mediaQuery = title;
      renderScreen();
      return;
    }
    // material / audio / video / text
    const item = findBy(state.libraryItems, 'title');
    if (item) { openItem(item.id); return; }
    setTab('media');
    state.mediaQuery = title;
    renderScreen();
  }

  function refreshAiMessages() {
    const windowEl = $('.ai-chat-window');
    if (!windowEl) return;
    windowEl.innerHTML = aiMessagesHtml();
    windowEl.scrollTop = windowEl.scrollHeight;
  }

  function renderAi() {
    const chatting = state.aiMessages.length > 0;
    const hero = !chatting ? `<div class="ai-coach-hero"><span class="eyebrow">AI-наставник Лозы</span><h1>Разбор семейной ситуации с опорой на материалы клуба</h1><p>Опишите ситуацию с подростком — я помогу разложить динамику и предложить бережные шаги.</p></div>` : '';
    const starters = !chatting ? `<div class="ai-starters">${D.AI_STARTERS.map((s) => `<button type="button" data-starter="${esc(s)}"><span>Начать разговор</span>${esc(s)}</button>`).join('')}</div>` : '';
    const msgs = aiMessagesHtml();
    return `<section class="ai-coach-page">
      <header class="inner-page-header ai-inner-header"><button class="inner-page-back" type="button" data-tab-link="home" aria-label="Назад">${ic('chevronLeft', 22)}</button>${innerBrand('AI-наставник')}<span class="inner-page-spacer" aria-hidden="true"></span></header>
      <div class="ai-coach-shell${chatting ? ' is-chatting' : ''}">${hero}<div class="ai-chat-window">${msgs}</div>${starters}
      <form class="ai-composer" id="ai-form"><textarea rows="1" placeholder="Сообщение" id="ai-draft"></textarea><button type="submit">${ic('send', 18)}</button></form></div></section>`;
  }

  function bindAi(root) {
    $$('[data-tab-link]', root).forEach((b) => { b.onclick = () => setTab(b.dataset.tabLink); });
    $$('[data-starter]', root).forEach((b) => { b.onclick = () => sendAi(b.dataset.starter); });
    $('.ai-chat-window', root)?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-ai-open]');
      if (!chip) return;
      openAiRecommendation(chip.dataset.aiType || '', chip.dataset.aiTitle || '');
    });
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

    const setAnswer = (txt) => {
      const answer = state.aiMessages[state.aiMessages.length - 1];
      if (answer && answer.role === 'assistant') answer.content = String(txt || '');
    };
    const payload = state.aiMessages
      .filter((m) => m.content && m.content.trim())
      .slice(-10);
    // Guard against a hung request leaving the chat "frozen" inside in-app
    // browsers (Telegram/webview) — always resolve within the timeout.
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), 45000);

    let gotToken = false;
    try {
      // 1) Preferred: token-by-token streaming.
      try {
        await API.askAiPublicStream(payload, (event, data) => {
          const answer = state.aiMessages[state.aiMessages.length - 1];
          if (!answer || answer.role !== 'assistant') return;
          if (event === 'token' && data.token) {
            gotToken = true;
            answer.content += data.token;
            refreshAiMessages();
          }
          if (event === 'error') {
            throw new Error(data.error || 'AI_PROVIDER_ERROR');
          }
        }, controller?.signal);
      } catch (streamError) {
        // If we already streamed something, keep it; otherwise fall through
        // to the non-streaming request below.
        if (gotToken) throw streamError;
      }

      // 2) Fallback: plain request (older webviews without ReadableStream, or
      //    a stream that produced no tokens).
      if (!gotToken) {
        const result = await API.askAiPublic(payload, controller?.signal);
        const answerText = result && (result.answer || result.reply || result.content);
        if (answerText) {
          setAnswer(answerText);
          refreshAiMessages();
        } else {
          setAnswer('Не удалось получить ответ. Попробуйте переформулировать вопрос.');
        }
      }
    } catch {
      if (!gotToken) {
        setAnswer('Не удалось связаться с ИИ-наставником. Попробуйте ещё раз чуть позже.');
      }
    } finally {
      clearTimeout(timer);
      state.aiSending = false;
      renderScreen();
    }
  }

  function iosRow(icon, label, sub) {
    return `<div class="ios-row">
      <span class="ios-row-icon">${ic(icon, 20)}</span>
      <span class="ios-row-text"><strong>${esc(label)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
    </div>`;
  }

  function renderProfile() {
    return `<div class="profile-ios">
      <section class="profile-ios-hero">
        <div class="profile-ios-avatar">Г</div>
        <div class="profile-ios-identity">
          <h1>Гость</h1>
          <p>Психологический клуб «Лоза»</p>
        </div>
      </section>

      <div class="ios-group">
        <div class="ios-group-title">Настройки</div>
        <div class="ios-list">
          ${iosRow('settings', 'Уведомления', 'Напоминания о новых материалах')}
          ${iosRow('ai', 'Внешний вид', 'Светлая тема')}
        </div>
      </div>

      <div class="ios-group">
        <div class="ios-group-title">О приложении</div>
        <div class="ios-list">
          ${iosRow('shieldCheck', 'О клубе «Лоза»', 'Психологический клуб для родителей')}
          ${iosRow('messageCircle', 'Поддержка', 'Мы на связи')}
        </div>
      </div>

      <p class="ios-footnote">Версия для участников клуба «Лоза».</p>
    </div>`;
  }

  function bindProfile(_root) {}

  function closePortal() { $('#portal').innerHTML = ''; }
  function bindModalClose() {
    $('#modal-close')?.addEventListener('click', closePortal);
    $('#modal-x')?.addEventListener('click', closePortal);
  }

  async function loadContent() {
    try {
      const data = await API.content();
      const sections = Array.isArray(data.sections)
        ? data.sections
          .filter((section) => section.slug && section.title)
          .map((section) => ({
            id: section.slug,
            title: M.cleanDisplayText(section.title),
            description: M.cleanDisplayText(section.description || ''),
          }))
        : [];
      const apiItems = Array.isArray(data.entries)
        ? data.entries
          .filter((entry) => entry.slug && entry.title)
          .map((entry) => {
            const kind = entry.type === 'VIDEO' ? 'video' : entry.type === 'AUDIO' ? 'audio' : 'text';
            const fallback = LIBRARY.items.find((item) => item.id === entry.slug) || {};
            const meta = entry.questionNumber
              ? `Вопрос ${entry.questionNumber} · ${kind === 'video' ? 'Видео' : kind === 'audio' ? 'Аудио' : 'Текст'}`
              : entry.category || fallback.meta || '';

            // The API supplies the latest text.  The generated React catalog
            // supplies media URLs for legacy entries that the API does not yet have.
            return {
              ...fallback,
              id: entry.slug,
              sectionId: entry.section?.slug || fallback.sectionId || '',
              title: M.cleanDisplayText(entry.title),
              meta,
              kind,
              duration: entry.duration || fallback.duration || meta,
              description: entry.summary || fallback.description || '',
              questionNumber: entry.questionNumber || fallback.questionNumber,
              transcript: entry.transcript || entry.body || fallback.transcript,
              mediaUrl: entry.mediaUrl || fallback.mediaUrl,
              audioAssetPath: entry.audioAssetPath || fallback.audioAssetPath,
            };
          })
        : [];

      if (sections.length) state.librarySections = sections;
      if (apiItems.length) state.libraryItems = apiItems;
    } catch {
      // The full generated React catalog remains available offline.
    }
  }

  async function loadFeed() {
    try {
      const data = await API.feed();
      if (data.posts?.length) {
        state.feedPosts = data.posts.map((p) => {
          const rawRole = p.author?.role || p.authorRole || '';
          const team = isTeamRole(rawRole);
          const rawName = p.author?.name || p.authorName || '';
          return {
            id: p.id,
            authorName: team || !rawName ? 'Лоза' : rawName,
            authorRole: roleLabel(rawRole),
            createdAt: p.createdAt,
            body: p.body || '',
            imageUrl: p.imageUrl,
            likes: p.likes || p._count?.reactions || 0,
            comments: p.comments || p._count?.comments || 0,
          };
        });
      }
    } catch {
      /* fallback */
    }
  }

  async function loadChatRooms() {
    try {
      const data = await API.chatRooms();
      state.chatRooms = (data.rooms || []).map((room) => ({
        ...room,
        messages: (room.messages || []).map((message) => ({
          ...message,
          authorId: message.author?.id || message.authorId,
          authorName: message.author?.name || message.authorName || 'Участник клуба',
        })),
      }));
      if (!state.selectedRoomId && state.chatRooms[0]) state.selectedRoomId = state.chatRooms[0].id;
    } catch {
      state.chatRooms = [];
    }
  }

  function startChatStream() {
    if (state.chatStream || !window.EventSource) return;
    const stream = new EventSource(API.chatStreamUrl());
    stream.addEventListener('chat.message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const room = state.chatRooms.find((item) => item.id === payload.roomId);
        if (!room) return;

        if (payload.type === 'deleted') {
          room.messages = room.messages.filter((message) => message.id !== payload.messageId);
        } else if (payload.message) {
          const message = {
            ...payload.message,
            authorId: payload.message.author?.id || payload.message.authorId,
            authorName: payload.message.author?.name || payload.message.authorName || 'Участник клуба',
          };
          const index = room.messages.findIndex((item) => item.id === message.id);
          if (index >= 0) room.messages[index] = message;
          else room.messages.push(message);
        }
        if (state.tab === 'chat') renderScreen();
      } catch {
        // Ignore malformed stream events; the regular reload will recover state.
      }
    });
    stream.onerror = () => {
      stream.close();
      state.chatStream = null;
      window.setTimeout(startChatStream, 3000);
    };
    state.chatStream = stream;
  }

  async function init() {
    renderNav();
    setTab('home');
    await Promise.all([loadContent(), loadFeed(), loadChatRooms()]);
    startChatStream();
    renderScreen();
    setTimeout(() => {
      state.booting = false;
      $('#splash')?.remove();
    }, 900);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
