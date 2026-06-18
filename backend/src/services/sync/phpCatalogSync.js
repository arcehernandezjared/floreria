const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');

let pool = null;

function getPool() {
  if (pool) return pool;
  if (!process.env.PHP_CATALOG_DB_HOST) return null;

  pool = mysql.createPool({
    host: process.env.PHP_CATALOG_DB_HOST,
    port: parseInt(process.env.PHP_CATALOG_DB_PORT) || 3306,
    user: process.env.PHP_CATALOG_DB_USER,
    password: process.env.PHP_CATALOG_DB_PASS,
    database: process.env.PHP_CATALOG_DB_NAME,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    charset: 'utf8mb4',
    connectTimeout: 10000,
  });
  return pool;
}

// Migración idempotente: agrega columna de enlace si no existe
async function ensureSyncSchema() {
  const p = getPool();
  if (!p) {
    logger.warn('PHP_CATALOG_DB_HOST no configurado — sincronización con catálogo PHP desactivada');
    return;
  }
  try {
    await p.query('ALTER TABLE store_products ADD COLUMN floreria_id INT NULL UNIQUE');
    logger.info('phpCatalogSync: columna floreria_id agregada a store_products');
  } catch (e) {
    if (!/Duplicate column/i.test(e.message)) logger.warn(`phpCatalogSync ensureSyncSchema: ${e.message}`);
  }
}

async function findOrCreateCategoria(p, nombreCategoria) {
  const nombre = (nombreCategoria || 'General').trim();
  const [rows] = await p.query('SELECT id FROM store_categories WHERE name = ? LIMIT 1', [nombre]);
  if (rows.length) return rows[0].id;
  const [result] = await p.query(
    'INSERT INTO store_categories (name, type, is_active) VALUES (?, "flor", 1)',
    [nombre]
  );
  return result.insertId;
}

// Crea o actualiza el producto en store_products según floreria_id
async function syncArreglo(arreglo) {
  const p = getPool();
  if (!p) return;

  try {
    const categoryId = await findOrCreateCategoria(p, arreglo.categoria);
    const imagePath = arreglo.imagen_url || null;
    const isActive = arreglo.disponible_externo === false || arreglo.disponible_externo === 0 ? 0 : 1;

    const [existing] = await p.query('SELECT id FROM store_products WHERE floreria_id = ? LIMIT 1', [arreglo.id]);

    if (existing.length) {
      await p.query(
        `UPDATE store_products SET name=?, description=?, price=?, image_path=?, category_id=?, is_active=?
         WHERE floreria_id=?`,
        [arreglo.nombre, arreglo.descripcion || null, arreglo.precio_venta, imagePath, categoryId, isActive, arreglo.id]
      );
      logger.info(`phpCatalogSync: actualizado "${arreglo.nombre}" (floreria_id=${arreglo.id})`);
    } else {
      await p.query(
        `INSERT INTO store_products (floreria_id, name, description, price, image_path, category_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arreglo.id, arreglo.nombre, arreglo.descripcion || null, arreglo.precio_venta, imagePath, categoryId, isActive]
      );
      logger.info(`phpCatalogSync: creado "${arreglo.nombre}" (floreria_id=${arreglo.id})`);
    }
  } catch (e) {
    logger.error(`phpCatalogSync syncArreglo: ${e.message}`);
  }
}

// Desactiva el producto en el catálogo PHP (no lo borra, igual que el soft-delete de floreria)
async function desactivarArreglo(catalogoId) {
  const p = getPool();
  if (!p) return;
  try {
    await p.query('UPDATE store_products SET is_active = 0 WHERE floreria_id = ?', [catalogoId]);
    logger.info(`phpCatalogSync: desactivado floreria_id=${catalogoId}`);
  } catch (e) {
    logger.error(`phpCatalogSync desactivarArreglo: ${e.message}`);
  }
}

module.exports = { ensureSyncSchema, syncArreglo, desactivarArreglo };
