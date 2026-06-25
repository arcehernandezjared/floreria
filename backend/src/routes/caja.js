const router = require('express').Router();
const ctrl = require('../controllers/cajaController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/actual', ctrl.getActual);
router.post('/abrir', ctrl.abrir);
router.post('/reabrir', ctrl.reabrir);
router.put('/:fecha/monto-inicial', ctrl.editarMontoInicial);

module.exports = router;
