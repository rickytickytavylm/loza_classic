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
    chatStreamSeenAt: 0,
    chatPollTimer: null,
    chatPollTick: 0,
    chatPollBusy: false,
    chatView: 'rooms',
    selectedRoomId: '',
    chatCompose: null, // { mode: 'reply'|'edit', messageId, preview, authorName, body? }
    chatAttachments: [], // { localId, previewUrl, status: 'uploading'|'ready'|'error', id? }
    pushEndpoint: '',
    // Per-room read marks: { [roomId]: { id, at } } — the newest message the
    // user actually saw. Drives unread badges and "resume where you left off".
    chatReads: (() => {
      try { return JSON.parse(localStorage.getItem('loza-chat-reads') || '{}'); } catch { return {}; }
    })(),
    chatUnreadAnchor: null, // { roomId, beforeId } — where the "new messages" line sits
    chatScrollPending: false, // next thread render should apply the resume position
    chatTyping: null, // { roomId, authorName, until }
    chatHistoryLoading: false,
    chatStreamStatus: 'connecting', // connecting | live | offline
    // Persisted so your own messages stay "yours" after a reload, even when the
    // session drops and the server briefly treats you as a fresh guest.
    myChatMessageIds: new Set((() => {
      try { return JSON.parse(localStorage.getItem('loza-my-chat-ids') || '[]'); } catch { return []; }
    })()),
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
    if (tier === 'library') return 'Медиатека. Теория';
    if (tier === 'club') return 'Клуб';
    if (tier === 'club_plus') return 'Клуб Плюс';
    return 'Базовый';
  }

  function isStaffUser() {
    return Boolean(state.access?.isStaff)
      || ['OWNER', 'ADMIN', 'CURATOR'].includes(state.user?.role);
  }

  function hasLibraryAccess() {
    return isStaffUser() || ['library', 'club', 'club_plus'].includes(currentTier());
  }

  function canPostInRoom(room) {
    if (!room || room.locked) return false;
    if (room.canPost !== false) return true;
    return isStaffUser();
  }

  function libraryPlanInfo(plan) {
    return plan?.info || D.LIBRARY_PLAN_INFO || '';
  }

  function planCardHtml(plan, { featured = false } = {}) {
    const price = `${Number(plan.priceRub).toLocaleString('ru-RU')} ₽`;
    const days = plan.planDays === 90 ? '90 дней' : '30 дней';
    const renew = plan.autoRenew ? ' · автопродление' : '';
    const info = plan.code === 'library_30' ? libraryPlanInfo(plan) : '';
    const title = info
      ? `<span class="plan-card-title-row">
          <strong>${esc(plan.planName)}</strong>
          <button type="button" class="plan-info-btn" data-plan-info="${esc(plan.code)}" aria-expanded="false" aria-label="Что входит">${ic('helpCircle', 16)}</button>
        </span>
        <p class="plan-info-tip" data-plan-tip="${esc(plan.code)}" hidden>${esc(info)}</p>`
      : `<strong>${esc(plan.planName)}</strong>`;
    return `<div class="plan-card${featured ? ' is-featured' : ''}" data-buy-plan="${esc(plan.code)}" role="button" tabindex="0">
      ${title}
      <span class="plan-card-price">${price}<small> / ${days}${renew}</small></span>
      <span class="plan-card-desc">${esc(plan.description || '')}</span>
    </div>`;
  }

  function bindPlanInfoToggles(root = document) {
    $$('[data-plan-info]', root).forEach((btn) => {
      btn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const code = btn.dataset.planInfo;
        const tip = root.querySelector(`[data-plan-tip="${code}"]`)
          || document.querySelector(`[data-plan-tip="${code}"]`);
        if (!tip) return;
        const open = tip.hasAttribute('hidden');
        tip.toggleAttribute('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
    });
  }

  // Web Push helpers (server-sent notifications via VAPID)
  function isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || navigator.standalone === true
      || document.referrer?.includes('android-app://');
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function canUseWebPush() {
    return Boolean(
      isPWA()
      && 'Notification' in window
      && 'serviceWorker' in navigator
      && 'PushManager' in window,
    );
  }

  function getNotificationSetting() {
    try {
      return localStorage.getItem('loza-notify-enabled') === '1';
    } catch {
      return false;
    }
  }

  function setNotificationSetting(value) {
    try {
      localStorage.setItem('loza-notify-enabled', value ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function getPushSubscription() {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg?.pushManager) return null;
    return reg.pushManager.getSubscription();
  }

  /** Remember this device's push endpoint so it can be skipped on its own posts. */
  async function syncPushEndpoint() {
    try {
      const sub = await getPushSubscription();
      state.pushEndpoint = sub?.endpoint || '';
    } catch {
      /* push may be unavailable; nothing to skip then */
    }
  }

  async function subscribeWebPush() {
    const keyData = await API.pushVapidKey();
    const publicKey = keyData.publicKey;
    if (!publicKey) throw new Error('PUSH_NOT_CONFIGURED');

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await API.pushSubscribe(subscription.toJSON());
    state.pushEndpoint = subscription.endpoint || '';
    return subscription;
  }

  async function unsubscribeWebPush() {
    const subscription = await getPushSubscription();
    if (!subscription) {
      setNotificationSetting(false);
      return;
    }
    try {
      await API.pushUnsubscribe(subscription.endpoint);
    } catch {
      /* still drop local subscription */
    }
    try {
      await subscription.unsubscribe();
    } catch {
      /* ignore */
    }
    setNotificationSetting(false);
  }

  async function testPushNotification() {
    try {
      await API.pushTest();
      showAppToast('Тестовое уведомление отправлено', { title: 'Уведомления' });
    } catch (error) {
      const code = String(error?.message || '');
      if (code === 'NO_PUSH_SUBSCRIPTION') {
        showAppToast('Сначала включите уведомления тумблером', { title: 'Уведомления', tone: 'warn' });
      } else if (code === 'PUSH_NOT_CONFIGURED') {
        showAppToast('Push ещё не настроен на сервере', { title: 'Уведомления', tone: 'warn' });
      } else {
        showAppToast('Не удалось отправить тест', { title: 'Уведомления', tone: 'warn' });
      }
    }
  }

  async function toggleNotifications(nextEnabled) {
    if (!canUseWebPush()) {
      if (!isPWA()) {
        showAppToast('Установите приложение на домашний экран', { title: 'Уведомления', tone: 'warn' });
      } else if (isIOS()) {
        showAppToast('Разрешите уведомления в настройках iPhone', { title: 'Уведомления', tone: 'warn' });
      } else {
        showAppToast('Уведомления недоступны в этом браузере', { title: 'Уведомления', tone: 'warn' });
      }
      return false;
    }

    if (!nextEnabled) {
      await unsubscribeWebPush();
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotificationSetting(false);
      showAppToast('Разрешите уведомления в настройках телефона', { title: 'Уведомления', tone: 'warn' });
      return false;
    }

    try {
      await subscribeWebPush();
      setNotificationSetting(true);
      // Real server push with congratulations — not a local fake.
      await testPushNotification();
      return true;
    } catch (error) {
      setNotificationSetting(false);
      const code = String(error?.message || '');
      showAppToast(
        code === 'PUSH_NOT_CONFIGURED'
          ? 'Push ещё не настроен на сервере'
          : 'Не удалось включить уведомления',
        { title: 'Уведомления', tone: 'warn' },
      );
      return false;
    }
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
    movies: 'Киноклуб',
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
    if (tab === 'movies') {
      state.mediaSection = 'movies';
      tab = 'media';
    }
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
      clearChatCompose();
      clearChatAttachments();
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
        <p>В чате для общения напишите пару слов о себе.</p>
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
        <button class="icon-button paywall-close" type="button" id="modal-x" aria-label="Закрыть">${ic('x', 18)}</button>
        <span class="paywall-kicker">Чаты клуба</span>
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
      `<button type="button" class="${state.tab === n.id ? 'active' : ''}" data-tab="${n.id}">${esc(n.label)}${n.id === 'chat' ? navUnreadBadgeHtml() : ''}</button>`,
    ).join('');
    mobile.innerHTML = D.NAV.map((n) =>
      `<button type="button" class="${state.tab === n.id ? 'active' : ''}" data-tab="${n.id}">${ic(n.id, 20)}<span>${esc(n.label)}</span>${n.id === 'chat' ? navUnreadBadgeHtml() : ''}</button>`,
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
      b.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const post = state.feedPosts.find((p) => p.id === b.dataset.share);
        if (!post) return;
        const index = Math.max(0, state.feedPosts.findIndex((p) => p.id === post.id));
        const authorName = post.authorName || post.author || 'Лоза';
        // No post body on the card/message — only cover + link (Telegram-friendly).
        shareWithPreview({
          title: 'Лоза',
          cardTitle: '',
          eyebrow: authorName === 'Лоза' ? 'Лоза · лента' : `${authorName} · Лоза`,
          url: `${window.location.origin}${window.location.pathname}?post=${encodeURIComponent(post.id)}`,
          imageUrl: resolveShareImageUrl(post.imageUrl || post.image || post.coverUrl, index),
        }).catch(() => {
          showAppToast('Не удалось поделиться', { title: 'Поделиться', tone: 'warn' });
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

  function formatShareUrlForCard(url) {
    try {
      const u = new URL(url, window.location.origin);
      const path = `${u.pathname}${u.search}`.replace(/\/$/, '');
      return `${u.host}${path === '/' ? '' : path}`;
    } catch {
      return String(url || 'loza-club.ru').replace(/^https?:\/\//i, '');
    }
  }

  function loadShareImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error('no image'));
        return;
      }
      const img = new Image();
      // blob:/data: never need CORS; same-origin paths are fine without it too.
      if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = src;
    });
  }

  async function loadShareImageSafe(src) {
    const url = String(src || '').trim();
    if (!url) throw new Error('no image');
    // Fetch→blob keeps the canvas untainted when the host sends CORS headers.
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        return await loadShareImage(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return loadShareImage(url);
    }
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
   * Branded share card: cover + optional short label + deep link on the image.
   * Telegram/WhatsApp often split file+text into two messages, so we share the
   * file alone and put the URL on the card itself.
   */
  async function buildShareCardFile({
    title = '',
    eyebrow = 'Лоза',
    imageUrl,
    shareUrl = '',
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

    const mediaH = Math.round(H * 0.68);
    try {
      const img = await loadShareImageSafe(imageUrl);
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

    const veil = ctx.createLinearGradient(0, mediaH * 0.4, 0, H);
    veil.addColorStop(0, 'rgba(28, 23, 36, 0)');
    veil.addColorStop(0.5, 'rgba(28, 23, 36, 0.72)');
    veil.addColorStop(1, '#1c1724');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);

    try {
      await document.fonts?.ready;
    } catch {
      /* keep system fallbacks */
    }

    const pad = 72;
    const hasTitle = Boolean(String(title || '').trim());

    ctx.fillStyle = 'rgba(243, 235, 227, 0.78)';
    ctx.font = '600 34px Onest, Manrope, sans-serif';
    ctx.fillText(shareSnippet(eyebrow, 42).toUpperCase(), pad, hasTitle ? H - 292 : H - 168);

    if (hasTitle) {
      ctx.fillStyle = '#fffaf4';
      ctx.font = '700 52px Unbounded, Onest, sans-serif';
      const titleLines = wrapShareCardLines(ctx, title, W - pad * 2, 2);
      titleLines.forEach((line, i) => {
        ctx.fillText(line, pad, H - 230 + i * 64);
      });
    }

    ctx.fillStyle = 'rgba(255, 250, 244, 0.55)';
    ctx.font = '600 28px Onest, Manrope, sans-serif';
    const linkLines = wrapShareCardLines(ctx, formatShareUrlForCard(shareUrl), W - pad * 2, 2);
    linkLines.forEach((line, i) => {
      ctx.fillText(line, pad, H - 88 + i * 36);
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
    });
    return new File([blob], 'loza-share.jpg', { type: 'image/jpeg' });
  }

  async function shareWithPreview({ title, url, imageUrl, eyebrow, cardTitle }) {
    const shareUrl = url || `${window.location.origin}${window.location.pathname}`;
    const labelOnCard = cardTitle !== undefined ? cardTitle : (title || '');

    if (navigator.share) {
      try {
        const card = await buildShareCardFile({
          title: labelOnCard,
          eyebrow: eyebrow || 'Лоза',
          imageUrl: resolveShareImageUrl(imageUrl),
          shareUrl,
        });
        // Files ONLY — text/url alongside a file becomes a second Telegram message.
        if (!navigator.canShare || navigator.canShare({ files: [card] })) {
          await navigator.share({ files: [card] });
          return;
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }

      try {
        await navigator.share({ title: title || 'Лоза', url: shareUrl });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
        try {
          await navigator.share({ title: title || 'Лоза', text: shareUrl });
          return;
        } catch (err2) {
          if (err2?.name === 'AbortError') return;
        }
      }
    }

    try {
      await navigator.clipboard?.writeText(shareUrl);
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
      const kind = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : item.kind === 'movie' ? 'Киноклуб' : 'Текст';
      const lockBadge = item.locked
        ? '<span class="access-badge locked">Закрытый клуб</span>'
        : '<span class="access-badge free">Открыто</span>';
      const ctaLabel = item.locked
        ? 'Открыть доступ'
        : (item.kind === 'video' ? 'Смотреть' : item.kind === 'audio' ? 'Слушать' : item.kind === 'movie' ? 'Открыть' : 'Читать');
      const lockOverlay = item.locked
        ? `<span class="media-lock-overlay" aria-hidden="true">${ic('lock', 22)}<em>Материал закрытого клуба</em></span>`
        : '';
      const cover = item.poster
        ? `<img alt="" src="${esc(asset(item.poster))}" loading="lazy" />`
        : `<img alt="" src="${bgImage(i)}" loading="lazy" />`;
      return `<article class="media-feed-card${item.locked ? ' is-locked' : ''}" data-item="${esc(item.id)}">
        <div class="media-feed-card-head"><img class="media-feed-card-logo" src="${asset('/assets/webp/new_logo.webp')}" alt="" /><span>Лоза · ${esc(sectionTitle(item.sectionId))} · ${kind}</span>${lockBadge}</div>
        <button class="media-feed-card-visual" type="button" data-open-item="${esc(item.id)}">${cover}${lockOverlay}</button>
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
      b.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const item = state.libraryItems.find((x) => x.id === b.dataset.shareItem);
        if (!item) return;
        // Use the same local cover the card shows — avoids CORS/tainted-canvas failures.
        const filtered = filteredMediaItems();
        const visualIndex = Math.max(0, filtered.findIndex((x) => x.id === item.id));
        const kindLabel = item.kind === 'video' ? 'Видео' : item.kind === 'audio' ? 'Аудио' : 'Материал';
        const cover = item.kind === 'audio' ? audioCoverForItem(item.id) : bgImage(visualIndex);
        shareWithPreview({
          title: shareSnippet(M.cleanDisplayText?.(item.title) || item.title, 72),
          cardTitle: shareSnippet(M.cleanDisplayText?.(item.title) || item.title, 72),
          eyebrow: `Лоза · ${kindLabel}`,
          url: `${window.location.origin}${window.location.pathname}?media=${encodeURIComponent(item.id)}`,
          imageUrl: resolveShareImageUrl(cover, visualIndex),
        }).catch(() => {
          showAppToast('Не удалось поделиться', { title: 'Поделиться', tone: 'warn' });
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

    // Constant spacer under overlay chrome (Twitter/Instagram pattern):
    // padding equals bar height and NEVER changes on hide/show — so the first
    // card is visible at rest, and collapsing the bar is transform-only (no jump).
    let hidden = false;
    let lastTop = scroller.scrollTop;
    let ticking = false;

    const syncPad = () => {
      const h = Math.ceil(controls.scrollHeight || controls.getBoundingClientRect().height);
      if (!h) return;
      page.style.setProperty('--media-controls-h', `${h}px`);
    };

    const setHidden = (next) => {
      if (next === hidden) return;
      if (next && document.activeElement?.closest?.('.media-feed-controls')) return;
      hidden = next;
      page.classList.toggle('media-controls-hidden', hidden);
    };

    syncPad();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncPad) : null;
    ro?.observe(controls);

    scroller.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const top = scroller.scrollTop;
        const delta = top - lastTop;
        lastTop = top;
        if (top <= 4) {
          setHidden(false);
          return;
        }
        if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
      });
    }, { passive: true });

    root._mediaControlsRemeasure = syncPad;
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
    if (item.sectionId === 'movies' || item.kind === 'movie') {
      openMovie(item.movieId || item.id);
      return;
    }
    if (item.locked) {
      openPaywall({
        reason: 'library',
        title: 'Материал в закрытой медиатеке',
        text: 'Откройте тариф «Медиатека. Теория» или «Клуб», чтобы смотреть и слушать материалы без ограничений.',
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
      return planCardHtml(plan, { featured });
    }).join('');

    document.body.classList.add('paywall-open');
    $('#portal').innerHTML = `<div class="modal-backdrop paywall-backdrop" id="modal-close">
      <section class="paywall-modal glass-panel" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <button class="icon-button paywall-close" type="button" id="modal-x" aria-label="Закрыть">${ic('x', 18)}</button>
        <span class="paywall-kicker">Закрытый клуб</span>
        <h2>${esc(title || 'Открыть доступ')}</h2>
        <p>${esc(text || 'Выберите тариф по условиям клуба Лоза.')}</p>
        <div class="paywall-benefits">
          <span>Медиатека. Теория</span><span>Чаты клуба</span><span>AI-наставник</span>
        </div>
        <div class="plan-grid">${cards || '<p class="checkout-note">Тарифы пока недоступны. Обновите страницу.</p>'}</div>
        <p class="checkout-note" id="paywall-status"></p>
        <button type="button" class="paywall-later" id="paywall-later">Позже</button>
      </section>
    </div>`;
    bindModalClose();
    bindPlanInfoToggles($('#portal'));
    $('#paywall-later')?.addEventListener('click', closePortal);
    $$('[data-buy-plan]', $('#portal')).forEach((btn) => {
      btn.onclick = (event) => {
        if (event.target.closest('[data-plan-info]')) return;
        startCheckout(btn.dataset.buyPlan, $('#paywall-status'));
      };
    });
  }

  function showAppToast(message, { title = 'Лоза', tone = 'ok', onOpen = null, hold = 4200 } = {}) {
    let host = $('#app-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'app-toast-host';
      document.body.appendChild(host);
    }
    host.innerHTML = `<div class="app-toast app-toast-${esc(tone)}${onOpen ? ' is-clickable' : ''}" role="status">
      <div class="app-toast-copy"${onOpen ? ' id="app-toast-open" role="button" tabindex="0"' : ''}><strong>${esc(title)}</strong><p>${esc(message)}</p></div>
      <button type="button" class="app-toast-close" id="app-toast-close" aria-label="Закрыть">${onOpen ? ic('x', 16) : 'Закрыть'}</button>
    </div>`;
    const close = () => { host.innerHTML = ''; };
    $('#app-toast-close', host)?.addEventListener('click', close);
    if (onOpen) {
      $('#app-toast-open', host)?.addEventListener('click', () => {
        close();
        onOpen();
      });
    }
    window.setTimeout(close, hold);
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
    return localAsset(`assets/webp/audio-cover-${String((hash % 10) + 1).padStart(2, '0')}.webp`);
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
    try {
      // Keep the tail bounded so localStorage never grows without limit.
      const ids = [...state.myChatMessageIds].slice(-600);
      state.myChatMessageIds = new Set(ids);
      localStorage.setItem('loza-my-chat-ids', JSON.stringify(ids));
    } catch {
      /* storage full or unavailable — in-memory set still works */
    }
  }

  // If we think we are logged in but the server saved the message under a
  // different (guest) author, the session token was silently rejected. Tell the
  // user once and re-check the session so they can sign back in.
  let guestDegradationWarned = false;
  function maybeWarnGuestDegradation(message) {
    const myId = state.user?.id;
    const authorId = message?.author?.id || message?.authorId;
    if (!myId || !authorId || authorId === myId) return;
    if (guestDegradationWarned) return;
    guestDegradationWarned = true;
    showAppToast('Сессия истекла — сообщение ушло как гость. Войдите заново, чтобы писать под своим именем.', {
      title: 'Вход',
      tone: 'warn',
      hold: 7000,
    });
    loadSession();
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

    html = html.replace(
      /#([\p{L}\p{N}_]{2,40})/gu,
      '<span class="chat-hashtag">#$1</span>',
    );
    // Keep line breaks from textarea (Telegram-style multi-line messages).
    return html.replace(/\n/g, '<br>');
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

  /** Cancel reply/edit from the compose bar and drop the borrowed draft text. */
  function cancelChatCompose() {
    const wasEdit = state.chatCompose?.mode === 'edit';
    clearChatCompose();
    const draft = $('#chat-draft');
    if (wasEdit && draft) {
      draft.value = '';
      resizeChatDraft(draft);
    }
    renderChatLive();
  }

  const MAX_CHAT_ATTACHMENTS = 4;

  function clearChatAttachments() {
    state.chatAttachments.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    state.chatAttachments = [];
  }

  function releaseChatAttachmentPreviews(items) {
    // Let the optimistic bubble keep its blob preview until the real one loads.
    // Generous window: on a slow uplink the server copy can take a while, and a
    // revoked blob would blank the sender's own photo mid-flight.
    window.setTimeout(() => {
      (items || []).forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    }, 60000);
  }

  /** Local-only bubble shown while the request is in flight. */
  function addPendingChatMessage(body, attachments, compose) {
    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId);
    if (!room) return null;
    const message = {
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: room.id,
      body,
      createdAt: new Date().toISOString(),
      authorId: currentChatUserId(),
      authorName: state.user?.name || 'Вы',
      reactions: [],
      attachments: (attachments || []).map((item) => ({ url: item.previewUrl, mimeType: 'image/*' })),
      replyTo: compose?.mode === 'reply'
        ? { id: compose.messageId, authorName: compose.authorName, body: compose.preview }
        : null,
      mine: true,
      pending: true,
    };
    room.messages.push(message);
    return message;
  }

  function removePendingChatMessage(message) {
    if (!message) return;
    const room = state.chatRooms.find((item) => item.id === message.roomId);
    if (!room) return;
    room.messages = room.messages.filter((item) => item.id !== message.id);
  }

  function removeChatAttachment(localId) {
    const item = state.chatAttachments.find((entry) => entry.localId === localId);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    state.chatAttachments = state.chatAttachments.filter((entry) => entry.localId !== localId);
    renderChatLive();
  }

  async function addChatAttachments(files) {
    const free = MAX_CHAT_ATTACHMENTS - state.chatAttachments.length;
    if (free <= 0) {
      showAppToast(`Можно прикрепить не больше ${MAX_CHAT_ATTACHMENTS} фото`, { title: 'Чат', tone: 'warn' });
      return;
    }
    const picked = [...files].filter((file) => /^image\//i.test(file.type)).slice(0, free);
    if (!picked.length) return;

    // Optimistic previews first, then upload each in the background.
    const pending = picked.map((file) => ({
      localId: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      previewUrl: URL.createObjectURL(file),
      status: 'uploading',
      file,
    }));
    state.chatAttachments = [...state.chatAttachments, ...pending];
    renderChatLive();

    await Promise.all(pending.map(async (entry) => {
      try {
        // The reverse proxy in front of the API rejects multipart bodies around
        // 1 MB, so phone photos need to be shrunk client-side before upload.
        const file = await shrinkChatImage(entry.file);
        const data = await API.uploadChatImage(file);
        const current = state.chatAttachments.find((item) => item.localId === entry.localId);
        if (!current) return;
        current.id = data.attachment?.id;
        current.status = current.id ? 'ready' : 'error';
      } catch (error) {
        const current = state.chatAttachments.find((item) => item.localId === entry.localId);
        if (current) current.status = 'error';
        showAppToast(
          String(error?.message) === 'IMAGE_TOO_LARGE'
            ? 'Фото больше 6 МБ — выберите другое'
            : 'Не удалось загрузить фото',
          { title: 'Чат', tone: 'warn' },
        );
      }
    }));
    renderChatLive();
  }

  /**
   * Downscale phone photos to chat-friendly dimensions. The backend accepts up
   * to 6 MB, but the proxy in front of it dies at roughly 1 MB, so we target
   * ~700 KB JPEG output at 2048px on the long side.
   */
  async function shrinkChatImage(file) {
    const maxSide = 2048;
    const targetBytes = 700 * 1024;
    if (file.size <= targetBytes && !/image\/(heic|heif)/i.test(file.type)) {
      return file;
    }

    try {
      const source = await loadChatImageSource(file);
      const { width, height } = source;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source.bitmap, 0, 0, canvas.width, canvas.height);
      if (source.bitmap.close) source.bitmap.close();

      let quality = 0.92;
      let blob = await canvasToBlob(canvas, quality);
      while (blob.size > targetBytes && quality > 0.5) {
        quality -= 0.1;
        blob = await canvasToBlob(canvas, quality);
      }
      return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    } catch {
      return file;
    }
  }

  async function loadChatImageSource(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        return { bitmap, width: bitmap.width, height: bitmap.height };
      } catch {
        /* fall back to <img> decoding below (e.g. HEIC on some engines) */
      }
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  function renderChatAttachmentTray() {
    if (!state.chatAttachments.length) return '';
    const items = state.chatAttachments.map((item) => `
      <div class="chat-attach-chip${item.status === 'uploading' ? ' is-uploading' : ''}${item.status === 'error' ? ' is-error' : ''}">
        <img src="${esc(item.previewUrl)}" alt="" />
        ${item.status === 'uploading' ? '<span class="chat-attach-spinner" aria-label="Загрузка"></span>' : ''}
        ${item.status === 'error' ? `<span class="chat-attach-error" aria-hidden="true">${ic('x', 16)}</span>` : ''}
        <button type="button" class="chat-attach-remove" data-attach-remove="${esc(item.localId)}" aria-label="Убрать фото">${ic('x', 14)}</button>
      </div>`).join('');
    return `<div class="chat-attach-tray" id="chat-attach-tray">${items}</div>`;
  }

  function chatComposeSlotSignature() {
    const compose = state.chatCompose;
    return shortHash([
      compose ? `${compose.mode}:${compose.messageId}:${compose.preview || ''}` : '',
      state.chatAttachments.map((item) => `${item.localId}:${item.status}`).join(','),
    ].join('\u0001'));
  }

  function chatAttachmentsHtml(message) {
    const images = (message.attachments || []).filter((item) => (
      !item.mimeType || /^image\//i.test(item.mimeType)
    ));
    if (!images.length) return '';
    const tiles = images.map((item) => `
      <button type="button" class="bubble-photo" data-photo="${esc(item.url)}">
        <img src="${esc(item.url)}" alt="${esc(item.fileName || 'Фото')}" loading="lazy" decoding="async" />
      </button>`).join('');
    return `<div class="bubble-photos${images.length > 1 ? ' is-grid' : ''}">${tiles}</div>`;
  }

  function openChatPhoto(url) {
    $('#portal').innerHTML = `<div class="photo-viewer-backdrop" id="modal-close">
      <button type="button" class="photo-viewer-close" id="modal-x" aria-label="Закрыть">${ic('x', 22)}</button>
      <img class="photo-viewer-image" src="${esc(url)}" alt="" onclick="event.stopPropagation()" />
    </div>`;
    bindModalClose();
  }

  function chatMessagePreview(message) {
    const body = String(message?.body || message?.text || '').trim();
    if (body) return body;
    return (message?.attachments || []).length ? 'Фото' : '';
  }

  function persistChatReads() {
    try { localStorage.setItem('loza-chat-reads', JSON.stringify(state.chatReads)); } catch { /* ignore */ }
  }

  let chatReadSyncTimer = 0;
  let chatReadSyncPending = null;

  /** Advance the room's read mark to this message; returns true when it moved. */
  function markChatMessageRead(roomId, message) {
    if (!roomId || !message || message.pending || message.failed) return false;
    const at = new Date(message.createdAt || 0).getTime();
    if (!at) return false;
    const current = state.chatReads[roomId];
    if (current && current.at >= at) return false;
    state.chatReads[roomId] = { id: message.id, at };
    persistChatReads();
    // Debounce the server sync so scroll doesn't spam the API.
    chatReadSyncPending = { roomId, messageId: message.id };
    if (!chatReadSyncTimer) {
      chatReadSyncTimer = window.setTimeout(() => {
        chatReadSyncTimer = 0;
        const job = chatReadSyncPending;
        chatReadSyncPending = null;
        if (!job) return;
        API.markChatRead(job.roomId, job.messageId).catch(() => {});
      }, 450);
    }
    const room = state.chatRooms.find((item) => item.id === roomId);
    if (room) room.serverUnreadCount = 0;
    return true;
  }

  function roomUnreadCount(room) {
    if (!room || room.locked) return 0;
    const mark = state.chatReads[room.id];
    // Prefer the live local mark once the user has opened the room at least once.
    if (!mark) return room.serverUnreadCount || 0;
    return (room.messages || []).filter((message) => (
      !message.pending
      && !message.failed
      && !isMyChatMessage(message)
      && new Date(message.createdAt || 0).getTime() > mark.at
    )).length;
  }

  function totalChatUnreadCount() {
    return state.chatRooms.reduce((sum, room) => sum + roomUnreadCount(room), 0);
  }

  function navUnreadBadgeHtml() {
    const count = totalChatUnreadCount();
    if (!count) return '';
    return `<span class="nav-unread-badge" aria-label="${count} непрочитанных">${count > 99 ? '99+' : count}</span>`;
  }

  function syncUnreadBadges() {
    const count = totalChatUnreadCount();
    const label = count > 99 ? '99+' : String(count);
    $$('[data-tab="chat"]').forEach((button) => {
      const badge = button.querySelector('.nav-unread-badge');
      if (!count) badge?.remove();
      else if (badge) {
        if (badge.textContent !== label) badge.textContent = label;
        badge.setAttribute('aria-label', `${count} непрочитанных`);
      } else {
        button.insertAdjacentHTML('beforeend', navUnreadBadgeHtml());
      }
    });

    if ('setAppBadge' in navigator) {
      const update = count
        ? navigator.setAppBadge(count)
        : navigator.clearAppBadge();
      Promise.resolve(update).catch(() => {});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.active?.postMessage({
          type: 'loza:set-badge',
          count,
        }))
        .catch(() => {});
    }
  }

  function unreadBadgeHtml(count) {
    if (!count) return '';
    return `<span class="chat-unread-badge">${count > 99 ? '99+' : count}</span>`;
  }

  /** First unread incoming message — the "Новые сообщения" line goes above it. */
  function computeUnreadAnchor(room) {
    if (!room || room.locked) return null;
    const mark = state.chatReads[room.id];
    if (!mark) return null;
    const first = (room.messages || []).find((message) => (
      !message.pending
      && !isMyChatMessage(message)
      && new Date(message.createdAt || 0).getTime() > mark.at
    ));
    return first ? { roomId: room.id, beforeId: first.id } : null;
  }

  let chatReadRaf = 0;

  /** Mark the bottom-most visible message as read; refresh badges when it moves. */
  function updateChatReadFromScroll(scroller) {
    if (!scroller || document.hidden) return;
    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId);
    if (!room) return;
    const scRect = scroller.getBoundingClientRect();
    if (!scRect.height) return; // thread is hidden (rooms view on mobile)
    let seenId = null;
    $$('.chat-bubble[data-message-id]', scroller).forEach((node) => {
      if (node.dataset.pending) return;
      if (node.getBoundingClientRect().top < scRect.bottom - 6) seenId = node.dataset.messageId;
    });
    if (!seenId) return;
    const message = (room.messages || []).find((item) => item.id === seenId);
    if (message && markChatMessageRead(room.id, message)) patchChatRoomPreviews();
  }

  function queueChatReadCheck() {
    if (chatReadRaf) return;
    chatReadRaf = window.requestAnimationFrame(() => {
      chatReadRaf = 0;
      updateChatReadFromScroll($('.telegram-messages'));
    });
  }

  /** Entering a room: remember where the "new" line goes and ask for a resume scroll. */
  function prepareChatThreadEntry(roomId) {
    const room = state.chatRooms.find((item) => item.id === roomId);
    state.chatUnreadAnchor = computeUnreadAnchor(room);
    state.chatScrollPending = true;
  }

  /** Scroll a freshly rendered thread: resume position or bottom for first visits. */
  function positionChatThread(scroller) {
    if (!scroller) return;
    const wantsResume = state.chatScrollPending
      && state.chatUnreadAnchor?.roomId === state.selectedRoomId;
    state.chatScrollPending = false;
    const anchorEl = wantsResume ? scroller.querySelector('[data-key="unread-divider"]') : null;
    if (anchorEl) {
      const scRect = scroller.getBoundingClientRect();
      const elRect = anchorEl.getBoundingClientRect();
      scroller.scrollTop += elRect.top - scRect.top - 72;
    } else {
      scroller.scrollTop = scroller.scrollHeight;
    }
    updateChatReadFromScroll(scroller);
  }

  function setChatReply(message) {
    state.chatCompose = {
      mode: 'reply',
      messageId: message.id,
      preview: chatMessagePreview(message).slice(0, 120),
      authorName: message.authorName || message.author?.name || 'Участник',
    };
    renderChatLive();
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
    renderChatLive();
    window.setTimeout(() => {
      const input = $('#chat-draft');
      if (!input) return;
      input.value = message.body || '';
      input.focus();
    }, 30);
  }

  /** Compact ASCII digest: attribute values normalise newlines, raw text cannot. */
  function shortHash(input) {
    let h1 = 0x811c9dc5;
    let h2 = 0x1000193;
    const text = String(input);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 = ((h1 ^ code) * 0x01000193) >>> 0;
      h2 = ((h2 + code) * 0x85ebca6b) >>> 0;
    }
    return `${h1.toString(36)}${h2.toString(36)}`;
  }

  /** Everything that changes a bubble's markup — used to skip untouched DOM. */
  function chatBubbleSignature(message, mine) {
    return shortHash([
      message.body || message.text || '',
      message.editedAt || '',
      mine ? 'm' : 'i',
      message.authorName || message.author?.name || '',
      (message.attachments || []).map((item) => item.url).join(','),
      (message.reactions || []).map((r) => `${r.emoji}${r.count}${r.mine ? '*' : ''}`).join(''),
      message.replyTo
        ? `${message.replyTo.id}${message.replyTo.deleted ? 'd' : ''}${message.replyTo.body || ''}`
        : '',
      message.createdAt || '',
      message.pending ? 'p' : '',
      message.failed ? 'f' : '',
      message.seenByOthers ? 's' : '',
      message.isPinned ? 'pin' : '',
    ].join('\u0001'));
  }

  /** Keyed timeline entries so the thread can be patched instead of rebuilt. */
  function chatTimelineItems(room) {
    const messages = room?.messages || [];
    if (!messages.length) {
      return [{
        key: 'empty',
        sig: 'empty',
        html: '<div class="empty-chat" data-key="empty" data-sig="empty"><p>Напишите первое сообщение.</p></div>',
      }];
    }

    const items = [];
    let lastDateKey = '';
    const anchor = state.chatUnreadAnchor?.roomId === room?.id ? state.chatUnreadAnchor : null;
    messages.forEach((message) => {
      if (anchor && anchor.beforeId === message.id) {
        items.push({
          key: 'unread-divider',
          sig: 'unread',
          html: '<div class="telegram-date-pill chat-unread-pill" data-key="unread-divider" data-sig="unread">Новые сообщения</div>',
        });
      }
      const stamp = message.createdAt || Date.now();
      const dateKey = new Date(stamp).toDateString();
      if (dateKey !== lastDateKey) {
        const key = `date-${dateKey}`;
        items.push({
          key,
          sig: dateKey,
          html: `<div class="telegram-date-pill" data-key="${esc(key)}" data-sig="${esc(dateKey)}">${esc(chatDateLabel(stamp))}</div>`,
        });
        lastDateKey = dateKey;
      }
      const mine = isMyChatMessage(message);
      const sig = chatBubbleSignature(message, mine);
      items.push({
        key: `msg-${message.id}`,
        sig,
        html: renderChatBubble(message, mine, sig),
      });
    });
    return items;
  }

  function renderChatBubble(message, mine, sig) {
    const signature = sig ?? chatBubbleSignature(message, mine);
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
    // One check = saved on the server; two = at least one other member has read it.
    const check = mine && !message.pending && !message.failed
      ? ic(message.seenByOthers ? 'checkCheck' : 'check', 15)
      : '';
    const sending = message.pending ? '<span class="bubble-sending" aria-label="Отправляется"></span>' : '';
    const failed = message.failed
      ? `<button type="button" class="bubble-retry" data-retry="${esc(message.id)}" aria-label="Повторить отправку">!</button>`
      : '';
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

    const photos = chatAttachmentsHtml(message);
    const photoClass = photos ? ' has-photos' : '';

    // Photos and link cards bring their own frame, so the coloured bubble around
    // them is just visual noise. A quote or the intro badge still needs one.
    const photoOnly = Boolean(photos) && !formattedBody && !meetings.length;
    const mediaOnly = (photoOnly || meetingOnly) && !reply && !intro;
    const mediaClass = `${mediaOnly ? ' is-media-only' : ''}${photoOnly && mediaOnly ? ' is-photo-only' : ''}`;

    return `<article class="chat-bubble ${mine ? 'mine' : 'incoming'}${introClass}${meetingClass}${photoClass}${mediaClass}${message.pending ? ' is-pending' : ''}${message.failed ? ' is-failed' : ''}" data-message-id="${esc(message.id)}" data-key="msg-${esc(message.id)}" data-sig="${esc(signature)}"${message.pending ? ' data-pending="1"' : ''}${message.failed ? ' data-failed="1"' : ''}>
      <div class="bubble-body">
        ${author}${reply}${introBadge}
        ${photos}
        ${bodyHtml}
        ${meetingCards}
        <div class="bubble-meta">${edited}<time>${formatBubbleTime(message.createdAt)}</time>${sending}${failed}${check}</div>
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

  function chatHeaderSubtitle(room) {
    const typing = state.chatTyping;
    if (typing && typing.roomId === room?.id && typing.until > Date.now()) {
      return `${typing.authorName} печатает…`;
    }
    if (state.chatStreamStatus === 'offline') return 'Нет связи · обновляем…';
    if (state.chatStreamStatus === 'connecting') return 'Подключение…';
    return room?.description || 'Живое общение участников';
  }

  function chatPinnedBarHtml(room) {
    const pinned = (room?.pinned || []).filter((item) => item.isPinned !== false);
    if (!pinned.length) return '';
    const top = pinned[0];
    return `<button type="button" class="chat-pinned-bar" data-scroll-to="${esc(top.id)}">
      <span class="chat-pinned-label">Закреплено</span>
      <span class="chat-pinned-text">${esc(chatMessagePreview(top) || 'Сообщение')}</span>
    </button>`;
  }

  function renderChat() {
    const selectedRoom = state.chatRooms.find((r) => r.id === state.selectedRoomId) || state.chatRooms[0];
    const preset = D.CHAT_BG_PRESETS.find((p) => p.id === state.chatBg) || D.CHAT_BG_PRESETS[0];

    const roomButtons = state.chatRooms.map((room, i) => {
      const last = room.messages?.[room.messages.length - 1];
      const preview = room.locked
        ? 'Доступно в тарифе «Клуб»'
        : (last ? chatMessagePreview(last) : (room.description || 'Пока нет сообщений'));
      const time = !room.locked && last ? `<time>${formatBubbleTime(last.createdAt)}</time>` : '';
      const lock = room.locked ? '<span class="access-badge locked">Клуб</span>' : '';
      const side = room.locked
        ? lock
        : `<span class="telegram-room-side">${time}${unreadBadgeHtml(roomUnreadCount(room))}</span>`;
      return `<button type="button" class="${room.id === selectedRoom?.id ? 'active' : ''}${room.locked ? ' is-locked' : ''}" data-room="${esc(room.id)}" data-locked="${room.locked ? '1' : '0'}">
        <span class="telegram-room-avatar" style="background-image:url(${bgImage(i)})"></span>
        <span class="telegram-room-copy"><strong>${esc(room.title)}</strong><small>${esc(preview)}</small></span>
        ${side}
      </button>`;
    }).join('');

    const timeline = chatTimelineItems(selectedRoom).map((item) => item.html);

    const roomsListInner = roomButtons
      ? `<div class="telegram-room-group">${roomButtons}</div>`
      : '<p class="chat-muted">Комнаты пока не созданы в базе.</p>';

    const placeholder = state.chatCompose?.mode === 'edit' ? 'Изменить сообщение' : 'Сообщение';
    const allowPost = canPostInRoom(selectedRoom);
    const composerHtml = allowPost
      ? `<div id="chat-compose-slot" data-sig="${esc(chatComposeSlotSignature())}">${renderChatComposeBar()}${renderChatAttachmentTray()}</div>
        <form class="telegram-composer" id="chat-form">
          <input type="file" id="chat-file" accept="image/*" multiple hidden />
          <button class="telegram-composer-attach" type="button" id="chat-attach" aria-label="Прикрепить фото">${ic('paperclip', 21)}</button>
          <textarea id="chat-draft" rows="1" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="enter"></textarea>
          <button class="telegram-composer-send" type="submit" aria-label="Отправить">${ic('arrowUp', 20)}</button>
        </form>`
      : `<div class="chat-readonly-note" role="status">Пишут только руководители и администраторы</div>`;

    return `<div class="telegram-chat-layout ${state.chatView === 'rooms' ? 'rooms-open' : 'thread-open'}">
      <aside class="telegram-room-list">
        <div class="telegram-room-list-head"><img class="telegram-room-list-logo" src="${asset('/assets/webp/new_logo.webp')}" alt="" /><h2>Чаты клуба</h2></div>
        ${roomsListInner}
      </aside>
      <section class="telegram-thread" style="${chatBgVars(preset)}">
        <header class="telegram-header">
          <button class="telegram-header-back" type="button" id="chat-back" aria-label="К списку чатов">${ic('chevronLeft', 22)}</button>
          <div class="telegram-header-pill">
            <strong>${esc(selectedRoom?.title || 'Чат клуба')}</strong>
            <span>${esc(chatHeaderSubtitle(selectedRoom))}</span>
          </div>
          <button class="telegram-header-settings" type="button" id="chat-settings" aria-label="Настройки фона чата">${ic('settings', 20)}</button>
        </header>
        ${chatPinnedBarHtml(selectedRoom)}
        <div class="telegram-messages">
          <div class="telegram-messages-canvas chat-background chat-background-${esc(preset.id)}" style="${chatBgVars(preset)}">
            ${selectedRoom?.hasMore ? '<div class="chat-history-hint" data-key="history-hint" data-sig="hint">Прокрутите вверх за историей</div>' : ''}
            ${timeline.join('')}
          </div>
        </div>
        ${composerHtml}
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
      attachments: message.attachments || previous?.attachments || [],
      seenByOthers: Boolean(message.seenByOthers || previous?.seenByOthers),
      isPinned: Boolean(message.isPinned),
      mine,
      pending: false,
      failed: false,
    };
    if (index >= 0) {
      room.messages[index] = { ...previous, ...normalized };
      return;
    }
    // The stream can echo our own message before the POST resolves; drop the
    // matching optimistic bubble so it never shows up twice.
    if (mine) {
      const twin = room.messages.findIndex((item) => (
        item.pending
        && (item.body || '') === (normalized.body || '')
        && (item.attachments || []).length === (normalized.attachments || []).length
      ));
      if (twin >= 0) room.messages.splice(twin, 1);
    }

    // Stream events can arrive out of order, so keep the timeline chronological.
    const stamp = new Date(normalized.createdAt || Date.now()).getTime();
    let at = room.messages.length;
    while (at > 0 && new Date(room.messages[at - 1].createdAt || 0).getTime() > stamp) at -= 1;
    room.messages.splice(at, 0, normalized);
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
    const staff = ['OWNER', 'ADMIN', 'CURATOR'].includes(state.user?.role);
    const emojis = (D.CHAT_QUICK_EMOJIS || []).map((emoji) =>
      `<button type="button" class="chat-emoji-pick" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`,
    ).join('');
    const ownActions = mine
      ? `<button type="button" data-chat-action="edit">${ic('pencil', 18)}<span>Изменить</span></button>
         <button type="button" class="is-danger" data-chat-action="delete">${ic('trash', 18)}<span>Удалить</span></button>`
      : `<button type="button" class="is-danger" data-chat-action="report">${ic('flag', 18)}<span>Пожаловаться</span></button>`;
    const pinAction = staff
      ? `<button type="button" data-chat-action="pin">${ic('pin', 18)}<span>${message.isPinned ? 'Открепить' : 'Закрепить'}</span></button>`
      : '';

    $('#portal').innerHTML = `<div class="chat-msg-menu-backdrop" id="modal-close">
      <section class="chat-msg-menu" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        <div class="chat-msg-menu-emojis">${emojis}</div>
        <div class="chat-msg-menu-actions">
          <button type="button" data-chat-action="reply">${ic('reply', 18)}<span>Ответить</span></button>
          <button type="button" data-chat-action="copy">${ic('copy', 18)}<span>Копировать</span></button>
          ${pinAction}
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
        if (action === 'copy') {
          const text = String(message.body || '').trim();
          if (!text) {
            showAppToast('В сообщении нет текста', { title: 'Чат' });
            return;
          }
          try {
            await navigator.clipboard.writeText(text);
            showAppToast('Скопировано', { title: 'Чат' });
          } catch {
            window.alert('Не удалось скопировать');
          }
          return;
        }
        if (action === 'report') {
          if (!window.confirm('Отправить жалобу на это сообщение модераторам?')) return;
          try {
            await API.reportChatMessage(message.id, 'user_report');
            showAppToast('Жалоба отправлена', { title: 'Чат' });
          } catch {
            window.alert('Не удалось отправить жалобу.');
          }
          return;
        }
        if (action === 'pin') {
          try {
            const data = await API.pinChatMessage(message.id, !message.isPinned);
            if (data.message) {
              upsertChatMessageLocal(data.message, { trustMine: true });
              const room = state.chatRooms.find((item) => item.id === (data.message.roomId || state.selectedRoomId));
              if (room) {
                if (data.message.isPinned) {
                  room.pinned = [normalizeChatMessage(data.message), ...(room.pinned || []).filter((item) => item.id !== data.message.id)].slice(0, 3);
                } else {
                  room.pinned = (room.pinned || []).filter((item) => item.id !== data.message.id);
                }
              }
              renderChatLive();
            }
          } catch {
            window.alert('Не удалось изменить закрепление.');
          }
          return;
        }
        if (action === 'delete') {
          if (!window.confirm('Удалить сообщение?')) return;
          try {
            await API.deleteChatMessage(message.id);
            const found = findChatMessage(message.id);
            if (found) {
              found.room.messages = found.room.messages.filter((item) => item.id !== message.id);
              found.room.pinned = (found.room.pinned || []).filter((item) => item.id !== message.id);
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
      // Optimistic bubbles have no server id yet, so no menu actions for them.
      if (bubble.dataset.pending === '1' || bubble.dataset.gesturesBound === '1') return;
      bubble.dataset.gesturesBound = '1';
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
      // Mobile long-press must not select text; desktop users can still select to copy.
      if (!window.matchMedia('(pointer: fine)').matches) {
        bubble.addEventListener('selectstart', (event) => event.preventDefault());
        bubble.addEventListener('dragstart', (event) => event.preventDefault());
      }

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

  /** Handlers that every bubble needs, safe to call again after a patch. */
  function bindChatThreadInteractions(scope) {
    bindChatMessageGestures(scope);
    $$('[data-photo]', scope).forEach((b) => {
      b.onclick = (event) => {
        event.stopPropagation();
        openChatPhoto(b.dataset.photo);
      };
    });
    $$('[data-retry]', scope).forEach((b) => {
      b.onclick = (event) => {
        event.stopPropagation();
        retryFailedChatMessage(b.dataset.retry);
      };
    });
  }

  let chatTypingPulseAt = 0;
  function pulseChatTyping() {
    if (!state.selectedRoomId) return;
    if (Date.now() - chatTypingPulseAt < 1600) return;
    chatTypingPulseAt = Date.now();
    API.chatTyping(state.selectedRoomId).catch(() => {});
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
        prepareChatThreadEntry(b.dataset.room);
        clearChatCompose();
        renderScreen();
        setImmersive();
      };
    });
    $('#chat-back', root)?.addEventListener('click', () => {
      state.chatView = 'rooms';
      state.chatUnreadAnchor = null;
      clearChatCompose();
      renderScreen();
      setImmersive();
    });
    $('#chat-settings', root)?.addEventListener('click', () => openChatBgPicker());
    $('#chat-compose-cancel', root)?.addEventListener('click', () => cancelChatCompose());

    const messages = $('.telegram-messages', root);
    if (messages) {
      positionChatThread(messages);
      messages.addEventListener('scroll', () => {
        queueChatReadCheck();
        if (messages.scrollTop < 80) loadOlderChatMessages();
      }, { passive: true });
    }
    bindChatThreadInteractions(root);
    $$('[data-scroll-to]', root).forEach((btn) => {
      if (btn.closest('.chat-pinned-bar')) {
        btn.onclick = () => {
          const target = root.querySelector(`[data-message-id="${btn.dataset.scrollTo}"]`);
          if (!target) return;
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('is-flash');
          window.setTimeout(() => target.classList.remove('is-flash'), 1200);
        };
      }
    });

    const draft = $('#chat-draft', root);
    if (state.chatCompose?.mode === 'edit' && state.chatCompose.body) {
      if (draft && !draft.value) draft.value = state.chatCompose.body;
    }
    bindChatDraftAutosize(draft);
    draft?.addEventListener('input', pulseChatTyping);

    const fileInput = $('#chat-file', root);
    $('#chat-attach', root)?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', () => {
      const files = fileInput.files;
      if (files?.length) addChatAttachments(files);
      fileInput.value = '';
    });
    $$('[data-attach-remove]', root).forEach((b) => {
      b.onclick = () => removeChatAttachment(b.dataset.attachRemove);
    });

    $('#chat-form', root)?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = $('#chat-draft', root);
      const body = input?.value.trim() || '';
      if (!state.selectedRoomId) return;

      const compose = state.chatCompose;
      const editing = compose?.mode === 'edit';
      const attachments = editing ? [] : state.chatAttachments;
      if (attachments.some((item) => item.status === 'uploading')) {
        showAppToast('Фото ещё загружается', { title: 'Чат' });
        return;
      }
      const attachmentIds = attachments.filter((item) => item.id).map((item) => item.id);
      if (!body && !attachmentIds.length) return;

      input.value = '';
      resizeChatDraft(input);

      // Show the bubble right away; the server copy replaces it on reply.
      const pending = editing ? null : addPendingChatMessage(body, attachments, compose);
      const sentAttachments = editing ? [] : attachments;
      if (!editing) state.chatAttachments = [];
      clearChatCompose();
      renderChatLive();

      try {
        if (editing) {
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
            attachmentIds,
            state.pushEndpoint || undefined,
          );
          removePendingChatMessage(pending);
          if (data.message) {
            rememberMyChatMessage(data.message.id);
            upsertChatMessageLocal(data.message, { trustMine: true });
            maybeWarnGuestDegradation(data.message);
          }
          releaseChatAttachmentPreviews(sentAttachments);
        }
        renderChatLive();
      } catch {
        if (editing) {
          if (compose) state.chatCompose = compose;
          input.value = body;
          resizeChatDraft(input);
          renderChatLive();
          window.alert('Не удалось изменить сообщение.');
          return;
        }
        // Keep the bubble as a failed outbox item — tap ! to retry.
        if (pending) {
          pending.pending = false;
          pending.failed = true;
          pending._retry = {
            body,
            attachmentIds,
            replyToId: compose?.mode === 'reply' ? compose.messageId : undefined,
            attachments: sentAttachments,
          };
        }
        renderChatLive();
        showAppToast('Не отправилось — нажмите ! чтобы повторить', { title: 'Чат', tone: 'warn' });
      }
    });
  }

  async function retryFailedChatMessage(messageId) {
    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId);
    const message = room?.messages?.find((item) => item.id === messageId);
    if (!message?._retry) return;
    const payload = message._retry;
    message.pending = true;
    message.failed = false;
    renderChatLive();
    try {
      const data = await API.sendChatMessage(
        state.selectedRoomId,
        payload.body,
        payload.replyToId,
        payload.attachmentIds,
        state.pushEndpoint || undefined,
      );
      removePendingChatMessage(message);
      if (data.message) {
        rememberMyChatMessage(data.message.id);
        upsertChatMessageLocal(data.message, { trustMine: true });
      }
      releaseChatAttachmentPreviews(payload.attachments || []);
      renderChatLive();
    } catch {
      message.pending = false;
      message.failed = true;
      renderChatLive();
      showAppToast('Снова не удалось отправить', { title: 'Чат', tone: 'warn' });
    }
  }

  function resizeChatDraft(el) {
    if (!el) return;
    el.style.height = 'auto';
    const max = Math.round(window.innerHeight * 0.34);
    const next = Math.min(Math.max(el.scrollHeight, 42), max);
    el.style.height = `${next}px`;
    el.classList.toggle('is-expanded', next > 48);
  }

  /** Insert a line break at the caret, keeping native undo where possible. */
  function insertNewlineAtCaret(el) {
    const before = el.value;
    let handled = false;
    try {
      handled = document.execCommand('insertText', false, '\n');
    } catch {
      handled = false;
    }
    if (!handled || el.value === before) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      el.value = `${el.value.slice(0, start)}\n${el.value.slice(end)}`;
      const caret = start + 1;
      try { el.setSelectionRange(caret, caret); } catch { /* ignore */ }
    }
    resizeChatDraft(el);
    el.scrollTop = el.scrollHeight;
  }

  function bindChatDraftAutosize(el) {
    if (!el) return;
    resizeChatDraft(el);
    el.addEventListener('input', () => resizeChatDraft(el));
    // Enter always makes a line break; sending is the arrow button (or Ctrl/⌘+Enter
    // on desktop). Some mobile keyboards fire a submit action on Enter even inside
    // a textarea, so the break is inserted by hand instead of relying on default.
    el.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.ctrlKey || event.metaKey) {
        if (el.form?.requestSubmit) el.form.requestSubmit();
        else $('.telegram-composer-send', el.form || document)?.click();
        return;
      }
      insertNewlineAtCaret(el);
    });
  }

  function openChatBgPicker() {
    const swatches = D.CHAT_BG_PRESETS.map((p) =>
      `<button type="button" class="${state.chatBg === p.id ? 'active' : ''}" data-bg="${p.id}">
        <span class="chat-bg-swatch chat-bg-swatch-${p.id}" style="${chatBgVars(p)}"></span>
        <strong>${esc(p.label)}</strong>
      </button>`,
    ).join('');

    const available = canUseWebPush();
    const enabled = getNotificationSetting();
    const notifyUnsupported = !available
      ? (isPWA()
        ? 'Уведомления не поддерживаются в этом браузере'
        : 'Установите приложение на домашний экран — в браузере push недоступен')
      : null;

    const notifyRow = `
      <div class="chat-settings-row">
        <div class="chat-settings-row-copy">
          <strong>Push-уведомления</strong>
          <span>${notifyUnsupported || (enabled ? 'Будут приходить новые сообщения из чата' : 'Включите, чтобы не пропускать чат')}</span>
        </div>
        <label class="chat-settings-toggle${!available ? ' is-disabled' : ''}">
          <input type="checkbox" id="chat-notify-toggle" ${enabled ? 'checked' : ''} ${!available ? 'disabled' : ''} />
          <span aria-hidden="true"></span>
        </label>
      </div>
      ${(available && enabled) ? `<button type="button" class="chat-settings-test" id="chat-notify-test">${ic('bell', 18)} Протестировать уведомление</button>` : ''}
    `;

    $('#portal').innerHTML = `<div class="chat-bg-picker-backdrop" id="modal-close"><section class="chat-bg-picker" aria-label="Настройки чата" onclick="event.stopPropagation()">
      <div class="chat-bg-picker-handle"></div>
      <header class="chat-bg-picker-head"><div><span>Настройки чата</span><h2>Фон и уведомления</h2></div><button type="button" id="modal-x" aria-label="Закрыть настройки">${ic('x', 20)}</button></header>
      <div class="chat-settings-block">
        <div class="chat-settings-label">Фон</div>
        <div class="chat-bg-grid">${swatches}</div>
      </div>
      <div class="chat-settings-block">
        <div class="chat-settings-label">Уведомления</div>
        ${notifyRow}
      </div>
    </section></div>`;
    bindModalClose();
    $$('[data-bg]', $('#portal')).forEach((b) => {
      b.onclick = () => { state.chatBg = b.dataset.bg; localStorage.setItem('chat-bg', state.chatBg); closePortal(); renderScreen(); };
    });
    const toggle = $('#chat-notify-toggle', $('#portal'));
    toggle?.addEventListener('change', async () => {
      toggle.disabled = true;
      const result = await toggleNotifications(toggle.checked);
      toggle.disabled = false;
      toggle.checked = result;
      closePortal();
      openChatBgPicker();
    });
    $('#chat-notify-test', $('#portal'))?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      await testPushNotification();
      btn.disabled = false;
    });
  }

  function moviePosterHtml(m) {
    const poster = asset(m.poster || m.posterUrl);
    return poster ? `<img alt="" src="${esc(poster)}" loading="lazy" decoding="async" />` : '<div class="poster-fallback"></div>';
  }

  function movieAsLibraryItem(m) {
    const locked = !hasLibraryAccess() || m.locked === true;
    return {
      id: m.id,
      movieId: m.id,
      sectionId: 'movies',
      title: m.title,
      meta: `${m.year || ''} · Киноклуб`.replace(/^ · /, ''),
      kind: 'movie',
      description: m.theme || m.description || 'Рекомендация киноклуба',
      transcript: locked ? null : m.description,
      poster: m.poster || m.posterUrl || '',
      locked,
      requiredTier: 'library',
    };
  }

  function mergeMoviesIntoLibrary() {
    const withoutMovies = state.libraryItems.filter((item) => item.sectionId !== 'movies' && item.kind !== 'movie');
    const movieItems = (state.movies || []).map(movieAsLibraryItem);
    state.libraryItems = [...withoutMovies, ...movieItems];
    if (!state.librarySections.some((s) => s.id === 'movies')) {
      state.librarySections = [
        ...state.librarySections,
        { id: 'movies', title: 'Киноклуб', description: 'Рекомендации фильмов и записи разборов' },
      ];
    }
  }

  function renderMovies() {
    const cards = state.movies.map((m) => `
      <button class="movie-card${m.locked ? ' is-locked' : ''}" type="button" data-movie="${esc(m.id)}">
        ${moviePosterHtml(m)}
        <div class="movie-info"><span>${esc(m.year || '')}</span><h3>${esc(m.title)}</h3><p>${esc(m.theme || '')}</p></div>
      </button>`).join('');
    return `<section class="section"><header class="section-header"><span>Киноклуб</span><h2>Фильмы для разговоров с подростками</h2><p>Рекомендация фильма и вопросы для рефлексии — в начале месяца. Запись эфира с психологическим разбором — в конце месяца. Входит в «Медиатека. Теория».</p></header><div class="movie-grid">${cards}</div></section>`;
  }

  function bindMovies(root) {
    $$('[data-movie]', root).forEach((b) => {
      b.onclick = () => openMovie(b.dataset.movie);
    });
  }

  function openMovie(id) {
    const movie = state.movies.find((x) => x.id === id);
    if (!movie) return;
    if (movie.locked || !hasLibraryAccess()) {
      openPaywall({
        reason: 'library',
        title: 'Киноклуб в медиатеке',
        text: 'Откройте тариф «Медиатека. Теория» или «Клуб», чтобы смотреть рекомендации фильмов и записи разборов.',
        preferPlan: 'library_30',
      });
      return;
    }
    state.selectedMovieId = id;
    renderScreen();
  }

  function closeMovie() {
    state.selectedMovieId = '';
    document.body.classList.remove('material-immersive-open');
    $('#portal').innerHTML = '';
    state.tab = 'media';
    state.mediaSection = 'movies';
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
        ${innerBrand('Медиатека · Киноклуб')}
        <span class="inner-page-spacer" aria-hidden="true"></span>
      </header>
      <div class="movie-detail-body">
        <div class="movie-detail-poster">${moviePosterHtml(m)}</div>
        <span class="movie-detail-kicker">${esc(m.year || '')} · ${esc(m.theme || 'Киноклуб')}</span>
        <h1>${esc(m.title)}</h1>
        ${facts ? `<div class="movie-facts">${facts}</div>` : ''}
        <p class="movie-detail-desc">${esc(m.description || '')}</p>
        <div class="prompt movie-modal-prompt"><strong>Вопрос для рефлексии</strong><p>${esc(m.prompt || '')}</p></div>
        <p class="movie-detail-note">Запись эфира с психологическим разбором фильма публикуется в медиатеке в конце месяца.</p>
      </div>
    </div>`;
  }

  function bindMovieDetail(root, _m) {
    $('#movie-back', root)?.addEventListener('click', closeMovie);
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
      setTab('media');
      state.mediaSection = 'movies';
      renderScreen();
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

    const planCards = (state.plans || []).map((plan) => planCardHtml(plan)).join('');

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
            ${iosRow('media', 'Медиатека', 'Подкасты, эфиры и киноклуб', 'media')}
            ${iosRow('movies', 'Киноклуб', 'Фильмы и разборы в медиатеке', 'movies')}
            ${iosRow('chat', 'Чаты клуба', 'Общий чат и лента объявлений', 'chat')}
            ${iosRow('ai', 'ИИ-наставник', 'Короткие ориентиры по ситуации', 'ai')}
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
    bindPlanInfoToggles(root);
    $$('[data-buy-plan]', root).forEach((btn) => {
      btn.onclick = (event) => {
        if (event.target.closest('[data-plan-info]')) return;
        startCheckout(btn.dataset.buyPlan, $('#profile-pay-status', root));
      };
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
      mergeMoviesIntoLibrary();
    } catch {
      // The full generated React catalog remains available offline.
      mergeMoviesIntoLibrary();
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

  function normalizeChatMessage(message) {
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
      attachments: message.attachments || [],
      seenByOthers: Boolean(message.seenByOthers),
      isPinned: Boolean(message.isPinned),
      mine,
    };
  }

  async function loadChatRooms() {
    const pendingByRoom = new Map();
    const olderByRoom = new Map();
    state.chatRooms.forEach((room) => {
      const pending = (room.messages || []).filter((message) => message.pending || message.failed);
      if (pending.length) pendingByRoom.set(room.id, pending);
      olderByRoom.set(room.id, room.messages || []);
    });
    try {
      const data = await API.chatRooms();
      if (data.access) state.access = data.access;
      state.chatRooms = (data.rooms || []).map((room) => {
        const incoming = (room.messages || []).map(normalizeChatMessage);
        const prev = olderByRoom.get(room.id) || [];
        const byId = new Map();
        // Keep already-loaded older history across refreshes that only return the tail.
        prev.forEach((message) => {
          if (!message.pending && !message.failed) byId.set(message.id, message);
        });
        incoming.forEach((message) => byId.set(message.id, { ...byId.get(message.id), ...message }));
        const messages = [...byId.values()].sort(
          (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
        );

        if (room.lastReadMessageId) {
          const readMsg = messages.find((item) => item.id === room.lastReadMessageId)
            || incoming.find((item) => item.id === room.lastReadMessageId);
          if (readMsg) {
            const at = new Date(readMsg.createdAt || 0).getTime();
            const current = state.chatReads[room.id];
            if (!current || current.at < at) {
              state.chatReads[room.id] = { id: readMsg.id, at };
            }
          }
        }

        return {
          ...room,
          serverUnreadCount: room.unreadCount || 0,
          hasMore: Boolean(room.hasMore),
          pinned: (room.pinned || []).map(normalizeChatMessage),
          messages,
        };
      });
      persistChatReads();
      syncUnreadBadges();

      pendingByRoom.forEach((pending, roomId) => {
        const room = state.chatRooms.find((item) => item.id === roomId);
        if (!room) return;
        const stillInFlight = pending.filter((p) => !room.messages.some((m) => (
          !m.pending
          && !m.failed
          && isMyChatMessage(m)
          && (m.body || '') === (p.body || '')
          && (m.attachments || []).length === (p.attachments || []).length
          && Math.abs(new Date(m.createdAt || 0) - new Date(p.createdAt || 0)) < 120000
        )));
        room.messages = [...room.messages, ...stillInFlight];
      });
      if (!state.selectedRoomId && state.chatRooms[0]) state.selectedRoomId = state.chatRooms[0].id;
      if (!state.introSeeded) {
        state.chatRooms.forEach((room) => (room.messages || []).forEach((message) => {
          if (isIntroMessage(message.body)) state.seenIntroIds.add(message.id);
        }));
        state.introSeeded = true;
      }
    } catch {
      // A failed refresh must not blank the thread; keep what we already have.
    }
  }

  async function loadOlderChatMessages() {
    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId);
    if (!room || room.locked || !room.hasMore || state.chatHistoryLoading) return;
    const oldest = (room.messages || []).find((item) => !item.pending && !item.failed);
    if (!oldest) return;

    state.chatHistoryLoading = true;
    const scroller = $('.telegram-messages');
    const prevHeight = scroller?.scrollHeight || 0;
    try {
      const data = await API.chatRoomMessages(room.id, oldest.id);
      const older = (data.messages || []).map(normalizeChatMessage);
      const existing = new Set((room.messages || []).map((item) => item.id));
      const fresh = older.filter((item) => !existing.has(item.id));
      if (fresh.length) {
        room.messages = [...fresh, ...room.messages];
        renderChatLive();
        if (scroller) scroller.scrollTop = scroller.scrollHeight - prevHeight;
      }
      room.hasMore = Boolean(data.hasMore);
      if (!room.hasMore) {
        $('.chat-history-hint')?.remove();
      }
    } catch {
      showAppToast('Не удалось подгрузить историю', { title: 'Чат', tone: 'warn' });
    } finally {
      state.chatHistoryLoading = false;
    }
  }

  function chatStateSignature() {
    return state.chatRooms.map((room) => {
      const messages = room.messages || [];
      const tail = messages.map((message) => [
        message.id,
        chatBubbleSignature(message, isMyChatMessage(message)),
      ].join('.')).join('|');
      return `${room.id}#${messages.length}#${tail}`;
    }).join('~');
  }

  /**
   * Patch the open thread in place: only new, changed and removed bubbles touch
   * the DOM, so the composer, keyboard, images and scroll position stay put.
   * Returns false when the thread markup is not on screen yet.
   */
  function patchChatThread() {
    const scroller = $('.telegram-messages');
    const canvas = $('.telegram-messages-canvas');
    if (!scroller || !canvas) return false;

    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId) || state.chatRooms[0];
    const items = chatTimelineItems(room);
    const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;

    const stale = new Map();
    [...canvas.children].forEach((node) => {
      const key = node.dataset?.key;
      if (key) stale.set(key, node);
      else node.remove();
    });

    const oven = document.createElement('div');
    const fresh = [];
    let cursor = null;
    let touched = false;

    items.forEach((item) => {
      let node = stale.get(item.key);
      stale.delete(item.key);
      if (node && node.dataset.sig !== item.sig) {
        oven.innerHTML = item.html;
        const next = oven.firstElementChild;
        node.replaceWith(next);
        node = next;
        fresh.push(node);
        touched = true;
      } else if (!node) {
        oven.innerHTML = item.html;
        node = oven.firstElementChild;
        fresh.push(node);
        touched = true;
      }
      const misplaced = cursor ? cursor.nextElementSibling !== node : canvas.firstElementChild !== node;
      if (misplaced) {
        if (cursor) cursor.after(node);
        else canvas.prepend(node);
      }
      cursor = node;
    });

    stale.forEach((node) => node.remove());

    if (touched) bindChatThreadInteractions(canvas);
    if (atBottom && touched) {
      scroller.scrollTop = scroller.scrollHeight;
      // Photos gain their height late; stay pinned while they decode.
      fresh.forEach((node) => $$('img', node).forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', () => {
          const stillDown = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 300;
          if (stillDown) scroller.scrollTop = scroller.scrollHeight;
        }, { once: true });
      }));
    }
    if (touched) updateChatReadFromScroll(scroller);
    return true;
  }

  function patchChatComposeSlot() {
    const slot = $('#chat-compose-slot');
    if (!slot) return;
    const sig = chatComposeSlotSignature();
    if (slot.dataset.sig === sig) return;
    slot.dataset.sig = sig;
    slot.innerHTML = `${renderChatComposeBar()}${renderChatAttachmentTray()}`;
    $('#chat-compose-cancel', slot)?.addEventListener('click', () => cancelChatCompose());
    $$('[data-attach-remove]', slot).forEach((b) => {
      b.onclick = () => removeChatAttachment(b.dataset.attachRemove);
    });

    const draft = $('#chat-draft');
    if (draft) {
      draft.placeholder = state.chatCompose?.mode === 'edit' ? 'Изменить сообщение' : 'Сообщение';
      if (state.chatCompose?.mode === 'edit' && state.chatCompose.body && !draft.value) {
        draft.value = state.chatCompose.body;
        resizeChatDraft(draft);
      }
    }
  }

  /** Refresh room previews without rebuilding the list buttons. */
  function patchChatRoomPreviews() {
    syncUnreadBadges();
    const list = $('.telegram-room-list');
    if (!list) return;
    $$('[data-room]', list).forEach((button) => {
      const room = state.chatRooms.find((item) => item.id === button.dataset.room);
      if (!room) return;
      const last = room.messages?.[room.messages.length - 1];
      const preview = room.locked
        ? 'Доступно в тарифе «Клуб»'
        : (last ? chatMessagePreview(last) : (room.description || 'Пока нет сообщений'));
      const previewEl = button.querySelector('.telegram-room-copy small');
      if (previewEl && previewEl.textContent !== preview) previewEl.textContent = preview;
      const timeEl = button.querySelector('time');
      const time = !room.locked && last ? formatBubbleTime(last.createdAt) : '';
      if (timeEl && timeEl.textContent !== time) timeEl.textContent = time;

      const side = button.querySelector('.telegram-room-side');
      if (side) {
        const count = roomUnreadCount(room);
        const label = count > 99 ? '99+' : String(count);
        const badge = side.querySelector('.chat-unread-badge');
        if (!count) badge?.remove();
        else if (badge) { if (badge.textContent !== label) badge.textContent = label; }
        else side.insertAdjacentHTML('beforeend', `<span class="chat-unread-badge">${label}</span>`);
      }
    });
  }

  /** Re-render the chat without losing the draft, focus or scroll position. */
  function renderChatLive() {
    if (state.tab !== 'chat') return;
    if (patchChatThread()) {
      patchChatComposeSlot();
      patchChatRoomPreviews();
      return;
    }
    renderChatFull();
  }

  function renderChatFull() {
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
      resizeChatDraft(nextDraft);
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
    if (payload.type === 'typing') {
      if (!payload.userId || payload.userId === currentChatUserId()) return false;
      state.chatTyping = {
        roomId: payload.roomId,
        authorName: firstName(payload.authorName || 'Участник'),
        until: Date.now() + 3200,
      };
      patchChatHeaderSubtitle();
      window.setTimeout(() => {
        if (state.chatTyping && state.chatTyping.until <= Date.now()) {
          state.chatTyping = null;
          patchChatHeaderSubtitle();
        }
      }, 3300);
      return false;
    }

    if (payload.type === 'read') {
      const room = state.chatRooms.find((item) => item.id === payload.roomId);
      if (!room || !payload.messageId) return false;
      const stamp = new Date(payload.at || 0).getTime();
      let changed = false;
      (room.messages || []).forEach((message) => {
        if (!isMyChatMessage(message) || message.seenByOthers) return;
        if (payload.userId && payload.userId === message.authorId) return;
        if (stamp && new Date(message.createdAt || 0).getTime() <= stamp) {
          message.seenByOthers = true;
          changed = true;
        } else if (message.id === payload.messageId) {
          message.seenByOthers = true;
          changed = true;
        }
      });
      return changed;
    }

    const room = state.chatRooms.find((item) => item.id === payload.roomId);
    if (!room) return false;
    if (payload.type === 'deleted') {
      const before = room.messages.length;
      room.messages = room.messages.filter((message) => message.id !== payload.messageId);
      if (state.chatCompose?.messageId === payload.messageId) clearChatCompose();
      room.pinned = (room.pinned || []).filter((message) => message.id !== payload.messageId);
      return room.messages.length !== before;
    }
    if (payload.message) {
      upsertChatMessageLocal(payload.message, { trustMine: false });
      if (payload.message.isPinned) {
        room.pinned = [
          normalizeChatMessage(payload.message),
          ...(room.pinned || []).filter((item) => item.id !== payload.message.id),
        ].slice(0, 3);
      } else {
        room.pinned = (room.pinned || []).filter((item) => item.id !== payload.message.id);
      }
      // Incoming message for another room bumps the unread badge immediately.
      if (
        !isMyChatMessage(payload.message)
        && !(state.tab === 'chat' && state.chatView === 'thread' && state.selectedRoomId === room.id)
      ) {
        room.serverUnreadCount = (room.serverUnreadCount || 0) + 1;
      }
      return true;
    }
    return false;
  }

  function firstName(name) {
    return String(name || 'Участник').trim().split(/\s+/)[0] || 'Участник';
  }

  function patchChatHeaderSubtitle() {
    const el = $('.telegram-header-pill span');
    const room = state.chatRooms.find((item) => item.id === state.selectedRoomId);
    if (el) el.textContent = chatHeaderSubtitle(room);
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

  const CHAT_STREAM_STALE_MS = 50000;

  /**
   * Watchdog + fallback poll on one timer: fast polling while the stream is
   * down, a slow reconcile while it is alive, and a reconnect when the socket
   * goes quiet (mobile proxies often kill SSE without firing an error).
   */
  function ensureChatPolling() {
    if (state.chatPollTimer) return;
    state.chatPollTimer = window.setInterval(() => {
      if (document.hidden) return;
      state.chatPollTick += 1;
      if (!state.chatStreamReady) {
        pollChatRooms();
        return;
      }
      if (Date.now() - state.chatStreamSeenAt > CHAT_STREAM_STALE_MS) {
        restartChatStream();
        return;
      }
      if (state.chatPollTick % 8 === 0) pollChatRooms({ force: true });
    }, 4000);
  }

  function restartChatStream() {
    try { state.chatStream?.close(); } catch { /* ignore */ }
    state.chatStream = null;
    state.chatStreamReady = false;
    startChatStream();
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

    const noteAlive = () => { state.chatStreamSeenAt = Date.now(); };

    state.chatStreamStatus = 'connecting';
    patchChatHeaderSubtitle();

    stream.addEventListener('ready', () => {
      state.chatStreamReady = true;
      state.chatStreamRetry = 0;
      state.chatStreamStatus = 'live';
      noteAlive();
      patchChatHeaderSubtitle();
      // A dropped stream may have missed events while offline.
      pollChatRooms({ force: true });
    });

    stream.addEventListener('ping', noteAlive);
    stream.addEventListener('message', noteAlive);

    stream.addEventListener('chat.message', (event) => {
      noteAlive();
      state.chatStreamStatus = 'live';
      try {
        const payload = JSON.parse(event.data);
        if (applyChatEvent(payload)) renderChatLive();
      } catch {
        // Ignore malformed stream events; polling will recover state.
      }
    });

    stream.onerror = () => {
      stream.close();
      if (state.chatStream === stream) state.chatStream = null;
      state.chatStreamReady = false;
      state.chatStreamStatus = 'offline';
      patchChatHeaderSubtitle();
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
      else if (Date.now() - state.chatStreamSeenAt > CHAT_STREAM_STALE_MS) restartChatStream();
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

  function applyDeepLinkFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      const room = params.get('room');
      if (!tab && !room) return;
      if (tab === 'chat' || room) {
        state.tab = 'chat';
        state.chatView = room ? 'thread' : 'rooms';
        if (room && state.chatRooms.some((item) => item.id === room)) {
          state.selectedRoomId = room;
          state.chatView = 'thread';
          prepareChatThreadEntry(room);
        }
      } else if (D.TAB_TITLES?.[tab]) {
        state.tab = tab;
      }
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean || './');
      setImmersive();
      renderNav();
      renderScreen();
    } catch {
      /* ignore */
    }
  }

  /** Notification tapped while the app is already running: no reload, just jump. */
  async function openChatFromPush(roomId) {
    if (state.tab !== 'chat') setTab('chat');
    if (state.tab !== 'chat') return; // the rules sheet took over

    if (roomId && !state.chatRooms.some((item) => item.id === roomId)) {
      await pollChatRooms({ force: true });
    }
    const room = roomId ? state.chatRooms.find((item) => item.id === roomId) : null;
    if (room && !room.locked) {
      state.selectedRoomId = room.id;
      state.chatView = 'thread';
      prepareChatThreadEntry(room.id);
    } else {
      state.chatView = 'rooms';
    }
    closePortal();
    renderNav();
    renderScreen();
    setImmersive();
    pollChatRooms({ force: true });
  }

  /**
   * A push that arrives while the app is in the foreground: an OS banner would
   * duplicate what the thread already shows, so surface a tappable in-app one.
   */
  function handleForegroundChatPush(data) {
    const roomId = data.roomId || '';
    const reading = state.tab === 'chat'
      && state.chatView === 'thread'
      && state.selectedRoomId === roomId;
    pollChatRooms({ force: true });
    if (reading) return;
    showAppToast(data.body || 'Новое сообщение', {
      title: data.title || 'Чат клуба',
      hold: 6000,
      onOpen: () => openChatFromPush(roomId),
    });
  }

  function bindPushDeepLinks() {
    if (!navigator.serviceWorker) return;
    navigator.serviceWorker.addEventListener('message', (event) => {
      const data = event.data;
      if (data?.type === 'loza:open-chat') {
        openChatFromPush(data.roomId || '');
        return;
      }
      if (data?.type === 'loza:chat-push') handleForegroundChatPush(data);
    });
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

  function markOnboardingSeen() {
    try { localStorage.setItem('loza-onboarding-done', '1'); } catch { /* ignore */ }
  }

  function hasSeenOnboarding() {
    try { return localStorage.getItem('loza-onboarding-done') === '1'; } catch { return false; }
  }

  function finishOnboarding() {
    state.onboardingDone = true;
    markOnboardingSeen();
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
    // Only first-time visitors see the slides. A returning user who got signed
    // out (or arrives via a push deep link) goes straight to the sign-in screen.
    return !isAuthorized() && !hasSeenOnboarding();
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
      markOnboardingSeen();
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
    } else {
      // Returning but signed out: no slides, just the sign-in screen.
      showAuthScreen();
    }

    await Promise.all([loadContent(), loadFeed(), loadChatRooms()]);
    startChatStream();
    bindChatLiveRefresh();
    bindPushDeepLinks();
    syncPushEndpoint();
    syncHeaderIdentity();
    applyDeepLinkFromUrl();
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
