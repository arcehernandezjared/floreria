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

// ── Editar el monto inicial de una fecha (corrige errores sin tocar la BD a mano) ──
// Si esa fecha ya tiene un cierre guardado en el historial, lo recalcula
// (efectivo_esperado y diferencia_caja) para que quede consistente.
async function editarMontoInicial(req, res) {
  try {
    const { fecha } = req.params;
    const nuevoMonto = parseFloat(req.body.monto_inicial);
    if (isNaN(nuevoMonto) || nuevoMonto < 0) {
      return res.status(400).json({ success: false, message: 'Monto inválido' });
    }

    const sesion = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    if (!sesion) return res.status(404).json({ success: false, message: 'No hay caja registrada esa fecha' });

    await query('UPDATE caja_sesiones SET monto_inicial = ? WHERE fecha = ?', [nuevoMonto, fecha]);

    // Si ya existe un cierre (historial) para esta fecha, recalcular para que no quede desfasado
    const cierre = await queryOne('SELECT * FROM cierres_dia WHERE fecha = ?', [fecha]);
    if (cierre) {
      const efectivoEsperado = nuevoMonto + parseFloat(cierre.ventas_efectivo || 0);
      const diferencia = parseFloat(cierre.efectivo_caja || 0) - efectivoEsperado;
      await query(
        'UPDATE cierres_dia SET monto_inicial = ?, efectivo_esperado = ?, diferencia_caja = ? WHERE fecha = ?',
        [nuevoMonto, efectivoEsperado, diferencia, fecha]
      );
    }

    const actualizada = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    logger.info(`Monto inicial de caja ${fecha} editado a ₡${nuevoMonto} por ${req.user?.nombre || '—'}`);
    res.json({ success: true, data: actualizada, message: 'Monto inicial actualizado correctamente' });
  } catch (e) {
    logger.error(`editarMontoInicial: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { ensureTable, getActual, abrir, reabrir, editarMontoInicial };
