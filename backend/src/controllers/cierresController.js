const { query, queryOne, addColumnIfMissing } = require('../config/database');
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
  // Migración: desglose de caja por forma de pago (monto contado = efectivo_caja)
  await addColumnIfMissing('cierres_dia', 'monto_inicial', 'DECIMAL(12,2) DEFAULT 0');
  await addColumnIfMissing('cierres_dia', 'ventas_efectivo', 'DECIMAL(12,2) DEFAULT 0');
  await addColumnIfMissing('cierres_dia', 'ventas_tarjeta', 'DECIMAL(12,2) DEFAULT 0');
  await addColumnIfMissing('cierres_dia', 'ventas_sinpe', 'DECIMAL(12,2) DEFAULT 0');
  await addColumnIfMissing('cierres_dia', 'efectivo_esperado', 'DECIMAL(12,2) DEFAULT 0');
  await addColumnIfMissing('cierres_dia', 'diferencia_caja', 'DECIMAL(12,2) DEFAULT 0');
}

// ── Ventas del día agrupadas por forma de pago ──────────────────────────────
async function getDesglosePago(fecha) {
  const filas = await query(
    `SELECT forma_pago, COALESCE(SUM(precio_venta), 0) as total
     FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?
     GROUP BY forma_pago`,
    [fecha]
  );
  const desglose = { efectivo: 0, tarjeta: 0, sinpe: 0 };
  for (const f of filas) desglose[f.forma_pago] = parseFloat(f.total);
  return desglose;
}

// ── Verificar si hay días pendientes de cierre ─────────────────────────────
// Se considera pendiente un día anterior a hoy si: tuvo ventas sin cierre
// registrado, O si su caja quedó abierta y nunca se cerró (aunque no haya
// tenido ventas) — en ambos casos hay que obligar el cierre antes de seguir.
async function checkPendiente(req, res) {
  try {
    const crtz = { timeZone: 'America/Costa_Rica' };
    const hoy = new Date().toLocaleDateString('en-CA', crtz);

    const [pendientesVentas, cajaSinCerrar] = await Promise.all([
      query(`
        SELECT DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) as dia
        FROM ventas_floreria v
        WHERE DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) < ?
          AND DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) NOT IN (SELECT fecha FROM cierres_dia)
        GROUP BY DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00'))
      `, [hoy]),
      query(`SELECT fecha FROM caja_sesiones WHERE estado = 'abierta' AND fecha < ?`, [hoy])
    ]);

    const diasPendientes = new Set([
      ...pendientesVentas.map(p => p.dia instanceof Date ? p.dia.toISOString().split('T')[0] : String(p.dia)),
      ...cajaSinCerrar.map(c => c.fecha instanceof Date ? c.fecha.toISOString().split('T')[0] : String(c.fecha))
    ]);

    if (diasPendientes.size === 0) {
      return res.json({ success: true, data: { pendiente: false } });
    }

    const fecha = [...diasPendientes].sort()[0];

    const ventasDia = await queryOne(
      `SELECT COUNT(*) as ventas_count, COALESCE(SUM(precio_venta), 0) as ventas_total
       FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`,
      [fecha]
    );

    res.json({
      success: true,
      data: {
        pendiente: true,
        fecha,
        ventas_count: ventasDia.ventas_count,
        ventas_total: ventasDia.ventas_total
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
        `SELECT COALESCE(SUM(costo_total), 0) as total FROM mermas WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`, [fecha]
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

    // Fórmula: ventas − gastos − mermas (sin costos de producción, sin nómina en preview)
    const utilidad = parseFloat(ventas.total) - parseFloat(gastos.total) - parseFloat(mermas.total);

    const desglosePago = await getDesglosePago(fecha);
    const sesionCaja = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    const montoInicial = sesionCaja ? parseFloat(sesionCaja.monto_inicial) : 0;
    const efectivoEsperado = montoInicial + desglosePago.efectivo;

    res.json({
      success: true,
      data: {
        fecha,
        ventas_count:  parseInt(ventas.count),
        ventas_total:  parseFloat(ventas.total),
        gastos_total:  parseFloat(gastos.total),
        mermas_total:  parseFloat(mermas.total),
        utilidad:      parseFloat(utilidad.toFixed(2)),
        efectivo_ventas: parseFloat(ventas.efectivo),
        detalle_ventas:  detalleVentas,
        detalle_gastos:  detalleGastos,
        ventas_efectivo:   desglosePago.efectivo,
        ventas_tarjeta:    desglosePago.tarjeta,
        ventas_sinpe:      desglosePago.sinpe,
        monto_inicial:     montoInicial,
        efectivo_esperado: efectivoEsperado,
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
      queryOne(`SELECT COUNT(*) as count, COALESCE(SUM(precio_venta),0) as total FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`, [fecha]),
      queryOne(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE DATE(fecha) = ?`, [fecha]),
      queryOne(`SELECT COALESCE(SUM(costo_total),0) as total FROM mermas WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`, [fecha]),
    ]);

    // ── Registrar provisión de nómina ──
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

    // Rentabilidad = ventas − nómina − gastos − mermas
    const utilidad = parseFloat(ventas.total) - provisionRegistrada - parseFloat(gastos.total) - parseFloat(mermas.total);

    // ── Desglose de caja: cuánto debería haber en efectivo según las ventas ──
    const desglosePago = await getDesglosePago(fecha);
    const sesionCaja = await queryOne('SELECT * FROM caja_sesiones WHERE fecha = ?', [fecha]);
    const montoInicial = sesionCaja ? parseFloat(sesionCaja.monto_inicial) : 0;
    const efectivoContado = parseFloat(efectivo_caja) || 0;
    const efectivoEsperado = montoInicial + desglosePago.efectivo;
    const diferenciaCaja = efectivoContado - efectivoEsperado;

    await query(
      `INSERT INTO cierres_dia (fecha, ventas_count, ventas_total, costos_total, gastos_total, mermas_total, utilidad, efectivo_caja, notas, usuario_nombre,
         monto_inicial, ventas_efectivo, ventas_tarjeta, ventas_sinpe, efectivo_esperado, diferencia_caja)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         ventas_count=VALUES(ventas_count), ventas_total=VALUES(ventas_total),
         costos_total=VALUES(costos_total), gastos_total=VALUES(gastos_total),
         mermas_total=VALUES(mermas_total), utilidad=VALUES(utilidad),
         efectivo_caja=VALUES(efectivo_caja), notas=VALUES(notas), usuario_nombre=VALUES(usuario_nombre),
         monto_inicial=VALUES(monto_inicial), ventas_efectivo=VALUES(ventas_efectivo),
         ventas_tarjeta=VALUES(ventas_tarjeta), ventas_sinpe=VALUES(ventas_sinpe),
         efectivo_esperado=VALUES(efectivo_esperado), diferencia_caja=VALUES(diferencia_caja)`,
      [fecha, ventas.count, ventas.total, provisionRegistrada.toFixed(2), gastos.total, mermas.total,
       utilidad.toFixed(2), efectivoContado, notas || null, usuario_nombre || null,
       montoInicial, desglosePago.efectivo, desglosePago.tarjeta, desglosePago.sinpe, efectivoEsperado, diferenciaCaja]
    );

    if (sesionCaja && sesionCaja.estado === 'abierta') {
      await query(`UPDATE caja_sesiones SET estado = 'cerrada', cerrada_en = NOW() WHERE fecha = ?`, [fecha]);
    }

    logger.info(`Cierre registrado: ${fecha} — ₡${ventas.total} ventas, rentabilidad ₡${utilidad.toFixed(0)}, provisión ₡${provisionRegistrada.toFixed(0)}, diferencia caja ₡${diferenciaCaja.toFixed(0)}`);
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
