const router = require('express').Router();
const ctrl = require('../controllers/compraController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getCompras);
router.get('/:id', ctrl.getCompra);
router.post('/', ctrl.createCompra);
router.post('/:id/recibir', ctrl.recibirCompra);
router.delete('/:id', ctrl.eliminarCompra);

module.exports = router;
