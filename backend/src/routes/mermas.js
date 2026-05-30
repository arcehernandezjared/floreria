const router = require('express').Router();
const ctrl = require('../controllers/mermaController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getMermas);
router.get('/por-motivo', ctrl.getMermasPorMotivo);
router.get('/rendimiento-proveedores', ctrl.getRendimientoProveedores);
router.post('/', ctrl.registrarMerma);

module.exports = router;
