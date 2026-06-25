const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }

    const user = await queryOne(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    await query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign(
      { id: user.id, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password_hash: _, ...userData } = user;
    res.json({ success: true, token, user: userData });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
}

async function getProfile(req, res) {
  try {
    const user = await queryOne(
      'SELECT id, nombre, email, rol, ultimo_acceso FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const user = await queryOne('SELECT password_hash FROM usuarios WHERE id = ?', [req.user.id]);

    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({ success: false, message: 'Contraseña actual incorrecta' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await query('UPDATE usuarios SET password_hash = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { login, getProfile, changePassword };
