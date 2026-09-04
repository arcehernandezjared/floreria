const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');

async function getCompras(req, res) {
  try {
    const compras = await query(
      `SELECT c.*, p.nombre as proveedor_nombre
       FROM compras c JOIN proveedores p ON c.proveedor_id = p.id
       ORDER BY c.fecha DESC LIMIT 50`
    );
    res.json({ success: true, data: compras });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getCompra(req, res) {
  try {
    const compra = await queryOne(
      `SELECT c.*, p.nombre as proveedor_nombre
       FROM compras c JOIN proveedores p ON c.proveedor_id = p.id WHERE c.id = ?`,
      [req.params.id]
    );
    if (!compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });

    res.json({ success: true, data: compra });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createCompra(req, res) {
  try {
    const { proveedor_id, fecha, notas, total } = req.body;
    if (!proveedor_id || !fecha || !total || parseFloat(total) <= 0) {
      return res.status(400).json({ success: false, message: 'proveedor_id, fecha y total son requeridos' });
    }

    const result = await query(
      'INSERT INTO compras (proveedor_id, fecha, total, estado, notas) VALUES (?, ?, ?, ?, ?)',
      [proveedor_id, fecha, total, 'recibida', notas || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, total }, message: 'Compra registrada' });
  } catch (error) {
    logger.error(`createCompra: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateCompra(req, res) {
  try {
    const { id } = req.params;
    const { proveedor_id, fecha, notas, total } = req.body;
    if (!proveedor_id || !fecha || !total || parseFloat(total) <= 0) {
      return res.status(400).json({ success: false, message: 'proveedor_id, fecha y total son requeridos' });
    }

    const compra = await queryOne('SELECT id FROM compras WHERE id = ?', [id]);
    if (!compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });

    await query(
      'UPDATE compras SET proveedor_id = ?, fecha = ?, total = ?, notas = ? WHERE id = ?',
      [proveedor_id, fecha, total, notas || null, id]
    );

    res.json({ success: true, message: 'Compra actualizada' });
  } catch (error) {
    logger.error(`updateCompra: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function recibirCompra(req, res) {
  try {
    const { id } = req.params;
    const compra = await queryOne('SELECT * FROM compras WHERE id = ?', [id]);
    if (!compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    if (compra.estado === 'recibida') {
      return res.status(400).json({ success: false, message: 'Esta compra ya fue recibida' });
    }

    const items = await query(
      `SELECT ci.*, i.costo_unitario as costo_actual
       FROM compra_items ci JOIN insumos i ON ci.insumo_id = i.id WHERE ci.compra_id = ?`,
      [id]
    );

    await transaction(async (conn) => {
      for (const item of items) {
        // Actualizar stock
        await conn.query(
          'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
          [item.cantidad, item.insumo_id]
        );

        // Si cambió el costo, guardar historial
        if (parseFloat(item.costo_unitario) !== parseFloat(item.costo_actual)) {
          await conn.query(
            'INSERT INTO historial_costos_insumo (insumo_id, costo_anterior, costo_nuevo, notas) VALUES (?, ?, ?, ?)',
            [item.insumo_id, item.costo_actual, item.costo_unitario, `Recepción compra #${id}`]
          );
          await conn.query(
            'UPDATE insumos SET costo_unitario = ? WHERE id = ?',
            [item.costo_unitario, item.insumo_id]
          );
        }
      }

      await conn.query('UPDATE compras SET estado = ? WHERE id = ?', ['recibida', id]);
    });

    res.json({ success: true, message: 'Compra recibida y stock actualizado' });
  } catch (error) {
    logger.error(`recibirCompra: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function eliminarCompra(req, res) {
  try {
    const { id } = req.params;
    const compra = await queryOne('SELECT * FROM compras WHERE id = ?', [id]);
    if (!compra) return res.status(404).json({ success: false, message: 'Compra no encontrada' });

    const items = await query('SELECT * FROM compra_items WHERE compra_id = ?', [id]);

    await transaction(async (conn) => {
      // Si la compra ya sumó stock (estado = 'recibida'), revertir
      if (compra.estado === 'recibida') {
        for (const item of items) {
          await conn.query(
            'UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?',
            [item.cantidad, item.insumo_id]
          );
        }
      }
      await conn.query('DELETE FROM compra_items WHERE compra_id = ?', [id]);
      await conn.query('DELETE FROM compras WHERE id = ?', [id]);
    });

    res.json({ success: true, message: 'Compra eliminada y stock revertido' });
  } catch (error) {
    logger.error(`eliminarCompra: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getCompras, getCompra, createCompra, updateCompra, recibirCompra, eliminarCompra };
