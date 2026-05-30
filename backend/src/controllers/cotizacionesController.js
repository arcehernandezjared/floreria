const { query, queryOne } = require('../config/database');
const logger = require('../utils/logger');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

function getLogoPath() {
  const candidates = [
    '../../uploads/almacaribe.png',
    '../../uploads/logo.png',
    '../../uploads/logo.jpg',
  ];
  for (const rel of candidates) {
    try {
      const p = path.join(__dirname, rel);
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

// ── Número correlativo ────────────────────────────────────────────────────────
async function generarNumero() {
  const year = new Date().getFullYear();
  const last = await queryOne(
    "SELECT numero FROM cotizaciones WHERE numero LIKE ? ORDER BY id DESC LIMIT 1",
    [`COT-${year}-%`]
  );
  if (!last) return `COT-${year}-001`;
  const n = parseInt(last.numero.split('-')[2]) + 1;
  return `COT-${year}-${String(n).padStart(3, '0')}`;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
async function getCotizaciones(req, res) {
  try {
    const rows = await query('SELECT * FROM cotizaciones ORDER BY created_at DESC LIMIT 200');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function getCotizacion(req, res) {
  try {
    const row = await queryOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ success: false, message: 'No encontrada' });
    if (row.items && typeof row.items === 'string') row.items = JSON.parse(row.items);
    res.json({ success: true, data: row });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function createCotizacion(req, res) {
  try {
    const {
      cliente_nombre, cliente_email, cliente_telefono,
      tipo_evento, fecha_evento, validez_dias,
      items = [], notas, terminos, descuento_pct = 0
    } = req.body;

    if (!cliente_nombre) return res.status(400).json({ success: false, message: 'Nombre del cliente requerido' });

    const numero = await generarNumero();
    const subtotal = items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
    const total = subtotal * (1 - parseFloat(descuento_pct) / 100);

    const result = await query(
      `INSERT INTO cotizaciones
        (numero, cliente_nombre, cliente_email, cliente_telefono, tipo_evento, fecha_evento,
         validez_dias, items, notas, terminos, subtotal, descuento_pct, total)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [numero, cliente_nombre, cliente_email || null, cliente_telefono || null,
       tipo_evento || null, fecha_evento || null, validez_dias || 15,
       JSON.stringify(items), notas || null, terminos || null,
       subtotal, descuento_pct, total]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, numero } });
  } catch (e) {
    logger.error(`createCotizacion: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

async function updateCotizacion(req, res) {
  try {
    const { id } = req.params;
    const {
      cliente_nombre, cliente_email, cliente_telefono,
      tipo_evento, fecha_evento, validez_dias,
      items = [], notas, terminos, descuento_pct = 0, estado
    } = req.body;

    const subtotal = items.reduce((s, i) => s + parseFloat(i.subtotal || 0), 0);
    const total = subtotal * (1 - parseFloat(descuento_pct) / 100);

    await query(
      `UPDATE cotizaciones SET
        cliente_nombre=?, cliente_email=?, cliente_telefono=?,
        tipo_evento=?, fecha_evento=?, validez_dias=?,
        items=?, notas=?, terminos=?, subtotal=?, descuento_pct=?, total=?,
        estado=COALESCE(?,estado)
       WHERE id=?`,
      [cliente_nombre, cliente_email || null, cliente_telefono || null,
       tipo_evento || null, fecha_evento || null, validez_dias || 15,
       JSON.stringify(items), notas || null, terminos || null,
       subtotal, descuento_pct, total, estado || null, id]
    );

    res.json({ success: true, message: 'Cotización actualizada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

async function deleteCotizacion(req, res) {
  try {
    await query('DELETE FROM cotizaciones WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Cotización eliminada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// ── Email ─────────────────────────────────────────────────────────────────────
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });
}

function buildEmailHTML(cot, hasLogo = false) {
  const items = Array.isArray(cot.items) ? cot.items : JSON.parse(cot.items || '[]');
  const descuento = parseFloat(cot.descuento_pct || 0);
  const validezDate = new Date();
  validezDate.setDate(validezDate.getDate() + (cot.validez_dias || 15));
  const validezStr = validezDate.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fechaEvento = cot.fecha_evento
    ? new Date(cot.fecha_evento).toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;
  const filas = items.map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #FFE0EC;color:#333">${i.descripcion}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #FFE0EC;text-align:center;color:#555">${i.cantidad}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #FFE0EC;text-align:right;color:#555">₡${Number(i.precio_unitario).toLocaleString('es-CR')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #FFE0EC;text-align:right;font-weight:600;color:#D4006E">₡${Number(i.subtotal).toLocaleString('es-CR')}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFF0F5;font-family:Georgia,serif">
  <div style="max-width:680px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(212,0,110,.15)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#D4006E 0%,#F07525 100%);padding:36px 40px 30px;text-align:center">
      ${hasLogo
        ? `<img src="cid:logo@alma" alt="Floristería Alma Caribeña" style="height:100px;max-width:280px;object-fit:contain;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto">`
        : `<div style="font-size:30px;margin-bottom:6px">🌺</div>
           <h1 style="color:#fff;margin:0;font-size:26px;font-weight:700;letter-spacing:1px">Floristería Alma Caribeña</h1>
           <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:14px">Flores con alma · Alma Caribeña</p>`
      }
    </div>

    <!-- Número cotización -->
    <div style="background:#FFF5F8;padding:20px 40px;border-bottom:1px solid #FFE0EC">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td>
          <p style="margin:0;font-size:12px;color:#D4006E;font-weight:700;text-transform:uppercase;letter-spacing:1px">Cotización</p>
          <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#8B0040">${cot.numero}</p>
        </td>
        <td style="text-align:right">
          <p style="margin:0;font-size:12px;color:#6b7280">Válida hasta</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#1A8A7A">${validezStr}</p>
        </td>
      </tr></table>
    </div>

    <!-- Info cliente + evento -->
    <div style="padding:28px 40px;border-bottom:1px solid #f3f4f6">
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="vertical-align:top;width:50%;padding-right:16px">
          <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Para</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#111">${cot.cliente_nombre}</p>
          ${cot.cliente_email ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">${cot.cliente_email}</p>` : ''}
          ${cot.cliente_telefono ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">${cot.cliente_telefono}</p>` : ''}
        </td>
        <td style="vertical-align:top;width:50%">
          ${cot.tipo_evento ? `
          <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Evento</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#111">${cot.tipo_evento}</p>
          ` : ''}
          ${fechaEvento ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280">📅 ${fechaEvento}</p>` : ''}
        </td>
      </tr></table>
    </div>

    <!-- Tabla de items -->
    <div style="padding:28px 40px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1A8A7A">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Descripción</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Cant.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Precio unit.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <!-- Totales -->
      <div style="margin-top:16px;padding-top:16px;border-top:2px solid #FFE0EC">
        <table style="width:100%;border-collapse:collapse"><tr><td></td><td style="width:250px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#6b7280">
            <span>Subtotal</span><span>₡${Number(cot.subtotal).toLocaleString('es-CR')}</span>
          </div>
          ${descuento > 0 ? `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;color:#ef4444">
            <span>Descuento (${descuento}%)</span>
            <span>-₡${Number(cot.subtotal * descuento / 100).toLocaleString('es-CR')}</span>
          </div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#D4006E,#F07525);border-radius:8px;margin-top:8px">
            <span style="color:#fff;font-size:16px;font-weight:700">TOTAL</span>
            <span style="color:#fff;font-size:18px;font-weight:700">₡${Number(cot.total).toLocaleString('es-CR')}</span>
          </div>
        </td></tr></table>
      </div>
    </div>

    ${cot.notas ? `
    <div style="padding:0 40px 24px">
      <div style="background:#FFF5F8;border-left:3px solid #D4006E;border-radius:0 8px 8px 0;padding:14px 16px">
        <p style="margin:0 0 4px;font-size:11px;color:#D4006E;font-weight:700;text-transform:uppercase">Notas</p>
        <p style="margin:0;font-size:13px;color:#374151;white-space:pre-line">${cot.notas}</p>
      </div>
    </div>` : ''}

    ${cot.terminos ? `
    <div style="padding:0 40px 24px">
      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Términos y condiciones</p>
      <p style="margin:0;font-size:12px;color:#9ca3af;white-space:pre-line">${cot.terminos}</p>
    </div>` : ''}

    <!-- Footer -->
    <div style="background:linear-gradient(135deg,#D4006E 0%,#F07525 100%);padding:20px 40px;text-align:center">
      <p style="margin:0;font-size:13px;color:#fff;font-weight:600">Floristería Alma Caribeña 🌺</p>
      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.8)">Gracias por confiar en nosotras para tu evento especial</p>
    </div>
  </div>
</body>
</html>`;
}

async function enviarCotizacion(req, res) {
  try {
    const cot = await queryOne('SELECT * FROM cotizaciones WHERE id = ?', [req.params.id]);
    if (!cot) return res.status(404).json({ success: false, message: 'Cotización no encontrada' });
    if (!cot.cliente_email) return res.status(400).json({ success: false, message: 'La cotización no tiene email del cliente' });

    const transporter = getTransporter();
    if (!transporter) {
      return res.status(400).json({ success: false, message: 'SMTP no configurado. Agregá SMTP_HOST, SMTP_USER y SMTP_PASS en el .env' });
    }

    if (cot.items && typeof cot.items === 'string') cot.items = JSON.parse(cot.items);

    const from = process.env.SMTP_FROM || `Floristería Alma Caribeña <${process.env.SMTP_USER}>`;
    const asunto = `Cotización ${cot.numero}${cot.tipo_evento ? ` — ${cot.tipo_evento}` : ''} · Floristería Alma Caribeña`;
    const logoPath = getLogoPath();

    await transporter.sendMail({
      from,
      to: cot.cliente_email,
      subject: asunto,
      html: buildEmailHTML(cot, !!logoPath),
      attachments: logoPath ? [{ filename: 'logo.png', path: logoPath, cid: 'logo@alma' }] : [],
    });

    await query("UPDATE cotizaciones SET estado = 'enviada' WHERE id = ?", [cot.id]);

    logger.info(`Cotización ${cot.numero} enviada a ${cot.cliente_email}`);
    res.json({ success: true, message: `Cotización enviada a ${cot.cliente_email}` });
  } catch (e) {
    logger.error(`enviarCotizacion: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { getCotizaciones, getCotizacion, createCotizacion, updateCotizacion, deleteCotizacion, enviarCotizacion };
