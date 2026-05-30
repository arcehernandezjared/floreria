const router = require('express').Router();
const { enviarRecibo } = require('../controllers/ventasController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.post('/enviar-recibo', enviarRecibo);

module.exports = router;
