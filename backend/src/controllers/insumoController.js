const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function ensureCodigoInsumos() {
  try {
    await query('ALTER TABLE insumos ADD COLUMN codigo VARCHAR(50) NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await query('ALTER TABLE insumos ADD COLUMN imagen_url VARCHAR(500) NULL DEFAULT NULL');
  } catch (_) {}
  try {
    await query('ALTER TABLE insumos ADD COLUMN precio_venta DECIMAL(10,2) NULL DEFAULT NULL');
  } catch (_) {}
}

async function uploadImagenInsumo(req, res) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen' });
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'floreria-insumos', resource_type: 'image' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });
    res.json({ success: true, url: result.secure_url });
  } catch (error) {
    logger.error(`uploadImagenInsumo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getInsumos(req, res) {
  try {
    const { categoria_id, tipo, busqueda, solo_activos = '1' } = req.query;
    let sql = `
      SELECT i.*, c.nombre as categoria_nombre, c.tipo as categoria_tipo, c.color as categoria_color,
             p.nombre as proveedor_nombre
      FROM insumos i
      JOIN categorias_insumo c ON i.categoria_id = c.id
      LEFT JOIN proveedores p ON i.proveedor_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (solo_activos === '1') { sql += ' AND i.activo = 1'; }
    if (categoria_id) { sql += ' AND i.categoria_id = ?'; params.push(categoria_id); }
    if (tipo) { sql += ' AND c.tipo = ?'; params.push(tipo); }
    if (busqueda) { sql += ' AND i.nombre LIKE ?'; params.push(`%${busqueda}%`); }

    sql += ' ORDER BY c.tipo, i.nombre';

    const insumos = await query(sql, params);
    res.json({ success: true, data: insumos });
  } catch (error) {
    logger.error(`getInsumos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getCategorias(req, res) {
  try {
    const cats = await query('SELECT * FROM categorias_insumo ORDER BY nombre');
    res.json({ success: true, data: cats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createInsumo(req, res) {
  try {
    const { nombre, categoria_id, proveedor_id, unidad, stock_actual, stock_minimo, costo_unitario, vida_util_dias, codigo } = req.body;
    if (!nombre || !categoria_id) {
      return res.status(400).json({ success: false, message: 'Nombre y categoría son requeridos' });
    }

    const { imagen_url, precio_venta } = req.body;
    const result = await query(
      `INSERT INTO insumos (nombre, categoria_id, proveedor_id, unidad, stock_actual, stock_minimo, costo_unitario, vida_util_dias, codigo, imagen_url, precio_venta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, categoria_id, proveedor_id || null, unidad || 'unidad',
       stock_actual || 0, stock_minimo || 10, costo_unitario || 0, vida_util_dias || null, codigo || null, imagen_url || null, precio_venta || null]
    );

    const insumo = await queryOne(
      `SELECT i.*, c.nombre as categoria_nombre, p.nombre as proveedor_nombre
       FROM insumos i JOIN categorias_insumo c ON i.categoria_id = c.id
       LEFT JOIN proveedores p ON i.proveedor_id = p.id WHERE i.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: insumo, message: 'Insumo creado correctamente' });
  } catch (error) {
    logger.error(`createInsumo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateInsumo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, categoria_id, proveedor_id, unidad, stock_minimo, costo_unitario, vida_util_dias, codigo, imagen_url, precio_venta } = req.body;

    const existing = await queryOne('SELECT * FROM insumos WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Insumo no encontrado' });

    if (costo_unitario !== undefined && parseFloat(costo_unitario) !== parseFloat(existing.costo_unitario)) {
      await query(
        'INSERT INTO historial_costos_insumo (insumo_id, costo_anterior, costo_nuevo, notas) VALUES (?, ?, ?, ?)',
        [id, existing.costo_unitario, costo_unitario, 'Actualización manual']
      );
    }

    await query(
      `UPDATE insumos SET nombre=?, categoria_id=?, proveedor_id=?, unidad=?, stock_minimo=?, costo_unitario=?, vida_util_dias=?, codigo=?, imagen_url=?, precio_venta=?
       WHERE id=?`,
      [nombre || existing.nombre, categoria_id || existing.categoria_id,
       proveedor_id || existing.proveedor_id, unidad || existing.unidad,
       stock_minimo ?? existing.stock_minimo, costo_unitario ?? existing.costo_unitario,
       vida_util_dias ?? existing.vida_util_dias,
       codigo !== undefined ? (codigo || null) : existing.codigo,
       imagen_url !== undefined ? (imagen_url || null) : existing.imagen_url,
       precio_venta !== undefined ? (precio_venta || null) : existing.precio_venta, id]
    );

    const updated = await queryOne(
      `SELECT i.*, c.nombre as categoria_nombre, p.nombre as proveedor_nombre
       FROM insumos i JOIN categorias_insumo c ON i.categoria_id = c.id
       LEFT JOIN proveedores p ON i.proveedor_id = p.id WHERE i.id = ?`,
      [id]
    );

    res.json({ success: true, data: updated, message: 'Insumo actualizado' });
  } catch (error) {
    logger.error(`updateInsumo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteInsumo(req, res) {
  try {
    const { id } = req.params;
    await query('UPDATE insumos SET activo = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Insumo desactivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getStockBajo(req, res) {
  try {
    const insumos = await query(
      `SELECT i.*, c.nombre as categoria_nombre, c.tipo as categoria_tipo, p.nombre as proveedor_nombre
       FROM insumos i
       JOIN categorias_insumo c ON i.categoria_id = c.id
       LEFT JOIN proveedores p ON i.proveedor_id = p.id
       WHERE i.activo = 1 AND i.stock_actual <= i.stock_minimo
       ORDER BY (i.stock_actual / GREATEST(i.stock_minimo, 1)) ASC`
    );
    res.json({ success: true, data: insumos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function ajustarStock(req, res) {
  try {
    const { id } = req.params;
    const { ajuste, notas } = req.body;
    if (ajuste === undefined) {
      return res.status(400).json({ success: false, message: 'Se requiere el campo ajuste' });
    }

    const insumo = await queryOne('SELECT * FROM insumos WHERE id = ? AND activo = 1', [id]);
    if (!insumo) return res.status(404).json({ success: false, message: 'Insumo no encontrado' });

    const nuevoStock = parseFloat(insumo.stock_actual) + parseFloat(ajuste);
    if (nuevoStock < 0) {
      return res.status(400).json({ success: false, message: 'El stock no puede quedar negativo' });
    }

    await query('UPDATE insumos SET stock_actual = ? WHERE id = ?', [nuevoStock, id]);

    res.json({ success: true, data: { stock_anterior: insumo.stock_actual, ajuste, stock_nuevo: nuevoStock }, message: 'Stock ajustado correctamente' });
  } catch (error) {
    logger.error(`ajustarStock: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getHistorialCostos(req, res) {
  try {
    const { id } = req.params;
    const historial = await query(
      'SELECT * FROM historial_costos_insumo WHERE insumo_id = ? ORDER BY fecha DESC LIMIT 20',
      [id]
    );
    res.json({ success: true, data: historial });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function ventaDirecta(req, res) {
  try {
    const { items, nombre_cliente, canal, descuento = 0 } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Se requieren items' });
    }

    for (const item of items) {
      const { insumo_id, cantidad, precio_unitario } = item;
      const insumo = await queryOne('SELECT * FROM insumos WHERE id = ? AND activo = 1', [insumo_id]);
      if (!insumo) return res.status(404).json({ success: false, message: `Insumo ${insumo_id} no encontrado` });

      if (parseFloat(insumo.stock_actual) < parseFloat(cantidad)) {
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para ${insumo.nombre} (disponible: ${insumo.stock_actual} ${insumo.unidad})`
        });
      }

      await query(
        'UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?',
        [cantidad, insumo_id]
      );

      const precioConDesc = parseFloat(precio_unitario) * (1 - parseFloat(descuento) / 100);
      const precioTotal = precioConDesc * parseFloat(cantidad);
      const costoTotal = parseFloat(insumo.costo_unitario) * parseFloat(cantidad);

      await query(
        `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, nombre_cliente)
         VALUES (NULL, ?, ?, ?, ?, ?)`,
        [
          `${insumo.nombre} ×${cantidad} ${insumo.unidad}`,
          canal || 'mostrador',
          precioTotal,
          costoTotal,
          nombre_cliente || 'Cliente mostrador'
        ]
      );
    }

    res.json({ success: true, message: `${items.length} item(s) vendidos correctamente` });
  } catch (error) {
    logger.error(`ventaDirecta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createCategoria(req, res) {
  try {
    const { nombre, color } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    const result = await query(
      'INSERT INTO categorias_insumo (nombre, tipo, color) VALUES (?, ?, ?)',
      [nombre, 'otro', color || '#10b981']
    );
    const cat = await queryOne('SELECT * FROM categorias_insumo WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: cat });
  } catch (error) {
    logger.error(`createCategoria: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateCategoria(req, res) {
  try {
    const { id } = req.params;
    const { nombre, color } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    const existing = await queryOne('SELECT * FROM categorias_insumo WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
    await query('UPDATE categorias_insumo SET nombre=?, color=? WHERE id=?', [nombre, color || existing.color, id]);
    const cat = await queryOne('SELECT * FROM categorias_insumo WHERE id = ?', [id]);
    res.json({ success: true, data: cat });
  } catch (error) {
    logger.error(`updateCategoria: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteCategoria(req, res) {
  try {
    const { id } = req.params;
    const inUse = await queryOne('SELECT COUNT(*) as n FROM insumos WHERE categoria_id = ? AND activo = 1', [id]);
    if (inUse.n > 0) {
      return res.status(400).json({
        success: false,
        message: `No se puede eliminar: ${inUse.n} insumo(s) activo(s) usan esta categoría`
      });
    }
    await query('DELETE FROM categorias_insumo WHERE id = ?', [id]);
    res.json({ success: true, message: 'Categoría eliminada' });
  } catch (error) {
    logger.error(`deleteCategoria: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = {
  ensureCodigoInsumos, uploadImagenInsumo,
  getInsumos, getCategorias, createInsumo, updateInsumo, deleteInsumo,
  getStockBajo, ajustarStock, getHistorialCostos, ventaDirecta,
  createCategoria, updateCategoria, deleteCategoria
};
