const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        version,
        browser:['PureFoodBD', 'Safari', '17.4'],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) console.log('📱 QR CODE READY: Check Railway Logs');
        
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 রিকানেক্ট করছি...');
                setTimeout(startBot, 5000);
            } else {
                console.log('❌ লগআউট হয়েছে, সেশন মুছছি...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ BOT ACTIVE!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text) {
            try {
                // n8n Webhook URL (আপনার সঠিক URL দিন)
                const res = await fetch('https://n8n-server-sr4v.onrender.com/webhook/pf-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'chat', sessionId: sender, message: text })
                });
                const result = await res.json();
                if (result.message) {
                    await sock.sendMessage(sender, { text: result.message });
                }
            } catch (err) {
                console.error('Webhook Error');
            }
        }
    });
}

startBot();
