const router = require('express').Router();
const ctrl = require('../controllers/insumoController');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo imágenes (JPG, PNG, WEBP)'));
  }
});

router.use(authMiddleware);

router.get('/', ctrl.getInsumos);
router.get('/categorias', ctrl.getCategorias);
router.post('/categorias', ctrl.createCategoria);
router.put('/categorias/:id', ctrl.updateCategoria);
router.delete('/categorias/:id', ctrl.deleteCategoria);
router.get('/stock-bajo', ctrl.getStockBajo);
router.post('/upload-imagen', upload.single('imagen'), ctrl.uploadImagenInsumo);
router.get('/:id/historial-costos', ctrl.getHistorialCostos);
router.post('/venta-directa', ctrl.ventaDirecta);
router.post('/', ctrl.createInsumo);
router.put('/:id', ctrl.updateInsumo);
router.post('/:id/ajustar-stock', ctrl.ajustarStock);
router.delete('/:id', ctrl.deleteInsumo);

module.exports = router;
