const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const { calcularMargen } = require('../utils/helpers');

async function getDashboard(req, res) {
  try {
    // Fecha en zona horaria de Costa Rica (UTC-6)
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
    const mesInicio = hoy.substring(0, 8) + '01';

    // 1. Ventas hoy
    const ventasHoy = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(precio_venta), 0) as monto,
              COALESCE(SUM(precio_venta - costo_produccion), 0) as margen
       FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) = ?`,
      [hoy]
    );

    // 2. Mermas hoy
    const mermasHoy = await queryOne(
      `SELECT COUNT(*) as count, COALESCE(SUM(costo_total), 0) as costo_total
       FROM mermas WHERE DATE(fecha) = ?`,
      [hoy]
    );

    // 3. Stock bajo
    const stockBajo = await query(
      `SELECT i.id, i.nombre, i.stock_actual, i.stock_minimo, i.unidad, c.nombre as categoria_nombre, c.tipo
       FROM insumos i JOIN categorias_insumo c ON i.categoria_id = c.id
       WHERE i.activo = 1 AND i.stock_actual <= i.stock_minimo
       ORDER BY (i.stock_actual / GREATEST(i.stock_minimo, 1)) ASC LIMIT 10`
    );

    // 4. Alertas margen
    const alertasMargen = await query(
      `SELECT c.id, c.nombre, c.precio_venta, c.margen_minimo,
              (SELECT COALESCE(SUM(fi.cantidad * i.costo_unitario), 0)
               FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
               WHERE fi.catalogo_id = c.id) as costo_actual
       FROM catalogo c WHERE c.activo = 1`
    );

    const alertasMargenFiltradas = alertasMargen
      .map(a => ({
        ...a,
        margen_real: calcularMargen(parseFloat(a.precio_venta), parseFloat(a.costo_actual))
      }))
      .filter(a => a.margen_real < parseFloat(a.margen_minimo));

    // 5. Termómetro nómina
    const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
    let termometro = { meta: 0, acumulado_periodo: 0, porcentaje_avance: 0, estado: 'rojo' };
    if (config) {
      const dia = new Date().getDate();
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const periodoInicio = dia <= 15 ? `${year}-${month}-01` : `${year}-${month}-16`;

      const nomResult = await queryOne(
        'SELECT COALESCE(SUM(provision_dia), 0) as acumulado FROM fondo_quincena_log WHERE periodo_inicio = ? AND cerrado = 0',
        [periodoInicio]
      );
      const acumulado = parseFloat(nomResult.acumulado);
      const meta = parseFloat(config.meta_quincena);
      const pct = meta > 0 ? Math.min(100, (acumulado / meta) * 100) : 0;
      const hoyDate = new Date();
      const diaActual = hoyDate.getDate();
      const daysInMonth = new Date(hoyDate.getFullYear(), hoyDate.getMonth() + 1, 0).getDate();
      const finQuincena = diaActual <= 15 ? 15 : daysInMonth;
      const diasRestantes = Math.max(0, finQuincena - diaActual);
      const faltante = Math.max(0, meta - acumulado);
      const provisionNecesaria = diasRestantes > 0 ? Math.ceil(faltante / diasRestantes) : 0;

      termometro = {
        meta,
        acumulado_periodo: acumulado,
        porcentaje_avance: parseFloat(pct.toFixed(2)),
        estado: pct >= 75 ? 'verde' : pct >= 40 ? 'amarillo' : 'rojo',
        dias_restantes: diasRestantes,
        provision_diaria_promedio: provisionNecesaria
      };
    }

    // 6. Top mermas semana
    const topMermas = await query(
      `SELECT i.nombre as insumo_nombre, SUM(m.cantidad) as total_unidades, SUM(m.costo_total) as total_perdido
       FROM mermas m JOIN insumos i ON m.insumo_id = i.id
       WHERE m.fecha >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY m.insumo_id, i.nombre
       ORDER BY total_perdido DESC LIMIT 5`
    );

    // 6b. Ventas últimos 7 días (para gráfica de tendencia)
    const ventasSemana = await query(
      `SELECT DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) as dia, COUNT(*) as ventas, COALESCE(SUM(precio_venta),0) as ingresos
       FROM ventas_floreria
       WHERE fecha >= DATE_SUB(NOW(), INTERVAL 6 DAY)
       GROUP BY DATE(CONVERT_TZ(fecha, '+00:00', '-06:00'))
       ORDER BY dia ASC`
    );

    // 7. Gastos mes
    const gastosMes = await queryOne(
      'SELECT COALESCE(SUM(monto), 0) as total FROM gastos WHERE fecha >= ? AND fecha <= LAST_DAY(?)',
      [mesInicio, mesInicio]
    );

    // 8. Ventas mes para utilidad
    const ventasMes = await queryOne(
      `SELECT COALESCE(SUM(precio_venta), 0) as monto, COALESCE(SUM(costo_produccion), 0) as costo
       FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha, '+00:00', '-06:00')) >= ?`,
      [mesInicio]
    );

    const mermasMes = await queryOne(
      'SELECT COALESCE(SUM(costo_total), 0) as total FROM mermas WHERE fecha >= ?',
      [mesInicio]
    );

    const utilidad_mes = parseFloat(ventasMes.monto) - parseFloat(ventasMes.costo) - parseFloat(mermasMes.total) - parseFloat(gastosMes.total);

    // 9. Pedidos pendientes (tabla puede no existir aún)
    let pedidosPendientes = { count: 0, proximos: [] };
    try {
      const pp = await queryOne("SELECT COUNT(*) as count FROM pedidos WHERE estado = 'pendiente'");
      const proximos = await query(
        "SELECT id, numero, cliente_nombre, hora_entrega, fecha FROM pedidos WHERE estado = 'pendiente' ORDER BY fecha ASC, hora_entrega ASC LIMIT 5"
      );
      pedidosPendientes = { count: parseInt(pp.count), proximos };
    } catch (_) {}

    res.json({
      success: true,
      data: {
        ventas_hoy: ventasHoy,
        mermas_hoy: mermasHoy,
        stock_bajo: stockBajo,
        alertas_margen: alertasMargenFiltradas,
        termometro_nomina: termometro,
        top_mermas_semana: topMermas,
        ventas_semana: ventasSemana,
        gastos_mes: parseFloat(gastosMes.total),
        utilidad_mes,
        pedidos_pendientes: pedidosPendientes
      }
    });
  } catch (error) {
    logger.error(`getDashboard: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getDashboard };
