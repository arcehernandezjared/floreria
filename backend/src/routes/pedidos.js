const router = require('express').Router();
const ctrl = require('../controllers/pedidosController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/',          ctrl.getPedidos);
router.get('/:id',       ctrl.getPedido);
router.post('/',         ctrl.createPedido);
router.put('/:id',       ctrl.updatePedido);
router.patch('/:id/estado', ctrl.updateEstado);
router.delete('/:id',    ctrl.deletePedido);

module.exports = router;
