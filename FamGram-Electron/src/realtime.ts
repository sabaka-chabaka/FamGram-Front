import * as signalR from '@microsoft/signalr';
import type { MessageDto } from './api';

let connection: signalR.HubConnection | null = null;

export async function initRealtime(token: string, onMessage: (msg: MessageDto) => void) {
    if (connection) {
        await connection.stop();
    }

    connection = new signalR.HubConnectionBuilder()
        .withUrl('http://localhost:5000/hubs/chat', {
            accessTokenFactory: () => token,
        })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    connection.on('NewMessage', (msg: MessageDto) => {
        onMessage(msg);
    });

    await connection.start();
}

export async function joinChat(chatId: number) {
    await waitForConnection();
    connection?.invoke('JoinChat', chatId).catch(console.error);
}

export async function sendRealtimeMessage(chatId: number, content: string) {
    await waitForConnection();
    connection?.invoke('SendMessage', chatId, content).catch(console.error);
}

export function stopRealtime() {
    connection?.stop();
    connection = null;
}

async function waitForConnection() {
    if (!connection) return;

    if (connection.state === signalR.HubConnectionState.Connected) return;

    return new Promise<void>((resolve) => {
        const check = () => {
            if (connection?.state === signalR.HubConnectionState.Connected) {
                resolve();
            } else {
                setTimeout(check, 50);
            }
        };
        check();
    });
}