const jwt = require('jsonwebtoken');
const { queryOne } = require('../config/database');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token no proporcionado' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await queryOne(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ? AND activo = 1',
      [decoded.id]
    );
    if (!user) return res.status(401).json({ success: false, message: 'Usuario no válido' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Token inválido o expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return res.status(403).json({ success: false, message: 'Sin permisos suficientes' });
    }
    next();
  };
}

// ── Límite de intentos de login por IP ──────────────────────────────────────
// No había ninguna protección contra fuerza bruta sobre /auth/login. Guarda
// los intentos fallidos en memoria (suficiente para una app de un solo
// proceso) y bloquea temporalmente tras varios fallos seguidos.
const intentosLogin = new Map(); // ip -> { count, primerIntento }
const VENTANA_MS = 15 * 60 * 1000;
const MAX_INTENTOS = 10;

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ahora = Date.now();
  const registro = intentosLogin.get(ip);

  if (registro && ahora - registro.primerIntento < VENTANA_MS) {
    if (registro.count >= MAX_INTENTOS) {
      const minutosRestantes = Math.ceil((VENTANA_MS - (ahora - registro.primerIntento)) / 60000);
      return res.status(429).json({
        success: false,
        message: `Demasiados intentos de inicio de sesión. Intentá de nuevo en ${minutosRestantes} minuto(s).`
      });
    }
  } else if (registro) {
    intentosLogin.delete(ip);
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      const actual = intentosLogin.get(ip);
      if (actual && ahora - actual.primerIntento < VENTANA_MS) {
        actual.count += 1;
      } else {
        intentosLogin.set(ip, { count: 1, primerIntento: ahora });
      }
    } else if (res.statusCode === 200) {
      intentosLogin.delete(ip);
    }
  });

  next();
}

module.exports = { authMiddleware, requireRole, loginRateLimit };
