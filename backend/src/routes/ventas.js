const router = require('express').Router();
const { enviarRecibo, registrarVentaManual } = require('../controllers/ventasController');
const { fixMarkupVentasHoy } = require('../controllers/catalogoController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.post('/enviar-recibo', enviarRecibo);
router.post('/manual', registrarVentaManual);
router.post('/fix-markup-hoy', fixMarkupVentasHoy);

module.exports = router;
