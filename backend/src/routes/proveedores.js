const router = require('express').Router();
const ctrl = require('../controllers/proveedorController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getProveedores);
router.get('/:id', ctrl.getProveedor);
router.get('/:id/historial-compras', ctrl.getHistorialCompras);
router.post('/', ctrl.createProveedor);
router.put('/:id', ctrl.updateProveedor);
router.delete('/:id', ctrl.deleteProveedor);

module.exports = router;
