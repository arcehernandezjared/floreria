const router = require('express').Router();
const { enviarRecibo, registrarVentaManual } = require('../controllers/ventasController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.post('/enviar-recibo', enviarRecibo);
router.post('/manual', registrarVentaManual);

module.exports = router;
