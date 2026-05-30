const router = require('express').Router();
const ctrl = require('../controllers/nominaController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/config',            ctrl.getConfig);
router.put('/config',            ctrl.updateConfig);
router.get('/termometro',        ctrl.getTermometro);
router.get('/historial',         ctrl.getHistorialPeriodo);
router.get('/calculo-salarios',  ctrl.getCalculoSalarios);
router.get('/ingresos-hoy',      ctrl.getIngresosHoy);
router.post('/cierre-dia',       ctrl.cierreDia);
router.post('/reset-periodo',    ctrl.resetPeriodo);
router.post('/test-alerta',      ctrl.testAlerta);
router.post('/forzar-alerta',    ctrl.forzarAlerta);

module.exports = router;
