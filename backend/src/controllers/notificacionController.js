const { queryOne } = require('../config/database');

async function getNotificaciones(req, res) {
  try {
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const hora = hoy.getHours();
    const alertas = [];

    const [cierreHoy, agotados, bajosMin, comprasPend, ventasHoy] = await Promise.all([
      queryOne(
        'SELECT COUNT(*) as n FROM fondo_quincena_log WHERE fecha = ? AND cerrado = 0',
        [hoyStr]
      ),
      queryOne(
        'SELECT COUNT(*) as n FROM insumos WHERE stock_actual = 0 AND activo = 1'
      ),
      queryOne(
        'SELECT COUNT(*) as n FROM insumos WHERE stock_actual > 0 AND stock_actual <= stock_minimo AND activo = 1'
      ),
      queryOne(
        "SELECT COUNT(*) as n FROM compras WHERE estado = 'pendiente'"
      ),
      queryOne(
        'SELECT COUNT(*) as n FROM ventas_floreria WHERE DATE(fecha) = ?',
        [hoyStr]
      )
    ]);

    // 1. Cierre del día pendiente
    if (parseInt(cierreHoy.n) === 0) {
      alertas.push({
        id: 'cierre-pendiente',
        tipo: hora >= 15 ? 'danger' : 'warning',
        titulo: 'Cierre del día pendiente',
        mensaje: 'No se ha registrado el cierre de hoy en el fondo de nómina.',
        accion: '/nomina',
        icono: 'Calendar'
      });
    }

    // 2. Sin ventas hoy (solo después de las 10am)
    if (hora >= 10 && parseInt(ventasHoy.n) === 0) {
      alertas.push({
        id: 'sin-ventas-hoy',
        tipo: hora >= 14 ? 'warning' : 'info',
        titulo: 'Sin ventas registradas hoy',
        mensaje: 'No hay ventas cargadas en el sistema para el día de hoy.',
        accion: '/punto-venta',
        icono: 'ShoppingBag'
      });
    }

    // 3. Insumos agotados
    const nAgotados = parseInt(agotados.n);
    if (nAgotados > 0) {
      alertas.push({
        id: 'insumos-agotados',
        tipo: 'danger',
        titulo: `${nAgotados} insumo${nAgotados !== 1 ? 's' : ''} agotado${nAgotados !== 1 ? 's' : ''}`,
        mensaje: 'Hay insumos sin stock. Hacé una compra antes de quedarte sin materiales.',
        accion: '/insumos',
        icono: 'Package'
      });
    }

    // 4. Insumos bajo mínimo
    const nBajo = parseInt(bajosMin.n);
    if (nBajo > 0) {
      alertas.push({
        id: 'stock-bajo',
        tipo: 'warning',
        titulo: `${nBajo} insumo${nBajo !== 1 ? 's' : ''} bajo el mínimo`,
        mensaje: 'Algunos insumos están cerca de agotarse. Revisá el inventario.',
        accion: '/insumos',
        icono: 'AlertTriangle'
      });
    }

    // 5. Compras pendientes de recibir
    const nCompras = parseInt(comprasPend.n);
    if (nCompras > 0) {
      alertas.push({
        id: 'compras-pendientes',
        tipo: 'info',
        titulo: `${nCompras} compra${nCompras !== 1 ? 's' : ''} sin recibir`,
        mensaje: 'Hay órdenes de compra pendientes de marcar como recibidas.',
        accion: '/compras',
        icono: 'ShoppingCart'
      });
    }

    // 6. Meta de quincena en riesgo
    try {
      const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
      if (config) {
        const dia = hoy.getDate();
        const y = hoy.getFullYear();
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        const periodoInicio = dia <= 15 ? `${y}-${m}-01` : `${y}-${m}-16`;
        const periodoFin = new Date(periodoInicio);
        periodoFin.setDate(periodoFin.getDate() + parseInt(config.periodo_dias) - 1);

        const termData = await queryOne(
          'SELECT COALESCE(SUM(provision_dia),0) as acumulado FROM fondo_quincena_log WHERE periodo_inicio = ? AND cerrado = 0',
          [periodoInicio]
        );

        const acumulado = parseFloat(termData.acumulado);
        const meta = parseFloat(config.meta_quincena);
        const pct = meta > 0 ? (acumulado / meta) * 100 : 0;
        const diasRestantes = Math.max(0, Math.ceil((periodoFin - hoy) / (1000 * 60 * 60 * 24)));

        if (meta > 0 && pct < 30 && diasRestantes <= 3) {
          alertas.push({
            id: 'meta-critica',
            tipo: 'danger',
            titulo: 'Meta de quincena en riesgo crítico',
            mensaje: `Solo llevas el ${pct.toFixed(0)}% de la meta y quedan ${diasRestantes} días.`,
            accion: '/nomina',
            icono: 'TrendingDown'
          });
        } else if (meta > 0 && pct < 50 && diasRestantes <= 5) {
          alertas.push({
            id: 'meta-baja',
            tipo: 'warning',
            titulo: 'Meta de quincena baja',
            mensaje: `Llevas el ${pct.toFixed(0)}% de la meta con ${diasRestantes} días restantes.`,
            accion: '/nomina',
            icono: 'TrendingDown'
          });
        }
      }
    } catch (_) {
      // config_nomina puede no existir aún
    }

    res.json({ success: true, data: alertas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getNotificaciones };
