const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');

async function getCompras(req, res) {
  try {
    const compras = await query(
      `SELECT c.*, p.nombre as proveedor_nombre,
              (SELECT COUNT(*) FROM compra_items ci WHERE ci.compra_id = c.id) as total_items
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

    const items = await query(
      `SELECT ci.*, i.nombre as insumo_nombre, i.unidad
       FROM compra_items ci JOIN insumos i ON ci.insumo_id = i.id WHERE ci.compra_id = ?`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...compra, items } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createCompra(req, res) {
  try {
    const { proveedor_id, fecha, notas, items } = req.body;
    if (!proveedor_id || !fecha || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'proveedor_id, fecha e items son requeridos' });
    }

    const total = items.reduce((s, i) => s + (parseFloat(i.cantidad) * parseFloat(i.costo_unitario)), 0);

    await transaction(async (conn) => {
      const [result] = await conn.query(
        'INSERT INTO compras (proveedor_id, fecha, total, estado, notas) VALUES (?, ?, ?, ?, ?)',
        [proveedor_id, fecha, total, 'recibida', notas || null]
      );
      const compraId = result.insertId;

      for (const item of items) {
        const subtotal = parseFloat(item.cantidad) * parseFloat(item.costo_unitario);
        await conn.query(
          'INSERT INTO compra_items (compra_id, insumo_id, cantidad, costo_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
          [compraId, item.insumo_id, item.cantidad, item.costo_unitario, subtotal]
        );

        // Actualizar stock
        await conn.query(
          'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
          [item.cantidad, item.insumo_id]
        );

        // Actualizar costo unitario si cambió
        const [[insumo]] = await conn.query('SELECT costo_unitario FROM insumos WHERE id = ?', [item.insumo_id]);
        if (insumo && parseFloat(item.costo_unitario) !== parseFloat(insumo.costo_unitario)) {
          await conn.query(
            'INSERT INTO historial_costos_insumo (insumo_id, costo_anterior, costo_nuevo, notas) VALUES (?, ?, ?, ?)',
            [item.insumo_id, insumo.costo_unitario, item.costo_unitario, `Compra #${compraId}`]
          );
          await conn.query('UPDATE insumos SET costo_unitario = ? WHERE id = ?', [item.costo_unitario, item.insumo_id]);
        }
      }
    });

    res.status(201).json({ success: true, data: { total }, message: 'Compra registrada y stock actualizado' });
  } catch (error) {
    logger.error(`createCompra: ${error.message}`);
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

module.exports = { getCompras, getCompra, createCompra, recibirCompra, eliminarCompra };
