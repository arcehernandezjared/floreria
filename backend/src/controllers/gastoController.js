const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

async function getGastos(req, res) {
  try {
    const { desde, hasta, categoria, tipo } = req.query;
    let sql = 'SELECT * FROM gastos WHERE 1=1';
    const params = [];
    if (desde) { sql += ' AND fecha >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND fecha <= ?'; params.push(hasta); }
    if (categoria) { sql += ' AND categoria = ?'; params.push(categoria); }
    if (tipo) { sql += ' AND tipo = ?'; params.push(tipo); }
    sql += ' ORDER BY fecha DESC LIMIT 200';

    const data = await query(sql, params);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createGasto(req, res) {
  try {
    const { concepto, monto, tipo, categoria, fecha, recurrente, notas } = req.body;
    if (!concepto || !monto || !fecha) {
      return res.status(400).json({ success: false, message: 'Concepto, monto y fecha son requeridos' });
    }

    const result = await query(
      'INSERT INTO gastos (concepto, monto, tipo, categoria, fecha, recurrente, notas) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [concepto, monto, tipo || 'variable', categoria || 'otro', fecha, recurrente ? 1 : 0, notas || null]
    );

    const created = await queryOne('SELECT * FROM gastos WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: created, message: 'Gasto registrado' });
  } catch (error) {
    logger.error(`createGasto: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateGasto(req, res) {
  try {
    const { id } = req.params;
    const { concepto, monto, tipo, categoria, fecha, recurrente, notas } = req.body;

    const existing = await queryOne('SELECT * FROM gastos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Gasto no encontrado' });

    await query(
      'UPDATE gastos SET concepto=?, monto=?, tipo=?, categoria=?, fecha=?, recurrente=?, notas=? WHERE id=?',
      [concepto ?? existing.concepto, monto ?? existing.monto, tipo ?? existing.tipo,
       categoria ?? existing.categoria, fecha ?? existing.fecha,
       recurrente !== undefined ? (recurrente ? 1 : 0) : existing.recurrente,
       notas ?? existing.notas, id]
    );

    const updated = await queryOne('SELECT * FROM gastos WHERE id = ?', [id]);
    res.json({ success: true, data: updated, message: 'Gasto actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteGasto(req, res) {
  try {
    await query('DELETE FROM gastos WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Gasto eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getResumenGastos(req, res) {
  try {
    // Mes actual vs mes anterior
    const resumen = await query(`
      SELECT
        categoria,
        SUM(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN monto ELSE 0 END) as mes_actual,
        SUM(CASE WHEN MONTH(fecha) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(fecha) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) THEN monto ELSE 0 END) as mes_anterior
      FROM gastos
      WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
      GROUP BY categoria
      ORDER BY mes_actual DESC
    `);

    const totalMesActual = resumen.reduce((s, r) => s + parseFloat(r.mes_actual), 0);
    const totalMesAnterior = resumen.reduce((s, r) => s + parseFloat(r.mes_anterior), 0);

    res.json({ success: true, data: { por_categoria: resumen, total_mes_actual: totalMesActual, total_mes_anterior: totalMesAnterior } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getGastos, createGasto, updateGasto, deleteGasto, getResumenGastos };
