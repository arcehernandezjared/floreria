const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { calcularMargen } = require('../utils/helpers');

// Calcula costo de un arreglo sumando ficha × costo_unitario actual
async function calcularCostoArreglo(catalogo_id, conn = null) {
  const q = conn
    ? (sql, params) => conn.query(sql, params).then(([rows]) => rows)
    : query;

  const items = await q(
    `SELECT fi.cantidad, i.costo_unitario
     FROM ficha_ingredientes fi
     JOIN insumos i ON fi.insumo_id = i.id
     WHERE fi.catalogo_id = ?`,
    [catalogo_id]
  );
  return items.reduce((sum, item) => sum + (parseFloat(item.cantidad) * parseFloat(item.costo_unitario)), 0);
}

// Agregar columna codigo si no existe (migración automática)
async function ensureCodigo() {
  try {
    await query('ALTER TABLE catalogo ADD COLUMN codigo VARCHAR(50) NULL DEFAULT NULL');
  } catch (_) {}
}

async function getCatalogo(req, res) {
  try {
    const arreglos = await query(
      `SELECT c.*,
        (SELECT COALESCE(SUM(fi.cantidad * i.costo_unitario), 0)
         FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
         WHERE fi.catalogo_id = c.id) as costo_dinamico
       FROM catalogo c
       WHERE c.activo = 1
       ORDER BY c.nombre`
    );

    const data = arreglos.map(a => ({
      ...a,
      costo_actual: parseFloat(a.costo_dinamico) || 0,
      margen_real: calcularMargen(parseFloat(a.precio_venta), parseFloat(a.costo_dinamico) || 0),
      alerta_margen: calcularMargen(parseFloat(a.precio_venta), parseFloat(a.costo_dinamico) || 0) < parseFloat(a.margen_minimo)
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`getCatalogo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getArregloConFicha(req, res) {
  try {
    const { id } = req.params;
    const arreglo = await queryOne('SELECT * FROM catalogo WHERE id = ?', [id]);
    if (!arreglo) return res.status(404).json({ success: false, message: 'Arreglo no encontrado' });

    const ingredientes = await query(
      `SELECT fi.*, i.nombre as insumo_nombre, i.unidad, i.costo_unitario,
              (fi.cantidad * i.costo_unitario) as subtotal
       FROM ficha_ingredientes fi
       JOIN insumos i ON fi.insumo_id = i.id
       WHERE fi.catalogo_id = ?`,
      [id]
    );

    const costo_actual = ingredientes.reduce((s, i) => s + parseFloat(i.subtotal), 0);
    const margen_real = calcularMargen(parseFloat(arreglo.precio_venta), costo_actual);

    res.json({ success: true, data: { ...arreglo, ingredientes, costo_actual, margen_real } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createArreglo(req, res) {
  try {
    const { nombre, descripcion, imagen_url, precio_venta, categoria, margen_minimo, disponible_externo, ingredientes, codigo } = req.body;
    if (!nombre || !precio_venta) {
      return res.status(400).json({ success: false, message: 'Nombre y precio son requeridos' });
    }

    await transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO catalogo (nombre, descripcion, imagen_url, precio_venta, categoria, margen_minimo, disponible_externo, codigo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, descripcion || null, imagen_url || null, precio_venta, categoria || 'General', margen_minimo || 30, disponible_externo !== false ? 1 : 0, codigo || null]
      );
      const catalogoId = result.insertId;

      if (ingredientes && ingredientes.length > 0) {
        for (const ing of ingredientes) {
          await conn.query(
            'INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad, notas) VALUES (?, ?, ?, ?)',
            [catalogoId, ing.insumo_id, ing.cantidad, ing.notas || null]
          );
        }
      }

      // Calcular y guardar costo
      const costoItems = await conn.query(
        `SELECT fi.cantidad, i.costo_unitario FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id WHERE fi.catalogo_id = ?`,
        [catalogoId]
      );
      const costo = costoItems[0].reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.costo_unitario), 0);
      await conn.query('UPDATE catalogo SET costo_calculado = ? WHERE id = ?', [costo, catalogoId]);
    });

    res.status(201).json({ success: true, message: 'Arreglo creado correctamente' });
  } catch (error) {
    logger.error(`createArreglo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateArreglo(req, res) {
  try {
    const { id } = req.params;
    const { nombre, descripcion, imagen_url, precio_venta, categoria, margen_minimo, disponible_externo, activo, ingredientes, codigo } = req.body;

    const existing = await queryOne('SELECT * FROM catalogo WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Arreglo no encontrado' });

    await transaction(async (conn) => {
      await conn.query(
        `UPDATE catalogo SET nombre=?, descripcion=?, imagen_url=?, precio_venta=?, categoria=?, margen_minimo=?, disponible_externo=?, activo=?, codigo=? WHERE id=?`,
        [nombre ?? existing.nombre, descripcion ?? existing.descripcion,
         imagen_url !== undefined ? (imagen_url || null) : existing.imagen_url,
         precio_venta ?? existing.precio_venta, categoria ?? existing.categoria,
         margen_minimo ?? existing.margen_minimo, disponible_externo !== undefined ? (disponible_externo ? 1 : 0) : existing.disponible_externo,
         activo !== undefined ? (activo ? 1 : 0) : existing.activo,
         codigo !== undefined ? (codigo || null) : existing.codigo, id]
      );

      if (ingredientes !== undefined) {
        await conn.query('DELETE FROM ficha_ingredientes WHERE catalogo_id = ?', [id]);
        for (const ing of ingredientes) {
          await conn.query(
            'INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad, notas) VALUES (?, ?, ?, ?)',
            [id, ing.insumo_id, ing.cantidad, ing.notas || null]
          );
        }
      }

      // Recalcular costo
      const [costoItems] = await conn.query(
        `SELECT fi.cantidad, i.costo_unitario FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id WHERE fi.catalogo_id = ?`,
        [id]
      );
      const costo = costoItems.reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.costo_unitario), 0);
      await conn.query('UPDATE catalogo SET costo_calculado = ? WHERE id = ?', [costo, id]);
    });

    res.json({ success: true, message: 'Arreglo actualizado' });
  } catch (error) {
    logger.error(`updateArreglo: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteArreglo(req, res) {
  try {
    const { id } = req.params;
    await query('UPDATE catalogo SET activo = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Arreglo desactivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function recalcularCostos(req, res) {
  try {
    const arreglos = await query('SELECT id, nombre, precio_venta, margen_minimo FROM catalogo WHERE activo = 1');
    const alertas = [];

    for (const arreglo of arreglos) {
      const costo = await calcularCostoArreglo(arreglo.id);
      await query('UPDATE catalogo SET costo_calculado = ? WHERE id = ?', [costo, arreglo.id]);

      const margen = calcularMargen(parseFloat(arreglo.precio_venta), costo);
      if (margen < parseFloat(arreglo.margen_minimo)) {
        alertas.push({
          id: arreglo.id,
          nombre: arreglo.nombre,
          precio_venta: arreglo.precio_venta,
          costo_calculado: costo,
          margen_real: margen,
          margen_minimo: arreglo.margen_minimo
        });
      }
    }

    res.json({ success: true, data: { recalculados: arreglos.length, alertas }, message: `${arreglos.length} costos recalculados` });
  } catch (error) {
    logger.error(`recalcularCostos: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function registrarVenta(req, res) {
  try {
    const { catalogo_id, nombre_cliente, canal, precio_venta, notas, ref_externa, fecha_entrega } = req.body;

    const arreglo = await queryOne('SELECT * FROM catalogo WHERE id = ? AND activo = 1', [catalogo_id]);
    if (!arreglo) return res.status(404).json({ success: false, message: 'Arreglo no encontrado' });

    const ingredientes = await query(
      `SELECT fi.*, i.stock_actual, i.nombre as insumo_nombre
       FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
       WHERE fi.catalogo_id = ?`,
      [catalogo_id]
    );

    // Verificar stock suficiente
    const sinStock = ingredientes.filter(i => parseFloat(i.stock_actual) < parseFloat(i.cantidad));
    if (sinStock.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente para: ${sinStock.map(i => i.insumo_nombre).join(', ')}`
      });
    }

    const costo_produccion = await calcularCostoArreglo(catalogo_id);

    await transaction(async (conn) => {
      // Registrar venta
      await conn.query(
        `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, ref_externa, precio_venta, costo_produccion, notas, nombre_cliente, fecha_entrega)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [catalogo_id, arreglo.nombre, canal || 'mostrador', ref_externa || null,
         precio_venta || arreglo.precio_venta, costo_produccion, notas || null,
         nombre_cliente || null, fecha_entrega || null]
      );

      // Descontar stock de todos los insumos de la ficha
      for (const ing of ingredientes) {
        const nuevoStock = parseFloat(ing.stock_actual) - parseFloat(ing.cantidad);
        await conn.query('UPDATE insumos SET stock_actual = ? WHERE id = ?', [nuevoStock, ing.insumo_id]);

        // Si llega a 0, marcar disponible_externo=false en catálogos que dependen de este insumo
        if (nuevoStock <= 0) {
          await conn.query(
            `UPDATE catalogo SET disponible_externo = 0
             WHERE id IN (SELECT DISTINCT catalogo_id FROM ficha_ingredientes WHERE insumo_id = ?)`,
            [ing.insumo_id]
          );
        }
      }
    });

    res.status(201).json({ success: true, message: 'Venta registrada correctamente', data: { costo_produccion } });
  } catch (error) {
    logger.error(`registrarVenta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getVentas(req, res) {
  try {
    const { desde, hasta, canal } = req.query;
    let sql = `
      SELECT v.*, c.nombre as arreglo_nombre
      FROM ventas_floreria v
      LEFT JOIN catalogo c ON v.catalogo_id = c.id
      WHERE 1=1
    `;
    const params = [];
    if (desde) { sql += ' AND DATE(v.fecha) >= ?'; params.push(desde); }
    if (hasta) { sql += ' AND DATE(v.fecha) <= ?'; params.push(hasta); }
    if (canal) { sql += ' AND v.canal = ?'; params.push(canal); }
    sql += ' ORDER BY v.fecha DESC LIMIT 100';

    const ventas = await query(sql, params);
    res.json({ success: true, data: ventas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImagen(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen' });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'floreria-arreglos', resource_type: 'image' },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    res.json({ success: true, url: result.secure_url });
  } catch (error) {
    logger.error(`uploadImagen: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}


module.exports = { ensureCodigo, getCatalogo, getArregloConFicha, createArreglo, updateArreglo, deleteArreglo, recalcularCostos, registrarVenta, getVentas, uploadImagen };
