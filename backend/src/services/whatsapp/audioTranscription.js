const OpenAI = require('openai');
const logger = require('../../utils/logger');

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    logger.error('❌ Sin GROQ_API_KEY ni OPENAI_API_KEY — audios no se transcribirán');
    return null;
  }
  if (process.env.GROQ_API_KEY) {
    client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    logger.info('Transcripción: Groq Whisper listo');
  } else {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    logger.info('Transcripción: OpenAI Whisper listo');
  }
  return client;
}

function resolveFormat(mimeType = '') {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return { ext: 'mp4', type: 'audio/mp4' };
  if (mimeType.includes('mp3') || mimeType.includes('mpeg'))  return { ext: 'mp3', type: 'audio/mpeg' };
  if (mimeType.includes('webm')) return { ext: 'webm', type: 'audio/webm' };
  if (mimeType.includes('wav'))  return { ext: 'wav',  type: 'audio/wav' };
  return { ext: 'ogg', type: 'audio/ogg' }; // WhatsApp PTT por defecto
}

async function transcribeAudio(audioBuffer, mimeType = '') {
  if (!audioBuffer || audioBuffer.length === 0) {
    logger.warn('transcribeAudio: buffer vacío');
    return null;
  }

  const ai = getClient();
  if (!ai) return null;

  const { ext, type } = resolveFormat(mimeType);
  const model = process.env.GROQ_API_KEY ? 'whisper-large-v3' : 'whisper-1';

  logger.info(`🎤 Transcribiendo ${audioBuffer.length} bytes (${ext}) con ${process.env.GROQ_API_KEY ? 'Groq' : 'OpenAI'}...`);

  try {
    const { toFile } = require('openai');
    const audioFile = await toFile(audioBuffer, `audio.${ext}`, { type });

    const result = await ai.audio.transcriptions.create({
      file: audioFile,
      model,
      language: 'es',
    });

    const texto = (typeof result === 'string' ? result : result.text)?.trim();
    if (texto) {
      logger.info(`🎤 OK: "${texto.substring(0, 80)}"`);
    } else {
      logger.warn('🎤 Groq devolvió respuesta vacía');
    }
    return texto || null;
  } catch (e) {
    logger.error(`transcribeAudio error: ${e.message}${e.status ? ` (HTTP ${e.status})` : ''}`);
    return null;
  }
}

module.exports = { transcribeAudio };
