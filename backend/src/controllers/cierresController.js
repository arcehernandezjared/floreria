const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const { registrarProvisionNomina } = require('./nominaController');

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS cierres_dia (
    id INT PRIMARY KEY AUTO_INCREMENT,
    fecha DATE NOT NULL UNIQUE,
    ventas_count INT DEFAULT 0,
    ventas_total DECIMAL(12,2) DEFAULT 0,
    costos_total DECIMAL(12,2) DEFAULT 0,
    gastos_total DECIMAL(12,2) DEFAULT 0,
    mermas_total DECIMAL(12,2) DEFAULT 0,
    utilidad DECIMAL(12,2) DEFAULT 0,
    efectivo_caja DECIMAL(12,2) DEFAULT 0,
    notas TEXT,
    usuario_nombre VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

// ── Verificar si hay días pendientes de cierre ─────────────────────────────
async function checkPendiente(req, res) {
  try {
    const crtz = { timeZone: 'America/Costa_Rica' };
    const hoy = new Date().toLocaleDateString('en-CA', crtz);

    // Buscar días anteriores a hoy que tengan ventas y no tengan cierre
    const pendientes = await query(`
      SELECT DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) as dia,
             COUNT(*) as ventas_count,
             COALESCE(SUM(v.precio_venta), 0) as ventas_total
      FROM ventas_floreria v
      WHERE DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) < ?
        AND DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) NOT IN (SELECT fecha FROM cierres_dia)
      GROUP BY DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00'))
      ORDER BY dia ASC
      LIMIT 1
    `, [hoy]);

    if (!pendientes.length) {
      return res.json({ success: true, data: { pendiente: false } });
    }

    const dia = pendientes[0];
    res.json({
      success: true,
      data: {
        pendiente: true,
        fecha: dia.dia,
        ventas_count: dia.ventas_count,
        ventas_total: dia.ventas_total
      }
    });
  } catch (e) {
    logger.error(`checkPendiente: ${e.message}`);
    res.json({ success: true, data: { pendiente: false } }); // no bloquear si hay error
  }
}

// ── Resumen de un día específico ───────────────────────────────────────────
async function getSummary(req, res) {
  try {
    const { fecha } = req.params;

    const [ventas, gastos, mermas] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) as count,
                COALESCE(SUM(precio_venta), 0) as total,
                COALESCE(SUM(costo_produccion), 0) as costos,
                COALESCE(SUM(CASE WHEN canal='efectivo' OR canal='mostrador' THEN precio_venta ELSE 0 END), 0) as efectivo
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`, [fecha]
      ),
      queryOne(
        `SELECT COALESCE(SUM(monto), 0) as total FROM gastos WHERE DATE(fecha) = ?`, [fecha]
      ),
      queryOne(
        `SELECT COALESCE(SUM(costo_total), 0) as total FROM mermas WHERE DATE(fecha) = ?`, [fecha]
      )
    ]);

    const detalleVentas = await query(
      `SELECT nombre_arreglo, precio_venta, canal, nombre_cliente FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ? ORDER BY fecha DESC LIMIT 10`,
      [fecha]
    );

    const detalleGastos = await query(
      `SELECT concepto, monto, categoria FROM gastos WHERE DATE(fecha) = ? ORDER BY id DESC LIMIT 10`,
      [fecha]
    );

    const utilidad = parseFloat(ventas.total) - parseFloat(ventas.costos) - parseFloat(gastos.total) - parseFloat(mermas.total);

    res.json({
      success: true,
      data: {
        fecha,
        ventas_count:  parseInt(ventas.count),
        ventas_total:  parseFloat(ventas.total),
        costos_total:  parseFloat(ventas.costos),
        gastos_total:  parseFloat(gastos.total),
        mermas_total:  parseFloat(mermas.total),
        utilidad:      parseFloat(utilidad.toFixed(2)),
        efectivo_ventas: parseFloat(ventas.efectivo),
        detalle_ventas:  detalleVentas,
        detalle_gastos:  detalleGastos,
      }
    });
  } catch (e) {
    logger.error(`getSummary: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

// ── Registrar cierre ───────────────────────────────────────────────────────
async function createCierre(req, res) {
  try {
    const { fecha, efectivo_caja, notas, usuario_nombre } = req.body;
    if (!fecha) return res.status(400).json({ success: false, message: 'La fecha es requerida' });

    // Calcular valores del día automáticamente
    const [ventas, gastos, mermas] = await Promise.all([
      queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(precio_venta),0) as total, COALESCE(SUM(costo_produccion),0) as costos FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`, [fecha]),
      queryOne(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE DATE(fecha) = ?`, [fecha]),
      queryOne(`SELECT COALESCE(SUM(costo_total),0) as total FROM mermas WHERE DATE(fecha) = ?`, [fecha]),
    ]);

    const utilidad = parseFloat(ventas.total) - parseFloat(ventas.costos) - parseFloat(gastos.total) - parseFloat(mermas.total);

    await query(
      `INSERT INTO cierres_dia (fecha, ventas_count, ventas_total, costos_total, gastos_total, mermas_total, utilidad, efectivo_caja, notas, usuario_nombre)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         ventas_count=VALUES(ventas_count), ventas_total=VALUES(ventas_total),
         costos_total=VALUES(costos_total), gastos_total=VALUES(gastos_total),
         mermas_total=VALUES(mermas_total), utilidad=VALUES(utilidad),
         efectivo_caja=VALUES(efectivo_caja), notas=VALUES(notas), usuario_nombre=VALUES(usuario_nombre)`,
      [fecha, ventas.count, ventas.total, ventas.costos, gastos.total, mermas.total,
       utilidad.toFixed(2), parseFloat(efectivo_caja) || 0, notas || null, usuario_nombre || null]
    );

    // ── Registrar provisión de nómina usando la función centralizada ──
    let provisionRegistrada = 0;
    try {
      const resultado = await registrarProvisionNomina(fecha, parseFloat(ventas.total));
      if (resultado) {
        provisionRegistrada = resultado.provision;
        logger.info(`Provisión nómina: ₡${resultado.provision.toFixed(0)} → periodo ${resultado.periodoInicio}`);
      }
    } catch (nomErr) {
      logger.error(`Cierre: error al registrar provisión nómina: ${nomErr.message}`);
    }

    logger.info(`Cierre registrado: ${fecha} — ₡${ventas.total} ventas, utilidad ₡${utilidad.toFixed(0)}, provisión ₡${provisionRegistrada.toFixed(0)}`);
    res.json({ success: true, message: `Cierre del ${fecha} registrado correctamente`, provision: provisionRegistrada });
  } catch (e) {
    logger.error(`createCierre: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

// ── Historial de cierres ───────────────────────────────────────────────────
async function getCierres(req, res) {
  try {
    const cierres = await query(
      `SELECT * FROM cierres_dia ORDER BY fecha DESC LIMIT 90`
    );
    res.json({ success: true, data: cierres });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { ensureTable, checkPendiente, getSummary, createCierre, getCierres };
