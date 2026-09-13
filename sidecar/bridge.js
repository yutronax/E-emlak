// Baileys -> webhook köprüsü.
// connect.js'in doğrulanmış bağlantı/mesaj-ayrıştırma mantığını
// kullanır, farkı: log dosyasına yazmak yerine her mesajı sabit bir
// şemayla paketleyip WEBHOOK_URL'e POST eder.
//
// ASIL ÜRETİM NUMARASI İLE ÇALIŞTIRMAYIN — test/ikincil numarayla kullanın.
//
// Kullanım: node bridge.js
// Ortam değişkenleri:
//   WEBHOOK_URL  (varsayılan: http://localhost:8080/baileys-webhook)
//   WEBHOOK_SHARED_SECRET (opsiyonel; verilirse X-Webhook-Secret header'ı eklenir)

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, proto } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:8080/baileys-webhook';
const UNHANDLED_LOG = path.join(__dirname, 'bridge_unhandled_messages.log');
const RISK_EVENTS_LOG = path.join(__dirname, 'risk_events.log');

let groupsIntervalId = null;

if (!process.env.WEBHOOK_SHARED_SECRET) {
  console.warn('[WEBHOOK CONFIG] WEBHOOK_SHARED_SECRET tanımlı değil - webhook istekleri 403 ile reddedilebilir');
}

function logRiskEvent(event) {
  try {
    fs.appendFileSync(RISK_EVENTS_LOG, JSON.stringify({ ...event, ts: new Date().toISOString() }) + '\n', 'utf-8');
  } catch (e) {
    console.error('[RISK-LOG HATA]', e.message);
  }
}

function extractText(message) {
  if (!message) return null;
  const unwrapped =
    message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    message;

  return (
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage?.caption ||
    unwrapped.videoMessage?.caption ||
    unwrapped.documentMessage?.caption ||
    unwrapped.buttonsResponseMessage?.selectedButtonId ||
    unwrapped.listResponseMessage?.title ||
    unwrapped.reactionMessage?.text ||
    null
  );
}

function describeMessageType(message) {
  if (!message) return 'unknown';
  const keys = Object.keys(message);
  return keys.length ? keys.join(',') : 'empty';
}

function toWebhookShape(msg) {
  const from = msg.key.remoteJid;
  const isGroup = from?.endsWith('@g.us');
  const body = extractText(msg.message);
  if (!body) return null;

  const senderJid = msg.key.participantAlt || msg.key.participant || (isGroup ? null : from);
  const senderName = msg.pushName || senderJid?.split('@')[0] || 'Bilinmeyen';
  const timestampSec = typeof msg.messageTimestamp === 'number'
    ? msg.messageTimestamp
    : Number(msg.messageTimestamp?.low ?? Math.floor(Date.now() / 1000));

  return {
    id: msg.key.id,
    body,
    timestamp: timestampSec,
    chat_id: from,
    chat_name: null,
    sender_name: senderName,
    from: senderJid || from,
    type: 'text',
    is_processed: false,
    source: 'baileys',
  };
}

async function postToWebhook(messages) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const webhookSecret = process.env.WEBHOOK_SHARED_SECRET;
    if (webhookSecret) {
      headers['X-Webhook-Secret'] = webhookSecret;
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) {
      console.error(`[WEBHOOK HATA] ${res.status} ${res.statusText}`);
    } else {
      console.log(`[WEBHOOK OK] ${messages.length} mesaj gönderildi -> ${WEBHOOK_URL}`);
    }
  } catch (e) {
    console.error('[WEBHOOK BAGLANTI HATASI]', e.message, `(hedef: ${WEBHOOK_URL})`);
  }
}

function atomicWrite(filePath, content) {
  try {
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    console.error(`[QR-WRITE ERROR] ${e.message}`);
  }
}

function writeQrState(qr, filePath = path.join(__dirname, '..', 'data', 'baileys_qr.json')) {
  const content = JSON.stringify({ qr: qr, generated_at: Date.now() });
  atomicWrite(filePath, content);
}

function writeAuthenticatedState(filePath = path.join(__dirname, '..', 'data', 'baileys_qr.json')) {
  const content = JSON.stringify({ status: 'authenticated' });
  atomicWrite(filePath, content);
}

function writeGroupsState(groupsObject, filePath = path.join(__dirname, '..', 'data', 'baileys_groups.json')) {
  try {
    const groupsArray = Object.values(groupsObject).map(g => ({
      id: g.id,
      name: (g.subject && g.subject.trim()) ? g.subject : ('Isimsiz Grup (...' + g.id.split('@')[0].slice(-6) + ')')
    }));
    const content = JSON.stringify({ groups: groupsArray });
    atomicWrite(filePath, content);
  } catch (e) {
    console.error('[GROUPS-WRITE ERROR]', e.message);
  }
}

function buildGetMessage(messageHistoryMap) {
  return (key) => {
    if (!key) return undefined;
    const msgId = typeof key === 'string' ? key : (key.id || null);
    if (!msgId) return undefined;
    return messageHistoryMap.get(msgId);
  };
}

function isDecryptFailedMessage(msg) {
  if (!msg || !msg.messageStubType) return false;
  return msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT;
}

async function bridge() {
  const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

  const messageHistory = new Map();

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: false,
    getMessage: buildGetMessage(messageHistory),
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n=== QR KODU ===\n');
      qrcode.generate(qr, { small: true });
      QRCode.toDataURL(qr).then(dataUri => {
        writeQrState(dataUri);
      }).catch(e => {
        console.error('[QR-GENERATE ERROR]', e.message);
      });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      logRiskEvent({ type: 'disconnect', statusCode: statusCode ?? null });

      if (statusCode === DisconnectReason.connectionReplaced) {
        console.log('[BAGLANTI KAPANDI] statusCode=440 (conflict/replaced) — YENIDEN BAGLANMIYOR.');
        console.log('[UYARI] Bu oturumu kullanan başka bir bağlantı algılandı.');
        console.log('[UYARI] Diğer bağlantıyı kapatıp scripti elle yeniden başlatın.');
        return;
      }

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`[BAGLANTI KAPANDI] statusCode=${statusCode} yenidenBaglan=${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(bridge, 2000);
      } else {
        console.log('[OTURUM KAPANDI] auth_info_baileys/ klasörünü silip yeniden QR taratmanız gerekir.');
      }
    } else if (connection === 'open') {
      console.log(`[BAGLANDI] Köprü aktif. Mesajlar -> ${WEBHOOK_URL}`);
      writeAuthenticatedState();
      if (groupsIntervalId) {
        clearInterval(groupsIntervalId);
      }
      groupsIntervalId = setInterval(() => {
        sock.groupFetchAllParticipating().then(groups => {
          writeGroupsState(groups);
        }).catch(e => {
          console.error('[GROUPS-FETCH ERROR]', e.message);
        });
      }, 60000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const converted = [];
    for (const msg of messages) {
      if (isDecryptFailedMessage(msg)) {
        logRiskEvent({ type: 'decrypt_failed', chatId: msg.key ? msg.key.remoteJid : null });
        continue;
      }

      if (!msg.message) continue;

      if (msg.key && msg.key.id) {
        messageHistory.set(msg.key.id, msg);
        if (messageHistory.size > 200) {
          const firstKey = messageHistory.keys().next().value;
          messageHistory.delete(firstKey);
        }
      }

      const shaped = toWebhookShape(msg);
      if (shaped) {
        converted.push(shaped);
      } else {
        fs.appendFileSync(
          UNHANDLED_LOG,
          JSON.stringify({ timestamp: new Date().toISOString(), key: msg.key, message: msg.message }) + '\n',
          'utf-8'
        );
      }
    }

    if (converted.length > 0) {
      logRiskEvent({ type: 'message', count: converted.length });
      await postToWebhook(converted);
    }
  });
}

module.exports = {
  writeQrState,
  writeAuthenticatedState,
  writeGroupsState,
  buildGetMessage,
  isDecryptFailedMessage,
  toWebhookShape,
  postToWebhook
};

if (require.main === module) {
  bridge().catch((e) => console.error('[FATAL]', e));
}
