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
        if (msg.key.fromMe) continue;
        if (msg.key.remoteJid?.includes('@g.us')) continue;
        const numero = msg.key.remoteJid?.replace('@s.whatsapp.net', '');
        if (!numero) continue;

        // Texto normal
        const texto =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.buttonsResponseMessage?.selectedDisplayText;

        if (texto?.trim()) {
          handleMessage(numero, texto.trim()).catch(e => logger.error(`handleMessage: ${e.message}`));
          continue;
        }

        // Audio / nota de voz
        const esAudio = msg.message?.pttMessage || msg.message?.audioMessage;
        if (esAudio) {
          logger.info(`🎤 Audio recibido de ${numero}, transcribiendo...`);
          try {
            const buffer = await downloadMediaMessage(msg, 'buffer', {}, {
              logger: silentLogger,
              reuploadRequest: sock.updateMediaMessage,
            });
            const transcripcion = await transcribeAudio(buffer);
            if (transcripcion) {
              logger.info(`🎤 Transcripción: "${transcripcion.substring(0, 80)}"`);
              handleMessage(numero, transcripcion).catch(e => logger.error(`handleMessage audio: ${e.message}`));
            } else {
              await sendMessage(numero, '⚠️ No pude entender el audio. ¿Podés escribirme el mensaje?');
            }
          } catch (e) {
            logger.error(`Audio download error: ${e.message}`);
            await sendMessage(numero, '⚠️ Hubo un error procesando tu audio. ¿Podés escribirlo?');
          }
        }
      }
    });

  } catch (error) {
    logger.error(`initWhatsApp error: ${error.message}`);
    connectionStatus = 'error';
    emitStatus('error', { message: error.message });
  }
}

async function handleMessage(numero, texto) {
  logger.info(`📩 WA [${numero}]: ${texto.substring(0, 80)}`);

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
  await query('INSERT INTO activity_logs (accion, descripcion) VALUES (?,?)',
    ['wa_mensaje', `${numero}: ${texto.substring(0, 80)}`]);
  if (ioInstance) ioInstance.emit('wa_mensaje', { numero, texto, respuesta, timestamp: new Date() });
}

async function sendMessage(numero, mensaje) {
  if (!sock || connectionStatus !== 'connected') return false;
  try {
    const jid = numero.includes('@') ? numero : `${numero}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: mensaje });
    return true;
  } catch (e) {
    logger.error(`sendMessage error: ${e.message}`);
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
