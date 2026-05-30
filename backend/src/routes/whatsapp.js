const router = require('express').Router();
const { authMiddleware } = require('../middleware/auth');
const { initWhatsApp, sendMessage, disconnectWhatsApp, getStatus } = require('../services/whatsapp/whatsappService');
const { processMessage } = require('../services/ai/agentService');

router.use(authMiddleware);

router.get('/status', (req, res) => {
  res.json({ success: true, data: getStatus() });
});

router.post('/connect', async (req, res) => {
  try {
    const io = req.app.get('io');
    const { phoneNumber, forceNew } = req.body;
    await initWhatsApp(io, phoneNumber || null, forceNew || false);
    res.json({ success: true, message: phoneNumber ? 'Generando código de emparejamiento...' : 'Generando QR...' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await disconnectWhatsApp();
    res.json({ success: true, message: 'WhatsApp desconectado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/chat', async (req, res) => {
  try {
    const { mensaje, historial = [] } = req.body;
    const respuesta = await processMessage(mensaje, historial);
    res.json({ success: true, respuesta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
