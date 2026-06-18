const mysql = require('mysql2/promise');
const logger = require('../../utils/logger');
const { query } = require('../../config/database');

const PHP_SITE_URL = 'https://almacaribeña.store';

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

// Migración idempotente: agrega columna de enlace si no existe.
// Tabla destino: "products" — es la que alimenta el catálogo público (index.php#shop, producto.php).
// ("store_products" es una tabla aparte para el panel de "tienda" / crea-arreglo-detalle, no es el catálogo público).
async function ensureSyncSchema() {
  const p = getPool();
  if (!p) {
    logger.warn('PHP_CATALOG_DB_HOST no configurado — sincronización con catálogo PHP desactivada');
    return;
  }
  try {
    await p.query('ALTER TABLE products ADD COLUMN floreria_id INT NULL UNIQUE');
    logger.info('phpCatalogSync: columna floreria_id agregada a products');
  } catch (e) {
    if (!/Duplicate column/i.test(e.message)) logger.warn(`phpCatalogSync ensureSyncSchema: ${e.message}`);
  }
}

async function findOrCreateCategoria(p, nombreCategoria) {
  const nombre = (nombreCategoria || 'General').trim();
  const [rows] = await p.query('SELECT id FROM categories WHERE name = ? AND type = "categoria" LIMIT 1', [nombre]);
  if (rows.length) return rows[0].id;
  const [result] = await p.query(
    'INSERT INTO categories (name, type) VALUES (?, "categoria")',
    [nombre]
  );
  return result.insertId;
}

// Crea, actualiza o elimina el producto en "products" según floreria_id.
// "products" no tiene columna is_active — si el arreglo se desactiva, se borra la fila
// (no afecta a florería, solo deja de mostrarse en el catálogo público del PHP).
async function syncArreglo(arreglo) {
  const p = getPool();
  if (!p) return;

  const isActive = arreglo.disponible_externo === false || arreglo.disponible_externo === 0 ? false : true;

  try {
    if (!isActive) {
      await desactivarArreglo(arreglo.id);
      return;
    }

    const categoryId = await findOrCreateCategoria(p, arreglo.categoria);
    const imagePath = arreglo.imagen_url || null;

    const [existing] = await p.query('SELECT id FROM products WHERE floreria_id = ? LIMIT 1', [arreglo.id]);

    if (existing.length) {
      await p.query(
        `UPDATE products SET name=?, description=?, price=?, image_path=?, category_id=?
         WHERE floreria_id=?`,
        [arreglo.nombre, arreglo.descripcion || null, arreglo.precio_venta, imagePath, categoryId, arreglo.id]
      );
      logger.info(`phpCatalogSync: actualizado "${arreglo.nombre}" en products (floreria_id=${arreglo.id})`);
    } else {
      await p.query(
        `INSERT INTO products (floreria_id, name, description, price, image_path, category_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [arreglo.id, arreglo.nombre, arreglo.descripcion || null, arreglo.precio_venta, imagePath, categoryId]
      );
      logger.info(`phpCatalogSync: creado "${arreglo.nombre}" en products (floreria_id=${arreglo.id})`);
    }
  } catch (e) {
    logger.error(`phpCatalogSync syncArreglo: ${e.message}`);
  }
}

// Quita el arreglo del catálogo público (borra la fila — "products" no tiene soft-delete)
async function desactivarArreglo(catalogoId) {
  const p = getPool();
  if (!p) return;
  try {
    await p.query('DELETE FROM products WHERE floreria_id = ?', [catalogoId]);
    logger.info(`phpCatalogSync: removido de products floreria_id=${catalogoId}`);
  } catch (e) {
    logger.error(`phpCatalogSync desactivarArreglo: ${e.message}`);
  }
}

// Importa a florería los productos que ya existían en el catálogo PHP
// (creados directamente ahí, sin floreria_id). Idempotente: solo trae los
// que aún no tienen vínculo, así que se puede llamar varias veces sin duplicar.
async function importarDesdePhp() {
  const p = getPool();
  if (!p) return { importados: 0, mensaje: 'Catálogo PHP no configurado' };

  const [productos] = await p.query('SELECT * FROM products WHERE floreria_id IS NULL');
  const resultados = [];

  for (const prod of productos) {
    let categoriaNombre = 'General';
    if (prod.category_id) {
      const [cats] = await p.query('SELECT name FROM categories WHERE id = ?', [prod.category_id]);
      if (cats.length) categoriaNombre = cats[0].name;
    }

    let imagenUrl = null;
    if (prod.image_path) {
      const primeraImagen = prod.image_path.split(',')[0].trim();
      imagenUrl = primeraImagen.startsWith('http') ? primeraImagen : `${PHP_SITE_URL}/${primeraImagen}`;
    }

    const result = await query(
      `INSERT INTO catalogo (nombre, descripcion, imagen_url, precio_venta, categoria, margen_minimo, disponible_externo)
       VALUES (?, ?, ?, ?, ?, 30, 1)`,
      [prod.name, prod.description || null, imagenUrl, prod.price, categoriaNombre]
    );
    const catalogoId = result.insertId;

    await p.query('UPDATE products SET floreria_id = ? WHERE id = ?', [catalogoId, prod.id]);
    resultados.push({ nombre: prod.name, catalogo_id: catalogoId });
    logger.info(`phpCatalogSync importar: "${prod.name}" → catalogo_id=${catalogoId}`);
  }

  return { importados: resultados.length, productos: resultados };
}

module.exports = { ensureSyncSchema, syncArreglo, desactivarArreglo, importarDesdePhp };
