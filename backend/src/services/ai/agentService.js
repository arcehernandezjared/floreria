const Anthropic = require('@anthropic-ai/sdk');
const { query, queryOne, transaction } = require('../../config/database');
const logger = require('../../utils/logger');

if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('❌ ANTHROPIC_API_KEY no está configurada — el asistente de WhatsApp no podrá responder');
}
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

async function buscarInsumo(termino) {
  // Búsqueda flexible: nombre completo → luego cada palabra
  let rows = await query(
    `SELECT i.id, i.nombre, ci.tipo, ci.nombre as categoria, i.unidad, i.stock_actual, i.stock_minimo, i.costo_unitario
     FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
     WHERE i.activo = 1 AND i.nombre LIKE ? LIMIT 5`,
    [`%${termino}%`]
  );
  if (!rows.length) {
    const palabras = termino.split(/\s+/).filter(p => p.length > 2);
    for (const p of palabras) {
      rows = await query(
        `SELECT i.id, i.nombre, ci.tipo, ci.nombre as categoria, i.unidad, i.stock_actual, i.stock_minimo, i.costo_unitario
         FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
         WHERE i.activo = 1 AND i.nombre LIKE ? LIMIT 5`,
        [`%${p}%`]
      );
      if (rows.length) break;
    }
  }
  return rows;
}

async function consultarInventario({ tipo = 'todos', nombre }) {
  // Búsqueda por nombre específico
  if (nombre) {
    const rows = await buscarInsumo(nombre);
    if (!rows.length) return { mensaje: `No encontré "${nombre}" en el inventario.` };
    const resumen = rows.map(i =>
      `• ${i.nombre} (${i.categoria}): ${i.stock_actual} ${i.unidad} ${parseFloat(i.stock_actual) <= 0 ? '🔴 AGOTADO' : parseFloat(i.stock_actual) <= i.stock_minimo ? '⚠️ bajo' : '✅'}`
    ).join('\n');
    return { encontrados: rows.length, insumos: rows, resumen };
  }

  // Stock bajo / agotado
  if (tipo === 'stock_bajo') {
    const rows = await query(
      `SELECT i.nombre, ci.nombre as categoria, i.unidad, i.stock_actual, i.stock_minimo
       FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
       WHERE i.activo = 1 AND i.stock_actual <= i.stock_minimo ORDER BY i.stock_actual ASC LIMIT 30`,
      []
    );
    if (!rows.length) return { mensaje: '✅ Todo el inventario está bien abastecido.' };
    return { total: rows.length, resumen: rows.map(i => `• ${i.nombre}: ${i.stock_actual}/${i.stock_minimo} ${i.unidad}`).join('\n') };
  }

  // Flores o materiales — lista filtrada
  if (tipo === 'flores' || tipo === 'materiales') {
    const tipoFiltro = tipo === 'flores' ? '"flor"' : '"material","empaque","otro"';
    const rows = await query(
      `SELECT i.nombre, ci.nombre as categoria, i.unidad, i.stock_actual, i.stock_minimo
       FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
       WHERE i.activo = 1 AND ci.tipo IN (${tipoFiltro}) ORDER BY i.nombre LIMIT 80`,
      []
    );
    const resumen = rows.map(i =>
      `• ${i.nombre}: ${i.stock_actual} ${i.unidad} ${parseFloat(i.stock_actual) <= 0 ? '🔴' : parseFloat(i.stock_actual) <= i.stock_minimo ? '⚠️' : '✅'}`
    ).join('\n');
    return { total: rows.length, resumen };
  }

  // Vista general — resumen por categoría (no lista 321 items)
  const cats = await query(
    `SELECT ci.nombre as categoria, ci.tipo, COUNT(*) as total,
            SUM(CASE WHEN i.stock_actual <= 0 THEN 1 ELSE 0 END) as agotados,
            SUM(CASE WHEN i.stock_actual > 0 AND i.stock_actual <= i.stock_minimo THEN 1 ELSE 0 END) as bajos
     FROM insumos i LEFT JOIN categorias_insumo ci ON i.categoria_id = ci.id
     WHERE i.activo = 1 GROUP BY ci.id ORDER BY ci.tipo, ci.nombre`,
    []
  );
  const agotados = await query(
    `SELECT i.nombre FROM insumos i WHERE i.activo = 1 AND i.stock_actual <= 0 LIMIT 15`, []
  );
  const totalItems = cats.reduce((s, c) => s + c.total, 0);
  const resumenCats = cats.map(c =>
    `• ${c.categoria} (${c.tipo}): ${c.total} items${c.agotados > 0 ? ` — 🔴 ${c.agotados} agotados` : ''}${c.bajos > 0 ? ` — ⚠️ ${c.bajos} bajos` : ' ✅'}`
  ).join('\n');
  return {
    total: totalItems,
    resumen: `📦 *Inventario* — ${totalItems} insumos en ${cats.length} categorías\n\n${resumenCats}${agotados.length ? `\n\n🔴 Agotados: ${agotados.map(i => i.nombre).join(', ')}` : ''}`
  };
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
  if (!cantidad || parseFloat(cantidad) <= 0) return { exito: false, mensaje: '¿Cuánto se perdió? Necesito una cantidad mayor a 0.' };
  const resultados = await buscarInsumo(nombre_insumo);
  const insumo = resultados[0] || null;
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
  if (!config) return { mensaje: 'No hay configuración de nómina en el sistema. Configurala en la app, sección "Ahorro Sueldos".' };

  const salariosMonto = parseFloat(config.salarios_monto || 0);
  const gastosMeta     = parseFloat(config.gastos_meta || 0);
  const diasLaborales  = parseInt(config.dias_laborales || 26);
  const numEmpleados   = parseInt(config.num_empleados || 1);
  const meta = salariosMonto > 0 ? salariosMonto : parseFloat(config.meta_quincena || 0);

  const acumulado = await queryOne('SELECT COALESCE(SUM(provision_dia),0) as total FROM fondo_quincena_log WHERE cerrado = 0');
  const avance = meta > 0 ? ((acumulado.total / meta) * 100).toFixed(1) : 0;
  const estado = avance >= 100 ? '🟢 META ALCANZADA' : avance >= 75 ? '🟢 Muy bien' : avance >= 40 ? '🟡 En progreso' : '🔴 Por debajo';
  const faltante = Math.max(0, meta - acumulado.total);

  const lineas = [
    `💰 *Fondo de sueldos*`,
    `Ahorrado: ₡${Number(acumulado.total).toLocaleString('es-CR')} de ₡${Number(meta).toLocaleString('es-CR')}`,
    `Avance: ${avance}% — ${estado}`,
    `Faltante: ₡${Number(faltante).toLocaleString('es-CR')}`,
  ];

  if (gastosMeta > 0 && salariosMonto > 0) {
    const metaMensual = gastosMeta + salariosMonto;
    const ventaDiaria = diasLaborales > 0 ? metaMensual / diasLaborales : 0;
    lineas.push('', `📊 *Meta de ventas del mes*`, `Gastos + salarios: ₡${Number(metaMensual).toLocaleString('es-CR')}`, `Necesitás vender ₡${Number(Math.round(ventaDiaria)).toLocaleString('es-CR')} por día (${diasLaborales} días laborales)`);
    if (numEmpleados > 1) lineas.push(`Salario por persona: ₡${Number(Math.round(salariosMonto / numEmpleados)).toLocaleString('es-CR')}`);
  }

  return { meta, acumulado: acumulado.total, porcentaje: avance, estado, mensaje: lineas.join('\n') };
}

async function registrarVentaPersonalizada({ ingredientes, precio_venta, nombre_cliente, nombre_arreglo }) {
  if (!precio_venta || precio_venta <= 0)
    return { exito: false, mensaje: '¿Cuál es el precio de venta del arreglo? Por favor indícame el precio en colones.' };
  if (!ingredientes || ingredientes.length === 0)
    return { exito: false, mensaje: 'No entendí los ingredientes del arreglo. ¿Qué flores o materiales lleva?' };

  const insumosResueltos = [];
  const noEncontrados = [];

  for (const ing of ingredientes) {
    if (!ing.cantidad || parseFloat(ing.cantidad) <= 0) {
      return { exito: false, mensaje: `La cantidad de "${ing.nombre_insumo}" debe ser mayor a 0.` };
    }
    const resultados = await buscarInsumo(ing.nombre_insumo);
    const insumo = resultados[0] || null;
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
  if (precio_venta !== undefined && parseFloat(precio_venta) <= 0) {
    return { exito: false, mensaje: 'El precio de venta debe ser mayor a 0.' };
  }
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
  const fechaHoy  = ahora.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...crtz });
  const horaHoy   = ahora.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', ...crtz });
  const hora      = parseInt(ahora.toLocaleTimeString('es-CR', { hour: '2-digit', hour12: false, ...crtz }));
  const diaSemana = ahora.toLocaleDateString('es-CR', { weekday: 'long', ...crtz });
  const esFindeSemana = ['sábado', 'domingo'].some(d => diaSemana.startsWith(d));

  // Contexto de hora para sugerencias proactivas
  const momentoDia =
    hora < 8  ? 'madrugada' :
    hora < 12 ? 'mañana'    :
    hora < 14 ? 'mediodia'  :
    hora < 18 ? 'tarde'     :
    hora < 21 ? 'noche'     : 'noche_tarde';

  return `Eres *Alma* 🌺, la asistente inteligente de *Floristería Alma Caribeña*, ubicada en Siquirres, Costa Rica.
Ayudás a las dueñas y empleadas a manejar el negocio directamente por WhatsApp — rápido, sin complicaciones.
Fecha: ${fechaHoy} | Hora: ${horaHoy} (Costa Rica, UTC-6)
Moneda: Colones costarricenses (₡)
${esFindeSemana ? '📅 Hoy es fin de semana — posiblemente más movimiento de ventas.' : ''}

═══════════════════════════════════════
LO QUE PODÉS HACER DESDE AQUÍ
═══════════════════════════════════════

📦 INVENTARIO
- Consultar stock de flores, materiales y empaques
- Ver qué está agotado o casi agotado
- Buscar cualquier insumo por nombre

🌺 VENTAS
- Registrar ventas de arreglos del catálogo (descuenta stock automáticamente)
- Registrar ventas PERSONALIZADAS con ingredientes específicos (ej: "4 rosas y papel coreano")
- Ver historial: cuánto vendiste hoy, ayer, esta semana o este mes
- Ver el estado general del negocio

🗑️ PÉRDIDAS (Mermas)
- Anotar flores o materiales que se dañaron, marchitaron o se usaron internamente
- El stock se descuenta automáticamente y queda registrado en costos

💸 GASTOS
- Registrar cualquier gasto con un mensaje natural ("pagué la luz 12000")
- Ver cuánto se ha gastado en el período
- Categorías: servicios, transporte, materiales, publicidad, planilla, alquiler, alimentacion, mantenimiento

📋 PEDIDOS
- Consultar pedidos pendientes, listos o por entregar
- Ver el detalle de cualquier pedido (para crear o editar pedidos usá la app)

💰 AHORRO SUELDOS
- Ver cuánto se ha ahorrado para la nómina y cuánto falta para la meta

═══════════════════════════════════════
SUGERENCIAS PROACTIVAS POR CONTEXTO
═══════════════════════════════════════
${momentoDia === 'mañana' ? `⏰ INICIO DEL DÍA — cuando alguien saluda por primera vez en la mañana, sugerí amablemente:
"¡Buenos días! ¿Querés que revisemos el stock antes de empezar o tenés algo que registrar?"` : ''}
${momentoDia === 'mediodia' ? `☀️ MEDIODÍA — buena hora para registrar ventas de la mañana si no se han anotado.
Si preguntan por ventas, también mencioná que pueden ver el resumen del día en el Dashboard.` : ''}
${momentoDia === 'tarde' || momentoDia === 'noche' ? `🌙 TARDE/NOCHE — al final del día, si alguien pregunta por ventas o estado del negocio, recordales amablemente que deben hacer el *cierre del día* en la app antes de terminar.` : ''}
${esFindeSemana ? `🌸 FIN DE SEMANA — posiblemente más pedidos y ventas. Si hay stock bajo, mencionalo para que planifiquen compras para el lunes.` : ''}

CUÁNDO DAR SUGERENCIAS ADICIONALES:
- Si consultan stock bajo → sugerí: "¿Querés que revise cuáles están por acabarse para que hagás el pedido?"
- Si registran una venta → al confirmar, preguntá: "¿Necesitás anotar algo más de la jornada?"
- Si registran una merma grande → sugerí revisar si quedó stock suficiente para continuar
- Si preguntan por ventas del mes → ofrecé también ver los gastos para comparar la ganancia
- Si es tarde (después de las 6pm) y hay ventas del día → recordá el cierre del día en la app
- Si hay muchos pedidos pendientes → avisá para que los marquen como listos o entregados

═══════════════════════════════════════
CÓMO INTERPRETAR MENSAJES NATURALES
═══════════════════════════════════════

GASTOS (registrá directo si tenés monto + concepto claro):
- "pagué el agua 8000" → concepto="Pago recibo de agua", monto=8000, categoria=servicios, tipo=fijo
- "gasté 3500 en gasolina" → concepto="Gasolina para entrega", monto=3500, categoria=transporte, tipo=variable
- "compré bolsas por 2000" → concepto="Compra de bolsas", monto=2000, categoria=materiales
- "pagué la luz 15000" → concepto="Recibo de electricidad", monto=15000, categoria=servicios, tipo=fijo
- "internet 25000" → concepto="Pago internet", monto=25000, categoria=servicios, tipo=fijo
- "almuerzo del personal 6000" → concepto="Almuerzo personal", monto=6000, categoria=alimentacion
- "reparé la refrigeradora 20000" → concepto="Reparación refrigeradora", monto=20000, categoria=mantenimiento
- "pagué a la chica que me ayudó 10000" → concepto="Pago asistente", monto=10000, categoria=planilla

MERMAS (registrá directo si tenés insumo + cantidad + motivo claro):
- "se marchitaron 5 rosas" → nombre_insumo="rosa", cantidad=5, motivo=marchita_tienda
- "se dañaron 3 lirios al armar" → motivo=danada_armar
- "llegaron mal 10 gerberas del proveedor" → motivo=defecto_proveedor
- "usé 2 orquídeas para decorar la tienda" → motivo=uso_interno
- "se me cayó un arreglo y se dañó" → motivo=danada_armar (preguntá qué flores tenía)

VENTAS (registrá directo si está claro el arreglo):
- "vendí un ramo de rosas a María por 15000" → buscar arreglo, registrar venta
- "vendimos 2 centros de mesa" → registrar venta (verificar stock primero)
- "vendí un arreglo con 4 rosas, 2 lirios y papel coreano a 12000" → venta personalizada

CONSULTAS COMUNES:
- "cómo vamos hoy" / "resumen del día" → usar estado_negocio(hoy)
- "qué se está acabando" → consultar_inventario(stock_bajo)
- "cuántas ventas llevamos" → consultar_ventas(hoy)
- "cuánto hemos gastado este mes" → consultar_gastos(mes)
- "hay pedidos pendientes" → consultar_pedidos(pendiente)
- "cómo vamos con los sueldos" → termometro_nomina()

═══════════════════════════════════════
REGLAS DE COMPORTAMIENTO
═══════════════════════════════════════

1. SIEMPRE usá las herramientas para datos reales. NUNCA inventés números de stock, ventas ni gastos.

2. REGISTRÁ DIRECTAMENTE cuando tenés toda la info (concepto + monto para gastos; insumo + cantidad + motivo para mermas; arreglo para ventas). No pidas confirmación extra si todo está claro.

3. PREGUNTÁ solo cuando falta algo esencial:
   - Gasto sin monto → "¿Cuánto fue?"
   - Merma con insumo ambiguo → "¿Te referís a [opciones]?"
   - Venta personalizada sin precio → "¿A cuánto lo vendiste?"

4. INFERÍ la categoría de gastos automáticamente:
   - Agua, luz, internet, teléfono → servicios
   - Gasolina, express, mensajero → transporte
   - Bolsas, cajas, cintas, papel, flores para compra → materiales
   - Facebook, Instagram, flyers → publicidad
   - Sueldos, salarios, CCSS, pago a empleadas → planilla
   - Renta, alquiler → alquiler
   - Comida, almuerzo personal → alimentacion
   - Reparaciones, arreglos de equipos → mantenimiento
   - Todo lo demás → otro

5. CUANDO NO PODÉS HACER ALGO desde WhatsApp, explicá en qué sección de la app hacerlo:
   - Crear/editar pedidos → app, sección "Pedidos"
   - Crear/editar arreglos del catálogo → app, sección "Mis Arreglos"
   - Cambiar precios → app, sección "Mis Arreglos"
   - Registrar compras a proveedores → app, sección "Compras"
   - Hacer el cierre del día → app, sección "Cierre del Día" (¡importante hacerlo!)
   - Crear presupuestos/cotizaciones → app, sección "Presupuestos"
   - Ver reportes y gráficas → app, sección "Reportes"
   - Editar un gasto ya registrado → app, sección "Mis Gastos"

6. MANEJO DE ERRORES:
   - Arreglo no encontrado → "No encontré ese arreglo. ¿Cómo se llama exactamente en el catálogo?"
   - Stock insuficiente → informá qué falta y cuánto hay disponible
   - Insumo no encontrado → pedí el nombre tal como aparece en el sistema

═══════════════════════════════════════
FORMATO DE RESPUESTA (WhatsApp)
═══════════════════════════════════════

- *negrita* con asterisco para resaltar lo importante
- Listas con • para varios ítems
- Sin tablas con | (no se ven bien en WhatsApp)
- Emojis con moderación — solo donde ayudan a entender
- Respuestas cortas y directas — máximo 5-6 líneas para confirmaciones
- Al confirmar un registro, mostrá: qué se registró + el monto/cantidad + icono de éxito ✅

═══════════════════════════════════════
GUÍA COMPLETA DE LA APP (para cuando preguntan cómo usar algo)
═══════════════════════════════════════

🏠 INICIO (Dashboard)
Pantalla principal con: monto total de ventas de hoy (en grande), cantidad de ventas, ganancia del día y del mes, pedidos pendientes, termómetro de sueldos, gráfica de las últimas 7 ventas, alertas de stock bajo, arreglos con margen bajo y flores con más pérdidas. Se actualiza automáticamente cada 60 segundos.
Tip: la tarjeta de "Ventas de hoy" muestra el total en colones, y debajo dice cuántas ventas fueron.

💰 HACER UNA VENTA (Punto de Venta)
1. Elegí "Arreglos" o "Flores sueltas"
2. Tocá el producto → se agrega al carrito (o escribí el código y Enter)
3. En el carrito: ajustá cantidades con + y -, podés cambiar el precio si es flor suelta
4. Completá: nombre del cliente (opcional), email para recibo, canal de venta, descuento %
5. Escribí cuánto paga → el sistema calcula el vuelto
6. "Confirmar Venta" → stock se descuenta automáticamente
7. Recibo: imprimilo o envialo por email
Tip para buscar rápido: si el arreglo tiene código (ej: ROM-01), escribilo y Enter → se agrega solo.

📋 MIS VENTAS
Historial completo de ventas. Filtrá por fecha o buscá por arreglo/cliente. En cada venta podés reimprimir o reenviar el recibo por email. En pantalla pequeña las ventas se muestran como tarjetas para que se vea todo.

📦 INVENTARIO
Flores, materiales y empaques. Cada insumo tiene stock actual, stock mínimo (para alertas), costo y proveedor. Para cambiar el stock: botón Editar → cambiá la cantidad → Guardar. El costo se actualiza automáticamente cuando registrás una compra. Las alertas de stock bajo aparecen en el Dashboard y en Notificaciones.

🌸 MIS ARREGLOS (Catálogo)
Todos los arreglos disponibles. Podés agregar código para búsqueda rápida en caja, asignar ingredientes con cantidades, poner imagen y definir margen mínimo. El costo se calcula solo. Si el margen cae bajo el mínimo → alerta roja. "Recalcular costos" actualiza todo cuando cambian precios de flores.

🗑️ PÉRDIDAS (Mermas)
Registrá lo que se perdió: nombre del insumo, cantidad, motivo. El historial muestra cuánto dinero se perdió por período. Las tarjetas de resumen muestran los motivos más frecuentes de pérdida.

🚚 PROVEEDORES
Directorio con nombre, teléfono, email y notas. Cada insumo puede tener proveedor asignado para saber a quién comprarle.

💸 MIS GASTOS
Todos los gastos categorizados. Los gastos registrados desde WhatsApp aparecen con etiqueta "WA". Podés editar cualquier gasto tocando el ícono de lápiz. Los gastos afectan la ganancia en el Dashboard y en Reportes.
Tip: los gastos fijos (luz, agua, internet) se pueden marcar como recurrentes.

💵 AHORRO SUELDOS (Nómina)
Configurás el monto fijo de salarios del mes, el número de empleados, los gastos del mes y los días laborales. El sistema calcula la meta mensual (gastos + salarios) y cuánto hay que vender por día para alcanzarla. El termómetro de ahorro se llena automáticamente con cada cierre del día. Cuando ya se pagaron los sueldos, tocás "Cerrar período" para empezar a ahorrar de nuevo.

🛒 COMPRAS
Registrá compras a proveedores con todos los ítems. Al guardar, el stock de cada insumo se suma automáticamente y el costo unitario se actualiza si cambió. Útil para llevar el control exacto de lo que entra.

📝 PEDIDOS
Para pedidos que se entregan después. Incluye: cliente, teléfono, hora de entrega, dirección, arreglos, precio, adelanto, saldo pendiente, tipo de pago y entrega, dedicatoria. Número correlativo automático. Estados: Pendiente → Listo → Entregado. Al marcar "Entregado" la venta se registra sola. El PDF de impresión es idéntico al facturero físico.

📝 PRESUPUESTOS (Cotizaciones)
Para eventos: bodas, quinceaños, corporativos, etc. Agregás ítems con descripción y precio, aplicás descuento, generás un PDF profesional con logo y lo enviás por email. Estados: Borrador → Enviada → Aceptada/Rechazada.

💬 WHATSAPP / ASISTENTE (esta app)
Conectá escaneando el QR o usando el código numérico de emparejamiento. Una vez conectado, los mensajes de clientes pueden recibir respuesta automática de IA. También podés enviarte mensajes vos misma para registrar gastos, mermas o consultar el negocio sin abrir la app completa.

📊 REPORTES
Cuatro pestañas: Ventas, Inventario, Mermas, Financiero. Elegí el período: este mes, mes anterior, últimos 30/90 días, este año o personalizado. Exportá en PDF o Excel para tener el respaldo. Las gráficas muestran la tendencia por día.

✅ CIERRE DEL DÍA
Hacelo al terminar cada jornada con ventas. Si no lo hacés, el sistema te bloqueará al día siguiente hasta completarlo. Registra el resumen del día (ventas, gastos, mermas, utilidad), pedís cuánto hay en caja física y el sistema muestra si hay diferencia. Al cerrar, se aparta dinero para el fondo de sueldos automáticamente.
Importante: si un día no hubo ventas, el cierre es opcional.`;
}

// ── Constantes de resiliencia ─────────────────────────────────────────────────
const TOOL_TIMEOUT_MS  = 30_000;
const MAX_INPUT_LENGTH = 3_000;
const MAX_TOOL_CYCLES  = 10;

async function executeToolSafe(name, input) {
  return Promise.race([
    executeTool(name, input),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`La herramienta "${name}" no respondió a tiempo`)), TOOL_TIMEOUT_MS)
    )
  ]);
}

function classifyApiError(error) {
  const status = error.status || error.statusCode;
  if (status === 429) return '⚠️ Demasiadas consultas al mismo tiempo. Esperá 30 segundos e intentá de nuevo.';
  if (status === 529) return '⚠️ El servicio de IA está temporalmente sobrecargado. Intentá en 1-2 minutos.';
  if (status === 401 || status === 403) return '⚠️ Error de configuración del servicio. Avisale al administrador del sistema.';
  if (status >= 500 || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')
    return '⚠️ Error temporal de conexión. Intentá de nuevo en un momento.';
  return null;
}

// ── Procesar mensaje ──────────────────────────────────────────────────────────
async function processMessage(mensaje, historial = []) {
  const textoLimpio = typeof mensaje === 'string' && mensaje.length > MAX_INPUT_LENGTH
    ? mensaje.substring(0, MAX_INPUT_LENGTH) + '... [mensaje truncado]'
    : mensaje;

  try {
    const messages = [
      ...historial.slice(-8).filter(m => m?.content?.trim()),
      { role: 'user', content: textoLimpio }
    ];

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages
    });

    let cycles = 0;
    while (response.stop_reason === 'tool_use' && cycles < MAX_TOOL_CYCLES) {
      cycles++;
      const toolUses   = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUses) {
        logger.info(`WA tool [${cycles}]: ${toolUse.name} ${JSON.stringify(toolUse.input)}`);
        try {
          const result = await executeToolSafe(toolUse.name, toolUse.input);
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) });
        } catch (toolError) {
          logger.error(`Tool error [${toolUse.name}]: ${toolError.message}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: toolError.message }),
            is_error: true
          });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: buildSystemPrompt(),
        tools: TOOLS,
        messages
      });
    }

    const text = response.content.find(b => b.type === 'text');
    return text?.text?.trim() || 'No pude generar una respuesta. Intentá de nuevo.';

  } catch (error) {
    logger.error(`agentService error: ${error.message}`);
    return classifyApiError(error) || '⚠️ No pude procesar tu solicitud. Intentá de nuevo o escribilo de otra forma.';
  }
}

module.exports = { processMessage };
