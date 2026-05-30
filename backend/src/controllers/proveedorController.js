const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');

async function getProveedores(req, res) {
  try {
    const { activo = '1' } = req.query;
    let sql = 'SELECT * FROM proveedores WHERE 1=1';
    const params = [];
    if (activo === '1') { sql += ' AND activo = 1'; }
    sql += ' ORDER BY nombre';
    const data = await query(sql, params);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getProveedor(req, res) {
  try {
    const prov = await queryOne('SELECT * FROM proveedores WHERE id = ?', [req.params.id]);
    if (!prov) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });
    res.json({ success: true, data: prov });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function createProveedor(req, res) {
  try {
    const { nombre, tipo, contacto, telefono, email, notas } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Nombre es requerido' });

    const result = await query(
      'INSERT INTO proveedores (nombre, tipo, contacto, telefono, email, notas) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, tipo || 'otro', contacto || null, telefono || null, email || null, notas || null]
    );

    const created = await queryOne('SELECT * FROM proveedores WHERE id = ?', [result.insertId]);
    res.status(201).json({ success: true, data: created, message: 'Proveedor creado' });
  } catch (error) {
    logger.error(`createProveedor: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
}

async function updateProveedor(req, res) {
  try {
    const { id } = req.params;
    const { nombre, tipo, contacto, telefono, email, notas, activo } = req.body;

    const existing = await queryOne('SELECT * FROM proveedores WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Proveedor no encontrado' });

    await query(
      'UPDATE proveedores SET nombre=?, tipo=?, contacto=?, telefono=?, email=?, notas=?, activo=? WHERE id=?',
      [nombre ?? existing.nombre, tipo ?? existing.tipo, contacto ?? existing.contacto,
       telefono ?? existing.telefono, email ?? existing.email, notas ?? existing.notas,
       activo !== undefined ? (activo ? 1 : 0) : existing.activo, id]
    );

    const updated = await queryOne('SELECT * FROM proveedores WHERE id = ?', [id]);
    res.json({ success: true, data: updated, message: 'Proveedor actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function deleteProveedor(req, res) {
  try {
    await query('UPDATE proveedores SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Proveedor desactivado' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

async function getHistorialCompras(req, res) {
  try {
    const { id } = req.params;
    const compras = await query(
      `SELECT c.*, COUNT(ci.id) as total_items
       FROM compras c
       LEFT JOIN compra_items ci ON c.id = ci.compra_id
       WHERE c.proveedor_id = ?
       GROUP BY c.id
       ORDER BY c.fecha DESC LIMIT 20`,
      [id]
    );
    res.json({ success: true, data: compras });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

module.exports = { getProveedores, getProveedor, createProveedor, updateProveedor, deleteProveedor, getHistorialCompras };
