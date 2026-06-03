const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../../utils/logger');

let client = null;

function getClient() {
  if (client) return client;
  if (process.env.GROQ_API_KEY) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    logger.info('Transcripción de audio: usando Groq Whisper');
  } else if (process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    logger.info('Transcripción de audio: usando OpenAI Whisper');
  } else {
    logger.warn('⚠️  No hay GROQ_API_KEY ni OPENAI_API_KEY — los audios de WhatsApp no se transcribirán');
  }
  return client;
}

function extFromMime(mimeType = '') {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.mp4';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return '.mp3';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('wav'))  return '.wav';
  if (mimeType.includes('opus')) return '.ogg'; // opus dentro de contenedor ogg
  return '.ogg'; // WhatsApp PTT por defecto es ogg/opus
}

async function transcribeAudio(audioBuffer, mimeType = '') {
  const ai = getClient();
  if (!ai) return null;

  if (!audioBuffer || audioBuffer.length === 0) {
    logger.warn('transcribeAudio: buffer de audio vacío');
    return null;
  }

  const ext = extFromMime(mimeType);
  const tmpFile = path.join(os.tmpdir(), `wa_audio_${Date.now()}${ext}`);

  try {
    fs.writeFileSync(tmpFile, audioBuffer);
    logger.info(`🎤 Transcribiendo audio ${ext} (${audioBuffer.length} bytes)...`);

    const model = process.env.GROQ_API_KEY ? 'whisper-large-v3' : 'whisper-1';
    const result = await ai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model,
      language: 'es',
    });

    const texto = (typeof result === 'string' ? result : result.text)?.trim();
    if (texto) logger.info(`🎤 Transcripción: "${texto.substring(0, 80)}"`);
    return texto || null;
  } catch (e) {
    logger.error(`transcribeAudio error: ${e.message}`);
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

module.exports = { transcribeAudio };
