/* global LOZA_DATA, LOZA_API, LOZA_MEDIA, LOZA_LIBRARY_CONTENT */
(function () {
  const D = window.LOZA_DATA;
  const API = window.LOZA_API;
  const M = window.LOZA_MEDIA;
  const LIBRARY = window.LOZA_LIBRARY_CONTENT || {
    sections: D.LIBRARY_SECTIONS,
    items: D.LIBRARY_ITEMS,
  };
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Resolve image/media paths from this origin only (GitHub Pages). Never remote CDN. */
  function asset(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) {
      // Legacy remote Timeweb URLs break on many RU mobile networks — refuse them.
      if (/twc1\.net|rickytickytavylm-loza-front/i.test(path)) return '';
      return path;
    }
    const clean = String(path).replace(/^\.\//, '').replace(/^\//, '');
    return localAsset(clean);
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

  const ONBOARDING_SLIDES = [
    {
      mobile: 'assets/webp/onboarding/onboarding_one.webp',
      desktop: 'assets/webp/onboarding/onboarding_one_desktop.webp',
    },
    {
      mobile: 'assets/webp/onboarding/onboarding_two.webp',
      desktop: 'assets/webp/onboarding/onboarding_two_desktop.webp',
    },
    {
      mobile: 'assets/webp/onboarding/onboarding_three.webp',
      desktop: 'assets/webp/onboarding/onboarding_three_desktop.webp',
    },
    {
      mobile: 'assets/webp/onboarding/onboarding_four.webp',
      desktop: 'assets/webp/onboarding/onboarding_four_desktop.webp',
    },
    {
      mobile: 'assets/webp/onboarding/onboarding_five.webp',
      desktop: 'assets/webp/onboarding/onboarding_five_desktop.webp',
    },
  ];

  const state = {
    tab: 'home',
    booting: true,
    onboardingStep: 0,
    onboardingDone: false,
    authDone: false,
    user: null,
    selectedItemId: '',
    selectedMovieId: '',
    feedPosts: [...D.FEED_POSTS],
    librarySections: [...LIBRARY.sections],
    libraryItems: [...LIBRARY.items],
    movies: [...D.MOVIES],
    chatRooms: [],
    chatStream: null,
    chatStreamReady: false,
    chatStreamRetry: 0,
    chatPollTimer: null,
    chatPollBusy: false,
    chatView: 'rooms',
    selectedRoomId: '',
    chatCompose: null, // { mode: 'reply'|'edit', messageId, preview, authorName, body? }
    myChatMessageIds: new Set(),
    seenIntroIds: new Set(),
    introSeeded: false,
    chatBg: localStorage.getItem('chat-bg') || 'aurora',
    mediaSection: 'all',
    mediaQuery: '',
    mediaLikes: JSON.parse(localStorage.getItem('media-likes') || '[]'),
    aiMessages: [],
    aiSending: false,
    feedLikes: {},
    feedComments: {},
    listScroll: null, // { tab, media, shell } — restore after closing a material
    access: null,
    aiUsage: null,
    plans: [],
    freeTier: null,
    paymentProvider: 'mock',
  };

  function currentTier() {
    return state.access?.tier || 'basic';
  }

  function tierLabel(tier) {
    if (tier === 'library') return 'Медиатека';
    if (tier === 'club') return 'Клуб';
    if (tier === 'club_plus') return 'Клуб Плюс';
    return 'Базовый';
  }

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

  const SECTION_TITLE_OVERRIDES = {
    home_reviews: 'Задания',
    club_reviews: 'Разборы',
  };

  function sectionTitle(id) {
    if (SECTION_TITLE_OVERRIDES[id]) return SECTION_TITLE_OVERRIDES[id];
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
    if (tab === 'chat' && needsChatRules()) {
      openChatRules();
      return;
    }
    state.tab = tab;
    state.selectedItemId = '';
    state.selectedMovieId = '';
    document.body.classList.remove('material-immersive-open');
    closePortal();
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

  function needsLegalConsents() {
    if (!state.user) return false;
    return !state.user.acceptedTermsAt || !state.user.acceptedPrivacyAt;
  }

  function needsChatRules() {
    if (!state.user) return false;
    return !state.user.acceptedClubRulesAt;
  }

  function openLegalConsentsGate() {
    document.body.classList.add('paywall-open');
    $('#portal').innerHTML = `<div class="modal-backdrop paywall-backdrop">
      <section class="paywall-modal glass-panel consent-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <h2>Согласие на обработку данных</h2>
        <p>Чтобы пользоваться клубом, примите условия и политику конфиденциальности.</p>
        <label class="auth-consent"><input type="checkbox" id="gate-terms" /><span>Принимаю условия использования и даю согласие на обработку персональных данных</span></label>
        <label class="auth-consent"><input type="checkbox" id="gate-privacy" /><span>Ознакомлен(а) с политикой конфиденциальности</span></label>
        <p class="checkout-note" id="consent-status"></p>
        <button type="button" class="primary-button" id="consent-save">Продолжить</button>
      </section>
    </div>`;
    $('#consent-save')?.addEventListener('click', async () => {
      const terms = $('#gate-terms')?.checked;
      const privacy = $('#gate-privacy')?.checked;
      const status = $('#consent-status');
      if (!terms || !privacy) {
        if (status) status.textContent = 'Отметьте оба пункта, чтобы продолжить.';
        return;
      }
      try {
        const data = await API.acceptConsents({ terms: true, privacy: true });
        state.user = data.user || state.user;
        closePortal();
        renderScreen();
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : 'Не удалось сохранить согласие';
      }
    });
  }

  function enterChatTab() {
    state.tab = 'chat';
    const shell = $('#page-shell');
    shell.scrollTop = 0;
    shell.className = 'page-shell page-shell-chat';
    shell.setAttribute('aria-label', D.TAB_TITLES.chat || 'Чаты');
    renderNav();
    renderScreen();
    setImmersive();
  }

  function openChatIntroGuide({ afterRules = false } = {}) {
    document.body.classList.add('rules-open');
    const questions = (D.CHAT_INTRO_QUESTIONS || [])
      .map((question) => `<li>${esc(question)}</li>`)
      .join('');
    $('#portal').innerHTML = `<div class="modal-backdrop paywall-backdrop">
      <section class="paywall-modal glass-panel consent-modal club-intro-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <span class="paywall-kicker">Знакомство</span>
        <h2>Расскажите немного о себе</h2>
        <p>В чате для общения напишите пару слов о себе — так участникам легче поддержать друг друга.</p>
        <ul class="club-intro-list">${questions}</ul>
        <p class="club-intro-tag">Обязательно поставьте тег <strong>#знакомство</strong></p>
        <p class="club-intro-welcome">Добро пожаловать в чат клуба!</p>
        <div class="club-intro-actions">
          <button type="button" class="primary-button" id="intro-write">Написать о себе</button>
          <button type="button" class="paywall-later" id="intro-later">Позже</button>
        </div>
      </section>
    </div>`;

    const finish = (prefill) => {
      closePortal();
      if (afterRules) enterChatTab();
      if (!prefill) return;
      window.setTimeout(() => {
        const input = $('#chat-draft');
        if (!input) return;
        input.value = D.CHAT_INTRO_TEMPLATE || '#знакомство';
        input.focus();
      }, 120);
    };

    $('#intro-write')?.addEventListener('click', () => finish(true));
    $('#intro-later')?.addEventListener('click', () => finish(false));
  }

  function clubRulesHtml() {
    const items = (D.CLUB_RULES || []).map((rule, index) => {
      const list = rule.list
        ? `<ul>${rule.list.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`
        : '';
      return `<li class="club-rule">
        <span class="club-rule-num">${index + 1}</span>
        <div class="club-rule-copy">
          <strong>${esc(rule.title)}</strong>
          <p>${esc(rule.text)}</p>
          ${list}
        </div>
      </li>`;
    }).join('');
    return `<ol class="club-rules-list">${items}</ol>`;
  }

  function openChatRules() {
    document.body.classList.add('rules-open');
    $('#portal').innerHTML = `<div class="modal-backdrop paywall-backdrop" id="modal-close">
      <section class="paywall-modal glass-panel consent-modal club-rules-modal" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <header class="paywall-modal-head">
          <span class="paywall-kicker">Чаты клуба</span>
          <button class="icon-button paywall-close" type="button" id="modal-x" aria-label="Закрыть">${ic('x', 18)}</button>
        </header>
        <h2>${esc(D.CLUB_RULES_TITLE || 'Правила клуба')}</h2>
        ${clubRulesHtml()}
        <p class="club-rules-outro">${esc(D.CLUB_RULES_OUTRO || '')}</p>
        <p class="club-rules-sign">С уважением,<br />${esc(D.CLUB_RULES_SIGN || '')}</p>
        <p class="checkout-note" id="rules-status"></p>
        <button type="button" class="primary-button" id="rules-accept">Принимаю правила</button>
      </section>
    </div>`;
    bindModalClose();
    $('#rules-accept')?.addEventListener('click', async () => {
      const status = $('#rules-status');
      try {
        if (state.user) {
          const data = await API.acceptConsents({ clubRules: true });
          state.user = data.user || state.user;
        }
        closePortal();
        openChatIntroGuide({ afterRules: true });
      } catch (error) {
        if (status) status.textContent = error instanceof Error ? error.message : 'Не удалось сохранить';
      }
    });
  }

  function userDisplayName() {
    return state.user?.name || 'Гость';
  }

  function userAvatarUrl() {
    return state.user?.avatarUrl || state.user?.yandexAvatarUrl || '';
  }

  function userInitial() {
    const name = userDisplayName();
    return (name[0] || '?').toUpperCase();
  }

  function syncHeaderIdentity() {
    const pill = $('#header-initial');
    if (!pill) return;
    const avatar = userAvatarUrl();
    if (avatar) {
      pill.innerHTML = `<img class="profile-pill-avatar" src="${esc(avatar)}" alt="" />`;
      pill.classList.add('has-avatar');
    } else {
      pill.textContent = userInitial();
      pill.classList.remove('has-avatar');
    }
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
    syncHeaderIdentity();
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
          <img alt="" class="editorial-icon" src="${asset('/assets/webp/new_logo.webp')}" />
          <div class="editorial-meta"><strong>${esc(item.meta || '')}</strong><span>${item.kind === 'video' ? 'Видеоответ' : item.kind === 'audio' ? 'Аудио' : 'Текст'}</span></div>
          <button class="editorial-cta" type="button" data-open-media="${esc(item.id)}">${item.kind === 'video' ? 'Смотреть' : item.kind === 'audio' ? 'Слушать' : 'Читать'}</button>
        </footer>
      </article>`).join('');

    return `<div class="stack">
      <section class="hero glass-panel">
        <div class="hero-copy">
          <div class="eyebrow">Психологический клуб для родителей</div>
          <h1>Бережная опора, когда подростковый возраст становится штормом</h1>
          <p>Лекции, разборы и практики от психологов клуба, киноклуб и живой чат с родителями, которые проходят через то же самое.</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-tab-link="media">Открыть медиатеку ${ic('arrowRight', 18)}</button>
            <button class="secondary-button" type="button" data-tab-link="feed">Смотреть ленту</button>
          </div>
        </div>
        <div class="hero-art">
          <img src="${asset('/assets/webp/hero_logo.webp')}" alt="Лоза" />
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
      const rawImage = post.imageUrl || '';
      const image = (/^https?:\/\//i.test(rawImage) || rawImage.startsWith('data:'))
        ? rawImage
        : (asset(rawImage) || bgImage(index));
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
        if (!post) return;
        const index = Math.max(0, state.feedPosts.findIndex((p) => p.id === post.id));
        const authorName = post.authorName || post.author || 'Лоза';
        const caption = String(post.body || post.text || '').trim();
        const title = shareSnippet(caption.split('\n')[0] || 'Пост клуба Лоза', 90);
        shareWithPreview({
          title,
          text: shareSnippet(caption || title, 220),
          eyebrow: authorName === 'Лоза' ? 'Лоза · лента' : `${authorName} · Лоза`,
          url: `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(post.id)}`,
          imageUrl: resolveShareImageUrl(post.imageUrl || post.image || post.coverUrl, index),
        });
      };
    });
  }

  function commentItemHtml(c) {
    const name = c.author || 'Участник клуба';
    return `<li class="comments-item"><div class="comments-item-avatar">${esc((name[0] || '?').toUpperCase())}</div><div class="comments-item-copy"><strong>${esc(name)}</strong><p>${esc(c.body)}</p></div></li>`;
  }

  function commentsSkeletonHtml() {
    return `<div class="comments-skeleton" aria-hidden="true">
      <div class="comments-skeleton-row"><i></i><span><b></b><b></b></span></div>
      <div class="comments-skeleton-row"><i></i><span><b></b><b></b></span></div>
      <div class="comments-skeleton-row"><i></i><span><b></b><b></b></span></div>
    </div>`;
  }

  function renderCommentsBody(postId, loading) {
    const list = (state.feedComments[postId] || []).map(commentItemHtml).join('');
    if (loading) return commentsSkeletonHtml();
    if (list) return `<ul class="comments-list">${list}</ul>`;
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

    // Lock sheet height early so the body swap does not jump the modal.
    const sheet = $('.comments-sheet');
    if (sheet) {
      const locked = Math.max(sheet.getBoundingClientRect().height, window.innerHeight * 0.62);
      sheet.style.height = `${Math.min(locked, window.innerHeight * 0.82)}px`;
    }

    function refreshBody() {
      const body = $('#comments-body');
      if (body) body.innerHTML = renderCommentsBody(postId, false);
    }

    if (needsLoad) {
      window.requestAnimationFrame(() => {
        loadComments(postId).then(refreshBody);
      });
    }

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

  function shareSnippet(text, max = 96) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max - 1);
    const sp = cut.lastIndexOf(' ');
    return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`;
  }

  function resolveShareImageUrl(raw, fallbackIndex = 0) {
    const value = String(raw || '').trim();
    if (!value) return bgImage(fallbackIndex);
    if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) return value;
    return asset(value) || bgImage(fallbackIndex);
  }

  function loadShareImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error('no image'));
        return;
      }
      const img = new Image();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
  }

  function wrapShareCardLines(ctx, text, maxWidth, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i += 1) {
      const next = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = words[i];
        if (lines.length >= maxLines) {
          line = '';
          // leftover words → ellipsis on last line
          let last = lines[maxLines - 1];
          while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
          lines[maxLines - 1] = `${last.trim()}…`;
          return lines;
        }
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
  }

  /**
   * Branded share card (Instagram/Spotify pattern): cover + title baked into the image,
   * because many apps drop text/url when a file is attached.
   */
  async function buildShareCardFile({
    title,
    eyebrow = 'Лоза',
    imageUrl,
    footer = 'loza-club.ru',
  }) {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unsupported');

    ctx.fillStyle = '#1c1724';
    ctx.fillRect(0, 0, W, H);

    const mediaH = Math.round(H * 0.64);
    try {
      const img = await loadShareImage(imageUrl);
      const scale = Math.max(W / img.naturalWidth, mediaH / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      ctx.drawImage(img, (W - dw) / 2, (mediaH - dh) / 2, dw, dh);
    } catch {
      const fallback = ctx.createLinearGradient(0, 0, W, mediaH);
      fallback.addColorStop(0, '#3d2a4a');
      fallback.addColorStop(1, '#1c1724');
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, W, mediaH);
    }

    const veil = ctx.createLinearGradient(0, mediaH * 0.35, 0, H);
    veil.addColorStop(0, 'rgba(28, 23, 36, 0)');
    veil.addColorStop(0.42, 'rgba(28, 23, 36, 0.55)');
    veil.addColorStop(0.72, 'rgba(28, 23, 36, 0.94)');
    veil.addColorStop(1, '#1c1724');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);

    try {
      await document.fonts?.ready;
    } catch {
      /* keep system fallbacks */
    }

    const pad = 72;
    ctx.fillStyle = 'rgba(243, 235, 227, 0.72)';
    ctx.font = '600 34px Onest, Manrope, sans-serif';
    ctx.fillText(shareSnippet(eyebrow, 42).toUpperCase(), pad, H - 318);

    ctx.fillStyle = '#fffaf4';
    ctx.font = '700 58px Unbounded, Onest, sans-serif';
    const titleLines = wrapShareCardLines(ctx, title || 'Лоза', W - pad * 2, 3);
    titleLines.forEach((line, i) => {
      ctx.fillText(line, pad, H - 250 + i * 72);
    });

    ctx.fillStyle = 'rgba(255, 250, 244, 0.45)';
    ctx.font = '500 30px Onest, Manrope, sans-serif';
    ctx.fillText(footer, pad, H - 56);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
    });
    return new File([blob], 'loza-share.jpg', { type: 'image/jpeg' });
  }

  async function shareWithPreview({ title, text, url, imageUrl, eyebrow }) {
    const shareUrl = url || `${window.location.origin}${window.location.pathname}#share`;
    const shareTitle = title || 'Лоза';
    const shareText = text || shareTitle;
    const payload = {
      title: shareTitle,
      text: `${shareText}${shareText.includes(shareUrl) ? '' : `\n${shareUrl}`}`,
      url: shareUrl,
    };

    if (navigator.share) {
      try {
        const card = await buildShareCardFile({
          title: shareTitle,
          eyebrow: eyebrow || 'Лоза',
          imageUrl: resolveShareImageUrl(imageUrl),
        });
        if (navigator.canShare?.({ files: [card] })) {
          // Prefer files-only + text: card already carries title/cover for apps that strip url.
          await navigator.share({
            files: [card],
            title: payload.title,
            text: payload.text,
          });
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        /* fall through */
      }

      // Fallback: raw image file, then text/url only.
      if (imageUrl) {
        try {
          const response = await fetch(resolveShareImageUrl(imageUrl), { mode: 'cors', credentials: 'omit' });
          if (response.ok) {
            const blob = await response.blob();
            const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
            const file = new File([blob], `loza.${ext}`, { type: blob.type || 'image/jpeg' });
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({ ...payload, files: [file] });
              return;
            }
          }
        } catch {
          /* continue */
        }
      }

      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard?.writeText(`${payload.text}`);
      showAppToast('Ссылка скопирована', { title: 'Поделиться' });
    } catch {
      showAppToast('Не удалось поделиться', { title: 'Поделиться', tone: 'warn' });
    }
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
      const lockBadge = item.locked
        ? '<span class="access-badge locked">Закрытый клуб</span>'
        : '<span class="access-badge free">Открыто</span>';
      const ctaLabel = item.locked
        ? 'Открыть доступ'
        : (item.kind === 'video' ? 'Смотреть' : item.kind === 'audio' ? 'Слушать' : 'Читать');
      const lockOverlay = item.locked
        ? `<span class="media-lock-overlay" aria-hidden="true">${ic('lock', 22)}<em>Материал закрытого клуба</em></span>`
        : '';
      return `<article class="media-feed-card${item.locked ? ' is-locked' : ''}" data-item="${esc(item.id)}">
        <div class="media-feed-card-head"><img class="media-feed-card-logo" src="${asset('/assets/webp/new_logo.webp')}" alt="" /><span>Лоза · ${esc(sectionTitle(item.sectionId))} · ${kind}</span>${lockBadge}</div>
        <button class="media-feed-card-visual" type="button" data-open-item="${esc(item.id)}"><img alt="" src="${bgImage(i)}" loading="lazy" />${lockOverlay}</button>
        <button class="media-feed-card-title" type="button" data-open-item="${esc(item.id)}">${esc(item.title)}</button>
      <p class="media-feed-card-desc">${esc(M.getMaterialSummary(item))}</p>
        <div class="media-feed-card-actions">
          <button type="button" class="${item.locked ? 'media-cta-locked' : 'media-cta-open'}" data-open-item="${esc(item.id)}">${item.locked ? ic('lock', 16) : ic('play', 16)}<span>${ctaLabel}</span></button>
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
        if (!item) return;
        const index = Math.max(0, state.libraryItems.findIndex((x) => x.id === item.id));
        const kindLabel = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Материал';
        const cover = item.kind === 'audio'
          ? audioCoverForItem(item.id)
          : (item.coverUrl || item.imageUrl || bgImageForItem(item.id) || bgImage(index));
        const summary = M.getMaterialSummary?.(item) || '';
        shareWithPreview({
          title: shareSnippet(M.cleanDisplayText?.(item.title) || item.title, 90),
          text: shareSnippet(summary || `${item.title} — Лоза`, 220),
          eyebrow: `Лоза · ${sectionTitle(item.sectionId)} · ${kindLabel}`,
          url: `${window.location.origin}${window.location.pathname}?media=${encodeURIComponent(item.id)}`,
          imageUrl: resolveShareImageUrl(cover, index),
        });
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
    root._mediaControlsRemeasure?.();
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
    bindMediaControlsAutoHide(root);
  }

  function bindMediaControlsAutoHide(root) {
    const page = $('.media-feed-page', root);
    const controls = $('.media-feed-controls', root);
    const scroller = $('.media-feed-scroll', root);
    if (!page || !controls || !scroller) return;

    // Instagram/Telegram pattern: transform-only chrome + scrollTop compensation
    // so the feed does not jump. Reveal on scroll-up only (never on idle).
    let hidden = false;
    let lastTop = scroller.scrollTop;
    let ticking = false;
    let controlsH = 0;
    // Programmatic scrollTop tweaks must not be read as user scroll direction,
    // otherwise reveal (scrollTop += h) looks like a big scroll-down and re-hides.
    let suppressScroll = false;

    const syncLastTop = () => {
      lastTop = scroller.scrollTop;
    };

    const measure = () => {
      // scrollHeight is transform-independent, so we can measure while hidden.
      controlsH = Math.ceil(controls.scrollHeight || controls.getBoundingClientRect().height);
      page.style.setProperty('--media-controls-h', `${controlsH}px`);
      if (!hidden) scroller.style.paddingTop = `${controlsH}px`;
    };

    const setHidden = (next) => {
      if (next === hidden) return;
      // Keep chrome visible while typing in search.
      if (next && document.activeElement?.closest?.('.media-feed-controls')) return;
      const h = controlsH || Math.ceil(controls.scrollHeight || controls.getBoundingClientRect().height);
      if (!h) return;
      hidden = next;
      suppressScroll = true;
      if (hidden) {
        page.classList.add('media-controls-hidden');
        scroller.style.paddingTop = '0px';
        scroller.scrollTop = Math.max(0, scroller.scrollTop - h);
      } else {
        page.classList.remove('media-controls-hidden');
        scroller.style.paddingTop = `${h}px`;
        scroller.scrollTop += h;
      }
      syncLastTop();
      requestAnimationFrame(() => {
        syncLastTop();
        requestAnimationFrame(() => {
          syncLastTop();
          suppressScroll = false;
        });
      });
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (hidden) return;
          measure();
        })
      : null;
    ro?.observe(controls);

    scroller.addEventListener('scroll', () => {
      if (suppressScroll) {
        syncLastTop();
        return;
      }
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (suppressScroll) {
          syncLastTop();
          return;
        }
        const top = scroller.scrollTop;
        const delta = top - lastTop;
        lastTop = top;
        if (top <= 4) {
          setHidden(false);
          return;
        }
        // Hysteresis: ignore tiny jitter from touch / rubber-band.
        if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
      });
    }, { passive: true });

    root._mediaControlsRemeasure = measure;
  }

  function captureListScroll() {
    state.listScroll = {
      tab: state.tab,
      media: $('.media-feed-scroll')?.scrollTop || 0,
      shell: $('#page-shell')?.scrollTop || 0,
    };
  }

  function restoreListScroll() {
    const saved = state.listScroll;
    if (!saved || saved.tab !== state.tab) return;
    // Double rAF: wait until the rebuilt list is laid out.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const feed = $('.media-feed-scroll');
        if (feed) feed.scrollTop = saved.media;
        const shell = $('#page-shell');
        if (shell) shell.scrollTop = saved.shell;
      });
    });
  }

  function openItem(id) {
    const item = state.libraryItems.find((x) => x.id === id);
    if (!item) return;
    if (item.locked) {
      openPaywall({
        reason: 'library',
        title: 'Материал в закрытой медиатеке',
        text: 'Откройте тариф «Медиатека» или «Клуб», чтобы смотреть и слушать материалы без ограничений.',
        preferPlan: 'library_30',
      });
      return;
    }
    if (item.kind === 'audio' && M.resolveAudioUrl(item)) {
      openAudioPlayerModal(item);
      return;
    }
    captureListScroll();
    state.selectedItemId = id;
    // Don't reset the list scroll — immersive detail opens in #portal on top.
    renderScreen();
  }

  function openPaywall({ reason, title, text, preferPlan } = {}) {
    const plans = (state.plans || []).filter((plan) => {
      if (reason === 'chat' || reason === 'club') {
        return plan.tier === 'club' || plan.tier === 'club_plus';
      }
      if (reason === 'library') {
        return true;
      }
      return true;
    });
    const cards = plans.map((plan) => {
      const featured = plan.code === preferPlan || (preferPlan === 'library_30' && plan.code === 'library_30');
      const price = `${Number(plan.priceRub).toLocaleString('ru-RU')} ₽`;
      const days = plan.planDays === 90 ? '90 дней' : '30 дней';
      const renew = plan.autoRenew ? ' · автопродление' : '';
      return `<button type="button" class="plan-card${featured ? ' is-featured' : ''}" data-buy-plan="${esc(plan.code)}">
        <strong>${esc(plan.planName)}</strong>
        <span class="plan-card-price">${price}<small> / ${days}${renew}</small></span>
        <span class="plan-card-desc">${esc(plan.description || '')}</span>
      </button>`;
    }).join('');

    document.body.classList.add('paywall-open');
    $('#portal').innerHTML = `<div class="modal-backdrop paywall-backdrop" id="modal-close">
      <section class="paywall-modal glass-panel" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <header class="paywall-modal-head">
          <div class="paywall-modal-titles">
            <span class="paywall-kicker">Закрытый клуб</span>
            <h2>${esc(title || 'Открыть доступ')}</h2>
          </div>
          <button class="icon-button paywall-close" type="button" id="modal-x" aria-label="Закрыть">${ic('x', 18)}</button>
        </header>
        <p>${esc(text || 'Выберите тариф по условиям клуба Лоза.')}</p>
        <div class="paywall-benefits">
          <span>Медиатека</span><span>Чаты клуба</span><span>AI-наставник</span>
        </div>
        <div class="plan-grid">${cards || '<p class="checkout-note">Тарифы пока недоступны. Обновите страницу.</p>'}</div>
        <p class="checkout-note" id="paywall-status"></p>
        <button type="button" class="paywall-later" id="paywall-later">Позже</button>
      </section>
    </div>`;
    bindModalClose();
    $('#paywall-later')?.addEventListener('click', closePortal);
    $$('[data-buy-plan]', $('#portal')).forEach((btn) => {
      btn.onclick = () => startCheckout(btn.dataset.buyPlan, $('#paywall-status'));
    });
  }

  function showAppToast(message, { title = 'Лоза', tone = 'ok' } = {}) {
    let host = $('#app-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-toast-host';
      document.body.appendChild(host);
    }
    host.innerHTML = `<div class="app-toast app-toast-${esc(tone)}" role="status">
      <div class="app-toast-copy"><strong>${esc(title)}</strong><p>${esc(message)}</p></div>
      <button type="button" class="app-toast-close" id="app-toast-close">Закрыть</button>
    </div>`;
    const close = () => { host.innerHTML = ''; };
    $('#app-toast-close', host)?.addEventListener('click', close);
    window.setTimeout(close, 4200);
  }

  function isExternalCheckoutUrl(url) {
    try {
      const parsed = new URL(String(url || ''), window.location.href);
      if (!/^https?:$/i.test(parsed.protocol)) return false;
      return parsed.host !== window.location.host;
    } catch {
      return false;
    }
  }

  async function startCheckout(planCode, statusEl) {
    if (!isAuthorized() || !state.user) {
      if (statusEl) statusEl.textContent = 'Сначала войдите через Яндекс.';
      showAuthScreen('Чтобы оформить доступ, войдите через Яндекс.');
      return;
    }
    if (statusEl) statusEl.textContent = 'Создаём оплату…';
    try {
      const returnUrl = `${window.location.origin}${window.location.pathname}?payment=return`;
      const payment = await API.createPayment(planCode, returnUrl);

      // Prefer real YooKassa redirect whenever we got an external confirmation URL.
      if (payment.confirmationUrl && isExternalCheckoutUrl(payment.confirmationUrl) && payment.test !== true) {
        if (statusEl) statusEl.textContent = 'Переходим в ЮKassa…';
        window.location.href = payment.confirmationUrl;
        return;
      }

      if (payment.test === true || state.paymentProvider === 'mock') {
        if (statusEl) statusEl.textContent = 'Активируем тестовую подписку…';
        await API.completeMockPayment(payment.paymentId);
        await loadSession();
        await loadContent();
        await loadChatRooms();
        closePortal();
        renderScreen();
        showAppToast('Тестовая подписка активирована.', { title: 'Оплата' });
        return;
      }

      if (!payment.confirmationUrl) {
        throw new Error('Нет ссылки на оплату ЮKassa');
      }
      window.location.href = payment.confirmationUrl;
    } catch (error) {
      if (statusEl) {
        const code = error instanceof Error ? error.message : '';
        if (code === 'YOOKASSA_INVALID_CREDENTIALS') {
          statusEl.textContent = 'ЮKassa: неверный ShopID или секретный ключ. Проверьте переменные на Railway.';
        } else {
          statusEl.textContent = code || 'Не удалось создать оплату';
        }
      }
    }
  }

  async function handlePaymentReturn() {
    try {
      const params = new URLSearchParams(window.location.search);
      const paymentFlag = params.get('payment');
      const paymentId = params.get('paymentId');
      if (!paymentFlag && !paymentId) return;

      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean || './');

      if (paymentFlag === 'mock' && paymentId) {
        await API.completeMockPayment(paymentId);
      }

      await loadSession();
      await loadContent();
      await loadChatRooms();
      renderScreen();
    } catch {
      /* ignore return sync errors */
    }
  }

  function closeMaterial() {
    state.selectedItemId = '';
    document.body.classList.remove('material-immersive-open');
    $('#portal').innerHTML = '';
    renderScreen();
    restoreListScroll();
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
    const minutes = M.getMaterialDurationMinutes(item);
    const kindLabel = item.kind === 'video' ? 'Видео' : 'Аудио';
    const topics = M.getMaterialTopics(item);
    const takeaways = M.getMaterialTakeaways(item);
    const chips = topics.map((t) => `<span class="material-chip">${esc(t)}</span>`).join('');
    const points = takeaways.map((p) =>
      `<li><span class="material-takeaway-check">${ic('check', 14)}</span><span>${esc(p)}</span></li>`,
    ).join('');
    // Only show minutes when the catalog actually has them — never invent.
    const takeawaysTitle = minutes > 0 ? `За ${minutes} минут вы узнаете` : 'Вы узнаете';
    const metaParts = [
      duration ? `<span>${ic('clock', 18)} ${esc(duration)}</span>` : '',
      `<span>${ic(item.kind === 'audio' ? 'audioLines' : 'play', 18)} ${kindLabel}</span>`,
    ].filter(Boolean).join('');
    return `
      <div class="material-meta-row">${metaParts}</div>
      <div class="material-chips">${chips}</div>
      <section class="material-takeaways" aria-label="Что узнаете">
        <h2>${takeawaysTitle}</h2>
        <ul>${points}</ul>
      </section>`;
  }

  function renderMaterialDetail(item) {
    const hasMediaLayout = M.itemHasMediaLayout(item);
    const materialBody = M.getMaterialBody(item);
    const displayTitle = esc(M.cleanDisplayText(item.title));
    const displayMeta = esc(M.cleanDisplayText(item.meta));
    const kindLabel = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Материал';
    const bodyParagraphs = materialBodyHtml(materialBody);

    if (hasMediaLayout) {
      const titleLen = M.cleanDisplayText(item.title).length;
      const titleClass = titleLen > 70 ? ' is-long' : '';
      return `<div class="material-page material-page-immersive">
        ${innerHeader(kindLabel)}
        <div class="material-immersive-media" id="material-player">${renderMaterialMedia(item, true)}</div>
        <div class="material-immersive-body">
          <span class="material-kicker">${displayMeta}</span>
          <h1${titleClass ? ` class="${titleClass.trim()}"` : ''}>${displayTitle}</h1>
          ${materialLessonExtrasHtml(item)}
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

  function currentChatUserId() {
    return state.user?.id || '';
  }

  function rememberMyChatMessage(messageId) {
    if (!messageId) return;
    state.myChatMessageIds.add(messageId);
  }

  function isMyChatMessage(message) {
    if (!message) return false;
    if (state.myChatMessageIds.has(message.id)) return true;
    if (message.mine) return true;
    const myId = currentChatUserId();
    return Boolean(myId && message.authorId === myId);
  }

  const MEETING_PROVIDERS = [
    {
      id: 'zoom',
      label: 'Zoom',
      pattern: /https?:\/\/(?:[a-z0-9-]+\.)*zoom\.(?:us|com)\/[^\s<]+/gi,
    },
    {
      id: 'telemost',
      label: 'Яндекс Телемост',
      pattern: /https?:\/\/telemost\.yandex\.[a-z]{2,}\/[^\s<]+/gi,
    },
  ];

  const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

  function detectMeetingLinks(text) {
    const source = String(text || '');
    const found = [];
    const seen = new Set();
    for (const provider of MEETING_PROVIDERS) {
      const regex = new RegExp(provider.pattern.source, 'gi');
      let match = regex.exec(source);
      while (match) {
        const url = match[0].replace(/[),.;]+$/, '');
        if (!seen.has(url)) {
          seen.add(url);
          found.push({ id: provider.id, label: provider.label, url });
        }
        match = regex.exec(source);
      }
    }
    return found;
  }

  function meetingGlyph(id) {
    if (id === 'telemost') {
      return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.5 7.2A2.7 2.7 0 0 1 7.2 4.5h6.1A2.7 2.7 0 0 1 16 7.2v9.6a2.7 2.7 0 0 1-2.7 2.7H7.2A2.7 2.7 0 0 1 4.5 16.8V7.2Z"/><path d="M17.2 9.1 20.3 7a.9.9 0 0 1 1.4.75v8.5a.9.9 0 0 1-1.4.75l-3.1-2.1V9.1Z"/></svg>';
    }
    // Zoom-style camera
    return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.8 7.4A2.6 2.6 0 0 1 6.4 4.8h7.2A2.6 2.6 0 0 1 16.2 7.4v9.2a2.6 2.6 0 0 1-2.6 2.6H6.4A2.6 2.6 0 0 1 3.8 16.6V7.4Z"/><path d="M17.4 9.3 21 7.05a.85.85 0 0 1 1.3.72v8.46a.85.85 0 0 1-1.3.72l-3.6-2.25V9.3Z"/></svg>';
  }

  function meetingCardHtml(meeting, index = 0) {
    const art = bgImage(meeting.id === 'telemost' ? index + 2 : index + 4);
    const subtitle = meeting.id === 'telemost' ? 'Онлайн-встреча клуба' : 'Видеоконференция клуба';
    return `<a class="chat-meeting-card chat-meeting-${esc(meeting.id)}" href="${esc(meeting.url)}" target="_blank" rel="noopener noreferrer">
      <span class="chat-meeting-art" style="background-image:url(${art})" aria-hidden="true"></span>
      <span class="chat-meeting-veil" aria-hidden="true"></span>
      <span class="chat-meeting-icon" aria-hidden="true">${meetingGlyph(meeting.id)}</span>
      <span class="chat-meeting-footer">
        <span class="chat-meeting-copy">
          <strong>${esc(meeting.label)}</strong>
          <span>${esc(subtitle)}</span>
        </span>
        <span class="chat-meeting-cta">Открыть</span>
      </span>
    </a>`;
  }

  function isIntroMessage(text) {
    return /#знакомств/iu.test(String(text || ''));
  }

  function formatChatBody(text, meetings = []) {
    const meetingUrls = new Set(meetings.map((item) => item.url));
    let html = esc(text);

    html = html.replace(URL_PATTERN, (rawUrl) => {
      const trailing = rawUrl.match(/[),.;]+$/)?.[0] || '';
      const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
      // Meeting links get their own card below the text.
      if (meetingUrls.has(url)) return trailing;
      return `<a class="chat-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trailing}`;
    });

    return html.replace(
      /#([\p{L}\p{N}_]{2,40})/gu,
      '<span class="chat-hashtag">#$1</span>',
    );
  }

  function findChatMessage(messageId) {
    for (const room of state.chatRooms) {
      const message = (room.messages || []).find((item) => item.id === messageId);
      if (message) return { room, message };
    }
    return null;
  }

  function clearChatCompose() {
    state.chatCompose = null;
  }

  function setChatReply(message) {
    state.chatCompose = {
      mode: 'reply',
      messageId: message.id,
      preview: String(message.body || '').slice(0, 120),
      authorName: message.authorName || message.author?.name || 'Участник',
    };
    renderScreen();
    window.setTimeout(() => $('#chat-draft')?.focus(), 30);
  }

  function setChatEdit(message) {
    state.chatCompose = {
      mode: 'edit',
      messageId: message.id,
      preview: String(message.body || '').slice(0, 120),
      authorName: 'Редактирование',
      body: message.body || '',
    };
    renderScreen();
    window.setTimeout(() => {
      const input = $('#chat-draft');
      if (!input) return;
      input.value = message.body || '';
      input.focus();
    }, 30);
  }

  function renderChatBubble(message, mine) {
    const author = !mine
      ? `<strong class="bubble-author">${esc(message.authorName || message.author?.name || 'Участник клуба')}</strong>`
      : '';
    const reply = message.replyTo
      ? `<button type="button" class="bubble-reply" data-scroll-to="${esc(message.replyTo.id)}">
          <strong>${esc(message.replyTo.deleted ? 'Сообщение удалено' : (message.replyTo.authorName || 'Участник'))}</strong>
          <span>${esc(message.replyTo.deleted ? '' : (message.replyTo.body || '').slice(0, 140))}</span>
        </button>`
      : '';
    const reactions = (message.reactions || []).map((item) => `
      <button type="button" class="chat-reaction-chip${item.mine ? ' is-mine' : ''}" data-react="${esc(message.id)}" data-emoji="${esc(item.emoji)}">
        <span>${esc(item.emoji)}</span><small>${item.count}</small>
      </button>
    `).join('');
    const edited = message.editedAt ? '<span class="bubble-edited">изм.</span>' : '';
    const check = mine ? ic('checkCheck', 15) : '';
    const body = message.body || message.text || '';
    const meetings = detectMeetingLinks(body);
    const meetingCards = meetings.map((meeting, i) => meetingCardHtml(meeting, i)).join('');
    const formattedBody = formatChatBody(body, meetings).trim();
    const bodyHtml = formattedBody ? `<p>${formattedBody}</p>` : '';
    const meetingOnly = meetings.length > 0 && !formattedBody;

    const intro = isIntroMessage(body);
    const freshIntro = intro && !state.seenIntroIds.has(message.id);
    if (intro) state.seenIntroIds.add(message.id);
    const introBadge = intro
      ? '<span class="intro-badge" aria-hidden="true">✨ Знакомство</span>'
      : '';
    const introClass = intro ? ` is-intro${freshIntro ? ' is-intro-new' : ''}` : '';
    const meetingClass = meetingOnly ? ' is-meeting-only' : '';

    return `<article class="chat-bubble ${mine ? 'mine' : 'incoming'}${introClass}${meetingClass}" data-message-id="${esc(message.id)}">
      <div class="bubble-body">
        ${author}${reply}${introBadge}
        ${bodyHtml}
        ${meetingCards}
        <div class="bubble-meta">${edited}<time>${formatBubbleTime(message.createdAt)}</time>${check}</div>
      </div>
      ${reactions ? `<div class="chat-reaction-row">${reactions}</div>` : ''}
    </article>`;
  }

  function renderChatComposeBar() {
    const compose = state.chatCompose;
    if (!compose) return '';
    const title = compose.mode === 'edit' ? 'Редактирование' : `Ответ · ${compose.authorName}`;
    return `<div class="telegram-compose-bar" id="chat-compose-bar">
      <div class="telegram-compose-bar-copy">
        <strong>${esc(title)}</strong>
        <span>${esc(compose.preview || '')}</span>
      </div>
      <button type="button" id="chat-compose-cancel" aria-label="Отменить">${ic('x', 18)}</button>
    </div>`;
  }

  function renderChat() {
    const selectedRoom = state.chatRooms.find((r) => r.id === state.selectedRoomId) || state.chatRooms[0];
    const preset = D.CHAT_BG_PRESETS.find((p) => p.id === state.chatBg) || D.CHAT_BG_PRESETS[0];

    const roomButtons = state.chatRooms.map((room, i) => {
      const last = room.messages?.[room.messages.length - 1];
      const preview = room.locked
        ? 'Доступно в тарифе «Клуб»'
        : (last ? (last.body || last.text || '') : (room.description || 'Пока нет сообщений'));
      const time = !room.locked && last ? `<time>${formatBubbleTime(last.createdAt)}</time>` : '';
      const lock = room.locked ? '<span class="access-badge locked">Клуб</span>' : '';
      return `<button type="button" class="${room.id === selectedRoom?.id ? 'active' : ''}${room.locked ? ' is-locked' : ''}" data-room="${esc(room.id)}" data-locked="${room.locked ? '1' : '0'}">
        <span class="telegram-room-avatar" style="background-image:url(${bgImage(i)})"></span>
        <span class="telegram-room-copy"><strong>${esc(room.title)}</strong><small>${esc(preview)}</small></span>
        ${lock}${time}
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
      timeline.push(renderChatBubble(message, isMyChatMessage(message)));
    });

    const emptyThread = !(selectedRoom?.messages || []).length
      ? '<div class="empty-chat"><p>Напишите первое сообщение.</p></div>'
      : '';

    const roomsListInner = roomButtons
      ? `<div class="telegram-room-group">${roomButtons}</div>`
      : '<p class="chat-muted">Комнаты пока не созданы в базе.</p>';

    const placeholder = state.chatCompose?.mode === 'edit' ? 'Изменить сообщение' : 'Сообщение';

    return `<div class="telegram-chat-layout ${state.chatView === 'rooms' ? 'rooms-open' : 'thread-open'}">
      <aside class="telegram-room-list">
        <div class="telegram-room-list-head"><img class="telegram-room-list-logo" src="${asset('/assets/webp/new_logo.webp')}" alt="" /><h2>Чаты клуба</h2></div>
        ${roomsListInner}
      </aside>
      <section class="telegram-thread" style="${chatBgVars(preset)}">
        <header class="telegram-header">
          <button class="telegram-header-back" type="button" id="chat-back" aria-label="К списку чатов">${ic('chevronLeft', 22)}</button>
          <div class="telegram-header-pill"><strong>${esc(selectedRoom?.title || 'Чат клуба')}</strong><span>${esc(selectedRoom?.description || 'Живое общение участников')}</span></div>
          <button class="telegram-header-settings" type="button" id="chat-settings" aria-label="Настройки фона чата">${ic('settings', 20)}</button>
        </header>
        <div class="telegram-messages">
          <div class="telegram-messages-canvas chat-background chat-background-${esc(preset.id)}" style="${chatBgVars(preset)}">
            ${timeline.join('')}
            ${emptyThread}
          </div>
        </div>
        ${renderChatComposeBar()}
        <form class="telegram-composer" id="chat-form">
          <input placeholder="${esc(placeholder)}" id="chat-draft" autocomplete="off" />
          <button class="telegram-composer-send" type="submit" aria-label="Отправить">${ic('arrowUp', 20)}</button>
        </form>
      </section>
    </div>`;
  }

  function upsertChatMessageLocal(message, { trustMine = false } = {}) {
    const room = state.chatRooms.find((item) => item.id === (message.roomId || state.selectedRoomId));
    if (!room) return;
    const index = room.messages.findIndex((item) => item.id === message.id);
    const previous = index >= 0 ? room.messages[index] : null;
    const authorId = message.author?.id || message.authorId;
    const mine = Boolean(
      state.myChatMessageIds.has(message.id)
      || (trustMine && message.mine)
      || (currentChatUserId() && authorId === currentChatUserId()),
    );
    if (mine) rememberMyChatMessage(message.id);

    const prevMineEmojis = new Set(
      (previous?.reactions || []).filter((item) => item.mine).map((item) => item.emoji),
    );
    const reactions = (message.reactions || []).map((item) => ({
      ...item,
      mine: trustMine ? Boolean(item.mine) : prevMineEmojis.has(item.emoji),
    }));

    const normalized = {
      ...message,
      authorId,
      authorName: message.author?.name || message.authorName || 'Участник клуба',
      replyTo: message.replyTo || null,
      reactions,
      mine,
    };
    if (index >= 0) room.messages[index] = { ...previous, ...normalized };
    else room.messages.push(normalized);
  }

  let chatSelectionLock = 0;
  let chatSelectionObserverBound = false;
  let chatSelectionClearTimer = null;

  function clearNativeSelection() {
    try {
      const selection = window.getSelection?.();
      if (selection && selection.rangeCount) selection.removeAllRanges();
    } catch {
      /* ignore */
    }
  }

  function ensureChatSelectionGuard() {
    if (chatSelectionObserverBound) return;
    chatSelectionObserverBound = true;
    document.addEventListener('selectionchange', () => {
      if (!chatSelectionLock) return;
      clearNativeSelection();
    });
    document.addEventListener('selectstart', (event) => {
      if (!chatSelectionLock) return;
      event.preventDefault();
    }, true);
    document.addEventListener('contextmenu', (event) => {
      if (!chatSelectionLock) return;
      if (event.target?.closest?.('.chat-bubble, .chat-msg-menu, .telegram-messages')) {
        event.preventDefault();
      }
    }, true);
  }

  function lockChatSelection() {
    ensureChatSelectionGuard();
    chatSelectionLock += 1;
    document.documentElement.classList.add('chat-no-select');
    document.body.classList.add('chat-no-select');
    clearNativeSelection();
    if (chatSelectionClearTimer) window.clearInterval(chatSelectionClearTimer);
    chatSelectionClearTimer = window.setInterval(clearNativeSelection, 50);
  }

  function unlockChatSelection() {
    chatSelectionLock = Math.max(0, chatSelectionLock - 1);
    if (chatSelectionLock > 0) return;
    document.documentElement.classList.remove('chat-no-select');
    document.body.classList.remove('chat-no-select');
    if (chatSelectionClearTimer) {
      window.clearInterval(chatSelectionClearTimer);
      chatSelectionClearTimer = null;
    }
    clearNativeSelection();
  }

  function openChatMessageMenu(message) {
    if (!chatSelectionLock) lockChatSelection();
    clearNativeSelection();
    const mine = isMyChatMessage(message);
    const emojis = (D.CHAT_QUICK_EMOJIS || []).map((emoji) =>
      `<button type="button" class="chat-emoji-pick" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`,
    ).join('');
    const ownActions = mine
      ? `<button type="button" data-chat-action="edit">${ic('pencil', 18)}<span>Изменить</span></button>
         <button type="button" class="is-danger" data-chat-action="delete">${ic('trash', 18)}<span>Удалить</span></button>`
      : '';

    $('#portal').innerHTML = `<div class="chat-msg-menu-backdrop" id="modal-close">
      <section class="chat-msg-menu" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="chat-msg-menu-emojis">${emojis}</div>
        <div class="chat-msg-menu-actions">
          <button type="button" data-chat-action="reply">${ic('reply', 18)}<span>Ответить</span></button>
          ${ownActions}
        </div>
        <button type="button" class="chat-msg-menu-cancel" id="modal-x">Отмена</button>
      </section>
    </div>`;
    clearNativeSelection();
    window.setTimeout(clearNativeSelection, 0);
    window.setTimeout(clearNativeSelection, 120);
    bindModalClose();

    const releaseMenuLock = () => {
      while (chatSelectionLock > 0) unlockChatSelection();
    };
    $('#modal-close')?.addEventListener('click', (event) => {
      if (event.target.id === 'modal-close') releaseMenuLock();
    });
    $('#modal-x')?.addEventListener('click', releaseMenuLock);

    $$('.chat-emoji-pick', $('#portal')).forEach((btn) => {
      btn.onclick = async () => {
        releaseMenuLock();
        closePortal();
        try {
          const data = await API.toggleChatReaction(message.id, btn.dataset.emoji);
          if (data.message) upsertChatMessageLocal(data.message, { trustMine: true });
          renderChatLive();
        } catch {
          window.alert('Не удалось поставить реакцию.');
        }
      };
    });

    $$('[data-chat-action]', $('#portal')).forEach((btn) => {
      btn.onclick = async () => {
        const action = btn.dataset.chatAction;
        releaseMenuLock();
        closePortal();
        if (action === 'reply') {
          setChatReply(message);
          return;
        }
        if (action === 'edit') {
          setChatEdit(message);
          return;
        }
        if (action === 'delete') {
          if (!window.confirm('Удалить сообщение?')) return;
          try {
            await API.deleteChatMessage(message.id);
            const found = findChatMessage(message.id);
            if (found) {
              found.room.messages = found.room.messages.filter((item) => item.id !== message.id);
            }
            if (state.chatCompose?.messageId === message.id) clearChatCompose();
            renderChatLive();
          } catch {
            window.alert('Не удалось удалить сообщение.');
          }
        }
      };
    });
  }

  function bindChatMessageGestures(root) {
    $$('.chat-bubble[data-message-id]', root).forEach((bubble) => {
      const messageId = bubble.dataset.messageId;
      let pressTimer = null;
      let armed = false;
      let locked = false;
      let startX = 0;
      let startY = 0;

      const resetPress = ({ keepLock = false } = {}) => {
        if (pressTimer) window.clearTimeout(pressTimer);
        pressTimer = null;
        armed = false;
        bubble.classList.remove('is-pressing');
        if (!keepLock && locked) {
          unlockChatSelection();
          locked = false;
        }
      };

      bubble.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        clearNativeSelection();
        const found = findChatMessage(messageId);
        if (found) openChatMessageMenu(found.message);
      });
      bubble.addEventListener('selectstart', (event) => event.preventDefault());
      bubble.addEventListener('dragstart', (event) => event.preventDefault());

      bubble.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        armed = false;
        pressTimer = window.setTimeout(() => {
          armed = true;
          bubble.classList.add('is-pressing');
          if (!locked) {
            lockChatSelection();
            locked = true;
          }
          clearNativeSelection();
          if (navigator.vibrate) {
            try { navigator.vibrate(12); } catch { /* ignore */ }
          }
        }, 280);
      }, { passive: true });

      // Non-passive: once armed, cancel iOS text-selection gesture.
      bubble.addEventListener('touchmove', (event) => {
        if (armed) {
          event.preventDefault();
          clearNativeSelection();
          return;
        }
        if (!pressTimer) return;
        const touch = event.touches[0];
        if (!touch) return;
        if (Math.abs(touch.clientX - startX) > 8 || Math.abs(touch.clientY - startY) > 8) {
          resetPress();
        }
      }, { passive: false });

      bubble.addEventListener('touchend', (event) => {
        const shouldOpen = armed;
        if (!shouldOpen) {
          resetPress();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        bubble.classList.remove('is-pressing');
        pressTimer = null;
        armed = false;
        clearNativeSelection();
        const found = findChatMessage(messageId);
        // Keep selection lock through the menu lifetime.
        locked = false;
        if (found) openChatMessageMenu(found.message);
        else unlockChatSelection();
      }, { passive: false });

      bubble.addEventListener('touchcancel', () => resetPress());
    });

    $$('[data-react]', root).forEach((chip) => {
      chip.onclick = async (event) => {
        event.stopPropagation();
        try {
          const data = await API.toggleChatReaction(chip.dataset.react, chip.dataset.emoji);
          if (data.message) upsertChatMessageLocal(data.message, { trustMine: true });
          renderChatLive();
        } catch {
          window.alert('Не удалось обновить реакцию.');
        }
      };
    });

    $$('[data-scroll-to]', root).forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const target = root.querySelector(`[data-message-id="${btn.dataset.scrollTo}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('is-flash');
        window.setTimeout(() => target.classList.remove('is-flash'), 1200);
      };
    });
  }

  function bindChat(root) {
    $$('[data-room]', root).forEach((b) => {
      b.onclick = () => {
        if (b.dataset.locked === '1') {
          openPaywall({
            reason: 'chat',
            title: 'Закрытый чат клуба',
            text: 'Чаты практики и киноклуба открываются с тарифа «Клуб».',
            preferPlan: 'club_30',
          });
          return;
        }
        state.selectedRoomId = b.dataset.room;
        state.chatView = 'thread';
        clearChatCompose();
        renderScreen();
        setImmersive();
      };
    });
    $('#chat-back', root)?.addEventListener('click', () => {
      state.chatView = 'rooms';
      clearChatCompose();
      renderScreen();
      setImmersive();
    });
    $('#chat-settings', root)?.addEventListener('click', () => openChatBgPicker());
    $('#chat-compose-cancel', root)?.addEventListener('click', () => {
      clearChatCompose();
      renderScreen();
    });

    const messages = $('.telegram-messages', root);
    if (messages) messages.scrollTop = messages.scrollHeight;
    bindChatMessageGestures(root);

    if (state.chatCompose?.mode === 'edit' && state.chatCompose.body) {
      const input = $('#chat-draft', root);
      if (input && !input.value) input.value = state.chatCompose.body;
    }

    $('#chat-form', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#chat-draft', root);
      const body = input?.value.trim();
      if (!body || !state.selectedRoomId) return;
      const compose = state.chatCompose;
      input.value = '';
      try {
        if (compose?.mode === 'edit') {
          const data = await API.editChatMessage(compose.messageId, body);
          if (data.message) {
            rememberMyChatMessage(data.message.id);
            upsertChatMessageLocal(data.message, { trustMine: true });
          }
        } else {
          const data = await API.sendChatMessage(
            state.selectedRoomId,
            body,
            compose?.mode === 'reply' ? compose.messageId : undefined,
          );
          if (data.message) {
            rememberMyChatMessage(data.message.id);
            upsertChatMessageLocal(data.message, { trustMine: true });
          }
        }
        clearChatCompose();
        renderChatLive();
      } catch {
        input.value = body;
        window.alert(compose?.mode === 'edit'
          ? 'Не удалось изменить сообщение.'
          : 'Не удалось отправить сообщение. Попробуйте ещё раз.');
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
    const limit = state.access?.capabilities?.aiWeeklyLimit;
    const used = state.aiUsage?.used ?? 0;
    const quotaText = !state.user
      ? 'Войдите, чтобы учитывать лимит по тарифу'
      : (limit == null ? 'AI без ограничений на вашем тарифе' : `${used} из ${limit} запросов на этой неделе`);
    const hero = !chatting ? `<div class="ai-coach-hero"><span class="eyebrow">AI-наставник Лозы</span><h1>Разбор семейной ситуации с опорой на материалы клуба</h1><p>Опишите ситуацию с подростком — я помогу разложить динамику и предложить бережные шаги.</p><p class="ai-quota-line">${esc(quotaText)}</p></div>` : '';
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
        await API.askAiStream(payload, (event, data) => {
          const answer = state.aiMessages[state.aiMessages.length - 1];
          if (!answer || answer.role !== 'assistant') return;
          if (event === 'token' && data.token) {
            gotToken = true;
            answer.content += data.token;
            refreshAiMessages();
          }
          if (event === 'done' && data.aiUsage) {
            state.aiUsage = data.aiUsage;
          }
          if (event === 'error') {
            const err = new Error(data.error || 'AI_PROVIDER_ERROR');
            err.code = data.error;
            throw err;
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
    } catch (error) {
      if (!gotToken) {
        if (error?.code === 'AI_QUOTA_EXCEEDED') {
          setAnswer('Лимит AI на этой неделе исчерпан. Откройте тариф «Клуб» для безлимитного доступа.');
          openPaywall({
            reason: 'club',
            title: 'Лимит AI на неделе',
            text: 'На базовом и медиатеке есть недельный лимит. В «Клубе» AI без ограничений.',
            preferPlan: 'club_30',
          });
        } else {
          setAnswer('Не удалось связаться с ИИ-наставником. Попробуйте ещё раз чуть позже.');
        }
      }
    } finally {
      clearTimeout(timer);
      state.aiSending = false;
      renderScreen();
    }
  }

  function iosRow(icon, label, sub, action) {
    const act = action ? ` data-profile-action="${esc(action)}"` : '';
    return `<button type="button" class="ios-row"${act}>
      <span class="ios-row-icon">${ic(icon, 20)}</span>
      <span class="ios-row-text"><strong>${esc(label)}</strong>${sub ? `<span>${esc(sub)}</span>` : ''}</span>
      ${ic('chevronRight', 18)}
    </button>`;
  }

  function renderProfile() {
    const authed = Boolean(state.user);
    const avatar = userAvatarUrl();
    const name = userDisplayName();
    const email = state.user?.email || '';
    const phone = state.user?.phone || '';
    const avatarHtml = avatar
      ? `<img src="${esc(avatar)}" alt="" />`
      : esc(userInitial());
    const subtitle = authed
      ? [email, phone].filter(Boolean).join(' · ') || 'Участник клуба «Лоза»'
      : 'Психологический клуб «Лоза» · войдите, чтобы сохранить прогресс';
    const until = state.access?.accessUntil
      ? new Date(state.access.accessUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
      : '';
    const aiLimit = state.access?.capabilities?.aiWeeklyLimit;
    const aiUsed = state.aiUsage?.used ?? 0;
    const aiLine = aiLimit == null
      ? 'AI без ограничений'
      : `AI: ${aiUsed} / ${aiLimit} за неделю`;
    const accessLine = until
      ? `${tierLabel(currentTier())} · до ${until}`
      : `${tierLabel(currentTier())} · ${aiLine}`;

    const planCards = (state.plans || []).map((plan) => {
      const price = `${Number(plan.priceRub).toLocaleString('ru-RU')} ₽`;
      return `<button type="button" class="plan-card" data-buy-plan="${esc(plan.code)}">
        <strong>${esc(plan.planName)}</strong>
        <span class="plan-card-price">${price}<small> / ${plan.planDays} дн.</small></span>
        <span class="plan-card-desc">${esc(plan.description || '')}</span>
      </button>`;
    }).join('');

    return `<div class="profile-ios">
      <section class="profile-ios-hero">
        <div class="profile-ios-avatar${avatar ? ' has-photo' : ''}">${avatarHtml}</div>
        <div class="profile-ios-identity">
          <h1>${esc(name)}</h1>
          <p>${esc(subtitle)}</p>
          <p class="profile-access-line">${esc(accessLine)}</p>
        </div>
      </section>

      <div class="profile-ios-aside">
        <div class="ios-group">
          <div class="ios-group-title">Подписка</div>
          <div class="plan-grid profile-plan-grid">${planCards || '<p class="ios-footnote">Тарифы загрузятся после обновления.</p>'}</div>
          <p class="ios-footnote" id="profile-pay-status">Оплата через ЮKassa. Автопродление по условиям тарифа.</p>
        </div>
        <div class="ios-group">
          <div class="ios-group-title">Быстрый доступ</div>
          <div class="ios-list">
            ${iosRow('media', 'Медиатека', 'Подкасты, разборы и эфиры', 'media')}
            ${iosRow('chat', 'Чаты клуба', 'Общий чат и вопросы экспертам', 'chat')}
            ${iosRow('ai', 'ИИ-наставник', 'Короткие ориентиры по ситуации', 'ai')}
            ${iosRow('movies', 'Киноклуб', 'Фильмы с вопросами для семьи', 'movies')}
          </div>
        </div>
      </div>

      <div class="profile-ios-main">
        <div class="ios-group">
          <div class="ios-group-title">О клубе</div>
          <div class="ios-list">
            ${iosRow('shieldCheck', 'О «Лозе»', 'Бережная поддержка родителей подростков', 'about')}
            ${iosRow('feed', 'Лента клуба', 'Заметки и короткие разборы', 'feed')}
            ${iosRow('messageCircle', 'Поддержка', 'Написать в чат клуба', 'support')}
          </div>
        </div>
        ${authed ? `<div class="ios-group">
          <div class="ios-group-title">Аккаунт</div>
          <div class="ios-list">
            ${iosRow('logOut', 'Выйти', 'Завершить сессию на этом устройстве', 'logout')}
            ${iosRow('trash', 'Удалить аккаунт', 'Данные удалятся без возможности восстановления', 'delete-account')}
          </div>
        </div>
        <p class="ios-footnote">Вы вошли через Яндекс. Удаление аккаунта сбрасывает доступ и снова показывает онбординг.</p>`
    : `<p class="ios-footnote">Чтобы сохранить профиль и прогресс, войдите через Яндекс после онбординга.</p>`}
      </div>
    </div>`;
  }

  async function resetToOnboarding() {
    try {
      API.setToken('');
      localStorage.removeItem('loza_session_token');
      localStorage.removeItem('loza_onboarding_done');
    } catch {
      /* ignore */
    }
    state.user = null;
    state.authDone = false;
    state.onboardingDone = false;
    state.onboardingStep = 0;
    hideAuthScreen(false);
    syncHeaderIdentity();
    renderOnboarding();
    bindOnboarding();
    setTab('home');
  }

  async function handleLogout() {
    try { await API.logout(); } catch { /* ignore */ }
    await resetToOnboarding();
  }

  async function handleDeleteAccount() {
    const ok = window.confirm('Удалить аккаунт навсегда? Это действие нельзя отменить.');
    if (!ok) return;
    try {
      await API.deleteAccount();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось удалить аккаунт');
      return;
    }
    await resetToOnboarding();
  }

  function bindProfile(root) {
    $$('[data-buy-plan]', root).forEach((btn) => {
      btn.onclick = () => startCheckout(btn.dataset.buyPlan, $('#profile-pay-status', root));
    });
    $$('[data-profile-action]', root).forEach((btn) => {
      btn.onclick = () => {
        const action = btn.dataset.profileAction;
        if (action === 'about') {
          setTab('home');
          return;
        }
        if (action === 'support') {
          setTab('chat');
          return;
        }
        if (action === 'logout') {
          handleLogout();
          return;
        }
        if (action === 'delete-account') {
          handleDeleteAccount();
          return;
        }
        if (['home', 'feed', 'media', 'chat', 'movies', 'ai'].includes(action)) {
          setTab(action);
        }
      };
    });
  }

  function closePortal() {
    document.body.classList.remove('paywall-open', 'rules-open');
    document.documentElement.classList.remove('chat-no-select');
    document.body.classList.remove('chat-no-select');
    while (chatSelectionLock > 0) unlockChatSelection();
    $('#portal').innerHTML = '';
  }
  function bindModalClose() {
    $('#modal-close')?.addEventListener('click', (event) => {
      if (event.target.id === 'modal-close') closePortal();
    });
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
              locked: Boolean(entry.locked),
              requiredTier: entry.requiredTier || null,
            };
          })
        : [];

      if (data.access) state.access = data.access;
      if (sections.length) {
        state.librarySections = sections.map((section) => ({
          ...section,
          title: SECTION_TITLE_OVERRIDES[section.id] || section.title,
        }));
      }
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
        messages: (room.messages || []).map((message) => {
          const authorId = message.author?.id || message.authorId;
          const mine = Boolean(
            message.mine
            || state.myChatMessageIds.has(message.id)
            || (currentChatUserId() && authorId === currentChatUserId()),
          );
          if (mine) rememberMyChatMessage(message.id);
          return {
            ...message,
            authorId,
            authorName: message.author?.name || message.authorName || 'Участник клуба',
            replyTo: message.replyTo || null,
            reactions: message.reactions || [],
            mine,
          };
        }),
      }));
      if (!state.selectedRoomId && state.chatRooms[0]) state.selectedRoomId = state.chatRooms[0].id;
      // Only greet messages that arrive after the first load.
      if (!state.introSeeded) {
        state.chatRooms.forEach((room) => (room.messages || []).forEach((message) => {
          if (isIntroMessage(message.body)) state.seenIntroIds.add(message.id);
        }));
        state.introSeeded = true;
      }
    } catch {
      state.chatRooms = [];
    }
  }

  function chatStateSignature() {
    return state.chatRooms.map((room) => {
      const messages = room.messages || [];
      const tail = messages.map((message) => [
        message.id,
        message.body,
        message.editedAt || '',
        (message.reactions || []).map((r) => `${r.emoji}${r.count}${r.mine ? '*' : ''}`).join(''),
      ].join('.')).join('|');
      return `${room.id}#${messages.length}#${tail}`;
    }).join('~');
  }

  /** Re-render the chat without losing the draft, focus or scroll position. */
  function renderChatLive() {
    if (state.tab !== 'chat') return;
    const draftEl = $('#chat-draft');
    const draft = draftEl ? draftEl.value : null;
    const hadFocus = Boolean(draftEl && document.activeElement === draftEl);
    const selectionStart = draftEl?.selectionStart ?? null;
    const listEl = $('.telegram-messages');
    const prevScroll = listEl ? listEl.scrollTop : 0;
    const atBottom = listEl
      ? listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 90
      : true;

    renderScreen();

    const nextDraft = $('#chat-draft');
    if (nextDraft && draft !== null) {
      nextDraft.value = draft;
      if (hadFocus) {
        nextDraft.focus();
        if (selectionStart !== null) {
          try { nextDraft.setSelectionRange(selectionStart, selectionStart); } catch { /* ignore */ }
        }
      }
    }
    const nextList = $('.telegram-messages');
    if (nextList) nextList.scrollTop = atBottom ? nextList.scrollHeight : prevScroll;
  }

  function applyChatEvent(payload) {
    const room = state.chatRooms.find((item) => item.id === payload.roomId);
    if (!room) return false;
    if (payload.type === 'deleted') {
      const before = room.messages.length;
      room.messages = room.messages.filter((message) => message.id !== payload.messageId);
      if (state.chatCompose?.messageId === payload.messageId) clearChatCompose();
      return room.messages.length !== before;
    }
    if (payload.message) {
      upsertChatMessageLocal(payload.message, { trustMine: false });
      return true;
    }
    return false;
  }

  async function pollChatRooms({ force = false } = {}) {
    if (state.chatPollBusy) return;
    if (!force && state.chatStreamReady) return;
    state.chatPollBusy = true;
    const before = chatStateSignature();
    try {
      await loadChatRooms();
      if (chatStateSignature() !== before) renderChatLive();
    } catch {
      /* keep the previous state, next tick retries */
    } finally {
      state.chatPollBusy = false;
    }
  }

  function ensureChatPolling() {
    if (state.chatPollTimer) return;
    state.chatPollTimer = window.setInterval(() => {
      if (document.hidden) return;
      if (state.chatStreamReady) return;
      pollChatRooms();
    }, 4000);
  }

  function startChatStream() {
    if (state.chatStream || !window.EventSource) {
      ensureChatPolling();
      return;
    }
    ensureChatPolling();

    let stream;
    try {
      stream = new EventSource(API.chatStreamUrl(), { withCredentials: true });
    } catch {
      state.chatStreamReady = false;
      return;
    }

    stream.addEventListener('ready', () => {
      state.chatStreamReady = true;
      state.chatStreamRetry = 0;
      // A dropped stream may have missed events while offline.
      pollChatRooms({ force: true });
    });

    stream.addEventListener('chat.message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (applyChatEvent(payload)) renderChatLive();
      } catch {
        // Ignore malformed stream events; polling will recover state.
      }
    });

    stream.onerror = () => {
      stream.close();
      state.chatStream = null;
      state.chatStreamReady = false;
      state.chatStreamRetry = Math.min((state.chatStreamRetry || 0) + 1, 6);
      window.setTimeout(startChatStream, 1000 * state.chatStreamRetry);
    };

    state.chatStream = stream;
  }

  function bindChatLiveRefresh() {
    const wake = () => {
      if (document.hidden) return;
      pollChatRooms({ force: true });
      if (!state.chatStream) startChatStream();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
  }

  function captureAuthFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const auth = params.get('auth');
      if (token && API && typeof API.setToken === 'function') {
        API.setToken(token);
      }
      if (token || auth === 'yandex_ok' || auth === 'failed' || auth === 'no_email') {
        const clean = window.location.pathname + window.location.hash;
        window.history.replaceState({}, '', clean || './');
      }
      if (auth === 'failed') return { ok: false, error: 'Не удалось войти через Яндекс. Попробуйте ещё раз.' };
      if (auth === 'no_email') return { ok: false, error: 'У аккаунта Яндекса нет email. Добавьте почту и повторите вход.' };
      if (token || auth === 'yandex_ok') return { ok: true };
    } catch {
      /* ignore */
    }
    return null;
  }

  function showAuthScreen(errorText) {
    const root = $('#auth-screen');
    if (!root) return;
    root.hidden = false;
    document.body.classList.add('auth-open');
    document.body.classList.remove('onboarding-open');
    const err = $('#auth-screen-error');
    if (err) {
      if (errorText) {
        err.hidden = false;
        err.textContent = errorText;
      } else {
        err.hidden = true;
        err.textContent = '';
      }
    }
  }

  function hideAuthScreen(markDone = true) {
    const root = $('#auth-screen');
    if (root) root.hidden = true;
    document.body.classList.remove('auth-open');
    if (markDone) state.authDone = true;
  }

  function syncAuthConsentButton() {
    const btn = $('#auth-yandex-btn');
    const terms = $('#auth-consent-terms');
    const privacy = $('#auth-consent-privacy');
    if (!btn || !terms || !privacy) return;
    if (btn.classList.contains('is-loading')) return;
    const allowed = terms.checked && privacy.checked;
    btn.disabled = !allowed;
    btn.setAttribute('aria-disabled', allowed ? 'false' : 'true');
  }

  function bindAuth() {
    const btn = $('#auth-yandex-btn');
    if (!btn) return;
    $('#auth-consent-terms')?.addEventListener('change', syncAuthConsentButton);
    $('#auth-consent-privacy')?.addEventListener('change', syncAuthConsentButton);
    syncAuthConsentButton();
    btn.onclick = () => {
      const terms = $('#auth-consent-terms')?.checked;
      const privacy = $('#auth-consent-privacy')?.checked;
      if (!terms || !privacy) {
        showAuthScreen('Чтобы войти, примите условия и политику конфиденциальности.');
        syncAuthConsentButton();
        return;
      }
      try {
        sessionStorage.setItem('loza_pending_consents', JSON.stringify({ terms: true, privacy: true }));
      } catch {
        /* ignore */
      }
      const url = API && API.yandexLoginUrl;
      if (!url) {
        showAuthScreen('Ссылка входа недоступна. Обновите страницу.');
        return;
      }
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      const label = btn.querySelector('span:last-child');
      if (label) label.textContent = 'Переходим…';
      window.location.href = url;
    };
  }

  async function syncPendingConsents() {
    if (!state.user) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem('loza_pending_consents') || 'null');
    } catch {
      pending = null;
    }
    if (pending?.terms || pending?.privacy) {
      try {
        const data = await API.acceptConsents({
          terms: Boolean(pending.terms),
          privacy: Boolean(pending.privacy),
        });
        state.user = data.user || state.user;
      } catch {
        /* show gate below */
      }
      try { sessionStorage.removeItem('loza_pending_consents'); } catch { /* ignore */ }
    }
    if (needsLegalConsents()) openLegalConsentsGate();
  }

  function isAuthorized() {
    return Boolean(API && typeof API.getToken === 'function' && API.getToken());
  }

  function renderOnboarding() {
    const root = $('#onboarding');
    const slidesHost = $('#onboarding-slides');
    const dotsHost = $('#onboarding-dots');
    const nextBtn = $('#onboarding-next');
    if (!root || !slidesHost || !dotsHost || !nextBtn) return;

    slidesHost.innerHTML = ONBOARDING_SLIDES.map((slide, i) =>
      `<div class="onboarding-slide${i === state.onboardingStep ? ' is-active' : ''}" data-step="${i}">
        <picture>
          <source media="(min-width: 981px)" srcset="${localAsset(slide.desktop)}" type="image/webp" />
          <img src="${localAsset(slide.mobile)}" alt="" decoding="async" ${i === 0 ? '' : 'loading="lazy"'} />
        </picture>
      </div>`,
    ).join('');

    dotsHost.innerHTML = ONBOARDING_SLIDES.map((_, i) =>
      `<i class="${i === state.onboardingStep ? 'is-active' : ''}"></i>`,
    ).join('');

    const isLast = state.onboardingStep >= ONBOARDING_SLIDES.length - 1;
    nextBtn.textContent = isLast ? 'Начать' : 'Далее';
    root.hidden = false;
    document.body.classList.add('onboarding-open');
  }

  function syncOnboardingStep() {
    const slides = $$('.onboarding-slide');
    const dots = $$('#onboarding-dots i');
    slides.forEach((el, i) => el.classList.toggle('is-active', i === state.onboardingStep));
    dots.forEach((el, i) => el.classList.toggle('is-active', i === state.onboardingStep));
    const nextBtn = $('#onboarding-next');
    if (nextBtn) {
      nextBtn.textContent = state.onboardingStep >= ONBOARDING_SLIDES.length - 1 ? 'Начать' : 'Далее';
    }
  }

  function finishOnboarding() {
    state.onboardingDone = true;
    const root = $('#onboarding');
    if (root) root.hidden = true;
    document.body.classList.remove('onboarding-open');
    if (isAuthorized()) {
      hideAuthScreen();
      return;
    }
    showAuthScreen();
  }

  function bindOnboarding() {
    const nextBtn = $('#onboarding-next');
    if (!nextBtn) return;
    nextBtn.onclick = () => {
      if (state.onboardingStep < ONBOARDING_SLIDES.length - 1) {
        state.onboardingStep += 1;
        syncOnboardingStep();
        return;
      }
      finishOnboarding();
    };
  }

  function shouldShowOnboarding() {
    return !isAuthorized();
  }

  async function loadSession() {
    if (!isAuthorized()) {
      state.user = null;
      state.access = null;
      state.aiUsage = null;
      return null;
    }
    try {
      const data = await API.me();
      state.user = data.user || null;
      state.access = data.access || null;
      state.aiUsage = data.aiUsage || null;
      state.paymentProvider = data.paymentProvider || state.paymentProvider;
      if (!state.user) {
        API.setToken('');
        state.access = null;
        state.aiUsage = null;
      }
      return state.user;
    } catch {
      state.user = null;
      state.access = null;
      state.aiUsage = null;
      return null;
    }
  }

  async function loadPublicConfig() {
    try {
      const cfg = await API.publicConfig();
      state.plans = Array.isArray(cfg.plans) ? cfg.plans : [];
      state.freeTier = cfg.freeTier || null;
      state.paymentProvider = cfg.paymentProvider || state.paymentProvider;
    } catch {
      /* keep defaults */
    }
  }

  async function init() {
    const authReturn = captureAuthFromUrl();
    bindAuth();
    await Promise.all([loadSession(), loadPublicConfig()]);
    await handlePaymentReturn();
    renderNav();
    setTab('home');

    if (isAuthorized() && state.user) {
      state.onboardingDone = true;
      state.authDone = true;
      hideAuthScreen();
      const onboarding = $('#onboarding');
      if (onboarding) onboarding.hidden = true;
      await syncPendingConsents();
    } else if (authReturn && authReturn.ok === false) {
      state.onboardingDone = true;
      showAuthScreen(authReturn.error);
    } else if (shouldShowOnboarding()) {
      renderOnboarding();
      bindOnboarding();
    }

    await Promise.all([loadContent(), loadFeed(), loadChatRooms()]);
    startChatStream();
    bindChatLiveRefresh();
    syncHeaderIdentity();
    renderScreen();
    setTimeout(() => {
      state.booting = false;
      $('#splash')?.classList.add('splash-screen-hide');
      setTimeout(() => $('#splash')?.remove(), 500);
    }, 700);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
