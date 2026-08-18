/**
 * Migración de imágenes: Cloudinary → Hostinger
 *
 * Cómo ejecutar (en la shell de Render o localmente con credenciales de producción):
 *   node migrar-imagenes.js
 *
 * Qué hace:
 *  1. Lee todas las imagen_url de las tablas `catalogo` e `insumos` que apuntan a Cloudinary
 *  2. Descarga cada imagen de Cloudinary
 *  3. La sube al PHP de Hostinger
 *  4. Actualiza la URL en la base de datos
 *  5. Muestra un resumen al final
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com';

const HOSTINGER_URL   = process.env.HOSTINGER_UPLOAD_URL;
const HOSTINGER_TOKEN = process.env.HOSTINGER_UPLOAD_TOKEN;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function downloadImage(url) {
  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar ${url}`);
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, contentType };
}

async function uploadToHostinger(buffer, contentType, filename) {
  if (!HOSTINGER_URL || !HOSTINGER_TOKEN) {
    throw new Error('HOSTINGER_UPLOAD_URL o HOSTINGER_UPLOAD_TOKEN no están definidos');
  }
  const blob = new Blob([buffer], { type: contentType });
  const form = new FormData();
  form.append('imagen', blob, filename);

  const resp = await fetch(HOSTINGER_URL, {
    method: 'POST',
    headers: { 'X-Upload-Token': HOSTINGER_TOKEN },
    body: form,
  });
  const data = await resp.json();
  if (!data.success) throw new Error(data.message || `Error HTTP ${resp.status}`);
  return data.url;
}

function extensionDesdeContentType(ct) {
  if (ct.includes('png'))  return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('gif'))  return 'gif';
  return 'jpg';
}

async function migrarFila(conn, tabla, id, urlCloudinary, stats) {
  const urlCorta = urlCloudinary.substring(0, 80) + (urlCloudinary.length > 80 ? '...' : '');
  try {
    process.stdout.write(`  [${tabla}#${id}] Descargando... `);
    const { buffer, contentType } = await downloadImage(urlCloudinary);

    const filename = `migrado_${tabla}_${id}.${extensionDesdeContentType(contentType)}`;
    process.stdout.write(`subiendo a Hostinger... `);
    const nuevaUrl = await uploadToHostinger(buffer, contentType, filename);

    await conn.query(`UPDATE ${tabla} SET imagen_url = ? WHERE id = ?`, [nuevaUrl, id]);
    console.log(`✓ ${nuevaUrl}`);
    stats.ok++;
  } catch (err) {
    console.log(`✗ ERROR: ${err.message}`);
    stats.errores.push({ tabla, id, url: urlCorta, error: err.message });
  }

  // Pausa breve para no saturar Hostinger
  await new Promise(r => setTimeout(r, 300));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Migración de imágenes Cloudinary → Hostinger');
  console.log('═══════════════════════════════════════════════════════════');

  if (!HOSTINGER_URL || !HOSTINGER_TOKEN) {
    console.error('\n❌ Faltan variables de entorno:');
    console.error('   HOSTINGER_UPLOAD_URL   =', HOSTINGER_URL || '(no definida)');
    console.error('   HOSTINGER_UPLOAD_TOKEN =', HOSTINGER_TOKEN ? '(definida)' : '(no definida)');
    process.exit(1);
  }

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  console.log(`\n✔ Conectado a la base de datos ${process.env.DB_NAME}\n`);

  const stats = { ok: 0, errores: [] };

  // ── Catálogo ────────────────────────────────────────────────────────────────
  const [arreglos] = await conn.query(
    `SELECT id, imagen_url FROM catalogo WHERE imagen_url LIKE '${CLOUDINARY_PREFIX}%'`
  );
  console.log(`Catálogo: ${arreglos.length} imágenes en Cloudinary`);

  if (arreglos.length > 0) {
    for (const row of arreglos) {
      await migrarFila(conn, 'catalogo', row.id, row.imagen_url, stats);
    }
  } else {
    console.log('  (ninguna)\n');
  }

  // ── Insumos ─────────────────────────────────────────────────────────────────
  const [insumos] = await conn.query(
    `SELECT id, imagen_url FROM insumos WHERE imagen_url LIKE '${CLOUDINARY_PREFIX}%'`
  );
  console.log(`\nInsumos: ${insumos.length} imágenes en Cloudinary`);

  if (insumos.length > 0) {
    for (const row of insumos) {
      await migrarFila(conn, 'insumos', row.id, row.imagen_url, stats);
    }
  } else {
    console.log('  (ninguna)\n');
  }

  await conn.end();

  // ── Resumen ──────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  Resultado: ${stats.ok} migradas correctamente`);
  if (stats.errores.length > 0) {
    console.log(`             ${stats.errores.length} con error:`);
    for (const e of stats.errores) {
      console.log(`    • [${e.tabla}#${e.id}] ${e.error}`);
      console.log(`      URL: ${e.url}`);
    }
  } else {
    console.log('  Todos los registros migrados sin errores ✓');
  }
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
