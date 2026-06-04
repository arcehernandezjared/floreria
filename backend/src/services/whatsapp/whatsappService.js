const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const { query, queryOne } = require('../../config/database');
const { processMessage } = require('../ai/agentService');
const { transcribeAudio } = require('./audioTranscription');
const logger = require('../../utils/logger');

let sock = null;
let connectionStatus = 'disconnected';
let ioInstance = null;
let reconnectTimer = null;
let isShuttingDown = false;
let pendingPhoneNumber = null;
let socketGen = 0;
let onConnectedCb = null;

// ── Cola por usuario (evita condiciones de carrera) ───────────────────────────
const userQueues = new Map();

// ── Rate limiter: máx 20 msgs/min por número ─────────────────────────────────
const rateLimits  = new Map();
const RATE_MAX    = 20;
const RATE_WINDOW = 60_000;

function checkRateLimit(numero) {
  const now   = Date.now();
  const entry = rateLimits.get(numero);
  if (!entry || now - entry.since > RATE_WINDOW) {
    rateLimits.set(numero, { count: 1, since: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_MAX;
}

// Limpia entradas vencidas cada 5 minutos
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [num, r] of rateLimits) {
    if (r.since < cutoff) rateLimits.delete(num);
  }
}, 5 * 60_000).unref();

function setConnectedCallback(cb) { onConnectedCb = cb; }

const AUTH_PATH = path.join(__dirname, '../../../whatsapp-auth-floreria');

const silentLogger = {
  level: 'silent',
  trace: () => {}, debug: () => {}, info: () => {},
  warn: () => {}, error: () => {}, fatal: () => {},
  child: function () { return this; }
};

function clearAuthFiles() {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      fs.readdirSync(AUTH_PATH).forEach(f => fs.unlinkSync(path.join(AUTH_PATH, f)));
    }
    logger.info('Auth de WhatsApp limpiado');
  } catch (e) {
    logger.warn(`No se pudo limpiar auth: ${e.message}`);
  }
}

function emitStatus(status, extra = {}) {
  if (ioInstance) ioInstance.emit('wa_status', { status, ...extra });
}

async function initWhatsApp(io, phoneNumber = null, forceNew = false) {
  ioInstance = io;
  isShuttingDown = false;
  socketGen++;
  const myGen = socketGen;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) { try { sock.end(); } catch {} sock = null; }

  if (phoneNumber) {
    pendingPhoneNumber = phoneNumber;
    clearAuthFiles();
  } else if (forceNew) {
    pendingPhoneNumber = null;
    clearAuthFiles();
  }

  try {
    if (!fs.existsSync(AUTH_PATH)) fs.mkdirSync(AUTH_PATH, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    sock = makeWASocket({
      auth: state,
      logger: silentLogger,
      browser: ['Floristería Alma Caribeña', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      retryRequestDelayMs: 250,
      maxMsgRetryCount: 3,
      fireInitQueries: true,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: jid => jid?.includes('@g.us'),
      printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update) => {
      if (socketGen !== myGen) return;
      const { connection, lastDisconnect, qr } = update;

      // Cuando el socket está listo para autenticar (evento QR)
      // Usamos pairing code si hay número, de lo contrario enviamos el QR
      if (qr) {
        if (pendingPhoneNumber) {
          // Pequeño delay para asegurar que el socket esté completamente listo
          await new Promise(r => setTimeout(r, 500));
          if (socketGen !== myGen) return; // re-check after await
          try {
            logger.info(`Solicitando pairing code para ${pendingPhoneNumber}...`);
            const code = await sock.requestPairingCode(pendingPhoneNumber);
            logger.info(`Pairing code: ${code}`);
            connectionStatus = 'pairing';
            if (ioInstance) ioInstance.emit('wa_pairing_code', { code });
          } catch (e) {
            logger.error(`Error pairing code: ${e.message}`);
            emitStatus('error', { message: `Error generando código: ${e.message}` });
          }
        } else {
          // Sin número: generar imagen QR y emitirla al frontend
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
            connectionStatus = 'qr_ready';
            logger.info('QR generado para escanear');
            emitStatus('qr_ready');
            if (ioInstance) ioInstance.emit('wa_qr', { qr: qrDataUrl });
          } catch (e) {
            logger.error(`QR image error: ${e.message}`);
          }
        }
        return;
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        pendingPhoneNumber = null;
        emitStatus('connected');
        logger.info('✅ WhatsApp conectado');
        // Garantizar que la tabla de conversaciones existe
        query(`CREATE TABLE IF NOT EXISTS wa_conversaciones (
          id INT PRIMARY KEY AUTO_INCREMENT,
          numero_wa VARCHAR(30) NOT NULL UNIQUE,
          mensajes LONGTEXT,
          ultimo_mensaje DATETIME,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`).catch(e => logger.error(`ensureWaTable: ${e.message}`));
        if (onConnectedCb) onConnectedCb();
        return;
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode
          || lastDisconnect?.error?.output?.payload?.statusCode
          || 0;
        // Log completo para diagnóstico
        logger.info(`WhatsApp cerrado. Código: ${code} | Error completo: ${JSON.stringify(lastDisconnect?.error?.output || lastDisconnect?.error?.message || lastDisconnect?.error)}`);


        const wasConnected = connectionStatus === 'connected';
        if (socketGen === myGen) sock = null;

        // 515 = restart required: comportamiento normal tras emitir pairing code
        // Reconectar SIN número para no solicitar otro código — el teléfono ya tiene el código
        if (code === 515 || code === DisconnectReason.restartRequired) {
          connectionStatus = 'pairing';
          emitStatus('pairing');
          logger.info('Reiniciando para completar emparejamiento (esperando aprobación en el teléfono)...');
          pendingPhoneNumber = null; // no pedir otro código en la reconexión
          reconnectTimer = setTimeout(() => initWhatsApp(ioInstance), 2000);
          return;
        }

        const noReconnect = [
          DisconnectReason.loggedOut,
          401, // device_removed / logged out
          428, // connection closed before auth (unrecoverable)
        ].includes(code);

        connectionStatus = 'disconnected';

        if (noReconnect) {
          clearAuthFiles();
          pendingPhoneNumber = null;
          emitStatus('disconnected', { reason: 'session_invalid' });
          logger.info('Sesión terminada. Usa el panel para reconectar.');
        } else if (wasConnected && !isShuttingDown) {
          emitStatus('reconnecting');
          logger.info('Reconectando en 6s...');
          reconnectTimer = setTimeout(() => initWhatsApp(ioInstance), 6000);
        } else {
          emitStatus('disconnected', { reason: `code_${code}` });
          logger.info(`Desconectado con código ${code}. Auth conservado para reintento.`);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      if (socketGen !== myGen) return;
      if (type !== 'notify') return;

      for (const msg of msgs) {
        const jid = msg.key.remoteJid || '';
        logger.info(`📨 Mensaje entrante — jid: ${jid} | fromMe: ${msg.key.fromMe} | type: ${type}`);

        if (msg.key.fromMe) {
          logger.info(`⏭️ Ignorado (fromMe) — jid: ${jid}`);
          continue;
        }

        // Ignorar grupos, broadcasts y newsletters
        if (!jid ||
            jid.includes('@g.us') ||
            jid.includes('@broadcast') ||
            jid.includes('@newsletter')) {
          logger.info(`⏭️ Ignorado (jid especial) — jid: ${jid}`);
          continue;
        }

        // Extraer número — para @lid usar el JID completo como identificador único
        const numero = jid.includes('@lid')
          ? jid
          : jid.replace('@s.whatsapp.net', '');
        if (!numero) continue;

        // Rate limiting
        if (checkRateLimit(numero)) {
          logger.warn(`Rate limit alcanzado: ${numero} — mensaje ignorado`);
          continue;
        }

        // Ignorar mensajes de protocolo (delivery receipts, reacciones, etc.)
        const msgKeys = Object.keys(msg.message || {});
        if (!msg.message || msgKeys.includes('protocolMessage') ||
            msgKeys.includes('reactionMessage') ||
            msgKeys.includes('senderKeyDistributionMessage')) {
          logger.info(`⏭️ Ignorado (protocolo) — keys: ${msgKeys.join(',')}`);
          continue;
        }

        // Desempaquetar wrappers comunes de Baileys
        // (ephemeral, viewOnce, historySyncMsg llegan envueltos)
        const inner =
          msg.message?.ephemeralMessage?.message ||
          msg.message?.viewOnceMessage?.message ||
          msg.message?.viewOnceMessageV2?.message?.viewOnceMessage?.message ||
          msg.message?.documentWithCaptionMessage?.message ||
          msg.message;

        // Extraer texto del mensaje desempaquetado
        const texto =
          inner?.conversation ||
          inner?.extendedTextMessage?.text ||
          inner?.buttonsResponseMessage?.selectedDisplayText ||
          inner?.listResponseMessage?.title ||
          inner?.templateButtonReplyMessage?.selectedDisplayText;

        logger.info(`📝 [${numero}] keys: ${msgKeys.join(',')} | texto: "${texto ? texto.substring(0, 60) : 'vacío'}"`);

        if (texto?.trim()) {
          handleMessage(numero, texto.trim());
          continue;
        }

        // Imagen o video con caption (descripción de venta con foto)
        const caption = inner?.imageMessage?.caption || inner?.videoMessage?.caption;
        if (caption?.trim()) {
          handleMessage(numero, caption.trim());
          continue;
        }

        // Audio / nota de voz
        const audioMsg = inner?.audioMessage || inner?.pttMessage;
        if (audioMsg) {
          const mimeType = audioMsg.mimetype || 'audio/ogg; codecs=opus';
          logger.info(`🎤 Audio de ${numero} (mime: ${mimeType})`);
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              logger: silentLogger,
              reuploadRequest: sock.updateMediaMessage,
            });

            if (!buffer || buffer.length === 0) {
              logger.warn('Buffer de audio vacío — no se pudo descargar');
              await sendMessage(numero, '⚠️ No pude descargar tu audio. ¿Podés escribirme el mensaje?');
              continue;
            }

            const transcripcion = await transcribeAudio(buffer, mimeType);
            if (transcripcion) {
              handleMessage(numero, `[Audio]: ${transcripcion}`);
            } else {
              await sendMessage(numero, '⚠️ No pude entender el audio. ¿Podés escribirme el mensaje?');
            }
          } catch (e) {
            logger.error(`Audio error [${numero}]: ${e.message}`);
            await sendMessage(numero, '⚠️ Hubo un error con tu audio. ¿Podés escribirlo?');
          }
          continue;
        }

        // Otros tipos (imagen sin caption, documento, sticker, ubicación, contacto)
        const tipoArchivo =
          inner?.imageMessage    ? 'imagen'    :
          inner?.videoMessage    ? 'video'     :
          inner?.documentMessage ? 'documento' :
          inner?.stickerMessage  ? 'sticker'   :
          inner?.locationMessage ? 'ubicación' :
          inner?.contactMessage  ? 'contacto'  : null;

        if (tipoArchivo) {
          await sendMessage(numero,
            `Solo puedo procesar mensajes de texto y audios. El ${tipoArchivo} que enviaste no lo puedo interpretar. ¿Podés escribirme lo que necesitás?`
          );
        }
      }
    });

  } catch (error) {
    logger.error(`initWhatsApp error: ${error.message}`);
    connectionStatus = 'error';
    emitStatus('error', { message: error.message });
  }
}

// ── Cola de mensajes por usuario ──────────────────────────────────────────────
function handleMessage(numero, texto) {
  const prev = userQueues.get(numero) ?? Promise.resolve();
  const job  = prev
    .catch(() => {}) // el fallo anterior no bloquea el siguiente mensaje
    .then(() => _processMessage(numero, texto));
  userQueues.set(numero, job);
  job.finally(() => {
    if (userQueues.get(numero) === job) userQueues.delete(numero);
  });
}

async function _processMessage(numero, texto) {
  const jid = `${numero}@s.whatsapp.net`;
  logger.info(`📩 WA [${numero}]: ${texto.substring(0, 100)}`);

  // Indicador de "escribiendo..."
  try {
    if (sock && connectionStatus === 'connected') {
      await sock.sendPresenceUpdate('composing', jid);
    }
  } catch {}

  try {
    let conversacion = await queryOne(
      'SELECT * FROM wa_conversaciones WHERE numero_wa = ?',
      [numero]
    );

    let historial = [];
    try { historial = conversacion?.mensajes ? JSON.parse(conversacion.mensajes) : []; } catch {}

    const respuesta = await processMessage(texto, historial);

    historial.push({ role: 'user', content: texto });
    historial.push({ role: 'assistant', content: respuesta });
    if (historial.length > 20) historial = historial.slice(-20);

    if (conversacion) {
      await query('UPDATE wa_conversaciones SET mensajes=?, ultimo_mensaje=NOW() WHERE id=?',
        [JSON.stringify(historial), conversacion.id]);
    } else {
      await query('INSERT INTO wa_conversaciones (numero_wa, mensajes, ultimo_mensaje) VALUES (?,?,NOW())',
        [numero, JSON.stringify(historial)]);
    }

    await sendMessage(numero, respuesta);

    // Log de actividad — no crítico, no bloquea si falla
    query('INSERT INTO activity_logs (accion, descripcion) VALUES (?,?)',
      ['wa_mensaje', `${numero}: ${texto.substring(0, 80)}`]).catch(() => {});

    if (ioInstance) ioInstance.emit('wa_mensaje', { numero, texto, respuesta, timestamp: new Date() });

  } catch (error) {
    logger.error(`_processMessage error [${numero}]: ${error.message}`);
    await sendMessage(numero,
      '⚠️ Ocurrió un error procesando tu mensaje. Por favor intentá de nuevo en un momento.'
    );
  } finally {
    try {
      if (sock && connectionStatus === 'connected') {
        await sock.sendPresenceUpdate('paused', jid);
      }
    } catch {}
  }
}

async function sendMessage(numero, mensaje, retries = 1) {
  if (!sock || connectionStatus !== 'connected') return false;
  const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
  try {
    await sock.sendMessage(jid, { text: mensaje });
    return true;
  } catch (e) {
    logger.error(`sendMessage error [${numero}]: ${e.message}`);
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 1500));
      return sendMessage(numero, mensaje, retries - 1);
    }
    return false;
  }
}

async function disconnectWhatsApp() {
  isShuttingDown = true;
  pendingPhoneNumber = null;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) { try { await sock.logout(); } catch {} try { sock.end(); } catch {} sock = null; }
  clearAuthFiles();
  connectionStatus = 'disconnected';
}

function getStatus() {
  return { status: connectionStatus };
}

module.exports = { initWhatsApp, sendMessage, disconnectWhatsApp, getStatus, setConnectedCallback };
