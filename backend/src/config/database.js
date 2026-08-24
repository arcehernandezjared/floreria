const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'floreria',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
      charset: 'utf8mb4',
      // Devolver columnas JSON como string para manejarlas manualmente con JSON.parse
      typeCast(field, next) {
        if (field.type === 'JSON') return field.string('utf8');
        return next();
      }
    });

    // El servidor MySQL puede estar en zona horaria de Costa Rica (UTC-6).
    // Forzamos SET time_zone = '+00:00' en cada conexión usando 'acquire'
    // (que dispara en cada getConnection()) con un WeakSet para no repetirlo,
    // garantizando que NOW() devuelva UTC antes de cualquier query.
    const tzSet = new WeakSet();
    pool.on('acquire', (conn) => {
      if (tzSet.has(conn)) return;
      tzSet.add(conn);
      conn.query("SET time_zone = '+00:00'", (err) => {
        if (err) logger.warn(`SET time_zone: ${err.message}`);
      });
    });

    const connection = await pool.getConnection();
    logger.info('Conexión a MySQL establecida correctamente');
    connection.release();
    return pool;
  } catch (error) {
    logger.error(`Error conectando a MySQL: ${error.message}`);
    process.exit(1);
  }
}

function getPool() {
  if (!pool) throw new Error('Base de datos no inicializada');
  return pool;
}

async function query(sql, params = []) {
  // Usar query() en lugar de execute() para evitar problemas con LIMIT/OFFSET en prepared statements
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function transaction(callback) {
  const conn = await getPool().getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` no es sintaxis válida en MySQL
// (es una extensión de MariaDB) — falla con ER_PARSE_ERROR y queda silenciada
// por los `.catch(() => {})` de las migraciones, dejando la columna sin crear.
// Por eso las migraciones de columnas deben verificar information_schema primero.
async function addColumnIfMissing(table, column, definition) {
  const existe = await queryOne(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (existe) return;
  await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

module.exports = { connectDB, getPool, query, queryOne, transaction, addColumnIfMissing };
