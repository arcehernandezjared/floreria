const { query, queryOne, transaction } = require('../config/database');
const logger = require('../utils/logger');

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS pedidos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    numero VARCHAR(10) UNIQUE,
    fecha DATE NOT NULL,
    cliente_nombre VARCHAR(200),
    cliente_telefono VARCHAR(50),
    hora_entrega VARCHAR(20),
    direccion VARCHAR(500),
    tipo_arreglo VARCHAR(300),
    tributo_numero VARCHAR(50),
    precio DECIMAL(12,2) DEFAULT 0,
    adelanto DECIMAL(12,2) DEFAULT 0,
    adelanto_original DECIMAL(12,2) DEFAULT NULL,
    tipo_pago ENUM('efectivo','sinpe','tarjeta') DEFAULT 'efectivo',
    tipo_entrega ENUM('tienda','express') DEFAULT 'tienda',
    dedicatoria TEXT,
    observaciones TEXT,
    estado ENUM('pendiente','listo','entregado','cancelado') DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  // Migración: agregar columna si la tabla ya existía sin ella
  await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS adelanto_original DECIMAL(12,2) DEFAULT NULL`).catch(() => {});
  await query(`ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS ventas_registradas TINYINT(1) DEFAULT 0`).catch(() => {});
  await query(`CREATE TABLE IF NOT EXISTS pedido_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    pedido_id INT NOT NULL,
    tipo ENUM('arreglo','insumo') NOT NULL,
    referencia_id INT NOT NULL,
    nombre VARCHAR(300),
    cantidad INT NOT NULL DEFAULT 1,
    precio_unitario DECIMAL(12,2) DEFAULT 0,
    subtotal DECIMAL(12,2) DEFAULT 0
  )`);
}

async function generarNumero() {
  const last = await queryOne('SELECT numero FROM pedidos ORDER BY id DESC LIMIT 1');
  if (!last) return '0000001';
  const n = parseInt(last.numero) + 1;
  return String(n).padStart(7, '0');
}

async function getPedidos(req, res) {
  try {
    await ensureTable();
    const rows = await query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM pedido_items pi WHERE pi.pedido_id = p.id) as total_items
      FROM pedidos p ORDER BY p.created_at DESC LIMIT 200`);
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function getPedido(req, res) {
  try {
    const row = await queryOne('SELECT * FROM pedidos WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });
    const items = await query('SELECT * FROM pedido_items WHERE pedido_id = ? ORDER BY id', [row.id]);
    res.json({ success: true, data: { ...row, items } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function saveItems(pedidoId, items, conn) {
  const q = conn
    ? (sql, params) => conn.query(sql, params)
    : (sql, params) => query(sql, params);

  await q('DELETE FROM pedido_items WHERE pedido_id = ?', [pedidoId]);
  for (const item of (items || [])) {
    const subtotal = parseFloat(item.cantidad) * parseFloat(item.precio_unitario);
    await q(
      'INSERT INTO pedido_items (pedido_id, tipo, referencia_id, nombre, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?,?,?)',
      [pedidoId, item.tipo, item.referencia_id, item.nombre, item.cantidad, item.precio_unitario, subtotal]
    );
  }
}

async function createPedido(req, res) {
  try {
    await ensureTable();
    const {
      fecha, cliente_nombre, cliente_telefono, hora_entrega, direccion,
      tipo_arreglo, tributo_numero, adelanto,
      tipo_pago, tipo_entrega, dedicatoria, observaciones,
      items = []
    } = req.body;

    if (!fecha) return res.status(400).json({ success: false, message: 'La fecha es requerida' });

    const numero = await generarNumero();
    const itemsSum = items.reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.precio_unitario), 0);
    const precio = req.body.precio != null ? parseFloat(req.body.precio) || itemsSum : itemsSum;
    const adelantoNum = parseFloat(adelanto) || 0;

    let pedidoId;
    await transaction(async (conn) => {
      const [result] = await conn.query(
        `INSERT INTO pedidos (numero, fecha, cliente_nombre, cliente_telefono, hora_entrega,
          direccion, tipo_arreglo, tributo_numero, precio, adelanto,
          tipo_pago, tipo_entrega, dedicatoria, observaciones)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [numero, fecha, cliente_nombre || null, cliente_telefono || null, hora_entrega || null,
         direccion || null, tipo_arreglo || null, tributo_numero || null,
         precio, adelantoNum,
         tipo_pago || 'efectivo', tipo_entrega || 'tienda',
         dedicatoria || null, observaciones || null]
      );
      pedidoId = result.insertId;

      await saveItems(pedidoId, items, conn);

      // Registrar adelanto como venta inmediata si hay adelanto
      if (adelantoNum > 0) {
        await conn.query(
          `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, precio_venta, costo_produccion, canal, nombre_cliente, notas)
           VALUES (NULL, ?, ?, 0, 'pedido', ?, ?)`,
          [
            `Adelanto de pedido — ${tipo_arreglo || 'Pedido'}`,
            adelantoNum,
            cliente_nombre || null,
            `Pedido #${numero}`
          ]
        );
      }
    });

    if (adelantoNum > 0) logger.info(`Adelanto ₡${adelantoNum} de pedido #${numero} registrado como venta`);
    res.status(201).json({ success: true, data: { id: pedidoId, numero } });
  } catch (e) {
    logger.error(`createPedido: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

async function updatePedido(req, res) {
  try {
    const { id } = req.params;
    const {
      fecha, cliente_nombre, cliente_telefono, hora_entrega, direccion,
      tipo_arreglo, tributo_numero, adelanto,
      tipo_pago, tipo_entrega, dedicatoria, observaciones, estado,
      items = []
    } = req.body;

    const itemsSum = items.reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.precio_unitario), 0);
    const precio = req.body.precio != null ? parseFloat(req.body.precio) || itemsSum : itemsSum;

    await transaction(async (conn) => {
      await conn.query(
        `UPDATE pedidos SET fecha=?, cliente_nombre=?, cliente_telefono=?, hora_entrega=?,
          direccion=?, tipo_arreglo=?, tributo_numero=?, precio=?, adelanto=?,
          tipo_pago=?, tipo_entrega=?, dedicatoria=?, observaciones=?,
          estado=COALESCE(?,estado)
         WHERE id=?`,
        [fecha, cliente_nombre || null, cliente_telefono || null, hora_entrega || null,
         direccion || null, tipo_arreglo || null, tributo_numero || null,
         precio, parseFloat(adelanto) || 0,
         tipo_pago || 'efectivo', tipo_entrega || 'tienda',
         dedicatoria || null, observaciones || null,
         estado || null, id]
      );

      await saveItems(id, items, conn);
    });

    res.json({ success: true, message: 'Pedido actualizado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function updateEstado(req, res) {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const pedido = await queryOne('SELECT * FROM pedidos WHERE id = ?', [id]);
    if (!pedido) return res.status(404).json({ success: false, message: 'Pedido no encontrado' });

    if (estado === 'entregado' && !pedido.ventas_registradas) {
      // ── Registrar UNA venta por pedido con el precio total real ──────────
      const items = await query('SELECT * FROM pedido_items WHERE pedido_id = ?', [id]);

      // Calcular costo total de producción y acumular insumos a descontar del inventario
      let costoTotal = 0;
      const descuentos = new Map(); // insumo_id -> cantidad total a restar

      for (const item of items) {
        const cantidadItem = parseFloat(item.cantidad) || 1;
        if (item.tipo === 'arreglo') {
          const ingredientes = await query(
            `SELECT fi.insumo_id, fi.cantidad, i.costo_unitario
             FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
             WHERE fi.catalogo_id = ?`,
            [item.referencia_id]
          );
          for (const ing of ingredientes) {
            costoTotal += parseFloat(ing.cantidad) * parseFloat(ing.costo_unitario) * cantidadItem;
            const actual = descuentos.get(ing.insumo_id) || 0;
            descuentos.set(ing.insumo_id, actual + parseFloat(ing.cantidad) * cantidadItem);
          }
        } else {
          // tipo 'insumo': flor/material suelto vendido directo en el pedido
          costoTotal += parseFloat(item.precio_unitario || 0) * cantidadItem;
          if (item.referencia_id) {
            const actual = descuentos.get(item.referencia_id) || 0;
            descuentos.set(item.referencia_id, actual + cantidadItem);
          }
        }
      }

      const nombreVenta = items.length > 0
        ? items.map(i => i.nombre).filter(Boolean).join(', ') || pedido.tipo_arreglo || 'Pedido'
        : pedido.tipo_arreglo || 'Pedido';

      // ── Validar TODO el stock necesario antes de escribir nada ──────────────
      // Si falta cualquier insumo, no se registra la venta ni se descuenta nada.
      if (descuentos.size > 0) {
        const ids = [...descuentos.keys()];
        const insumosActuales = await query(
          `SELECT id, nombre, unidad, stock_actual FROM insumos WHERE id IN (${ids.map(() => '?').join(',')})`,
          ids
        );
        const stockMap = new Map(insumosActuales.map(i => [i.id, i]));
        const sinStock = [];
        for (const [insumoId, cantidadNecesaria] of descuentos) {
          const insumo = stockMap.get(insumoId);
          if (!insumo || parseFloat(insumo.stock_actual) < cantidadNecesaria) {
            sinStock.push({
              nombre: insumo?.nombre || `insumo #${insumoId}`,
              necesario: cantidadNecesaria,
              disponible: insumo ? parseFloat(insumo.stock_actual) : 0,
              unidad: insumo?.unidad || ''
            });
          }
        }
        if (sinStock.length > 0) {
          return res.status(400).json({
            success: false,
            message: `No se puede marcar como entregado — stock insuficiente para: ${sinStock.map(s => `${s.nombre} (necesita ${s.necesario}, hay ${s.disponible} ${s.unidad})`).join(', ')}`,
            datos: sinStock
          });
        }
      }

      // Solo registrar el saldo pendiente (precio - adelanto ya cobrado al crear el pedido)
      const saldoPendiente = (parseFloat(pedido.precio) || 0) - (parseFloat(pedido.adelanto) || 0);

      try {
        await transaction(async (conn) => {
          if (saldoPendiente > 0) {
            await conn.query(
              `INSERT INTO ventas_floreria
                (catalogo_id, nombre_arreglo, precio_venta, costo_produccion, canal, nombre_cliente, notas)
               VALUES (?,?,?,?,?,?,?)`,
              [
                null,
                `Saldo pedido — ${nombreVenta}`,
                saldoPendiente,
                costoTotal,
                'pedido',
                pedido.cliente_nombre || null,
                `Pedido #${pedido.numero}`
              ]
            );
          }

          // ── Descontar del inventario los insumos usados en el pedido ──────
          for (const [insumoId, cantidad] of descuentos) {
            await conn.query(
              'UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?',
              [cantidad, insumoId]
            );
          }

          await conn.query(
            `UPDATE pedidos SET estado = ?, adelanto_original = COALESCE(adelanto_original, adelanto), adelanto = precio, ventas_registradas = 1 WHERE id = ?`,
            [estado, id]
          );
        });

        if (saldoPendiente > 0) {
          logger.info(`Pedido #${pedido.numero} entregado — saldo ₡${saldoPendiente} registrado, ${descuentos.size} insumo(s) descontados`);
        } else {
          logger.info(`Pedido #${pedido.numero} entregado — sin saldo pendiente, ${descuentos.size} insumo(s) descontados`);
        }
      } catch (e) {
        logger.error(`updateEstado entregado ERROR: ${e.message}`);
        throw e;
      }

    } else if (estado !== 'entregado' && pedido.estado === 'entregado') {
      // ── Revertir saldo al adelanto original, devolver al inventario lo descontado
      //    y permitir registrar la venta de nuevo si vuelve a marcarse entregado ──
      const items = await query('SELECT * FROM pedido_items WHERE pedido_id = ?', [id]);
      const restituciones = new Map(); // insumo_id -> cantidad a devolver

      for (const item of items) {
        const cantidadItem = parseFloat(item.cantidad) || 1;
        if (item.tipo === 'arreglo') {
          const ingredientes = await query(
            'SELECT insumo_id, cantidad FROM ficha_ingredientes WHERE catalogo_id = ?',
            [item.referencia_id]
          );
          for (const ing of ingredientes) {
            const actual = restituciones.get(ing.insumo_id) || 0;
            restituciones.set(ing.insumo_id, actual + parseFloat(ing.cantidad) * cantidadItem);
          }
        } else if (item.referencia_id) {
          const actual = restituciones.get(item.referencia_id) || 0;
          restituciones.set(item.referencia_id, actual + cantidadItem);
        }
      }

      await transaction(async (conn) => {
        for (const [insumoId, cantidad] of restituciones) {
          await conn.query('UPDATE insumos SET stock_actual = stock_actual + ? WHERE id = ?', [cantidad, insumoId]);
        }
        await conn.query(
          `UPDATE pedidos SET estado = ?, adelanto = COALESCE(adelanto_original, adelanto), adelanto_original = NULL, ventas_registradas = 0 WHERE id = ?`,
          [estado, id]
        );
      });

      logger.info(`Pedido #${pedido.numero} salió de entregado — ${restituciones.size} insumo(s) devueltos al inventario`);

    } else {
      await query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);
    }

    res.json({ success: true });
  } catch (e) {
    logger.error(`updateEstado: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

async function deletePedido(req, res) {
  try {
    await query('DELETE FROM pedido_items WHERE pedido_id = ?', [req.params.id]);
    await query('DELETE FROM pedidos WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Pedido eliminado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { getPedidos, getPedido, createPedido, updatePedido, updateEstado, deletePedido };
