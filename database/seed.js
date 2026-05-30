/**
 * Seed script — genera hash real de bcrypt y actualiza schema.sql
 * Uso: node seed.js
 */
const bcrypt = require('bcryptjs');

async function main() {
  const password = 'floreria123';
  const hash = await bcrypt.hash(password, 10);
  console.log('Hash generado para floreria123:');
  console.log(hash);
  console.log('\nCopia este hash en el INSERT de usuarios en schema.sql');
  console.log('\nVerificación:', await bcrypt.compare(password, hash));
}

main();
