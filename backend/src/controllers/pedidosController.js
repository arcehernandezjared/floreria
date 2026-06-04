const { query, queryOne } = require('../config/database');
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
    tipo_pago ENUM('efectivo','sinpe','tarjeta') DEFAULT 'efectivo',
    tipo_entrega ENUM('tienda','express') DEFAULT 'tienda',
    dedicatoria TEXT,
    observaciones TEXT,
    estado ENUM('pendiente','listo','entregado','cancelado') DEFAULT 'pendiente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
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

    const result = await query(
      `INSERT INTO pedidos (numero, fecha, cliente_nombre, cliente_telefono, hora_entrega,
        direccion, tipo_arreglo, tributo_numero, precio, adelanto,
        tipo_pago, tipo_entrega, dedicatoria, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [numero, fecha, cliente_nombre || null, cliente_telefono || null, hora_entrega || null,
       direccion || null, tipo_arreglo || null, tributo_numero || null,
       precio, parseFloat(adelanto) || 0,
       tipo_pago || 'efectivo', tipo_entrega || 'tienda',
       dedicatoria || null, observaciones || null]
    );

    await saveItems(result.insertId, items);

    res.status(201).json({ success: true, data: { id: result.insertId, numero } });
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

    await query(
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

    await saveItems(id, items);

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

    // Al marcar como entregado, registrar como ventas (solo si no estaba ya entregado)
    if (estado === 'entregado' && pedido.estado !== 'entregado') {
      const items = await query('SELECT * FROM pedido_items WHERE pedido_id = ?', [id]);
      const fechaCR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

      if (items.length > 0) {
        for (const item of items) {
          // Para arreglos del catálogo, calcular el costo real de producción
          let costoUnit = 0;
          if (item.tipo === 'arreglo') {
            const costoRow = await queryOne(
              `SELECT COALESCE(SUM(fi.cantidad * i.costo_unitario), 0) as costo
               FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
               WHERE fi.catalogo_id = ?`,
              [item.referencia_id]
            );
            costoUnit = parseFloat(costoRow?.costo || 0);
          } else {
            // Flores sueltas: el costo es el precio_unitario del insumo
            costoUnit = parseFloat(item.precio_unitario);
          }

          await query(
            `INSERT INTO ventas_floreria
              (catalogo_id, nombre_arreglo, precio_venta, costo_produccion, canal, nombre_cliente, notas, fecha)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
              item.tipo === 'arreglo' ? item.referencia_id : null,
              item.nombre,
              parseFloat(item.subtotal),          // total de la línea
              costoUnit * parseInt(item.cantidad), // costo total de la línea
              'mostrador',
              pedido.cliente_nombre || null,
              `Pedido #${pedido.numero}`,
              fechaCR
            ]
          );
        }
      } else if (parseFloat(pedido.precio) > 0) {
        // Sin items detallados, registrar como una sola venta
        await query(
          `INSERT INTO ventas_floreria
            (catalogo_id, nombre_arreglo, precio_venta, costo_produccion, canal, nombre_cliente, notas, fecha)
           VALUES (?,?,?,?,?,?,?,?)`,
          [null, pedido.tipo_arreglo || 'Pedido', parseFloat(pedido.precio), 0,
           'mostrador', pedido.cliente_nombre || null, `Pedido #${pedido.numero}`, fechaCR]
        );
      }

      logger.info(`Pedido #${pedido.numero} entregado — ${items.length} item(s) registrados como ventas`);
    }

    await query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, id]);
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
