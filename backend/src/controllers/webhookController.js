const crypto = require('crypto');
const { query, queryOne, transaction } = require('../config/database');
const { calcularMargen } = require('../utils/helpers');
const logger = require('../utils/logger');

// Comparación en tiempo constante — evita que un atacante deduzca la API key
// midiendo cuánto tarda la respuesta carácter por carácter.
function apiKeyValida(recibida) {
  const esperada = process.env.WEBHOOK_API_KEY || '';
  if (!recibida || typeof recibida !== 'string') return false;
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function recibirVentaExterna(req, res) {
  try {
    if (!apiKeyValida(req.headers['x-api-key'])) {
      return res.status(401).json({ success: false, message: 'API key inválida' });
    }

    const { producto_nombre, precio, cliente, ref_externa, canal } = req.body;
    const precioNum = parseFloat(precio);
    if (!producto_nombre || !precio || isNaN(precioNum) || precioNum <= 0) {
      return res.status(400).json({ success: false, message: 'producto_nombre y un precio válido (mayor a 0) son requeridos' });
    }

    // Buscar arreglo en catálogo por nombre (fuzzy)
    const arreglos = await query(
      "SELECT * FROM catalogo WHERE nombre LIKE ? AND activo = 1 AND disponible_externo = 1 LIMIT 1",
      [`%${producto_nombre}%`]
    );

    if (arreglos.length === 0) {
      return res.status(404).json({ success: false, message: `No se encontró el arreglo: ${producto_nombre}` });
    }

    const arreglo = arreglos[0];

    // Obtener ingredientes y verificar stock
    const ingredientes = await query(
      `SELECT fi.*, i.stock_actual, i.nombre as insumo_nombre, i.costo_unitario
       FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
       WHERE fi.catalogo_id = ?`,
      [arreglo.id]
    );

    const sinStock = ingredientes.filter(i => parseFloat(i.stock_actual) < parseFloat(i.cantidad));
    if (sinStock.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Stock insuficiente para completar la venta`,
        datos: sinStock.map(i => ({ insumo: i.insumo_nombre, necesita: i.cantidad, disponible: i.stock_actual }))
      });
    }

    const costo_produccion = ingredientes.reduce((s, i) => s + (parseFloat(i.cantidad) * parseFloat(i.costo_unitario)), 0);

    await transaction(async (conn) => {
      await conn.query(
        `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, ref_externa, precio_venta, costo_produccion, nombre_cliente)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arreglo.id, arreglo.nombre, canal || 'externo', ref_externa || null, precioNum, costo_produccion, cliente || null]
      );

      for (const ing of ingredientes) {
        const nuevoStock = parseFloat(ing.stock_actual) - parseFloat(ing.cantidad);
        await conn.query('UPDATE insumos SET stock_actual = ? WHERE id = ?', [nuevoStock, ing.insumo_id]);

        if (nuevoStock <= 0) {
          await conn.query(
            `UPDATE catalogo SET disponible_externo = 0
             WHERE id IN (SELECT DISTINCT catalogo_id FROM ficha_ingredientes WHERE insumo_id = ?)`,
            [ing.insumo_id]
          );
        }
      }
    });

    logger.info(`Venta externa recibida: ${arreglo.nombre} por ₡${precioNum} - Cliente: ${cliente}`);

    res.json({
      success: true,
      message: 'Venta registrada correctamente',
      data: { arreglo: arreglo.nombre, precio: precioNum, costo_produccion }
    });
  } catch (error) {
    logger.error(`webhookVenta: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { recibirVentaExterna };
