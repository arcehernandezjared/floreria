const Anthropic = require('@anthropic-ai/sdk');
const { query, queryOne, transaction } = require('../../config/database');
const logger = require('../../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Definición de herramientas ────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'consultar_inventario',
    description: 'Consulta el stock actual de flores e insumos. Úsala cuando pregunten por stock, disponibilidad, cuánto hay de algo.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['flores', 'materiales', 'todos', 'stock_bajo'], description: 'Tipo de insumo a consultar' },
        nombre: { type: 'string', description: 'Nombre específico del insumo a buscar (opcional)' }
      }
    }
  },
  {
    name: 'buscar_arreglo',
    description: 'Busca arreglos florales en el catálogo con precio, costo y margen. Úsala cuando pregunten por precios, disponibilidad de arreglos o quieran cotizar.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre o parte del nombre del arreglo' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'registrar_merma',
    description: 'Registra una pérdida o merma de flores o materiales y descuenta del stock. Úsala cuando digan que se dañó, marchitó, se perdió o se usó internamente algún insumo.',
    input_schema: {
      type: 'object',
      properties: {
        nombre_insumo: { type: 'string', description: 'Nombre del insumo que se perdió' },
        cantidad: { type: 'number', description: 'Cantidad perdida' },
        motivo: {
          type: 'string',
          enum: ['marchita_tienda', 'danada_armar', 'defecto_proveedor', 'uso_interno'],
          description: 'marchita_tienda: se marchitó esperando venta | danada_armar: se dañó al hacer el arreglo | defecto_proveedor: llegó en mal estado | uso_interno: se usó para decoración u otro fin'
        },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' }
      },
      required: ['nombre_insumo', 'cantidad', 'motivo']
    }
  },
  {
    name: 'estado_negocio',
    description: 'Consulta el resumen general del negocio: ventas, mermas, stock crítico. Úsala cuando pregunten cómo va el negocio, las ventas del día/semana/mes, o pidan un resumen.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: ['hoy', 'ayer', 'semana', 'mes'],
          description: 'Período a consultar'
        }
      }
    }
  },
  {
    name: 'consultar_ventas',
    description: 'Consulta el historial detallado de ventas. Úsala cuando quieran ver qué se vendió, cuánto, por qué canal.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoy', 'ayer', 'semana', 'mes'] },
        canal: { type: 'string', enum: ['mostrador', 'externo', 'whatsapp', 'todos'] }
      }
    }
  },
  {
    name: 'registrar_venta',
    description: 'Registra una venta de un arreglo del catálogo. Descuenta el stock. Úsala cuando digan que vendieron algo o quieran registrar una venta desde WhatsApp.',
    input_schema: {
      type: 'object',
      properties: {
        nombre_arreglo: { type: 'string', description: 'Nombre del arreglo vendido' },
        nombre_cliente: { type: 'string', description: 'Nombre del cliente (opcional)' },
        precio_venta: { type: 'number', description: 'Precio en colones. Si no se indica, se usa el precio del catálogo.' },
        notas: { type: 'string', description: 'Notas adicionales (opcional)' }
      },
      required: ['nombre_arreglo']
    }
  },
  {
    name: 'registrar_gasto',
    description: 'Registra un gasto del negocio. Úsala cuando digan que pagaron algo, compraron algo para el negocio, o quieran anotar un gasto. Ejemplos: "pagué el agua", "compré cartón", "gasté en gasolina", "pagué la electricidad".',
    input_schema: {
      type: 'object',
      properties: {
        concepto: { type: 'string', description: 'Descripción clara del gasto. Ej: "Pago recibo de electricidad", "Compra de bolsas de regalo", "Gasolina para entrega"' },
        monto: { type: 'number', description: 'Monto en colones' },
        categoria: {
          type: 'string',
          enum: ['servicios', 'transporte', 'materiales', 'publicidad', 'planilla', 'alquiler', 'alimentacion', 'mantenimiento', 'otro'],
          description: 'servicios: agua, luz, internet, teléfono | transporte: gasolina, express, envíos | materiales: bolsas, cintas, cajas, decoración | publicidad: redes sociales, flyers | planilla: sueldos, aguinaldo, CCSS | alquiler: renta del local | alimentacion: comida del personal | mantenimiento: reparaciones | otro: cualquier otro gasto'
        },
        tipo: {
          type: 'string',
          enum: ['fijo', 'variable'],
          description: 'fijo: se paga siempre igual cada mes (alquiler, electricidad, internet) | variable: cambia cada vez (gasolina, materiales, etc)'
        },
        fecha: { type: 'string', description: 'Fecha del gasto en formato YYYY-MM-DD. Si no se indica, se usa hoy.' },
        notas: { type: 'string', description: 'Observaciones adicionales (opcional)' }
      },
      required: ['concepto', 'monto', 'categoria']
    }
  },
  {
    name: 'consultar_gastos',
    description: 'Consulta los gastos registrados del negocio. Úsala cuando pregunten cuánto se ha gastado, qué gastos hay, o pidan ver los gastos.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: { type: 'string', enum: ['hoy', 'semana', 'mes', 'mes_anterior'], description: 'Período a consultar' },
        categoria: {
          type: 'string',
          enum: ['servicios', 'transporte', 'materiales', 'publicidad', 'nomina', 'alquiler', 'alimentacion', 'mantenimiento', 'otro', 'todos'],
          description: 'Categoría específica o "todos" para ver todos'
        }
      }
    }
  },
  {
    name: 'consultar_pedidos',
    description: 'Consulta los pedidos de clientes. Úsala cuando pregunten por pedidos pendientes, órdenes de clientes, entregas pendientes.',
    input_schema: {
      type: 'object',
      properties: {
        estado: {
          type: 'string',
          enum: ['pendiente', 'listo', 'entregado', 'cancelado', 'todos'],
          description: 'Estado de los pedidos a consultar'
        }
      }
    }
  },
  {
    name: 'termometro_nomina',
    description: 'Consulta el estado del fondo de ahorro para sueldos. Úsala cuando pregunten por la nómina, el fondo de sueldos, cuánto se ha ahorrado.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'registrar_venta_personalizada',
    description: 'Registra una venta de un arreglo PERSONALIZADO que NO está en el catálogo. Úsala cuando la persona mencione ingredientes específicos (ej: "4 rosas y 2 lirios", "un arreglo con rosas y girasoles") en lugar de un nombre de catálogo. IMPORTANTE: si no dice el precio, pregúntalo antes de registrar.',
    input_schema: {
      type: 'object',
      properties: {
        ingredientes: {
          type: 'array',
          description: 'Lista de ingredientes del arreglo',
          items: {
            type: 'object',
            properties: {
              nombre_insumo: { type: 'string', description: 'Nombre del insumo tal como aparece en el sistema' },
              cantidad: { type: 'number', description: 'Cantidad a usar' }
            },
            required: ['nombre_insumo', 'cantidad']
          }
        },
        precio_venta: { type: 'number', description: 'Precio de venta en colones' },
        nombre_cliente: { type: 'string', description: 'Nombre del cliente (opcional)' },
        nombre_arreglo: { type: 'string', description: 'Nombre descriptivo del arreglo (opcional)' }
      },
      required: ['ingredientes', 'precio_venta']
    }
  }
];

// ── Ejecutar herramienta ──────────────────────────────────────────────────────
async function executeTool(name, input) {
  switch (name) {
    case 'consultar_inventario': return await consultarInventario(input);
    case 'buscar_arreglo':       return await buscarArreglo(input);
    case 'registrar_merma':      return await registrarMerma(input);
    case 'estado_negocio':       return await estadoNegocio(input);
    case 'consultar_ventas':     return await consultarVentas(input);
    case 'registrar_venta':      return await registrarVenta(input);
    case 'registrar_gasto':      return await registrarGasto(input);
    case 'consultar_gastos':     return await consultarGastos(input);
    case 'consultar_pedidos':    return await consultarPedidos(input);
    case 'termometro_nomina':             return await termometroNomina();
    case 'registrar_venta_personalizada': return await registrarVentaPersonalizada(input);
    default: return { error: 'Herramienta no reconocida' };
  }
}

// ── Implementaciones ──────────────────────────────────────────────────────────

async function consultarInventario({ tipo = 'todos', nombre }) {
  let where = '1=1';
  const params = [];
  if (tipo === 'flores')      { where += ' AND ci.tipo = "flor"'; }
  else if (tipo === 'materiales') { where += ' AND ci.tipo = "material"'; }
  else if (tipo === 'stock_bajo') { where += ' AND i.stock_actual <= i.stock_minimo'; }
  if (nombre) { where += ' AND i.nombre LIKE ?'; params.push(`%${nombre}%`); }

  const insumos = await query(
    `SELECT i.nombre, ci.tipo, i.unidad, i.stock_actual, i.stock_minimo, i.costo_unitario,
            CASE WHEN i.stock_actual <= 0 THEN 'agotado'
                 WHEN i.stock_actual <= i.stock_minimo THEN 'bajo'
                 ELSE 'ok' END as estado_stock
     FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
     WHERE i.activo = 1 AND ${where}
     ORDER BY ci.tipo, i.nombre LIMIT 20`,
    params
  );

  if (!insumos.length) return { mensaje: 'No se encontraron insumos con esos criterios.' };

  const resumen = insumos.map(i =>
    `• ${i.nombre}: ${i.stock_actual} ${i.unidad} (${i.estado_stock === 'ok' ? '✅' : i.estado_stock === 'bajo' ? '⚠️' : '🔴'})`
  ).join('\n');

  return { total: insumos.length, insumos, resumen };
}

async function buscarArreglo({ nombre }) {
  const arreglos = await query(
    `SELECT c.id, c.nombre, c.precio_venta, c.activo, c.disponible_externo,
            COALESCE(SUM(fi.cantidad * i.costo_unitario), 0) as costo_calculado
     FROM catalogo c
     LEFT JOIN ficha_ingredientes fi ON fi.catalogo_id = c.id
     LEFT JOIN insumos i ON fi.insumo_id = i.id
     WHERE c.activo = 1 AND c.nombre LIKE ?
     GROUP BY c.id LIMIT 5`,
    [`%${nombre}%`]
  );

  if (!arreglos.length) return { encontrado: false, mensaje: `No encontré arreglos con "${nombre}" en el catálogo.` };

  const lista = arreglos.map(a => {
    const margen = a.precio_venta > 0 ? (((a.precio_venta - a.costo_calculado) / a.precio_venta) * 100).toFixed(1) : 0;
    return `• *${a.nombre}*\n  Precio: ₡${Number(a.precio_venta).toLocaleString('es-CR')} | Margen: ${margen}%`;
  });

  return { encontrado: true, cantidad: arreglos.length, arreglos, resumen: lista.join('\n') };
}

async function registrarMerma({ nombre_insumo, cantidad, motivo, notas }) {
  const insumo = await queryOne(
    'SELECT i.*, ci.tipo FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id WHERE i.nombre LIKE ? AND i.activo = 1 LIMIT 1',
    [`%${nombre_insumo}%`]
  );
  if (!insumo) return { exito: false, mensaje: `No encontré el insumo "${nombre_insumo}". ¿Cómo se llama exactamente en el sistema?` };
  if (parseFloat(insumo.stock_actual) < cantidad) {
    return { exito: false, mensaje: `Stock insuficiente. Solo hay ${insumo.stock_actual} ${insumo.unidad} de ${insumo.nombre}.` };
  }

  const costo_total = parseFloat((cantidad * insumo.costo_unitario).toFixed(2));
  await query(
    'INSERT INTO mermas (insumo_id, cantidad, costo_unitario_momento, costo_total, motivo, notas) VALUES (?, ?, ?, ?, ?, ?)',
    [insumo.id, cantidad, insumo.costo_unitario, costo_total, motivo, notas || null]
  );
  await query('UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?', [cantidad, insumo.id]);

  const motivoLabels = {
    marchita_tienda: 'marchita en tienda', danada_armar: 'dañada al armar',
    defecto_proveedor: 'defecto del proveedor', uso_interno: 'uso interno'
  };
  return {
    exito: true,
    mensaje: `✅ Merma registrada: ${cantidad} ${insumo.unidad} de *${insumo.nombre}* (${motivoLabels[motivo]}). Pérdida: ₡${Number(costo_total).toLocaleString('es-CR')}`
  };
}

async function estadoNegocio({ periodo = 'hoy' }) {
  const crtz = { timeZone: 'America/Costa_Rica' };
  const hoy  = new Date().toLocaleDateString('en-CA', crtz);
  const ayer  = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', crtz);
  const inicioMes = hoy.substring(0, 8) + '01';
  const semD = new Date(Date.now() - 7 * 86400000).toLocaleDateString('en-CA', crtz);
  const desde = periodo === 'hoy' ? hoy : periodo === 'ayer' ? ayer : periodo === 'semana' ? semD : inicioMes;
  const hasta = periodo === 'ayer' ? ayer : null;

  const fechaWhere  = hasta ? 'DATE(fecha) BETWEEN ? AND ?' : 'DATE(fecha) >= ?';
  const fechaParams = hasta ? [desde, hasta] : [desde];

  const [ventas, mermas, gastos, stockBajo, pedidosPend] = await Promise.all([
    queryOne(`SELECT COUNT(*) as total, COALESCE(SUM(precio_venta),0) as ingresos, COALESCE(SUM(costo_produccion),0) as costos FROM ventas_floreria WHERE ${fechaWhere}`, fechaParams),
    queryOne(`SELECT COUNT(*) as total, COALESCE(SUM(costo_total),0) as perdida FROM mermas WHERE ${fechaWhere}`, fechaParams),
    queryOne(`SELECT COALESCE(SUM(monto),0) as total FROM gastos WHERE ${fechaWhere}`, fechaParams),
    query('SELECT nombre, stock_actual, unidad FROM insumos WHERE activo=1 AND stock_actual <= stock_minimo AND stock_actual > 0 LIMIT 5'),
    queryOne("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'pendiente'").catch(() => ({ total: 0 }))
  ]);

  const utilidad = (parseFloat(ventas.ingresos) - parseFloat(ventas.costos) - parseFloat(mermas.perdida) - parseFloat(gastos.total)).toFixed(0);
  const agotados = await query('SELECT nombre FROM insumos WHERE activo=1 AND stock_actual <= 0 LIMIT 3');

  return {
    periodo, ventas, mermas, gastos, utilidad_estimada: utilidad,
    stock_critico: stockBajo, agotados, pedidos_pendientes: pedidosPend?.total || 0,
    resumen: [
      `📊 *Resumen ${periodo}*`,
      `💰 Ventas: ${ventas.total} (₡${Number(ventas.ingresos).toLocaleString('es-CR')})`,
      `💸 Gastos: ₡${Number(gastos.total).toLocaleString('es-CR')}`,
      `🗑️ Mermas: ₡${Number(mermas.perdida).toLocaleString('es-CR')}`,
      `📈 Utilidad estimada: ₡${Number(utilidad).toLocaleString('es-CR')}`,
      pedidosPend?.total > 0 ? `📋 Pedidos pendientes: ${pedidosPend.total}` : '',
      stockBajo.length > 0 ? `⚠️ Stock bajo: ${stockBajo.map(i => i.nombre).join(', ')}` : '',
      agotados.length > 0 ? `🔴 Agotados: ${agotados.map(i => i.nombre).join(', ')}` : ''
    ].filter(Boolean).join('\n')
  };
}

async function consultarVentas({ periodo = 'hoy', canal = 'todos' }) {
  const crtz = { timeZone: 'America/Costa_Rica' };
  const hoy   = new Date().toLocaleDateString('en-CA', crtz);
  const ayer   = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', crtz);
  const inicioMes = hoy.substring(0, 8) + '01';
  const desde = periodo === 'hoy' ? hoy : periodo === 'ayer' ? ayer : periodo === 'semana' ? new Date(Date.now() - 7*86400000).toLocaleDateString('en-CA', crtz) : inicioMes;
  const hasta = periodo === 'ayer' ? ayer : null;

  let where = hasta ? 'DATE(v.fecha) BETWEEN ? AND ?' : 'DATE(v.fecha) >= ?';
  const params = hasta ? [desde, hasta] : [desde];
  if (canal !== 'todos') { where += ' AND v.canal = ?'; params.push(canal); }

  const ventas = await query(
    `SELECT v.nombre_arreglo, v.precio_venta, v.canal, v.nombre_cliente, v.notas FROM ventas_floreria v WHERE ${where} ORDER BY v.fecha DESC LIMIT 15`,
    params
  );
  const total = await queryOne(`SELECT COUNT(*) as n, COALESCE(SUM(precio_venta),0) as total FROM ventas_floreria v WHERE ${where}`, params);

  if (!ventas.length) return { mensaje: `No hay ventas registradas (${periodo}).` };

  const lista = ventas.map((v, i) =>
    `${i+1}. ${v.nombre_arreglo} — ₡${Number(v.precio_venta).toLocaleString('es-CR')}${v.nombre_cliente ? ` (${v.nombre_cliente})` : ''}${v.notas ? ` — ${v.notas}` : ''}`
  ).join('\n');

  return {
    total_ventas: total.n, total_ingresos: total.total, ventas,
    resumen: `📦 ${total.n} ventas — ₡${Number(total.total).toLocaleString('es-CR')} total\n\n${lista}`
  };
}

async function registrarGasto({ concepto, monto, categoria, tipo = 'variable', fecha, notas }) {
  const crtz = { timeZone: 'America/Costa_Rica' };
  const fechaReal = fecha || new Date().toLocaleDateString('en-CA', crtz);

  if (!concepto || !concepto.trim()) return { exito: false, mensaje: 'Necesito una descripción del gasto.' };
  if (!monto || monto <= 0)          return { exito: false, mensaje: 'El monto debe ser mayor a 0.' };

  const notasFinales = notas ? `${notas} | Registrado vía WhatsApp` : 'Registrado vía WhatsApp';

  const result = await query(
    'INSERT INTO gastos (concepto, monto, tipo, categoria, fecha, recurrente, notas) VALUES (?,?,?,?,?,?,?)',
    [concepto.trim(), monto, tipo, categoria, fechaReal, 0, notasFinales]
  );

  logger.info(`Gasto WA registrado: ${concepto} — ₡${monto} (${categoria})`);

  const catLabels = {
    servicios: 'Servicios (agua, luz, etc.)', transporte: 'Transporte',
    materiales: 'Materiales', publicidad: 'Publicidad',
    nomina: 'Nómina', alquiler: 'Alquiler', alimentacion: 'Alimentación',
    mantenimiento: 'Mantenimiento', otro: 'Otro'
  };

  return {
    exito: true, id: result.insertId,
    mensaje: `✅ Gasto registrado:\n📝 ${concepto}\n💰 ₡${Number(monto).toLocaleString('es-CR')}\n🏷️ ${catLabels[categoria] || categoria}\n📅 ${fechaReal}`
  };
}

async function consultarGastos({ periodo = 'mes', categoria = 'todos' }) {
  const crtz = { timeZone: 'America/Costa_Rica' };
  const hoy = new Date().toLocaleDateString('en-CA', crtz);
  const inicioMes = hoy.substring(0, 8) + '01';

  let desde;
  let hasta = null;
  if (periodo === 'hoy')          { desde = hoy; hasta = hoy; }
  else if (periodo === 'semana')  { desde = new Date(Date.now() - 7*86400000).toLocaleDateString('en-CA', crtz); }
  else if (periodo === 'mes')     { desde = inicioMes; }
  else if (periodo === 'mes_anterior') {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    desde = d.toLocaleDateString('en-CA', crtz).substring(0, 8) + '01';
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    hasta = fin.toLocaleDateString('en-CA', crtz);
  }

  let where = hasta ? 'fecha BETWEEN ? AND ?' : 'fecha >= ?';
  const params = hasta ? [desde, hasta] : [desde];
  if (categoria !== 'todos') { where += ' AND categoria = ?'; params.push(categoria); }

  const gastos = await query(`SELECT concepto, monto, categoria, fecha FROM gastos WHERE ${where} ORDER BY fecha DESC LIMIT 20`, params);
  const totalRow = await queryOne(`SELECT COALESCE(SUM(monto),0) as total, COUNT(*) as n FROM gastos WHERE ${where}`, params);

  if (!gastos.length) return { mensaje: `No hay gastos registrados en el período seleccionado.` };

  const lista = gastos.map(g =>
    `• ${g.concepto}: ₡${Number(g.monto).toLocaleString('es-CR')} [${g.categoria}]`
  ).join('\n');

  return {
    gastos, total: totalRow.total,
    resumen: `💸 *Gastos ${periodo}* (${totalRow.n} registros)\nTotal: ₡${Number(totalRow.total).toLocaleString('es-CR')}\n\n${lista}`
  };
}

async function consultarPedidos({ estado = 'pendiente' }) {
  let where = '1=1';
  if (estado !== 'todos') where += ` AND p.estado = '${estado}'`;

  let pedidos = [];
  try {
    pedidos = await query(
      `SELECT p.numero, p.cliente_nombre, p.cliente_telefono, p.fecha, p.hora_entrega,
              p.precio, p.adelanto, p.tipo_entrega, p.estado, p.tipo_arreglo
       FROM pedidos p WHERE ${where} ORDER BY p.fecha ASC, p.hora_entrega ASC LIMIT 10`
    );
  } catch (_) { return { mensaje: 'No hay pedidos registrados aún.' }; }

  if (!pedidos.length) return { mensaje: `No hay pedidos ${estado !== 'todos' ? `en estado "${estado}"` : ''} en este momento.` };

  const estadoEmoji = { pendiente: '🕐', listo: '✅', entregado: '📦', cancelado: '❌' };
  const lista = pedidos.map(p => {
    const saldo = (parseFloat(p.precio) - parseFloat(p.adelanto)).toFixed(0);
    const fecha = p.fecha ? new Date((typeof p.fecha === 'string' ? p.fecha : p.fecha).split('T')[0] + 'T12:00:00').toLocaleDateString('es-CR', { day: '2-digit', month: 'short' }) : '—';
    return `${estadoEmoji[p.estado] || '•'} #${p.numero} — *${p.cliente_nombre || 'Sin nombre'}*\n  📅 ${fecha}${p.hora_entrega ? ` ${p.hora_entrega}` : ''} | ₡${Number(p.precio).toLocaleString('es-CR')} (saldo: ₡${Number(saldo).toLocaleString('es-CR')})\n  ${p.tipo_arreglo || ''}`;
  }).join('\n\n');

  return {
    pedidos, total: pedidos.length,
    resumen: `📋 *${pedidos.length} pedido${pedidos.length > 1 ? 's' : ''} ${estado !== 'todos' ? estado + 's' : ''}*\n\n${lista}`
  };
}

async function termometroNomina() {
  const config = await queryOne('SELECT * FROM config_nomina LIMIT 1');
  if (!config) return { mensaje: 'No hay configuración de nómina en el sistema.' };

  const acumulado = await queryOne('SELECT COALESCE(SUM(provision_dia),0) as total FROM fondo_quincena_log WHERE cerrado = 0');
  const avance = config.meta_quincena > 0 ? ((acumulado.total / config.meta_quincena) * 100).toFixed(1) : 0;
  const estado = avance >= 100 ? '🟢 META ALCANZADA' : avance >= 75 ? '🟢 Muy bien' : avance >= 40 ? '🟡 En progreso' : '🔴 Por debajo';
  const faltante = Math.max(0, config.meta_quincena - acumulado.total);

  return {
    meta: config.meta_quincena, acumulado: acumulado.total, porcentaje: avance, estado,
    mensaje: `💰 *Fondo de sueldos*\nAhorrado: ₡${Number(acumulado.total).toLocaleString('es-CR')} de ₡${Number(config.meta_quincena).toLocaleString('es-CR')}\nAvance: ${avance}% — ${estado}\nFaltante: ₡${Number(faltante).toLocaleString('es-CR')}`
  };
}

async function registrarVentaPersonalizada({ ingredientes, precio_venta, nombre_cliente, nombre_arreglo }) {
  if (!precio_venta || precio_venta <= 0)
    return { exito: false, mensaje: '¿Cuál es el precio de venta del arreglo? Por favor indícame el precio en colones.' };
  if (!ingredientes || ingredientes.length === 0)
    return { exito: false, mensaje: 'No entendí los ingredientes del arreglo. ¿Qué flores o materiales lleva?' };

  const insumosResueltos = [];
  const noEncontrados = [];

  for (const ing of ingredientes) {
    const insumo = await queryOne(
      'SELECT * FROM insumos WHERE nombre LIKE ? AND activo = 1 LIMIT 1',
      [`%${ing.nombre_insumo}%`]
    );
    if (!insumo) {
      noEncontrados.push(ing.nombre_insumo);
    } else if (parseFloat(insumo.stock_actual) < ing.cantidad) {
      return { exito: false, mensaje: `⚠️ Stock insuficiente de *${insumo.nombre}*: hay ${insumo.stock_actual} ${insumo.unidad}, el arreglo necesita ${ing.cantidad}.` };
    } else {
      insumosResueltos.push({ ...insumo, cantidad_usar: ing.cantidad });
    }
  }

  if (noEncontrados.length > 0)
    return { exito: false, mensaje: `No encontré estos insumos: *${noEncontrados.join(', ')}*. ¿Cómo se llaman exactamente en el sistema?` };

  const costo_produccion = insumosResueltos.reduce((s, i) => s + i.cantidad_usar * parseFloat(i.costo_unitario), 0);
  const nombreArreglo = nombre_arreglo || 'Arreglo personalizado';

  await transaction(async (conn) => {
    await conn.query(
      `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, notas, nombre_cliente)
       VALUES (null,?,'whatsapp',?,?,'Arreglo personalizado vía WhatsApp',?)`,
      [nombreArreglo, precio_venta, costo_produccion, nombre_cliente || null]
    );
    for (const ins of insumosResueltos) {
      await conn.query('UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?', [ins.cantidad_usar, ins.id]);
    }
  });

  const margen = precio_venta > 0 ? (((precio_venta - costo_produccion) / precio_venta) * 100).toFixed(1) : 0;
  const listaIng = insumosResueltos.map(i => `  • ${i.cantidad_usar} ${i.unidad} de ${i.nombre}`).join('\n');
  logger.info(`VentaPersonalizada WA: ${nombreArreglo} — ₡${precio_venta}`);

  return {
    exito: true,
    mensaje: `✅ Venta registrada:\n🌺 ${nombreArreglo}\n${listaIng}\n💰 ₡${Number(precio_venta).toLocaleString('es-CR')}${nombre_cliente ? ` — ${nombre_cliente}` : ''}\nMargen: ${margen}%`
  };
}

async function registrarVenta({ nombre_arreglo, nombre_cliente, precio_venta, notas }) {
  const coincidencias = await query(
    'SELECT id, nombre, precio_venta, activo FROM catalogo WHERE nombre LIKE ? AND activo = 1 ORDER BY nombre LIMIT 5',
    [`%${nombre_arreglo}%`]
  );

  if (!coincidencias.length) {
    return { exito: false, mensaje: `No encontré arreglos con "${nombre_arreglo}" en el catálogo. ¿Cómo se llama exactamente?` };
  }
  if (coincidencias.length > 1) {
    const lista = coincidencias.map(a => `• ${a.nombre} (₡${Number(a.precio_venta).toLocaleString('es-CR')})`).join('\n');
    return { exito: false, necesita_confirmacion: true, opciones: coincidencias, mensaje: `Encontré ${coincidencias.length} arreglos. ¿Cuál es?\n${lista}` };
  }

  const arreglo = coincidencias[0];
  const ingredientes = await query(
    `SELECT fi.insumo_id, fi.cantidad, i.stock_actual, i.nombre as insumo_nombre
     FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id
     WHERE fi.catalogo_id = ?`,
    [arreglo.id]
  );

  const sinStock = ingredientes.filter(i => parseFloat(i.stock_actual) < parseFloat(i.cantidad));
  if (sinStock.length > 0) {
    const lista = sinStock.map(i => `• ${i.insumo_nombre}: necesita ${i.cantidad}, hay ${i.stock_actual}`).join('\n');
    return { exito: false, mensaje: `⚠️ No hay stock suficiente para "${arreglo.nombre}":\n${lista}` };
  }

  const costoItems = await query(
    `SELECT fi.cantidad, i.costo_unitario FROM ficha_ingredientes fi JOIN insumos i ON fi.insumo_id = i.id WHERE fi.catalogo_id = ?`,
    [arreglo.id]
  );
  const costo_produccion = costoItems.reduce((s, i) => s + parseFloat(i.cantidad) * parseFloat(i.costo_unitario), 0);
  const precio_final = precio_venta || parseFloat(arreglo.precio_venta);

  await transaction(async (conn) => {
    await conn.query(
      `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, notas, nombre_cliente) VALUES (?,?,'whatsapp',?,?,?,?)`,
      [arreglo.id, arreglo.nombre, precio_final, costo_produccion, notas || null, nombre_cliente || null]
    );
    for (const ing of ingredientes) {
      await conn.query('UPDATE insumos SET stock_actual = GREATEST(0, stock_actual - ?) WHERE id = ?', [ing.cantidad, ing.insumo_id]);
    }
  });

  const margen = precio_final > 0 ? (((precio_final - costo_produccion) / precio_final) * 100).toFixed(1) : 0;
  logger.info(`Venta WA: ${arreglo.nombre} — ₡${precio_final}`);

  return {
    exito: true,
    mensaje: `✅ Venta registrada:\n🌺 ${arreglo.nombre}\n💰 ₡${Number(precio_final).toLocaleString('es-CR')}${nombre_cliente ? ` — ${nombre_cliente}` : ''}\nMargen: ${margen}%`
  };
}

// ── Prompt del sistema ────────────────────────────────────────────────────────
function buildSystemPrompt() {
  const crtz = { timeZone: 'America/Costa_Rica' };
  const ahora = new Date();
  const fechaHoy = ahora.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...crtz });
  const horaHoy  = ahora.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', ...crtz });

  return `Eres el asistente de gestión de *Floristería Alma Caribeña*, ubicada en Siquirres, Costa Rica.
Ayudas a las dueñas y empleadas a manejar el negocio directamente por WhatsApp.
Fecha actual: ${fechaHoy} | Hora: ${horaHoy} (Costa Rica, UTC-6)
Moneda: Colones costarricenses (₡)

═══════════════════════════════
CAPACIDADES — QUÉ PUEDES HACER
═══════════════════════════════

📦 INVENTARIO
- Ver stock de flores y materiales
- Detectar qué está agotado o bajo
- Buscar un insumo específico

🌺 CATÁLOGO Y VENTAS
- Buscar arreglos, ver precios y márgenes
- Registrar ventas de arreglos del catálogo
- Registrar ventas de arreglos PERSONALIZADOS (con receta de ingredientes, aunque no estén en el catálogo)
- Ver historial de ventas (hoy, ayer, semana, mes)
- Ver estado general del negocio

🗑️ MERMAS (pérdidas)
- Registrar flores dañadas, marchitas o de uso interno
- Motivos: marchita_tienda, danada_armar, defecto_proveedor, uso_interno

💸 GASTOS
- Registrar cualquier gasto del negocio (luz, agua, transporte, materiales, etc.)
- Ver gastos del día, semana o mes
- Categorías: servicios, transporte, materiales, publicidad, nomina, alquiler, alimentacion, mantenimiento, otro

📋 PEDIDOS
- Ver pedidos pendientes y sus detalles
- Ver pedidos por estado (pendiente, listo, entregado)
- Los pedidos se registran desde la app; aquí solo puedes consultarlos

💰 NÓMINA
- Ver el fondo de ahorro para sueldos
- Ver cuánto se ha ahorrado y cuánto falta

═══════════════════════════════
CÓMO INTERPRETAR MENSAJES
═══════════════════════════════

GASTOS — ejemplos de frases y cómo procesarlas:
- "pagué el agua 8000" → concepto="Pago recibo de agua", monto=8000, categoria=servicios, tipo=fijo
- "gasté 3500 en gasolina" → concepto="Gasolina", monto=3500, categoria=transporte, tipo=variable
- "compré bolsas por 2000" → concepto="Compra de bolsas", monto=2000, categoria=materiales
- "pagué la luz 15000" → concepto="Recibo de electricidad", monto=15000, categoria=servicios, tipo=fijo
- "internet 25000" → concepto="Pago internet", monto=25000, categoria=servicios, tipo=fijo
- "almuerzo del personal 6000" → concepto="Almuerzo personal", monto=6000, categoria=alimentacion
- "reparé la refrigeradora 20000" → concepto="Reparación refrigeradora", monto=20000, categoria=mantenimiento

MERMAS — ejemplos:
- "se marchitaron 5 rosas" → merma de rosas, motivo marchita_tienda
- "se dañaron 3 lilis al armar" → merma de lirios, motivo danada_armar
- "llegaron mal 10 gerberas del proveedor" → motivo defecto_proveedor
- "usé 2 orquídeas para decorar la tienda" → motivo uso_interno

VENTAS — ejemplos:
- "vendí un ramo de rosas a María por 15000" → registrar venta
- "vendimos 2 centros de mesa hoy" → registrar venta (si hay stock)

═══════════════════════════════
REGLAS DE COMPORTAMIENTO
═══════════════════════════════

1. SIEMPRE usa las herramientas para obtener datos reales antes de responder sobre stock, ventas, gastos o pedidos. NUNCA inventes números.

2. SOLICITAR CONFIRMACIÓN antes de registrar:
   - Si el mensaje es ambiguo en el monto (ej: "pagué la luz"), pregunta el monto.
   - Si hay duda entre varias opciones (ej: varios arreglos con nombre similar), muestra las opciones.
   - Si ya tienes todo claro (concepto + monto + categoría inferida), REGISTRA DIRECTAMENTE sin preguntar confirmación extra.

3. CATEGORÍAS DE GASTO — infiere automáticamente cuando sea obvio:
   - Agua, luz, internet, teléfono → servicios
   - Gasolina, express, mensajero → transporte
   - Bolsas, cajas, cintas, papel → materiales
   - Facebook, Instagram, flyers → publicidad
   - Sueldos, salarios, CCSS → planilla
   - Renta, alquiler local → alquiler
   - Comida, almuerzo personal → alimentacion
   - Reparaciones → mantenimiento
   - Todo lo demás → otro

4. CUANDO NO ENTIENDAS algo, pide aclaración en máximo 1 pregunta.

5. SI el usuario dice algo que no puedes hacer (crear pedidos, modificar catálogo, cambiar precios), explica amablemente que eso se hace desde la app del sistema, y qué sección usar.

6. ERRORES comunes y cómo manejarlos:
   - Arreglo no encontrado → sugiere buscar con otro nombre o ver el catálogo
   - Stock insuficiente → informa qué falta y cuánto hay
   - Insumo no encontrado → pide el nombre exacto como aparece en el sistema

═══════════════════════════════
FORMATO DE RESPUESTA (WhatsApp)
═══════════════════════════════

- *negrita* con un asterisco
- Listas con • o números
- Sin tablas con |
- Emojis con moderación
- Respuestas cortas y directas

════════════════════════════════════════
MANUAL COMPLETO DEL SISTEMA
════════════════════════════════════════
(Usá esta información cuando alguien pregunta cómo funciona algo en la app)

🏠 INICIO (Dashboard)
Muestra el resumen del día al entrar: ventas de hoy, ganancia del día y del mes, pedidos pendientes, termómetro de sueldos, gráfica de ventas de 7 días, materiales que se están acabando, arreglos que ganan poco y flores más perdidas esta semana. Se actualiza cada 60 segundos o con el botón "Actualizar".

💰 HACER UNA VENTA (Punto de Venta)
1. Elegí pestaña "Arreglos" o "Flores sueltas"
2. Hacé clic en el producto para agregarlo al carrito (o escribí el código y Enter para agregar directo)
3. En el carrito: ajustá cantidades con + y -, cambiá precio de flores sueltas si necesitás
4. Llenás: nombre del cliente (opcional), email para recibo, canal (mostrador/WhatsApp/App), descuento %
5. Escribís cuánto paga el cliente → el sistema calcula el vuelto automáticamente
6. Presionás "Confirmar Venta" → se descuenta el stock automáticamente
7. Sale el recibo: podés imprimirlo o enviarlo por email
Búsqueda por código: si el arreglo tiene código (ej: ROM-01), escribilo y Enter → se agrega directo al carrito.

📋 MIS VENTAS (Registro de Ventas)
Historial de todas las ventas. Podés filtrar por fecha, buscar por arreglo o cliente. En cada fila hay botón para reimprimir el recibo o reenviarlo por email.

📦 MI INVENTARIO (Insumos)
Flores y materiales del negocio. Cada insumo tiene: nombre, código (opcional), categoría, proveedor, unidad, stock actual, stock mínimo, costo unitario, vida útil en días. Cuando el stock llega al mínimo, aparece alerta en el Dashboard. El costo se actualiza automáticamente con cada compra. Podés ajustar el stock si hay diferencia con lo físico.

🌸 MIS ARREGLOS (Catálogo)
Todos los arreglos que se venden. Cada uno tiene nombre, código (opcional para búsqueda rápida en caja), imagen, precio, margen mínimo e ingredientes (flores + cantidades). El costo se calcula solo sumando los ingredientes. Si el margen cae bajo el mínimo → alerta roja. "Recalcular costos" actualiza todo si cambiaron precios de insumos. Para eliminar: botón rojo de basurero, pide confirmación.

🗑️ PÉRDIDAS (Mermas)
Registrá flores o materiales perdidos. Motivos: marchita en tienda (se puso mala esperando), dañada al armar, defecto del proveedor (llegó mal), uso interno (para decorar la tienda). Descuenta del stock automáticamente y registra la pérdida en dinero.

🚚 PROVEEDORES
Directorio de proveedores con contacto y notas. Cada insumo puede tener un proveedor asignado.

💸 MIS GASTOS
Todos los gastos del negocio: servicios (agua/luz/internet), transporte, materiales, publicidad, planilla, alquiler, alimentación, mantenimiento u otro. Tipo fijo (siempre igual) o variable (cambia). Los gastos por WhatsApp aparecen con etiqueta verde "WA". Afectan la ganancia del mes en el Dashboard.

💵 AHORRO SUELDOS (Nómina)
Al hacer el cierre del día, el sistema aparta automáticamente un % de las ventas para el fondo de sueldos (configurás el % tú). El termómetro muestra cuánto se ha ahorrado vs la meta de la quincena. Podés ver cuánto le toca a cada empleada dividiendo el fondo entre el número de personas. "Cerrar período" se usa cuando ya se pagaron los sueldos, para empezar a ahorrar de nuevo.

🛒 COMPRAS
Registrá compras a proveedores. Al guardar, el stock se actualiza automáticamente (se suma) y queda como "Recibida" de una vez. Si el costo cambió, se actualiza el costo unitario del insumo.

📝 PEDIDOS
Para pedidos de clientes que se entregan después. Tiene todos los campos del facturero físico del negocio: cliente, teléfono, hora de entrega, dirección, arreglos del catálogo, flores sueltas, precio/adelanto/saldo, tipo de pago, tipo de entrega, dedicatoria y observaciones. Número correlativo automático (0000001, 0000002...). Estados: Pendiente → Listo → Entregado → Cancelado. Al marcar "Entregado" se registra como venta automáticamente. El botón imprimir genera un PDF idéntico al facturero físico.

📝 PRESUPUESTOS (Cotizaciones)
Para eventos (bodas, quinceaños, etc.). Agregás artículos con descripción, cantidad y precio. Podés aplicar descuento. Se puede enviar por email con logo y diseño profesional. Estados: borrador → enviada → aceptada → rechazada.

💬 WHATSAPP (el asistente)
Para conectar: escaneá el QR con el celular. Los mensajes de clientes se responden automáticamente con IA. También podés usarlo internamente para registrar gastos, mermas, consultar stock o ventas sin abrir la app.

📊 REPORTES
Cuatro tipos: Ventas, Inventario, Mermas, Financiero. Períodos: este mes, mes anterior, 30/90 días, este año, personalizado. Exportá en PDF o Excel. Las gráficas de ventas y financiero muestran la tendencia por día.

✅ CIERRE DEL DÍA
Obligatorio si hubo ventas ese día (si no lo hacés, el sistema bloquea la app al día siguiente hasta completarlo). Registra ventas, gastos, mermas, costos y utilidad del día. Al hacerlo, se aparta automáticamente el % configurado para el fondo de sueldos. Podés ingresar cuánto hay en caja y el sistema muestra la diferencia. Historial filtrable por mes o rango de fechas. Si un día no tuvo ventas, el cierre es opcional.`;
}

// ── Procesar mensaje ──────────────────────────────────────────────────────────
async function processMessage(mensaje, historial = []) {
  try {
    const messages = [
      ...historial.slice(-8).filter(m => m?.content?.trim()),
      { role: 'user', content: mensaje }
    ];

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages
    });

    // Agotar ciclos de herramientas
    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];
      for (const toolUse of toolUses) {
        logger.info(`WA tool: ${toolUse.name} ${JSON.stringify(toolUse.input)}`);
        const result = await executeTool(toolUse.name, toolUse.input);
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages
      });
    }

    const text = response.content.find(b => b.type === 'text');
    return text?.text || 'No pude procesar tu solicitud.';
  } catch (error) {
    logger.error(`agentService error: ${error.message}`);
    if (error.message?.includes('API')) return '⚠️ Error temporal con la IA. Intentá de nuevo en un momento.';
    return `Error: ${error.message}`;
  }
}

module.exports = { processMessage };
