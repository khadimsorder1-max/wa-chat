const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

async function connectToWhatsApp() {
    // ১. পারসিস্টেন্ট সেশন ফোল্ডার (Railway Volume এ মাউন্ট করা ফোল্ডার)
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        version,
        browser:['PureFoodBD', 'Safari', '17.4'], // হোয়াটসঅ্যাপ যেন সন্দেহ না করে
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 15000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) console.log('📱 QR কোড পাওয়া গেছে, স্ক্যান করুন!');

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log('❌ কানেকশন ক্লোজ! কারণ:', reason);
            
            // BAN PREVENTION: লগআউট না হলে ৫ সেকেন্ড পর আবার কানেক্ট হবে
            if (reason !== DisconnectReason.loggedOut) {
                setTimeout(connectToWhatsApp, 5000);
            } else {
                console.log('🚫 পারমানেন্ট লগআউট। সেশন মুছছি...');
                fs.rmSync('./auth_info', { recursive: true, force: true });
                setTimeout(connectToWhatsApp, 2000);
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp Bot Connected Successfully!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (msg.key.fromMe || !msg.message) return;

        const sender = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text) {
            console.log(`📩 নতুন মেসেজ: ${text}`);
            try {
                const response = await fetch('https://n8n-server-sr4v.onrender.com/webhook/pf-chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'chat', sessionId: sender, message: text })
                });
                const result = await response.json();
                
                if (result.message) {
                    await sock.sendMessage(sender, { text: result.message });
                }
            } catch (err) {
                console.error('Webhook Error:', err);
            }
        }
    });
}

connectToWhatsApp();
