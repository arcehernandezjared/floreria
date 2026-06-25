const router = require('express').Router();
const ctrl = require('../controllers/pedidosController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/',          ctrl.getPedidos);
router.get('/movimientos', ctrl.getMovimientosGlobal);
router.get('/:id',       ctrl.getPedido);
router.get('/:id/movimientos', ctrl.getMovimientos);
router.post('/',         ctrl.createPedido);
router.post('/:id/abono', ctrl.abonarPedido);
router.put('/:id',       ctrl.updatePedido);
router.patch('/:id/estado', ctrl.updateEstado);
router.delete('/:id',    ctrl.deletePedido);

module.exports = router;
