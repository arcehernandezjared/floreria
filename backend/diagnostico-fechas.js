require('dotenv').config();
const { connectDB, query } = require('./src/config/database');

async function main() {
  await connectDB();

  // Mostrar ventas del 22 y 23 de agosto para ver qué está guardado
  const ventas = await query(`
    SELECT id, nombre_arreglo, nombre_cliente, canal, fecha,
           CONVERT_TZ(fecha, '+00:00', '-06:00') AS fecha_cr,
           fecha AS fecha_utc_raw
    FROM ventas_floreria
    WHERE DATE(fecha) IN ('2026-08-22', '2026-08-23')
    ORDER BY fecha
  `);

  console.log(`\n=== VENTAS 22-23 AGO (${ventas.length} registros) ===\n`);
  console.log('ID'.padEnd(6), 'FECHA UTC (raw)'.padEnd(22), 'FECHA CR'.padEnd(22), 'ARTÍCULO');
  console.log('-'.repeat(90));
  for (const v of ventas) {
    const utcRaw = v.fecha instanceof Date
      ? v.fecha.toISOString()
      : String(v.fecha);
    const crStr = v.fecha_cr instanceof Date
      ? v.fecha_cr.toISOString()
      : String(v.fecha_cr);
    console.log(
      String(v.id).padEnd(6),
      utcRaw.padEnd(22),
      crStr.padEnd(22),
      (v.nombre_arreglo || '').slice(0, 30)
    );
  }

  // Ver el NOW() del servidor con y sin SET time_zone
  const [nowRaw] = await query('SELECT NOW() as now_server, @@global.time_zone as tz_global, @@session.time_zone as tz_session');
  console.log('\n=== TIMEZONE DEL SERVIDOR ===');
  console.log('  NOW() sin SET:', nowRaw.now_server);
  console.log('  TZ global:    ', nowRaw.tz_global);
  console.log('  TZ sesión:    ', nowRaw.tz_session);

  const CORREGIR = process.argv[2] === '--corregir';

  if (!CORREGIR) {
    console.log('\nPara CORREGIR las fechas del sábado 22 ago, ejecuta:');
    console.log('  node diagnostico-fechas.js --corregir');
    process.exit(0);
  }

  // Corregir: los registros de "Cliente mostrador" del 23 ago que son del sábado en la noche
  // Se mueven 12 horas atrás (de domingo 8:45 AM CR a sábado 8:45 PM CR)
  const candidatos = ventas.filter(v => {
    const utc = v.fecha instanceof Date ? v.fecha : new Date(v.fecha);
    return utc.toISOString().startsWith('2026-08-23') &&
           (v.nombre_cliente === 'Cliente mostrador' || v.canal === 'mostrador');
  });

  if (candidatos.length === 0) {
    console.log('\nNo se encontraron candidatos para corregir.');
    process.exit(0);
  }

  console.log(`\nCorrigiendo ${candidatos.length} registros (restando 12 horas)...`);
  const ids = candidatos.map(v => v.id);
  await query(
    `UPDATE ventas_floreria SET fecha = DATE_SUB(fecha, INTERVAL 12 HOUR) WHERE id IN (${ids.join(',')})`,
    []
  );
  console.log('✅ Listo. Las ventas ahora muestran el sábado 22 de agosto.');
  process.exit(0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
