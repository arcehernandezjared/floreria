const router = require('express').Router();
const ctrl = require('../controllers/catalogoController');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|png|webp|gif)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPG, PNG, WEBP)'));
  }
});

router.use(authMiddleware);

router.get('/', ctrl.getCatalogo);
router.get('/ventas', ctrl.getVentas);
router.post('/recalcular-costos', ctrl.recalcularCostos);
router.post('/venta', ctrl.registrarVenta);
router.post('/upload-imagen', upload.single('imagen'), ctrl.uploadImagen);
router.post('/venta-personalizada', ctrl.ventaPersonalizada);
router.get('/:id', ctrl.getArregloConFicha);
router.post('/', ctrl.createArreglo);
router.put('/:id', ctrl.updateArreglo);
router.delete('/:id', ctrl.deleteArreglo);

module.exports = router;
