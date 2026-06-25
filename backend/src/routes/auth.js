const router = require('express').Router();
const { login, getProfile, changePassword } = require('../controllers/authController');
const { authMiddleware, loginRateLimit } = require('../middleware/auth');

router.post('/login', loginRateLimit, login);
router.get('/profile', authMiddleware, getProfile);
router.put('/change-password', authMiddleware, changePassword);

module.exports = router;
