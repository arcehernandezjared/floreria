const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');

async function getMermas(req, res) {
  try {
    const { desde, hasta, motivo, insumo_id, proveedor_id } = req.query;
    let sql = `
      SELECT m.*, i.nombre as insumo_nombre, i.unidad, p.nombre as proveedor_nombre
      FROM mermas m
      JOIN insumos i ON m.insumo_id = i.id
      LEFT JOIN proveedores p ON m.proveedor_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (desde) { sql += ' AND DATE(m.fecha) >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND DATE(m.fecha) <= ?'; params.push(hasta); }
    if (motivo) { sql += ' AND m.motivo = ?'; params.push(motivo); }
    if (insumo_id) { sql += ' AND m.insumo_id = ?'; params.push(insumo_id); }
    if (proveedor_id) { sql += ' AND m.proveedor_id = ?'; params.push(proveedor_id); }
    sql += ' ORDER BY m.fecha DESC LIMIT 200';

    const mermas = await query(sql, params);
    res.json({ success: true, data: mermas });
  } catch (error) {
    logger.error(`getMermas: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function registrarMerma(req, res) {
  try {
    const { insumo_id, cantidad, motivo, proveedor_id, notas, costo_unitario } = req.body;
    if (!insumo_id || !cantidad || !motivo) {
      return res.status(400).json({ success: false, message: 'insumo_id, cantidad y motivo son requeridos' });
    }

    const insumo = await queryOne('SELECT * FROM insumos WHERE id = ? AND activo = 1', [insumo_id]);
    if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado' });

    // Usar costo_unitario del body si se envió, si no el del insumo
    const costoUnit = costo_unitario != null ? parseFloat(costo_unitario) : parseFloat(insumo.costo_unitario);
    const costo_total = parseFloat(cantidad) * costoUnit;

    await transaction(async (conn) => {
      await conn.query(
        `INSERT INTO mermas (insumo_id, cantidad, costo_unitario_momento, costo_total, motivo, proveedor_id, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [insumo_id, cantidad, costoUnit, costo_total, motivo, proveedor_id || null, notas || null]
      );

      const nuevoStock = Math.max(0, parseFloat(insumo.stock_actual) - parseFloat(cantidad));
      await conn.query('UPDATE insumos SET stock_actual = ? WHERE id = ?', [nuevoStock, insumo_id]);

      if (nuevoStock <= 0) {
        await conn.query(
          `UPDATE catalogo SET disponible_externo = 0
           WHERE id IN (SELECT DISTINCT catalogo_id FROM ficha_ingredientes WHERE insumo_id = ?)`,
          [insumo_id]
        );
      }
    });

    res.status(201).json({ success: true, data: { costo_total }, message: 'Merma registrada correctamente' });
  } catch (error) {
    logger.error(`registrarMerma: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateMerma(req, res) {
  try {
    const { id } = req.params;
    const { cantidad, motivo, proveedor_id, notas, costo_unitario } = req.body;

    const merma = await queryOne('SELECT * FROM mermas WHERE id = ?', [id]);
    logger.info(`updateMerma id=${id} → ${merma ? 'encontrada' : 'NO encontrada en DB'}`);
    if (!merma) return res.status(404).json({ success: false, message: `Merma #${id} no encontrada en la base de datos` });

    const cantidadAnterior = parseFloat(merma.cantidad);
    const cantidadNueva    = cantidad != null ? parseFloat(cantidad) : cantidadAnterior;
    const costoUnit        = costo_unitario != null ? parseFloat(costo_unitario) : parseFloat(merma.costo_unitario_momento);
    const costo_total      = cantidadNueva * costoUnit;

    await transaction(async (conn) => {
      // Solo tocar el stock si la cantidad cambió
      if (cantidadNueva !== cantidadAnterior) {
        const insumo = await queryOne('SELECT stock_actual FROM insumos WHERE id = ?', [merma.insumo_id]);
        if (insumo) {
          const stockFinal = Math.max(0, parseFloat(insumo.stock_actual) + cantidadAnterior - cantidadNueva);
          await conn.query('UPDATE insumos SET stock_actual = ? WHERE id = ?', [stockFinal, merma.insumo_id]);
        }
      }

      await conn.query(
        `UPDATE mermas SET cantidad=?, costo_unitario_momento=?, costo_total=?, motivo=?, proveedor_id=?, notas=?
         WHERE id=?`,
        [
          cantidadNueva,
          costoUnit,
          costo_total,
          motivo          != null ? motivo          : merma.motivo,
          proveedor_id    !== undefined ? (proveedor_id || null) : merma.proveedor_id,
          notas           !== undefined ? (notas || null)        : merma.notas,
          id
        ]
      );
    });

    res.json({ success: true, message: 'Merma actualizada' });
  } catch (error) {
    logger.error(`updateMerma: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteMerma(req, res) {
  try {
    const { id } = req.params;

    const merma = await queryOne('SELECT * FROM mermas WHERE id = ?', [id]);
    if (!merma) return res.status(404).json({ success: false, message: 'Merma no encontrada' });

    await transaction(async (conn) => {
      // Devolver stock al insumo
      await conn.query(
        'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
        [parseFloat(merma.cantidad), merma.insumo_id]
      );
      await conn.query('DELETE FROM mermas WHERE id = ?', [id]);
    });

    res.json({ success: true, message: 'Merma eliminada y stock restaurado' });
  } catch (error) {
    logger.error(`deleteMerma: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getMermasPorMotivo(req, res) {
  try {
    const { desde, hasta } = req.query;
    let sql = `
      SELECT motivo, COUNT(*) as cantidad, SUM(costo_total) as total_perdido
      FROM mermas
      WHERE 1=1
    `;
    const params = [];
    if (desde) { sql += ' AND DATE(fecha) >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND DATE(fecha) <= ?'; params.push(hasta); }
    sql += ' GROUP BY motivo ORDER BY total_perdido DESC';

    const data = await query(sql, params);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getRendimientoProveedores(req, res) {
  try {
    const data = await query(
      `SELECT p.id, p.nombre as proveedor_nombre, p.tipo,
              COUNT(m.id) as total_incidencias,
              SUM(m.cantidad) as total_unidades_mermadas,
              SUM(m.costo_total) as total_perdido
       FROM mermas m
       JOIN proveedores p ON m.proveedor_id = p.id
       WHERE m.motivo = 'defecto_proveedor'
       GROUP BY p.id, p.nombre, p.tipo
       ORDER BY total_perdido DESC`
    );
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getMermas, registrarMerma, updateMerma, deleteMerma, getMermasPorMotivo, getRendimientoProveedores };
