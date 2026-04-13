import './style.css';
import { api, saveSession, loadSession, clearSession, type AuthUser, type ChatDto, type MessageDto } from './api';
import { initRealtime, sendRealtimeMessage, joinChat, stopRealtime } from './realtime';

let currentUser: AuthUser | null = null;
let currentToken: string | null = null;
let chats: ChatDto[] = [];
let activeChatId: number | null = null;
let searchDebounce: ReturnType<typeof setTimeout> | null = null;

console.log(currentToken);

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function setAvatar(el: HTMLElement, name: string, color: string | null) {
  el.textContent = initials(name);
  el.style.background = color ?? '#3b82f6';
}

function escHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showAuth() {
  document.getElementById('auth-screen')!.classList.remove('hidden');
  document.getElementById('main-app')!.classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen')!.classList.add('hidden');
  document.getElementById('main-app')!.classList.remove('hidden');
}

document.querySelectorAll<HTMLButtonElement>('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-form`)!.classList.add('active');
  });
});

document.getElementById('login-btn')!.addEventListener('click', async () => {
  const u = (document.getElementById('login-username') as HTMLInputElement).value.trim();
  const p = (document.getElementById('login-password') as HTMLInputElement).value;
  const err = document.getElementById('login-error')!;
  err.textContent = '';
  try {
    const res = await api.auth.login(u, p);
    saveSession(res.token, res.user);
    await startApp(res.token, res.user);
  } catch (e: any) {
    err.textContent = e.message;
  }
});

document.getElementById('reg-btn')!.addEventListener('click', async () => {
  const u = (document.getElementById('reg-username') as HTMLInputElement).value.trim();
  const d = (document.getElementById('reg-displayname') as HTMLInputElement).value.trim();
  const p = (document.getElementById('reg-password') as HTMLInputElement).value;
  const err = document.getElementById('reg-error')!;
  err.textContent = '';
  try {
    const res = await api.auth.register(u, d || u, p);
    saveSession(res.token, res.user);
    await startApp(res.token, res.user);
  } catch (e: any) {
    err.textContent = e.message;
  }
});

['login-username', 'login-password'].forEach(id => {
  document.getElementById(id)!.addEventListener('keydown', e => {
    if (e.key === 'Enter') (document.getElementById('login-btn') as HTMLButtonElement).click();
  });
});
['reg-username', 'reg-displayname', 'reg-password'].forEach(id => {
  document.getElementById(id)!.addEventListener('keydown', e => {
    if (e.key === 'Enter') (document.getElementById('reg-btn') as HTMLButtonElement).click();
  });
});

document.getElementById('logout-btn')!.addEventListener('click', () => {
  stopRealtime();
  clearSession();
  currentUser = null;
  currentToken = null;
  chats = [];
  activeChatId = null;
  showAuth();
});

async function startApp(token: string, user: AuthUser) {
  currentUser = user;
  currentToken = token;
  showApp();

  setAvatar(document.getElementById('my-avatar')!, user.displayName, user.avatarColor);
  document.getElementById('my-name')!.textContent = user.displayName;
  document.getElementById('my-username')!.textContent = '@' + user.username;

  await loadChats();

  await initRealtime(token, (msg: MessageDto) => {
    const chat = chats.find(c => c.id === msg.chatId);
    if (chat) {
      chat.lastMessage = msg.content;
      chat.lastMessageAt = msg.sentAt;
      renderChatList();
    }
    if (msg.chatId === activeChatId) {
      appendMessage(msg, msg.senderId === user.id);
      scrollToBottom();
    }
  });
}

async function loadChats() {
  try {
    chats = await api.chats.list();
    renderChatList();
  } catch {
    document.getElementById('chat-list')!.innerHTML =
        '<div class="chat-list-empty">Ошибка загрузки</div>';
  }
}

function getChatName(c: ChatDto): string {
  if (c.isGroup) return c.name;
  const other = c.members.find(m => m.id !== currentUser?.id);
  return other?.displayName ?? c.name;
}

function getChatColor(c: ChatDto): string | null {
  if (c.isGroup) return c.avatarColor;
  const other = c.members.find(m => m.id !== currentUser?.id);
  return other?.avatarColor ?? c.avatarColor;
}

function renderChatList(list: ChatDto[] = chats) {
  const el = document.getElementById('chat-list')!;
  if (list.length === 0) {
    el.innerHTML = '<div class="chat-list-empty">Нет чатов. Начните новый!</div>';
    return;
  }
  el.innerHTML = list.map(c => {
    const name = getChatName(c);
    const color = getChatColor(c);
    const time = c.lastMessageAt ? formatTime(c.lastMessageAt) : '';
    const active = c.id === activeChatId ? 'active' : '';
    return `
      <div class="chat-item ${active}" data-id="${c.id}">
        <div class="avatar" style="background:${color ?? '#3b82f6'}">${initials(name)}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <div class="chat-item-name">${escHtml(name)}</div>
            <div class="chat-item-time">${time}</div>
          </div>
          <div class="chat-item-last">${escHtml(c.lastMessage ?? 'Нет сообщений')}</div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll<HTMLElement>('.chat-item').forEach(item => {
    item.addEventListener('click', () => openChat(parseInt(item.dataset.id!)));
  });
}

async function openChat(chatId: number) {
  activeChatId = chatId;
  const chat = chats.find(c => c.id === chatId)!;
  const name = getChatName(chat);
  const color = getChatColor(chat);

  document.getElementById('empty-state')!.classList.add('hidden');
  document.getElementById('chat-view')!.classList.remove('hidden');

  setAvatar(document.getElementById('chat-avatar')!, name, color);
  document.getElementById('chat-header-name')!.textContent = name;
  document.getElementById('chat-header-sub')!.textContent = chat.isGroup
      ? `${chat.members.length} участников`
      : '@' + (chat.members.find(m => m.id !== currentUser?.id)?.displayName ?? '');

  renderChatList();
  joinChat(chatId);

  const container = document.getElementById('messages-container')!;
  container.innerHTML = '<div class="messages-loading">Загрузка…</div>';

  try {
    const msgs = await api.chats.messages(chatId);
    renderMessages(msgs, chat.isGroup);
    scrollToBottom();
  } catch {
    container.innerHTML = '<div class="messages-loading">Ошибка загрузки</div>';
  }
}

function renderMessages(msgs: MessageDto[], isGroup: boolean) {
  const container = document.getElementById('messages-container')!;
  if (msgs.length === 0) {
    container.innerHTML = '<div class="messages-loading">Начните разговор!</div>';
    return;
  }

  let html = '';
  let lastDate = '';

  for (const msg of msgs) {
    const isOut = msg.senderId === currentUser?.id;
    const d = formatDate(msg.sentAt);
    if (d !== lastDate) {
      html += `<div class="date-divider">${d}</div>`;
      lastDate = d;
    }
    html += `
      <div class="msg-group ${isOut ? 'outgoing' : 'incoming'}">
        ${!isOut && isGroup ? `<div class="msg-sender">${escHtml(msg.senderName)}</div>` : ''}
        <div class="message ${isOut ? 'outgoing' : 'incoming'}">
          ${escHtml(msg.content)}
          <div class="message-meta">
            <span class="msg-time">${formatTime(msg.sentAt)}</span>
          </div>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

function appendMessage(msg: MessageDto, isOut: boolean) {
  const container = document.getElementById('messages-container')!;
  container.querySelector('.messages-loading')?.remove();

  const chat = chats.find(c => c.id === msg.chatId);
  const isGroup = chat?.isGroup ?? false;

  const div = document.createElement('div');
  div.className = `msg-group ${isOut ? 'outgoing' : 'incoming'}`;
  div.innerHTML = `
    ${!isOut && isGroup ? `<div class="msg-sender">${escHtml(msg.senderName)}</div>` : ''}
    <div class="message ${isOut ? 'outgoing' : 'incoming'}">
      ${escHtml(msg.content)}
      <div class="message-meta">
        <span class="msg-time">${formatTime(msg.sentAt)}</span>
      </div>
    </div>`;
  container.appendChild(div);
}

function scrollToBottom() {
  const c = document.getElementById('messages-container')!;
  c.scrollTop = c.scrollHeight;
}

async function sendMessage() {
  if (!activeChatId) return;
  const input = document.getElementById('message-input') as HTMLInputElement;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  sendRealtimeMessage(activeChatId, text);
}

document.getElementById('send-btn')!.addEventListener('click', sendMessage);
document.getElementById('message-input')!.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('search-input')!.addEventListener('input', e => {
  const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
  if (searchDebounce) clearTimeout(searchDebounce);
  if (!q) { renderChatList(); return; }
  searchDebounce = setTimeout(() => {
    renderChatList(chats.filter(c => getChatName(c).toLowerCase().includes(q)));
  }, 150);
});

document.getElementById('new-chat-btn')!.addEventListener('click', () => {
  document.getElementById('new-chat-modal')!.classList.remove('hidden');
  (document.getElementById('user-search') as HTMLInputElement).value = '';
  document.getElementById('user-results')!.innerHTML = '';
  setTimeout(() => (document.getElementById('user-search') as HTMLInputElement).focus(), 50);
});

function closeModal() {
  document.getElementById('new-chat-modal')!.classList.add('hidden');
}

document.getElementById('modal-close')!.addEventListener('click', closeModal);
document.querySelector('.modal-backdrop')!.addEventListener('click', closeModal);

let userSearchDebounce: ReturnType<typeof setTimeout> | null = null;
document.getElementById('user-search')!.addEventListener('input', async e => {
  const q = (e.target as HTMLInputElement).value.trim();
  const results = document.getElementById('user-results')!;
  if (userSearchDebounce) clearTimeout(userSearchDebounce);
  if (q.length < 2) { results.innerHTML = ''; return; }

  userSearchDebounce = setTimeout(async () => {
    try {
      const users = await api.users.search(q);
      if (users.length === 0) {
        results.innerHTML = '<div class="no-results">Пользователи не найдены</div>';
        return;
      }
      results.innerHTML = users.map(u => `
        <div class="user-result-item" data-id="${u.id}">
          <div class="avatar small" style="background:${u.avatarColor ?? '#3b82f6'}">${initials(u.displayName)}</div>
          <div>
            <div class="user-result-name">${escHtml(u.displayName)}</div>
            <div class="user-result-username">@${escHtml(u.username)}</div>
          </div>
        </div>`).join('');

      results.querySelectorAll<HTMLElement>('.user-result-item').forEach(item => {
        item.addEventListener('click', async () => {
          const uid = parseInt(item.dataset.id!);
          closeModal();
          try {
            const chat = await api.chats.direct(uid);
            if (!chats.find(c => c.id === chat.id)) chats.unshift(chat);
            renderChatList();
            openChat(chat.id);
          } catch (e: any) { console.error(e); }
        });
      });
    } catch {
      results.innerHTML = '<div class="no-results">Ошибка поиска</div>';
    }
  }, 250);
});

const session = loadSession();
if (session) {
  startApp(session.token, session.user).catch(() => { clearSession(); showAuth(); });
} else {
  showAuth();
}