const router = require('express').Router();
const ctrl = require('../controllers/cotizacionesController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/',          ctrl.getCotizaciones);
router.get('/:id',       ctrl.getCotizacion);
router.post('/',         ctrl.createCotizacion);
router.put('/:id',       ctrl.updateCotizacion);
router.delete('/:id',    ctrl.deleteCotizacion);
router.post('/:id/enviar', ctrl.enviarCotizacion);

module.exports = router;
