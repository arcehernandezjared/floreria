const router = require('express').Router();
const ctrl = require('../controllers/insumoController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', ctrl.getInsumos);
router.get('/categorias', ctrl.getCategorias);
router.post('/categorias', ctrl.createCategoria);
router.put('/categorias/:id', ctrl.updateCategoria);
router.delete('/categorias/:id', ctrl.deleteCategoria);
router.get('/stock-bajo', ctrl.getStockBajo);
router.get('/:id/historial-costos', ctrl.getHistorialCostos);
router.post('/venta-directa', ctrl.ventaDirecta);
router.post('/', ctrl.createInsumo);
router.put('/:id', ctrl.updateInsumo);
router.post('/:id/ajustar-stock', ctrl.ajustarStock);
router.delete('/:id', ctrl.deleteInsumo);

module.exports = router;
