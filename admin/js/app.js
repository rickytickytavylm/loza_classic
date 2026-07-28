/* global LOZA_ADMIN_API */
(function () {
  const API = window.LOZA_ADMIN_API;
  const app = document.getElementById('app');

  const state = {
    user: null,
    summary: null,
    users: [],
    payments: [],
    chatRooms: [],
    editingRoomId: null,
    roomDraft: emptyRoom(),
    post: { title: '', body: '', imageUrl: '', preview: '' },
    uploading: false,
    status: { post: '', chat: '', error: '' },
  };

  function emptyRoom() {
    return {
      slug: '',
      title: '',
      description: '',
      purpose: '',
      canPost: true,
      isPremium: false,
      sortOrder: 0,
    };
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('ru-RU');
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('ru-RU');
  }

  function payLabel(status) {
    if (status === 'active') return { text: 'Оплачено', cls: 'is-active' };
    if (status === 'expired') return { text: 'Истекла', cls: 'is-expired' };
    if (status === 'pending') return { text: 'Ожидает оплату', cls: 'is-pending' };
    if (status === 'failed') return { text: 'Ошибка оплаты', cls: 'is-failed' };
    if (status === 'paid_no_sub') return { text: 'Оплата есть', cls: 'is-active' };
    return { text: 'Нет оплаты', cls: 'is-none' };
  }

  function renderLogin() {
    app.innerHTML = `<div class="admin-login">
      <form class="admin-card" id="login-form">
        <h1>Лоза Admin</h1>
        <p class="muted">Вход для команды клуба · classic</p>
        <div class="admin-form">
          <label>Email<input id="login-email" value="admin@loza.app" autocomplete="username" /></label>
          <label>Пароль<input id="login-password" type="password" autocomplete="current-password" /></label>
          <p class="error" id="login-error" hidden></p>
          <button type="submit">Войти</button>
        </div>
      </form>
    </div>`;

    document.getElementById('login-form').onsubmit = async (event) => {
      event.preventDefault();
      const error = document.getElementById('login-error');
      error.hidden = true;
      try {
        const payload = await API.login(
          document.getElementById('login-email').value.trim(),
          document.getElementById('login-password').value,
        );
        if (!['OWNER', 'ADMIN', 'CURATOR'].includes(payload.user?.role)) {
          API.clearToken();
          throw new Error('FORBIDDEN');
        }
        state.user = payload.user;
        await loadDashboard();
        render();
      } catch {
        error.hidden = false;
        error.textContent = 'Неверный логин или нет прав администратора';
      }
    };
  }

  function renderStats() {
    const s = state.summary || {};
    return `<section class="admin-stats">
      <article><strong>${s.users ?? '—'}</strong><span>Пользователи</span></article>
      <article><strong>${s.paidUsers ?? '—'}</strong><span>С оплатой</span></article>
      <article><strong>${s.pendingPayments ?? '—'}</strong><span>Ждут оплату</span></article>
      <article><strong>${s.posts ?? '—'}</strong><span>Посты</span></article>
      <article><strong>${s.rooms ?? '—'}</strong><span>Чаты</span></article>
    </section>`;
  }

  function renderUsers() {
    const rows = state.users.map((entry) => {
      const avatar = entry.avatarUrl || '';
      const pay = payLabel(entry.payStatus);
      const sub = entry.subscription;
      const payDetail = sub?.accessUntil
        ? `${sub.planName || 'Подписка'} · до ${fmtDate(sub.accessUntil)}`
        : (entry.lastPayment
          ? `${entry.lastPayment.planName || entry.lastPayment.provider} · ${entry.lastPayment.amountRub || '—'} ₽`
          : '—');
      return `<tr>
        <td><div class="admin-user-avatar">${avatar ? `<img src="${esc(avatar)}" alt="" />` : esc((entry.name || '?')[0].toUpperCase())}</div></td>
        <td>${esc(entry.name)}${entry.hasYandex ? '<span class="admin-badge">Яндекс</span>' : ''}</td>
        <td><div>${esc(entry.email)}</div><div class="muted">${esc(entry.phone || '—')}</div></td>
        <td>${esc(entry.role)}</td>
        <td>
          <span class="pay-pill ${pay.cls}">${pay.text}</span>
          <div class="muted" style="margin-top:4px">${esc(payDetail)}</div>
        </td>
        <td>${fmtDate(entry.createdAt)}</td>
      </tr>`;
    }).join('');

    return `<section class="admin-card">
      <h2>Пользователи и оплата</h2>
      <p class="muted">Статус подписки и последней оплаты. Когда подключим кассу — сюда же лягут свежие платежи.</p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Имя</th>
              <th>Email / телефон</th>
              <th>Роль</th>
              <th>Оплата</th>
              <th>Регистрация</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">Пока нет пользователей</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderPostForm() {
    const p = state.post;
    return `<section class="admin-card">
      <h2>Новый пост в ленту PWA</h2>
      <p class="muted">Текст + картинка. Сразу появится в приложении.</p>
      <form class="admin-form" id="post-form">
        <label>Заголовок (необязательно)<input id="post-title" value="${esc(p.title)}" /></label>
        <label>Текст поста<textarea id="post-body" required rows="5">${esc(p.body)}</textarea></label>
        <label class="admin-file-label">Картинка<input id="post-file" accept="image/jpeg,image/png,image/webp,image/gif" type="file" /></label>
        ${(p.preview || p.imageUrl) ? `<div class="admin-image-preview">
          <img alt="Превью" src="${esc(p.preview || p.imageUrl)}" />
          <button type="button" id="post-clear-image">Убрать картинку</button>
        </div>` : ''}
        <label>Или URL картинки<input id="post-image-url" placeholder="https://…" value="${esc(p.imageUrl)}" /></label>
        ${state.status.post ? `<p class="status">${esc(state.status.post)}</p>` : ''}
        <button type="submit" ${state.uploading ? 'disabled' : ''}>${state.uploading ? 'Загружаем картинку…' : 'Опубликовать'}</button>
      </form>
    </section>`;
  }

  function renderPayments() {
    const rows = state.payments.map((payment) => `<tr>
      <td>${fmtDateTime(payment.createdAt)}</td>
      <td>${esc(payment.user?.name || payment.email || '—')}</td>
      <td>${esc(payment.provider || '—')}</td>
      <td>${esc(payment.planName || '—')}${payment.planDays ? ` · ${payment.planDays} дн.` : ''}</td>
      <td>${payment.amountRub != null ? `${payment.amountRub} ₽` : '—'}</td>
      <td><span class="pay-pill ${payment.status === 'PAID' ? 'is-active' : payment.status === 'PENDING' ? 'is-pending' : payment.status === 'FAILED' ? 'is-failed' : 'is-none'}">${esc(payment.status)}</span></td>
    </tr>`).join('');

    return `<section class="admin-card admin-payments">
      <h2>Платежи</h2>
      <p class="muted">Лента оплат из бэкенда. Когда подключим ЮKassa/Prodamus — статусы обновятся сами.</p>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Пользователь</th>
              <th>Провайдер</th>
              <th>План</th>
              <th>Сумма</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6" class="muted">Платежей пока нет — кассу подключим следующим шагом</td></tr>'}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderChats() {
    const d = state.roomDraft;
    const rooms = state.chatRooms.map((room) => {
      const messages = (room.messages || []).map((message) => `<div class="chat-admin-message" data-message-id="${esc(message.id)}">
        <p><strong>${esc(message.author?.name || 'Участник')}</strong> · ${fmtDateTime(message.createdAt)}</p>
        <span>${esc(message.body)}</span>
        <div class="chat-admin-actions">
          <button type="button" data-edit-message="${esc(message.id)}">Изменить</button>
          <button type="button" data-pin-message="${esc(message.id)}" data-pinned="${message.isPinned ? '1' : '0'}">${message.isPinned ? 'Открепить' : 'Закрепить'}</button>
          <button type="button" class="danger" data-del-message="${esc(message.id)}">Удалить</button>
        </div>
      </div>`).join('') || '<p class="muted">В этом чате пока нет сообщений.</p>';

      return `<article class="chat-admin-room">
        <header>
          <div>
            <strong>${esc(room.title)}</strong>
            <span>#${esc(room.slug)} · ${room._count?.messages ?? 0} сообщений · ${room.canPost ? 'можно писать' : 'только чтение'}</span>
          </div>
          <div class="chat-admin-actions">
            <button type="button" data-edit-room="${esc(room.id)}">Изменить</button>
            <button type="button" class="danger" data-del-room="${esc(room.id)}">Удалить</button>
          </div>
        </header>
        <div class="chat-admin-messages">${messages}</div>
      </article>`;
    }).join('');

    return `<section class="admin-card admin-chat-manager">
      <div class="admin-section-head">
        <div>
          <h2>Управление чатами</h2>
          <p class="muted">Комнаты, доступ на отправку и сообщения.</p>
        </div>
        <button type="button" id="chat-new">Новый чат</button>
      </div>
      <form class="admin-form chat-room-form" id="chat-form">
        <label>Название<input id="room-title" required value="${esc(d.title)}" /></label>
        <label>Slug<input id="room-slug" required pattern="[a-z0-9_-]+" value="${esc(d.slug)}" /></label>
        <label class="full">Описание<input id="room-description" value="${esc(d.description || '')}" /></label>
        <label>Порядок<input id="room-sort" type="number" min="0" value="${esc(d.sortOrder || 0)}" /></label>
        <label class="admin-checkbox"><input id="room-can-post" type="checkbox" ${d.canPost ? 'checked' : ''} /> Участники могут писать</label>
        <label class="admin-checkbox"><input id="room-premium" type="checkbox" ${d.isPremium ? 'checked' : ''} /> Закрытый чат</label>
        ${state.status.chat ? `<p class="status">${esc(state.status.chat)}</p>` : ''}
        <button type="submit">${state.editingRoomId ? 'Сохранить чат' : 'Создать чат'}</button>
      </form>
      <div class="chat-admin-rooms">${rooms || '<p class="muted">Чатов пока нет</p>'}</div>
    </section>`;
  }

  function renderDashboard() {
    app.innerHTML = `<div class="admin-shell">
      <header class="admin-topbar">
        <div>
          <strong>Лоза Admin</strong>
          <p class="muted">${esc(state.user?.name || '')} · ${esc(state.user?.role || '')}</p>
        </div>
        <button type="button" id="logout-btn">Выйти</button>
      </header>
      ${renderStats()}
      <div class="admin-grid">
        ${renderPostForm()}
        ${renderUsers()}
      </div>
      ${renderPayments()}
      ${renderChats()}
    </div>`;
    bindDashboard();
  }

  function readRoomDraftFromForm() {
    return {
      title: document.getElementById('room-title').value.trim(),
      slug: document.getElementById('room-slug').value.trim().toLowerCase().replace(/\s+/g, '_'),
      description: document.getElementById('room-description').value.trim(),
      purpose: '',
      sortOrder: Number(document.getElementById('room-sort').value) || 0,
      canPost: document.getElementById('room-can-post').checked,
      isPremium: document.getElementById('room-premium').checked,
    };
  }

  function bindDashboard() {
    document.getElementById('logout-btn').onclick = () => {
      API.clearToken();
      state.user = null;
      render();
    };

    document.getElementById('post-form').onsubmit = async (event) => {
      event.preventDefault();
      state.post.title = document.getElementById('post-title').value;
      state.post.body = document.getElementById('post-body').value;
      state.post.imageUrl = document.getElementById('post-image-url').value.trim();
      state.status.post = '';
      try {
        await API.createPost({
          title: state.post.title.trim() || undefined,
          body: state.post.body.trim(),
          imageUrl: state.post.imageUrl || undefined,
        });
        state.post = { title: '', body: '', imageUrl: '', preview: '' };
        state.status.post = 'Пост опубликован в ленте PWA';
        state.summary = await API.summary();
        render();
      } catch (error) {
        state.status.post = error instanceof Error ? error.message : 'Ошибка публикации';
        render();
      }
    };

    const fileInput = document.getElementById('post-file');
    if (fileInput) {
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        state.uploading = true;
        state.post.preview = URL.createObjectURL(file);
        state.status.post = '';
        render();
        try {
          const uploaded = await API.uploadImage(file);
          state.post.imageUrl = uploaded.url;
          state.status.post = 'Картинка загружена';
        } catch (error) {
          state.post.preview = '';
          state.post.imageUrl = '';
          state.status.post = error instanceof Error ? error.message : 'Не удалось загрузить картинку';
        } finally {
          state.uploading = false;
          render();
        }
      };
    }

    document.getElementById('post-clear-image')?.addEventListener('click', () => {
      state.post.imageUrl = '';
      state.post.preview = '';
      render();
    });

    document.getElementById('post-image-url')?.addEventListener('input', (event) => {
      state.post.imageUrl = event.target.value;
      state.post.preview = '';
    });

    document.getElementById('chat-new').onclick = () => {
      state.editingRoomId = null;
      state.roomDraft = emptyRoom();
      state.status.chat = '';
      render();
    };

    document.getElementById('chat-form').onsubmit = async (event) => {
      event.preventDefault();
      state.roomDraft = readRoomDraftFromForm();
      state.status.chat = '';
      try {
        if (state.editingRoomId) await API.updateChatRoom(state.editingRoomId, state.roomDraft);
        else await API.createChatRoom(state.roomDraft);
        state.editingRoomId = null;
        state.roomDraft = emptyRoom();
        state.status.chat = 'Настройки чата сохранены';
        await reloadChats();
        state.summary = await API.summary();
        render();
      } catch (error) {
        state.status.chat = error instanceof Error ? error.message : 'Не удалось сохранить чат';
        render();
      }
    };

    app.querySelectorAll('[data-edit-room]').forEach((btn) => {
      btn.onclick = () => {
        const room = state.chatRooms.find((item) => item.id === btn.dataset.editRoom);
        if (!room) return;
        state.editingRoomId = room.id;
        state.roomDraft = {
          slug: room.slug,
          title: room.title,
          description: room.description || '',
          purpose: room.purpose || '',
          isPremium: Boolean(room.isPremium),
          canPost: Boolean(room.canPost),
          sortOrder: room.sortOrder || 0,
        };
        state.status.chat = '';
        render();
      };
    });

    app.querySelectorAll('[data-del-room]').forEach((btn) => {
      btn.onclick = async () => {
        if (!window.confirm('Удалить чат и все его сообщения?')) return;
        try {
          await API.deleteChatRoom(btn.dataset.delRoom);
          if (state.editingRoomId === btn.dataset.delRoom) {
            state.editingRoomId = null;
            state.roomDraft = emptyRoom();
          }
          await reloadChats();
          state.summary = await API.summary();
          render();
        } catch (error) {
          state.status.chat = error instanceof Error ? error.message : 'Не удалось удалить чат';
          render();
        }
      };
    });

    app.querySelectorAll('[data-edit-message]').forEach((btn) => {
      btn.onclick = async () => {
        const messageId = btn.dataset.editMessage;
        let current = '';
        state.chatRooms.forEach((room) => {
          const found = (room.messages || []).find((message) => message.id === messageId);
          if (found) current = found.body;
        });
        const body = window.prompt('Текст сообщения', current);
        if (body === null || !body.trim()) return;
        try {
          await API.updateChatMessage(messageId, { body: body.trim() });
          await reloadChats();
          render();
        } catch (error) {
          state.status.chat = error instanceof Error ? error.message : 'Не удалось изменить сообщение';
          render();
        }
      };
    });

    app.querySelectorAll('[data-pin-message]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await API.updateChatMessage(btn.dataset.pinMessage, {
            isPinned: btn.dataset.pinned !== '1',
          });
          await reloadChats();
          render();
        } catch (error) {
          state.status.chat = error instanceof Error ? error.message : 'Не удалось обновить сообщение';
          render();
        }
      };
    });

    app.querySelectorAll('[data-del-message]').forEach((btn) => {
      btn.onclick = async () => {
        if (!window.confirm('Удалить это сообщение?')) return;
        try {
          await API.deleteChatMessage(btn.dataset.delMessage);
          await reloadChats();
          render();
        } catch (error) {
          state.status.chat = error instanceof Error ? error.message : 'Не удалось удалить сообщение';
          render();
        }
      };
    });
  }

  async function reloadChats() {
    const payload = await API.chatRooms();
    state.chatRooms = payload.rooms || [];
  }

  async function loadDashboard() {
    const [summary, users, payments, chats] = await Promise.all([
      API.summary(),
      API.users(),
      API.payments().catch(() => ({ payments: [] })),
      API.chatRooms(),
    ]);
    state.summary = summary;
    state.users = users.users || [];
    state.payments = payments.payments || [];
    state.chatRooms = chats.rooms || [];
  }

  function render() {
    if (!state.user) {
      renderLogin();
      return;
    }
    renderDashboard();
  }

  async function init() {
    try {
      if (!API.getToken()) {
        renderLogin();
        return;
      }
      const me = await API.me();
      if (!me.user || !['OWNER', 'ADMIN', 'CURATOR'].includes(me.user.role)) {
        API.clearToken();
        renderLogin();
        return;
      }
      state.user = me.user;
      await loadDashboard();
      render();
    } catch {
      API.clearToken();
      renderLogin();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
