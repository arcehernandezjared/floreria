const router = require('express').Router();
const ctrl = require('../controllers/cierresController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/check',        ctrl.checkPendiente);
router.get('/summary/:fecha', ctrl.getSummary);
router.get('/',             ctrl.getCierres);
router.post('/',            ctrl.createCierre);
router.put('/:fecha',       ctrl.corregirCierre);

module.exports = router;
