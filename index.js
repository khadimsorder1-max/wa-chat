/**
 * PUREFOODBD WHATSAPP BOT - ENTERPRISE VERSION
 * Features: Anti-Ban, Auto-Reconnect, Memory Management, Webhook Integration
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeInMemoryStore 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

// Memory Monitor: ৫১২ মেগাবাইট লিমিট থাকলে ৪৫০ এ রিস্টার্ট নেবে
setInterval(() => {
    const mem = process.memoryUsage().heapUsed / 1024 / 1024;
    if (mem > 450) {
        console.warn(`⚠️ Critical RAM: ${mem.toFixed(2)} MB. Restarting...`);
        process.exit(1);
    }
}, 300000);

const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        version,
        browser: ['PureFoodBD', 'Safari', '17.4'],
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000,
        // Ban Prevention: কাস্টম হেডার ও প্যাচ
        patchMessageBeforeSending: (msg) => {
            return { viewOnceMessage: { message: { messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} }, ...msg } } };
        }
    });

    store.bind(sock.ev);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) console.log('📱 QR কোড স্ক্যান করুন (Railway Logs এ দেখুন)');
        
        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 কানেকশন ক্লোজ! রিকানেক্টিং...');
                connectToWhatsApp();
            } else {
                console.log('❌ লগআউট! সেশন মুছছি...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ PureFoodBD WA Bot is Active!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

        if (text) {
            console.log(`📩 মেসেজ: ${sender} -> ${text}`);
            
            // n8n Webhook Call
            try {
                // Anti-Spam: মেসেজের মাঝে রেন্ডম বিরতি
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
                
                const res = await fetch('https://n8n-server-sr4v.onrender.com/webhook/pf-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'chat', sessionId: sender, message: text })
                });
                
                const result = await res.json();
                if (result.type === 'chat' || result.message) {
                    await sock.sendMessage(sender, { text: result.message || 'ধন্যবাদ!' });
                }
            } catch (err) {
                console.error('Webhook Error:', err.message);
            }
        }
    });
}

process.on('uncaughtException', (err) => console.error('FATAL:', err));
connectToWhatsApp();
