const router = require('express').Router();
const ctrl = require('../controllers/gastoController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getGastos);
router.get('/resumen', ctrl.getResumenGastos);
router.post('/', ctrl.createGasto);
router.put('/:id', ctrl.updateGasto);
router.delete('/:id', ctrl.deleteGasto);

module.exports = router;
