const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

async function ensureMetaColumns() {
  try { await query('ALTER TABLE config_nomina ADD COLUMN gastos_meta DECIMAL(12,2) DEFAULT 0'); } catch (_) {}
  try { await query('ALTER TABLE config_nomina ADD COLUMN dias_laborales INT DEFAULT 26'); } catch (_) {}
}

async function getConfig(req, res) {
  try {
    await ensureMetaColumns();
    let config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    if (!config) {
      await query('INSERT INTO config_nomina (porcentaje_provision, meta_quincena, periodo_dias, gastos_meta, dias_laborales) VALUES (15, 600000, 15, 0, 26)');
      config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    }
    res.json({ success: true, data: config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateConfig(req, res) {
  try {
    const { porcentaje_provision, meta_quincena, periodo_dias, numero_alertas, gastos_meta, dias_laborales } = req.body;
    const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');

    if (config) {
      await query(
        'UPDATE config_nomina SET porcentaje_provision=?, meta_quincena=?, periodo_dias=?, numero_alertas=?, gastos_meta=?, dias_laborales=? WHERE id=?',
        [
          porcentaje_provision ?? config.porcentaje_provision,
          meta_quincena       ?? config.meta_quincena,
          periodo_dias        ?? config.periodo_dias,
          numero_alertas !== undefined ? (numero_alertas || null) : (config.numero_alertas ?? null),
          gastos_meta  !== undefined ? gastos_meta  : (config.gastos_meta ?? 0),
          dias_laborales !== undefined ? dias_laborales : (config.dias_laborales ?? 26),
          config.id
        ]
      );
    } else {
      await query(
        'INSERT INTO config_nomina (porcentaje_provision, meta_quincena, periodo_dias, numero_alertas, gastos_meta, dias_laborales) VALUES (?, ?, ?, ?, ?, ?)',
        [porcentaje_provision || 15, meta_quincena || 600000, periodo_dias || 15, numero_alertas || null, gastos_meta || 0, dias_laborales || 26]
      );
    }

    const updated = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    res.json({ success: true, data: updated, message: 'Configuración actualizada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function testAlerta(req, res) {
  try {
    const { enviarPrueba } = require('../services/alertScheduler');
    const numero = await enviarPrueba();
    res.json({ success: true, message: `Mensaje de prueba enviado a ${numero}` });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function forzarAlerta(req, res) {
  try {
    const { forzarAlertas } = require('../services/alertScheduler');
    const enviados = await forzarAlertas();
    const mensaje = enviados.length === 0
      ? 'Sin alertas activas en este momento — todo está bien 👍'
      : `${enviados.length} alerta(s) enviada(s): ${enviados.join(' | ')}`;
    res.json({ success: true, message: mensaje });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function cierreDia(req, res) {
  try {
    const { ingresos_dia, fecha } = req.body;
    if (ingresos_dia === undefined) {
      return res.status(400).json({ success: false, message: 'ingresos_dia es requerido' });
    }

    const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    const crHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
    const fechaDia = fecha || crHoy;
    const provision = parseFloat(ingresos_dia) * (parseFloat(config.porcentaje_provision) / 100);

    // Calcular acumulado del período actual (registros no cerrados)
    const periodoInicio = await getPeriodoInicio();
    const acumuladoAnterior = await queryOne(
      'SELECT COALESCE(SUM(provision_dia), 0) as total FROM fondo_quincena_log WHERE periodo_inicio = ? AND cerrado = 0 AND fecha < ?',
      [periodoInicio, fechaDia]
    );
    const acumulado = parseFloat(acumuladoAnterior.total) + provision;

    const periodoFin = getPeriodoFin(periodoInicio, config.periodo_dias);

    // INSERT OR REPLACE para el día
    await query(
      `INSERT INTO fondo_quincena_log (fecha, ingresos_dia, provision_dia, acumulado_periodo, periodo_inicio, periodo_fin, cerrado)
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE ingresos_dia=VALUES(ingresos_dia), provision_dia=VALUES(provision_dia),
       acumulado_periodo=VALUES(acumulado_periodo)`,
      [fechaDia, ingresos_dia, provision, acumulado, periodoInicio, periodoFin]
    );

    res.json({ success: true, data: { fecha: fechaDia, ingresos_dia, provision_dia: provision, acumulado_periodo: acumulado }, message: 'Cierre del día registrado' });
  } catch (error) {
    logger.error(`cierreDia: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getTermometro(req, res) {
  try {
    const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    if (!config) return res.json({ success: true, data: { meta: 0, acumulado: 0, porcentaje_avance: 0, estado: 'rojo' } });

    const periodoInicio = await getPeriodoInicio();
    const periodoFin = getPeriodoFin(periodoInicio, config.periodo_dias);

    const result = await queryOne(
      'SELECT COALESCE(SUM(provision_dia), 0) as acumulado, COUNT(*) as dias_registrados FROM fondo_quincena_log WHERE periodo_inicio = ? AND cerrado = 0',
      [periodoInicio]
    );

    const acumulado = parseFloat(result.acumulado);
    const meta = parseFloat(config.meta_quincena);
    const porcentaje_avance = meta > 0 ? Math.min(100, (acumulado / meta) * 100) : 0;

    const hoy = new Date();
    const fin = new Date(periodoFin);
    const dias_restantes = Math.max(0, Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24)));

    let estado = 'rojo';
    if (porcentaje_avance >= 75) estado = 'verde';
    else if (porcentaje_avance >= 40) estado = 'amarillo';

    const provision_diaria_promedio = result.dias_registrados > 0
      ? acumulado / result.dias_registrados
      : 0;

    res.json({
      success: true,
      data: {
        meta,
        acumulado_periodo: acumulado,
        porcentaje_avance: parseFloat(porcentaje_avance.toFixed(2)),
        dias_restantes,
        provision_diaria_promedio: parseFloat(provision_diaria_promedio.toFixed(2)),
        estado,
        periodo_inicio: periodoInicio,
        periodo_fin: periodoFin,
        porcentaje_provision: config.porcentaje_provision
      }
    });
  } catch (error) {
    logger.error(`getTermometro: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function resetPeriodo(req, res) {
  try {
    const periodoInicio = await getPeriodoInicio();
    await query('UPDATE fondo_quincena_log SET cerrado = 1 WHERE periodo_inicio = ?', [periodoInicio]);
    res.json({ success: true, message: `Período ${periodoInicio} cerrado correctamente` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getHistorialPeriodo(req, res) {
  try {
    const periodoInicio = await getPeriodoInicio();
    const data = await query(
      'SELECT * FROM fondo_quincena_log WHERE periodo_inicio = ? ORDER BY fecha ASC',
      [periodoInicio]
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getCalculoSalarios(req, res) {
  try {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
    const mesInicio = hoy.substring(0, 8) + '01';
    const desde = req.query.desde || mesInicio;
    const hasta = req.query.hasta || hoy;
    const empleados = Math.max(1, parseInt(req.query.empleados) || 1);

    const [ventas, gastos, compras, mermas] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(precio_venta),0) as ingresos, COALESCE(SUM(costo_produccion),0) as costos
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      queryOne(
        `SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE DATE(fecha) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      queryOne(
        `SELECT COALESCE(SUM(total),0) as total FROM compras WHERE DATE(fecha) BETWEEN ? AND ? AND estado = 'recibida'`,
        [desde, hasta]
      ),
      queryOne(
        `SELECT COALESCE(SUM(costo_total),0) as total FROM mermas WHERE DATE(fecha) BETWEEN ? AND ?`,
        [desde, hasta]
      )
    ]);

    const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    const pct_provision = config ? parseFloat(config.porcentaje_provision) : 15;

    const ingresos          = parseFloat(ventas.ingresos);
    const costos_produccion = parseFloat(ventas.costos);
    const total_gastos      = parseFloat(gastos.total);
    const total_inversiones = parseFloat(compras.total);
    const total_mermas      = parseFloat(mermas.total);

    const margen_bruto      = ingresos - costos_produccion;
    const disponible        = margen_bruto - total_gastos - total_inversiones - total_mermas;
    const provision_nomina  = ingresos * (pct_provision / 100);
    const utilidad_neta     = disponible - provision_nomina;
    const por_empleado      = empleados > 0 ? provision_nomina / empleados : 0;
    const pct_nomina        = ingresos > 0 ? (disponible / ingresos) * 100 : 0;

    let seguridad = 'critico';
    if (disponible > 0) {
      if (pct_nomina >= 15)     seguridad = 'seguro';
      else if (pct_nomina >= 5) seguridad = 'precaucion';
      else                      seguridad = 'riesgo';
    }

    res.json({
      success: true,
      data: {
        periodo: { desde, hasta },
        ingresos, costos_produccion, margen_bruto,
        total_gastos, total_inversiones, total_mermas,
        disponible, provision_nomina, utilidad_neta,
        empleados, por_empleado,
        pct_provision,
        pct_nomina: parseFloat(pct_nomina.toFixed(2)),
        seguridad
      }
    });
  } catch (error) {
    logger.error(`getCalculoSalarios: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getIngresosHoy(req, res) {
  try {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
    const result = await queryOne(
      `SELECT COALESCE(SUM(precio_venta),0) as total, COUNT(*) as ventas FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`,
      [hoy]
    );
    res.json({ success: true, data: { total: parseFloat(result.total), ventas: parseInt(result.ventas), fecha: hoy } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// Helpers internos
async function getPeriodoInicio() {
  const crHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
  const partes = crHoy.split('-');
  const year = partes[0];
  const month = partes[1];
  const dia = parseInt(partes[2], 10);
  const inicio = dia <= 15 ? `${year}-${month}-01` : `${year}-${month}-16`;
  return inicio;
}

function getPeriodoFin(inicio, periodoDias) {
  const d = new Date(inicio);
  d.setDate(d.getDate() + parseInt(periodoDias) - 1);
  return d.toISOString().split('T')[0];
}

// Función interna reutilizable — recibe fecha en formato YYYY-MM-DD
async function registrarProvisionNomina(fecha, ingresos_dia) {
  const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
  if (!config) throw new Error('No hay configuración de nómina');
  if (!ingresos_dia || parseFloat(ingresos_dia) <= 0) return null;

  const provision = parseFloat(ingresos_dia) * (parseFloat(config.porcentaje_provision) / 100);

  // Usar la fecha recibida para calcular el período, NO new Date()
  const partes = fecha.split('-');
  const yr = partes[0], mo = partes[1], dia = parseInt(partes[2]);
  const periodoInicio = dia <= 15 ? `${yr}-${mo}-01` : `${yr}-${mo}-16`;
  const periodoFin = getPeriodoFin(periodoInicio, config.periodo_dias);

  const acumuladoAnterior = await queryOne(
    'SELECT COALESCE(SUM(provision_dia), 0) as total FROM fondo_quincena_log WHERE periodo_inicio = ? AND cerrado = 0 AND fecha < ?',
    [periodoInicio, fecha]
  );
  const acumulado = parseFloat(acumuladoAnterior.total) + provision;

  await query(
    `INSERT INTO fondo_quincena_log (fecha, ingresos_dia, provision_dia, acumulado_periodo, periodo_inicio, periodo_fin, cerrado)
     VALUES (?,?,?,?,?,?,0)
     ON DUPLICATE KEY UPDATE
       ingresos_dia=VALUES(ingresos_dia),
       provision_dia=VALUES(provision_dia),
       acumulado_periodo=VALUES(acumulado_periodo)`,
    [fecha, ingresos_dia, provision.toFixed(2), acumulado.toFixed(2), periodoInicio, periodoFin]
  );

  return { provision, acumulado, periodoInicio };
}

async function getResumenMes(req, res) {
  try {
    const hoy = new Date();
    const primerDia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    const hoyStr = hoy.toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

    const [ventas, gastos] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(precio_venta), 0) as total, COUNT(*) as count
         FROM ventas_floreria
         WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) BETWEEN ? AND ?`,
        [primerDia, hoyStr]
      ),
      queryOne(
        `SELECT COALESCE(SUM(monto), 0) as total FROM gastos WHERE DATE(fecha) BETWEEN ? AND ?`,
        [primerDia, hoyStr]
      ),
    ]);

    const diasTranscurridos = hoy.getDate();
    const diasEnMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

    res.json({
      success: true,
      data: {
        ventas_mes: parseFloat(ventas.total),
        ventas_count: ventas.count,
        gastos_mes: parseFloat(gastos.total),
        dias_transcurridos: diasTranscurridos,
        dias_en_mes: diasEnMes,
        promedio_diario: diasTranscurridos > 0 ? parseFloat(ventas.total) / diasTranscurridos : 0,
      }
    });
  } catch (error) {
    logger.error(`getResumenMes: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getConfig, updateConfig, cierreDia, getTermometro, resetPeriodo, getHistorialPeriodo, getCalculoSalarios, getIngresosHoy, testAlerta, forzarAlerta, registrarProvisionNomina, getResumenMes };
