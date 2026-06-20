const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');
const { calcularMargen } = require('../utils/helpers');
const phpCatalogSync = require('../services/sync/phpCatalogSync');

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

// Agrega 'pedido' como canal válido — ventas generadas por adelanto/saldo de pedidos
async function ensureCanalPedido() {
  try {
    await query(`ALTER TABLE ventas_floreria MODIFY COLUMN canal ENUM('mostrador','externo','whatsapp','pedido') NOT NULL DEFAULT 'mostrador'`);
  } catch (e) {
    logger.warn(`ensureCanalPedido: ${e.message}`);
  }
  // Reclasifica retroactivamente las ventas que ya existían como adelanto/saldo de pedido
  // (se identifican por la nota "Pedido #N" que se les asigna siempre al crearlas)
  try {
    const result = await query(`UPDATE ventas_floreria SET canal = 'pedido' WHERE notas LIKE 'Pedido #%' AND canal != 'pedido'`);
    if (result.affectedRows > 0) logger.info(`ensureCanalPedido: ${result.affectedRows} venta(s) reclasificadas a canal 'pedido'`);
  } catch (e) {
    logger.warn(`ensureCanalPedido retroactivo: ${e.message}`);
  }
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

    let catalogoIdCreado = null;
    await transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO catalogo (nombre, descripcion, imagen_url, precio_venta, categoria, margen_minimo, disponible_externo, codigo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nombre, descripcion || null, imagen_url || null, precio_venta, categoria || 'General', margen_minimo || 30, disponible_externo !== false ? 1 : 0, codigo || null]
      );
      const catalogoId = result.insertId;
      catalogoIdCreado = catalogoId;

      if (ingredientes && ingredientes.length > 0) {
        const ingsMap = new Map();
        for (const ing of ingredientes) {
          if (ingsMap.has(ing.insumo_id)) ingsMap.get(ing.insumo_id).cantidad += parseFloat(ing.cantidad);
          else ingsMap.set(ing.insumo_id, { ...ing, cantidad: parseFloat(ing.cantidad) });
        }
        for (const ing of ingsMap.values()) {
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

    phpCatalogSync.syncArreglo({
      id: catalogoIdCreado, nombre, descripcion, imagen_url, precio_venta, categoria, disponible_externo
    }).catch(() => {});

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
        const ingsMap = new Map();
        for (const ing of ingredientes) {
          if (ingsMap.has(ing.insumo_id)) ingsMap.get(ing.insumo_id).cantidad += parseFloat(ing.cantidad);
          else ingsMap.set(ing.insumo_id, { ...ing, cantidad: parseFloat(ing.cantidad) });
        }
        for (const ing of ingsMap.values()) {
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

    const activoFinal = activo !== undefined ? (activo ? 1 : 0) : existing.activo;
    const disponibleFinal = disponible_externo !== undefined ? !!disponible_externo : !!existing.disponible_externo;
    if (activoFinal === 0) {
      phpCatalogSync.desactivarArreglo(id).catch(() => {});
    } else {
      phpCatalogSync.syncArreglo({
        id,
        nombre: nombre ?? existing.nombre,
        descripcion: descripcion ?? existing.descripcion,
        imagen_url: imagen_url !== undefined ? imagen_url : existing.imagen_url,
        precio_venta: precio_venta ?? existing.precio_venta,
        categoria: categoria ?? existing.categoria,
        disponible_externo: disponibleFinal,
      }).catch(() => {});
    }

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
    phpCatalogSync.desactivarArreglo(id).catch(() => {});
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

async function registrarVentaLote(req, res) {
  try {
    const { items, nombre_cliente, canal, descuento } = req.body;
    // items: [{ catalogo_id, precio_venta, cantidad, notas }]
    if (!items || items.length === 0)
      return res.status(400).json({ success: false, message: 'Sin items' });

    const descPct = parseFloat(descuento) || 0;

    // Pre-verificar stock de todos los insumos necesarios antes de abrir transacción
    const stockNecesario = {};
    const arreglosMap = {};
    for (const item of items) {
      const arreglo = await queryOne('SELECT * FROM catalogo WHERE id = ? AND activo = 1', [item.catalogo_id]);
      if (!arreglo) return res.status(404).json({ success: false, message: `Arreglo ${item.catalogo_id} no encontrado` });
      arreglosMap[item.catalogo_id] = arreglo;

      const ings = await query(
        `SELECT fi.insumo_id, fi.cantidad, i.stock_actual, i.nombre as insumo_nombre
         FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
         WHERE fi.catalogo_id = ?`,
        [item.catalogo_id]
      );
      for (const ing of ings) {
        const key = ing.insumo_id;
        stockNecesario[key] = stockNecesario[key] || { nombre: ing.insumo_nombre, stock: parseFloat(ing.stock_actual), necesario: 0 };
        stockNecesario[key].necesario += parseFloat(ing.cantidad) * (parseInt(item.cantidad) || 1);
      }
    }

    const sinStock = Object.values(stockNecesario).filter(s => s.stock < s.necesario);
    if (sinStock.length > 0)
      return res.status(400).json({ success: false, message: `Stock insuficiente para: ${sinStock.map(s => s.nombre).join(', ')}` });

    // Una sola transacción para todos los items — evita deadlock
    await transaction(async (conn) => {
      for (const item of items) {
        const arreglo = arreglosMap[item.catalogo_id];
        const cant = parseInt(item.cantidad) || 1;
        const costo = await calcularCostoArreglo(item.catalogo_id, conn);
        const precioFinal = parseFloat(item.precio_venta || arreglo.precio_venta) * (1 - descPct / 100);

        for (let n = 0; n < cant; n++) {
          await conn.query(
            `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, nombre_cliente, notas)
             VALUES (?,?,?,?,?,?,?)`,
            [arreglo.id, arreglo.nombre, canal || 'mostrador', precioFinal, costo,
             nombre_cliente || null, item.notas || null]
          );
        }

        const ings = await conn.query(
          `SELECT fi.insumo_id, fi.cantidad FROM ficha_ingredientes fi WHERE fi.catalogo_id = ?`,
          [item.catalogo_id]
        ).then(([rows]) => rows);

        for (const ing of ings) {
          const totalDescontar = parseFloat(ing.cantidad) * cant;
          await conn.query(
            'UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?',
            [totalDescontar, ing.insumo_id]
          );
          const updated = await conn.query('SELECT stock_actual FROM insumos WHERE id = ?', [ing.insumo_id]).then(([r]) => r[0]);
          if (parseFloat(updated.stock_actual) <= 0) {
            await conn.query(
              `UPDATE catalogo SET disponible_externo = 0 WHERE id IN (SELECT DISTINCT catalogo_id FROM ficha_ingredientes WHERE insumo_id = ?)`,
              [ing.insumo_id]
            );
          }
        }
      }
    });

    logger.info(`registrarVentaLote: ${items.length} arreglo(s) — cliente: ${nombre_cliente || 'mostrador'}`);
    res.status(201).json({ success: true, message: 'Venta registrada correctamente' });
  } catch (error) {
    logger.error(`registrarVentaLote: ${error.message}`);
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
    if (desde) { sql += " AND DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) >= ?"; params.push(desde); }
    if (hasta) { sql += " AND DATE(CONVERT_TZ(v.fecha, '+00:00', '-06:00')) <= ?"; params.push(hasta); }
    if (canal) { sql += ' AND v.canal = ?'; params.push(canal); }
    sql += ' ORDER BY v.fecha DESC LIMIT 500';

    const ventas = await query(sql, params);
    res.json({ success: true, data: ventas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getVentaDetalle(req, res) {
  try {
    const { id } = req.params;
    const venta = await queryOne(
      `SELECT v.*, c.nombre as arreglo_nombre
       FROM ventas_floreria v LEFT JOIN catalogo c ON v.catalogo_id = c.id
       WHERE v.id = ?`,
      [id]
    );
    if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada' });

    // Si la venta corresponde a un arreglo del catálogo, traer su receta
    let ingredientes = [];
    if (venta.catalogo_id) {
      ingredientes = await query(
        `SELECT fi.cantidad, i.nombre as insumo_nombre, i.unidad, i.costo_unitario,
                (fi.cantidad * i.costo_unitario) as subtotal
         FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
         WHERE fi.catalogo_id = ?`,
        [venta.catalogo_id]
      );
    }

    // Si la venta viene de un adelanto/saldo de pedido, traer el pedido y sus items
    let pedido = null;
    const match = (venta.notas || '').match(/Pedido #(\d+)/);
    if (match) {
      pedido = await queryOne('SELECT * FROM pedidos WHERE numero = ?', [match[1]]);
      if (pedido) {
        pedido.items = await query('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id', [pedido.id]);
      }
    }

    res.json({ success: true, data: { ...venta, ingredientes, pedido } });
  } catch (error) {
    logger.error(`getVentaDetalle: ${error.message}`);
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


async function ventaPersonalizada(req, res) {
  try {
    const { ingredientes, precio_venta, nombre_cliente, canal, notas, guardar_catalogo, nombre_arreglo, categoria, imagen_url } = req.body;

    if (!ingredientes || ingredientes.length === 0)
      return res.status(400).json({ success: false, message: 'Agrega al menos un ingrediente' });
    if (!precio_venta || parseFloat(precio_venta) <= 0)
      return res.status(400).json({ success: false, message: 'El precio de venta es requerido' });

    // Verificar stock de cada ingrediente
    const insumosData = [];
    for (const ing of ingredientes) {
      const insumo = await queryOne('SELECT * FROM insumos WHERE id = ? AND activo = 1', [ing.insumo_id]);
      if (!insumo) return res.status(400).json({ success: false, message: `Insumo no encontrado (id: ${ing.insumo_id})` });
      if (parseFloat(insumo.stock_actual) < parseFloat(ing.cantidad))
        return res.status(400).json({ success: false, message: `Stock insuficiente de ${insumo.nombre}: hay ${insumo.stock_actual} ${insumo.unidad}` });
      insumosData.push({ ...insumo, cantidad_usar: parseFloat(ing.cantidad) });
    }

    const costo_produccion = insumosData.reduce((s, i) => s + i.cantidad_usar * parseFloat(i.costo_unitario), 0);
    const nombreArreglo = (nombre_arreglo || 'Arreglo personalizado').trim();

    await transaction(async (conn) => {
      let catalogo_id = null;

      if (guardar_catalogo) {
        const [result] = await conn.query(
          `INSERT INTO catalogo (nombre, categoria, precio_venta, costo_calculado, margen_minimo, disponible_externo, imagen_url)
           VALUES (?, ?, ?, ?, 30, 1, ?)`,
          [nombreArreglo, categoria || 'General', precio_venta, costo_produccion, imagen_url || null]
        );
        catalogo_id = result.insertId;
        for (const ing of ingredientes) {
          await conn.query('INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad) VALUES (?,?,?)',
            [catalogo_id, ing.insumo_id, ing.cantidad]);
        }
      }

      await conn.query(
        `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, notas, nombre_cliente)
         VALUES (?,?,?,?,?,?,?)`,
        [catalogo_id, nombreArreglo, canal || 'mostrador', precio_venta, costo_produccion, notas || null, nombre_cliente || null]
      );

      for (const ins of insumosData) {
        await conn.query('UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?', [ins.cantidad_usar, ins.id]);
      }
    });

    logger.info(`ventaPersonalizada: ${nombreArreglo} — ₡${precio_venta}${guardar_catalogo ? ' [guardado en catálogo]' : ''}`);
    res.json({
      success: true,
      message: guardar_catalogo ? `Venta registrada y "${nombreArreglo}" guardado en catálogo` : 'Venta registrada',
      data: { costo_produccion, guardado_catalogo: !!guardar_catalogo }
    });
  } catch (error) {
    logger.error(`ventaPersonalizada: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function revertirVenta(req, res) {
  try {
    const { id } = req.params;
    const venta = await queryOne('SELECT * FROM ventas_floreria WHERE id = ?', [id]);
    if (!venta) return res.status(404).json({ success: false, message: 'Venta no encontrada' });

    await transaction(async (conn) => {
      if (venta.catalogo_id) {
        const ingredientes = await query(
          'SELECT insumo_id, cantidad FROM ficha_ingredientes WHERE catalogo_id = ?',
          [venta.catalogo_id]
        );
        for (const ing of ingredientes) {
          await conn.query(
            'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
            [ing.cantidad, ing.insumo_id]
          );
        }
      } else if (venta.insumo_id) {
        // Venta de insumo suelto (flor/material vendido directo) — restaurar su stock
        await conn.query(
          'UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?',
          [venta.cantidad_insumo, venta.insumo_id]
        );
      }
      await conn.query('DELETE FROM ventas_floreria WHERE id = ?', [id]);
    });

    logger.info(`revertirVenta: venta #${id} eliminada — ₡${venta.precio_venta}`);
    res.json({ success: true, message: 'Venta revertida correctamente' });
  } catch (error) {
    logger.error(`revertirVenta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function importarDesdePhp(req, res) {
  try {
    const resultado = await phpCatalogSync.importarDesdePhp();
    res.json({ success: true, ...resultado, message: `${resultado.importados} arreglo(s) importado(s) desde el catálogo PHP` });
  } catch (error) {
    logger.error(`importarDesdePhp: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { ensureCodigo, ensureCanalPedido, getCatalogo, getArregloConFicha, createArreglo, updateArreglo, deleteArreglo, recalcularCostos, registrarVenta, registrarVentaLote, getVentas, getVentaDetalle, uploadImagen, ventaPersonalizada, revertirVenta, importarDesdePhp };
