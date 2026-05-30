const router = require('express').Router();
const ctrl = require('../controllers/reporteController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/ventas',      ctrl.getVentas);
router.get('/inventario',  ctrl.getInventario);
router.get('/mermas',      ctrl.getMermas);
router.get('/financiero',  ctrl.getFinanciero);

module.exports = router;
