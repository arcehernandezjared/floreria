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

module.exports = { connectDB, getPool, query, queryOne, transaction };
