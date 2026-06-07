const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

function rango(desde, hasta) {
  const hoy = new Date().toISOString().split('T')[0];
  const mesInicio = hoy.substring(0, 8) + '01';
  return { desde: desde || mesInicio, hasta: hasta || hoy };
}

async function getVentas(req, res) {
  try {
    const { desde, hasta } = rango(req.query.desde, req.query.hasta);

    const [resumen, porDia, porCanal, topProductos, detalle] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) as total_ventas,
                COALESCE(SUM(precio_venta),0) as total_ingresos,
                COALESCE(SUM(costo_produccion),0) as total_costos,
                COALESCE(SUM(precio_venta - costo_produccion),0) as margen_bruto,
                COALESCE(AVG(precio_venta),0) as ticket_promedio
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      query(
        `SELECT DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) as dia, COUNT(*) as ventas,
                COALESCE(SUM(precio_venta),0) as ingresos
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?
         GROUP BY dia ORDER BY dia`,
        [desde, hasta]
      ),
      query(
        `SELECT canal, COUNT(*) as ventas,
                COALESCE(SUM(precio_venta),0) as ingresos
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?
         GROUP BY canal ORDER BY ingresos DESC`,
        [desde, hasta]
      ),
      query(
        `SELECT nombre_arreglo, COUNT(*) as veces,
                COALESCE(SUM(precio_venta),0) as total,
                COALESCE(AVG(precio_venta),0) as promedio
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?
         GROUP BY nombre_arreglo ORDER BY total DESC LIMIT 10`,
        [desde, hasta]
      ),
      query(
        `SELECT nombre_arreglo, precio_venta, costo_produccion, canal, nombre_cliente, fecha
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?
         ORDER BY fecha DESC LIMIT 150`,
        [desde, hasta]
      )
    ]);

    res.json({ success: true, data: { resumen, porDia, porCanal, topProductos, detalle, periodo: { desde, hasta } } });
  } catch (error) {
    logger.error(`reporte/ventas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getInventario(req, res) {
  try {
    const [resumen, insumos, porCategoria] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) as total_items,
                COALESCE(SUM(stock_actual * costo_unitario),0) as valor_total,
                SUM(CASE WHEN stock_actual = 0 THEN 1 ELSE 0 END) as agotados,
                SUM(CASE WHEN stock_actual > 0 AND stock_actual <= stock_minimo THEN 1 ELSE 0 END) as bajo_minimo
         FROM insumos WHERE activo = 1`
      ),
      query(
        `SELECT i.nombre, ci.nombre as categoria, i.unidad,
                i.stock_actual, i.stock_minimo, i.costo_unitario,
                ROUND(i.stock_actual * i.costo_unitario, 2) as valor_stock,
                CASE WHEN i.stock_actual = 0 THEN 'agotado'
                     WHEN i.stock_actual <= i.stock_minimo THEN 'bajo'
                     ELSE 'ok' END as estado
         FROM insumos i JOIN categorias_insumo ci ON i.categoria_id = ci.id
         WHERE i.activo = 1 ORDER BY ci.nombre, i.nombre`
      ),
      query(
        `SELECT ci.nombre as categoria, COUNT(i.id) as total,
                ROUND(SUM(i.stock_actual * i.costo_unitario),2) as valor
         FROM insumos i JOIN categorias_insumo ci ON i.categoria_id = ci.id
         WHERE i.activo = 1
         GROUP BY ci.id, ci.nombre ORDER BY valor DESC`
      )
    ]);

    res.json({ success: true, data: { resumen, insumos, porCategoria } });
  } catch (error) {
    logger.error(`reporte/inventario: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getMermas(req, res) {
  try {
    const { desde, hasta } = rango(req.query.desde, req.query.hasta);

    const [resumen, porMotivo, topInsumos, detalle] = await Promise.all([
      queryOne(
        `SELECT COUNT(*) as total_registros,
                COALESCE(SUM(costo_total),0) as perdida_total,
                COALESCE(AVG(costo_total),0) as perdida_promedio,
                COALESCE(SUM(cantidad),0) as total_unidades
         FROM mermas WHERE DATE(fecha) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      query(
        `SELECT motivo, COUNT(*) as cantidad,
                COALESCE(SUM(costo_total),0) as total
         FROM mermas WHERE DATE(fecha) BETWEEN ? AND ?
         GROUP BY motivo ORDER BY total DESC`,
        [desde, hasta]
      ),
      query(
        `SELECT i.nombre, COUNT(m.id) as registros,
                SUM(m.cantidad) as unidades, SUM(m.costo_total) as perdida
         FROM mermas m JOIN insumos i ON m.insumo_id = i.id
         WHERE DATE(m.fecha) BETWEEN ? AND ?
         GROUP BY m.insumo_id, i.nombre ORDER BY perdida DESC LIMIT 10`,
        [desde, hasta]
      ),
      query(
        `SELECT i.nombre as insumo, m.cantidad, m.costo_total, m.motivo, m.notas, m.fecha
         FROM mermas m JOIN insumos i ON m.insumo_id = i.id
         WHERE DATE(m.fecha) BETWEEN ? AND ?
         ORDER BY m.fecha DESC LIMIT 150`,
        [desde, hasta]
      )
    ]);

    res.json({ success: true, data: { resumen, porMotivo, topInsumos, detalle, periodo: { desde, hasta } } });
  } catch (error) {
    logger.error(`reporte/mermas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getFinanciero(req, res) {
  try {
    const { desde, hasta } = rango(req.query.desde, req.query.hasta);

    const [ventas, mermas, gastosRows, tendencia] = await Promise.all([
      queryOne(
        `SELECT COALESCE(SUM(precio_venta),0) as ingresos,
                COUNT(*) as total_ventas
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      queryOne(
        `SELECT COALESCE(SUM(costo_total),0) as perdida
         FROM mermas WHERE DATE(fecha) BETWEEN ? AND ?`,
        [desde, hasta]
      ),
      query(
        `SELECT COALESCE(categoria,'Sin categoría') as categoria,
                COALESCE(SUM(monto),0) as total
         FROM gastos WHERE DATE(fecha) BETWEEN ? AND ?
         GROUP BY categoria ORDER BY total DESC`,
        [desde, hasta]
      ),
      query(
        `SELECT DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) as dia, SUM(precio_venta) as ingresos
         FROM ventas_floreria WHERE DATE(CONVERT_TZ(fecha,'+00:00','-06:00')) BETWEEN ? AND ?
         GROUP BY dia ORDER BY dia`,
        [desde, hasta]
      )
    ]);

    let nomina = 0;
    try {
      const nominaRow = await queryOne(
        `SELECT COALESCE(SUM(provision_dia), 0) as total
         FROM fondo_quincena_log
         WHERE periodo_inicio BETWEEN ? AND ?`,
        [desde, hasta]
      );
      nomina = parseFloat(nominaRow?.total || 0);
    } catch (_) {}

    const totalGastos = gastosRows.reduce((s, g) => s + parseFloat(g.total), 0);
    const rentabilidad = parseFloat(ventas.ingresos) - nomina - parseFloat(mermas.perdida) - totalGastos;

    res.json({
      success: true,
      data: {
        periodo: { desde, hasta },
        ingresos: parseFloat(ventas.ingresos),
        mermas: parseFloat(mermas.perdida),
        gastos: gastosRows,
        total_gastos: totalGastos,
        nomina,
        rentabilidad,
        total_ventas: parseInt(ventas.total_ventas),
        tendencia
      }
    });
  } catch (error) {
    logger.error(`reporte/financiero: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getVentas, getInventario, getMermas, getFinanciero };
