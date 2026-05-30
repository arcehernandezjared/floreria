const router = require('express').Router();
const { recibirVentaExterna } = require('../controllers/webhookController');

// Sin authMiddleware — se autentica por API key en el header X-API-Key
router.post('/venta-externa', recibirVentaExterna);

module.exports = router;
