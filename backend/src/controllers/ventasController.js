const { Resend } = require('resend');
const logger = require('../utils/logger');
const { query } = require('../config/database');

const resend = new Resend(process.env.RESEND_API_KEY);

function buildReciboHTML({ cliente_nombre, items, subtotal, descuento_pct, total, numero, fecha, canal, hasLogo }) {
  const descuento = parseFloat(descuento_pct || 0);
  const descuentoMonto = subtotal * descuento / 100;

  const filas = items.map(i => {
    const precio = i.tipo === 'insumo' ? i.precio_unitario : i.precio_venta;
    const sub = precio * i.cantidad;
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #ffe0ec;color:#333">
        ${i.nombre}${i.tipo === 'insumo' ? ' <span style="color:#D4006E;font-size:11px">(suelta)</span>' : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #ffe0ec;text-align:center;color:#555">${i.cantidad}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #ffe0ec;text-align:right;color:#555">₡${Number(precio).toLocaleString('es-CR')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #ffe0ec;text-align:right;font-weight:600;color:#D4006E">₡${Number(sub).toLocaleString('es-CR')}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFF0F5;font-family:Georgia,serif">
  <div style="max-width:620px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(212,0,110,.15)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#D4006E 0%,#F07525 100%);padding:32px 36px 28px;text-align:center">
      ${hasLogo
        ? `<img src="cid:logo@alma" alt="Floristería Alma Caribeña" style="height:90px;max-width:260px;object-fit:contain;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto">`
        : `<div style="font-size:28px;margin-bottom:6px">🌺</div>
           <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:1px">Floristería Alma Caribeña</h1>
           <p style="color:rgba(255,255,255,.85);margin:6px 0 0;font-size:13px">Flores con alma · Alma Caribeña</p>`
      }
    </div>

    <!-- Número + fecha -->
    <div style="background:#FFF5F8;padding:18px 36px;border-bottom:1px solid #FFE0EC">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td>
            <p style="margin:0;font-size:11px;color:#D4006E;font-weight:700;text-transform:uppercase;letter-spacing:1px">Recibo de compra</p>
            <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#8B0040">${numero}</p>
          </td>
          <td style="text-align:right">
            <p style="margin:0;font-size:11px;color:#6b7280">Fecha</p>
            <p style="margin:4px 0 0;font-size:13px;font-weight:600;color:#1A8A7A">${fecha}</p>
            ${canal ? `<p style="margin:4px 0 0;font-size:11px;color:#9ca3af;text-transform:capitalize">${canal}</p>` : ''}
          </td>
        </tr>
      </table>
    </div>

    <!-- Cliente -->
    <div style="padding:22px 36px;border-bottom:1px solid #f3f4f6">
      <p style="margin:0 0 4px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px">Cliente</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#111">${cliente_nombre}</p>
    </div>

    <!-- Tabla items -->
    <div style="padding:24px 36px">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1A8A7A">
            <th style="padding:10px 12px;text-align:left;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Producto</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Cant.</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Precio</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;color:#fff;text-transform:uppercase;letter-spacing:1px">Subtotal</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>

      <!-- Totales -->
      <div style="margin-top:14px;padding-top:14px;border-top:2px solid #FFE0EC">
        <table style="width:100%;border-collapse:collapse">
          <tr><td></td><td style="width:240px">
            <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#6b7280">
              <span>Subtotal</span><span>₡${Number(subtotal).toLocaleString('es-CR')}</span>
            </div>
            ${descuento > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:13px;color:#ef4444">
              <span>Descuento (${descuento}%)</span>
              <span>-₡${Number(descuentoMonto).toLocaleString('es-CR')}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:10px 14px;background:linear-gradient(135deg,#D4006E,#F07525);border-radius:8px;margin-top:8px">
              <span style="color:#fff;font-size:15px;font-weight:700">TOTAL</span>
              <span style="color:#fff;font-size:17px;font-weight:700">₡${Number(total).toLocaleString('es-CR')}</span>
            </div>
          </td></tr>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:linear-gradient(135deg,#D4006E 0%,#F07525 100%);padding:18px 36px;text-align:center">
      <p style="margin:0;font-size:13px;color:#fff;font-weight:600">¡Gracias por su compra! 🌺</p>
      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,.8)">Floristería Alma Caribeña · Flores con alma</p>
    </div>
  </div>
</body>
</html>`;
}

async function enviarRecibo(req, res) {
  try {
    const { email, cliente_nombre, items, subtotal, descuento_pct, total, numero, fecha, canal } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email requerido' });

    const from = process.env.EMAIL_FROM || 'Floristería Alma Caribeña <onboarding@resend.dev>';

    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: `Recibo ${numero} · Floristería Alma Caribeña`,
      html: buildReciboHTML({ cliente_nombre, items, subtotal, descuento_pct, total, numero, fecha, canal, hasLogo: false }),
    });

    if (error) throw new Error(error.message);

    logger.info(`Recibo ${numero} enviado a ${email}`);
    res.json({ success: true, message: `Recibo enviado a ${email}` });
  } catch (e) {
    logger.error(`enviarRecibo: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

async function registrarVentaManual(req, res) {
  try {
    const { concepto, monto, fecha, canal, nombre_cliente } = req.body;
    if (!monto || !fecha) return res.status(400).json({ success: false, message: 'Monto y fecha son requeridos' });
    if (isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) return res.status(400).json({ success: false, message: 'Monto inválido' });

    // Guardar como mediodía UTC para que CONVERT_TZ a CR (-6h) quede en la fecha correcta
    const fechaUTC = `${fecha} 12:00:00`;
    const result = await query(
      `INSERT INTO ventas_floreria (catalogo_id, nombre_arreglo, canal, precio_venta, costo_produccion, nombre_cliente, fecha)
       VALUES (NULL, ?, ?, ?, 0, ?, ?)`,
      [concepto || 'Venta general', canal || 'mostrador', parseFloat(monto), nombre_cliente || null, fechaUTC]
    );

    logger.info(`Venta manual registrada: ${concepto || 'Venta general'} ₡${monto} el ${fecha}`);
    res.status(201).json({ success: true, message: 'Venta registrada', id: result.insertId });
  } catch (e) {
    logger.error(`registrarVentaManual: ${e.message}`);
    res.status(500).json({ success: false, message: e.message });
  }
}

module.exports = { enviarRecibo, registrarVentaManual };
