const router = require('express').Router();
const { getNotificaciones } = require('../controllers/notificacionController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.get('/', getNotificaciones);

module.exports = router;
