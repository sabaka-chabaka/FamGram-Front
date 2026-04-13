const BASE = 'http://localhost:5000/api';

function getToken(): string | null {
    return localStorage.getItem('famgram_token');
}

function authHeaders(): HeadersInit {
    const t = getToken();
    return t
        ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: authHeaders(),
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Request failed');
    return data as T;
}

export interface AuthUser {
    id: number;
    username: string;
    displayName: string;
    avatarColor: string;
}

export interface MemberDto {
    id: number;
    displayName: string;
    avatarColor: string | null;
}

export interface ChatDto {
    id: number;
    name: string;
    isGroup: boolean;
    avatarColor: string | null;
    lastMessage: string | null;
    lastMessageAt: string | null;
    members: MemberDto[];
}

export interface MessageDto {
    id: number;
    chatId: number;
    senderId: number;
    senderName: string;
    senderAvatar: string | null;
    content: string;
    sentAt: string;
    isRead: boolean;
}

export const api = {
    auth: {
        register: (username: string, displayName: string, password: string) =>
            req<{ token: string; user: AuthUser }>('POST', '/auth/register', { username, displayName, password }),
        login: (username: string, password: string) =>
            req<{ token: string; user: AuthUser }>('POST', '/auth/login', { username, password }),
        me: () => req<AuthUser>('GET', '/users/me'),
    },
    users: {
        search: (q: string) =>
            req<AuthUser[]>('GET', `/users/search?q=${encodeURIComponent(q)}`),
    },
    chats: {
        list: () => req<ChatDto[]>('GET', '/chats'),
        direct: (userId: number) =>
            req<ChatDto>('POST', '/chats/direct', { userId }),
        createGroup: (name: string, memberIds: number[]) =>
            req<ChatDto>('POST', '/chats/group', { name, memberIds }),
        messages: (chatId: number, skip = 0) =>
            req<MessageDto[]>('GET', `/chats/${chatId}/messages?skip=${skip}&take=50`),
        send: (chatId: number, content: string) =>
            req<MessageDto>('POST', `/chats/${chatId}/messages`, { content }),
    },
};

export function saveSession(token: string, user: AuthUser) {
    localStorage.setItem('famgram_token', token);
    localStorage.setItem('famgram_user', JSON.stringify(user));
}

export function loadSession(): { token: string; user: AuthUser } | null {
    const t = localStorage.getItem('famgram_token');
    const u = localStorage.getItem('famgram_user');
    if (!t || !u) return null;
    return { token: t, user: JSON.parse(u) };
}

export function clearSession() {
    localStorage.removeItem('famgram_token');
    localStorage.removeItem('famgram_user');
}