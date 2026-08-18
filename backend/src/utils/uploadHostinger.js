const logger = require('./logger');

/**
 * Sube una imagen al servidor Hostinger via PHP.
 * @param {Buffer} buffer  - Contenido del archivo
 * @param {string} mimetype - MIME type del archivo
 * @param {string} originalname - Nombre original del archivo
 * @returns {Promise<string>} URL pública de la imagen
 */
async function uploadToHostinger(buffer, mimetype, originalname) {
  const uploadUrl   = process.env.HOSTINGER_UPLOAD_URL;
  const uploadToken = process.env.HOSTINGER_UPLOAD_TOKEN;

  if (!uploadUrl || !uploadToken) {
    throw new Error('HOSTINGER_UPLOAD_URL y HOSTINGER_UPLOAD_TOKEN no están configurados en las variables de entorno');
  }

  const blob = new Blob([buffer], { type: mimetype });
  const form = new FormData();
  form.append('imagen', blob, originalname || 'imagen.jpg');

  const resp = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'X-Upload-Token': uploadToken },
    body: form,
  });

  if (resp.status === 404) {
    throw new Error(`El archivo upload.php no existe en Hostinger (${uploadUrl}). Verifica que esté subido a public_html/api/upload.php`);
  }
  if (resp.status === 401) {
    throw new Error('Token incorrecto: verifica que HOSTINGER_UPLOAD_TOKEN coincida con el token en upload.php');
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error(`Respuesta inválida del servidor de imágenes (HTTP ${resp.status}). Verifica que upload.php esté bien configurado.`);
  }

  if (!resp.ok || !data.success) {
    throw new Error(data.message || `Error al subir imagen (HTTP ${resp.status})`);
  }

  logger.info(`uploadToHostinger: imagen subida → ${data.url}`);
  return data.url;
}

module.exports = { uploadToHostinger };
