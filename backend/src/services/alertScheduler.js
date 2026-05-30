const { query, queryOne } = require('../config/database');
const { sendMessage, getStatus, setConnectedCallback } = require('./whatsapp/whatsappService');
const logger = require('../utils/logger');

// Evita mensajes duplicados en el mismo día — clave: "alertId_YYYY-MM-DD"
const enviadas = new Set();

function hoy() {
  return new Date().toISOString().split('T')[0];
}
function yaEnviada(id) { return enviadas.has(`${id}_${hoy()}`); }
function marcar(id)    { enviadas.add(`${id}_${hoy()}`); }

async function ensureColumna() {
  try {
    await query("ALTER TABLE config_nomina ADD COLUMN numero_alertas VARCHAR(25) DEFAULT NULL");
    logger.info('Columna numero_alertas agregada a config_nomina');
  } catch (_) { /* ya existe */ }
}

// force=false → scheduler automático (silencioso si falta WA o número)
// force=true  → botón manual (tira error descriptivo, sin restricción de hora)
async function checkAlertas(force = false) {
  const waStatus = getStatus();
  if (waStatus.status !== 'connected') {
    if (force) throw new Error('WhatsApp no está conectado. Conectalo desde el módulo WhatsApp IA primero.');
    logger.info('Scheduler: WA no conectado, omitiendo chequeo de alertas');
    return [];
  }

  const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
  if (!config?.numero_alertas) {
    if (force) throw new Error('No hay número de alertas configurado. Agregalo en Configuración → Fondo Nómina.');
    logger.info('Scheduler: sin número de alertas configurado');
    return [];
  }

  const numero = String(config.numero_alertas).replace(/\D/g, '');
  if (!numero) {
    if (force) throw new Error('El número guardado no tiene dígitos válidos.');
    return [];
  }

  const hoyStr = hoy();
  const hora = new Date().getHours();
  const resumen = [];

  // ── 1. Insumos agotados (stock = 0) ──────────────────────────────────────────
  const agotados = await query(
    "SELECT nombre FROM insumos WHERE stock_actual = 0 AND activo = 1 ORDER BY nombre LIMIT 15"
  );
  if (agotados.length > 0 && !yaEnviada('agotados')) {
    const lista = agotados.map(i => `• ${i.nombre}`).join('\n');
    const ok = await sendMessage(numero, [
      '🚨 *Alerta Inventario — Sin Stock*',
      '',
      `Hay *${agotados.length} insumo${agotados.length !== 1 ? 's' : ''}* completamente agotado${agotados.length !== 1 ? 's' : ''}:`,
      '',
      lista,
      '',
      '📦 Ingresá a *Compras* para reponer el inventario.'
    ].join('\n'));
    if (ok) {
      marcar('agotados');
      resumen.push(`🚨 ${agotados.length} insumo(s) agotado(s)`);
      logger.info(`WA alerta: agotados (${agotados.length}) → ${numero}`);
    } else {
      logger.warn(`WA alerta agotados: sendMessage retornó false para ${numero}`);
    }
  }

  // ── 2. Insumos bajo mínimo ────────────────────────────────────────────────────
  const bajos = await query(
    `SELECT nombre, stock_actual, stock_minimo, unidad
     FROM insumos
     WHERE stock_actual > 0 AND stock_actual <= stock_minimo AND activo = 1
     ORDER BY (stock_actual / stock_minimo) ASC LIMIT 15`
  );
  if (bajos.length > 0 && !yaEnviada('stock_bajo')) {
    const lista = bajos.map(i => `• ${i.nombre}: ${i.stock_actual}/${i.stock_minimo} ${i.unidad}`).join('\n');
    const ok = await sendMessage(numero, [
      '⚠️ *Alerta Inventario — Stock Bajo*',
      '',
      `*${bajos.length} insumo${bajos.length !== 1 ? 's' : ''}* por debajo del mínimo recomendado:`,
      '',
      lista,
      '',
      'Considerá hacer una compra pronto para evitar quedarte sin materiales.'
    ].join('\n'));
    if (ok) {
      marcar('stock_bajo');
      resumen.push(`⚠️ ${bajos.length} insumo(s) bajo mínimo`);
      logger.info(`WA alerta: stock_bajo (${bajos.length}) → ${numero}`);
    } else {
      logger.warn(`WA alerta stock_bajo: sendMessage retornó false para ${numero}`);
    }
  }

  // ── 3. Cierre del día pendiente ───────────────────────────────────────────────
  // Automático: solo desde las 15:00 / Manual (force): siempre
  if (force || hora >= 15) {
    const cierre = await queryOne(
      'SELECT COUNT(*) as n FROM fondo_quincena_log WHERE fecha = ? AND cerrado = 0',
      [hoyStr]
    );
    if (parseInt(cierre.n) === 0 && !yaEnviada('cierre_pendiente')) {
      const ok = await sendMessage(numero, [
        '⏰ *Recordatorio — Fondo de Nómina*',
        '',
        `No se ha registrado el *cierre del día ${hoyStr}* aún.`,
        '',
        'Por favor ingresá los ingresos del día en el módulo *Fondo Nómina* para mantener la provisión al día.',
        '',
        '💡 Podés usar el botón _Auto-completar_ para jalarlo directo de las ventas del día.'
      ].join('\n'));
      if (ok) {
        marcar('cierre_pendiente');
        resumen.push('⏰ Cierre del día pendiente');
        logger.info(`WA alerta: cierre_pendiente → ${numero}`);
      } else {
        logger.warn(`WA alerta cierre_pendiente: sendMessage retornó false para ${numero}`);
      }
    }
  }

  return resumen;
}

// Usado por el botón manual — limpia caché del día y ejecuta con force=true
async function forzarAlertas() {
  const hoyStr = hoy();
  for (const key of [...enviadas]) {
    if (key.endsWith(`_${hoyStr}`)) enviadas.delete(key);
  }
  return checkAlertas(true);
}

async function enviarPrueba() {
  const waStatus = getStatus();
  if (waStatus.status !== 'connected') {
    throw new Error('WhatsApp no está conectado. Conectalo desde el módulo WhatsApp IA primero.');
  }
  const config = await queryOne('SELECT numero_alertas FROM config_nomina LIMIT 1');
  if (!config?.numero_alertas) {
    throw new Error('No hay número de alertas configurado. Agregalo en Configuración → Fondo Nómina.');
  }
  const numero = String(config.numero_alertas).replace(/\D/g, '');
  const ok = await sendMessage(numero, [
    '✅ *Prueba de alertas exitosa*',
    '',
    'Este es un mensaje de prueba del sistema de alertas de Floristería Alma Caribeña.',
    '',
    `🕐 Enviado: ${new Date().toLocaleString('es-CR')}`
  ].join('\n'));
  if (!ok) throw new Error('WhatsApp conectado pero no pudo enviar el mensaje. Intentá de nuevo.');
  return numero;
}

async function startAlertScheduler() {
  await ensureColumna();

  async function scheduledCheck() {
    try { await checkAlertas(false); } catch (e) { logger.error(`scheduler: ${e.message}`); }
  }

  // Cuando WA conecta (o reconecta), disparar chequeo inmediato después de 8s
  setConnectedCallback(() => {
    logger.info('WA conectado → chequeo de alertas en 8s...');
    setTimeout(scheduledCheck, 8_000);
  });

  setTimeout(scheduledCheck, 45_000);              // 45s inicial — da tiempo a WA
  setInterval(scheduledCheck, 5 * 60 * 1000);      // Cada 5 minutos
  logger.info('Alert scheduler iniciado (intervalo: 5 min, trigger: on-connect)');
}

module.exports = { startAlertScheduler, checkAlertas, forzarAlertas, enviarPrueba };
