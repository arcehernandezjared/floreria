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
  }
  return client;
}

async function transcribeAudio(audioBuffer) {
  const ai = getClient();
  if (!ai) {
    logger.warn('Audio recibido pero no hay GROQ_API_KEY ni OPENAI_API_KEY configurada');
    return null;
  }

  const tmpFile = path.join(os.tmpdir(), `wa_audio_${Date.now()}.ogg`);
  try {
    fs.writeFileSync(tmpFile, audioBuffer);
    const model = process.env.GROQ_API_KEY ? 'whisper-large-v3' : 'whisper-1';
    const result = await ai.audio.transcriptions.create({
      file: fs.createReadStream(tmpFile),
      model,
      language: 'es',
    });
    const texto = result.text?.trim();
    logger.info(`Audio transcrito: "${texto?.substring(0, 60)}"`);
    return texto || null;
  } catch (e) {
    logger.error(`transcribeAudio error: ${e.message}`);
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

module.exports = { transcribeAudio };
