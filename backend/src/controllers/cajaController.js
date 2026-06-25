const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

function hoyCR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
}

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS caja_sesiones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL UNIQUE,
    monto_inicial DECIMAL(12,2) NOT NULL DEFAULT 0,
    estado ENUM('abierta','cerrada') NOT NULL DEFAULT 'abierta',
    usuario_nombre VARCHAR(200),
    abierta_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cerrada_en TIMESTAMP NULL
  )`);
}

// ── Sesión de caja de hoy (o null si nadie la ha abierto) ──────────────────
async function getActual(req, res) {
  try {
    const sesion = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [hoyCR()]);
    res.json({ success: true, data: sesion || null });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// ── Abrir caja del día con el monto inicial contado ─────────────────────────
async function abrir(req, res) {
  try {
    const { monto_inicial } = req.body;
    const fecha = hoyCR();

    const existente = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    if (existente) {
      return res.status(400).json({
        success: false,
        message: existente.estado === 'abierta'
          ? 'La caja de hoy ya está abierta'
          : 'La caja de hoy ya fue cerrada'
      });
    }

    await query(
      'INSERT INTO caja_sesiones (fecha, monto_inicial, usuario_nombre) VALUES (?, ?, ?)',
      [fecha, parseFloat(monto_inicial) || 0, req.user?.nombre || null]
    );

    const sesion = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    logger.info(`Caja abierta — ${fecha} con ₡${parseFloat(monto_inicial) || 0} por ${req.user?.nombre || '—'}`);
    res.status(201).json({ success: true, data: sesion, message: 'Caja abierta correctamente' });
  } catch (e) {
    logger.error(`abrir caja: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

// ── Reabrir la caja de hoy después de haberla cerrado — por ejemplo si llega
//    una venta más tarde. Mantiene el mismo monto_inicial; el siguiente cierre
//    recalcula todo desde cero con las ventas nuevas.
async function reabrir(req, res) {
  try {
    const fecha = hoyCR();
    const existente = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);

    if (!existente) {
      return res.status(400).json({ success: false, message: 'No hay caja registrada hoy para reabrir' });
    }
    if (existente.estado === 'abierta') {
      return res.status(400).json({ success: false, message: 'La caja de hoy ya está abierta' });
    }

    await query(`UPDATE caja_sesiones SET estado = 'abierta', cerrada_en = NULL WHERE fecha = ?`, [fecha]);

    const sesion = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    logger.info(`Caja reabierta — ${fecha} por ${req.user?.nombre || '—'}`);
    res.json({ success: true, data: sesion, message: 'Caja reabierta correctamente' });
  } catch (e) {
    logger.error(`reabrir caja: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { ensureTable, getActual, abrir, reabrir };
