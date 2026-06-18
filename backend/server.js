require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const { connectDB } = require('./src/config/database');
const logger = require('./src/utils/logger');
const { initWhatsApp } = require('./src/services/whatsapp/whatsappService');

const authRoutes      = require('./src/routes/auth');
const insumoRoutes    = require('./src/routes/insumos');
const catalogoRoutes  = require('./src/routes/catalogo');
const mermaRoutes     = require('./src/routes/mermas');
const proveedorRoutes = require('./src/routes/proveedores');
const gastoRoutes     = require('./src/routes/gastos');
const nominaRoutes    = require('./src/routes/nomina');
const compraRoutes    = require('./src/routes/compras');
const dashboardRoutes = require('./src/routes/dashboard');
const webhookRoutes   = require('./src/routes/webhooks');
const whatsappRoutes  = require('./src/routes/whatsapp');
const reporteRoutes        = require('./src/routes/reportes');
const notificacionRoutes   = require('./src/routes/notificaciones');
const cotizacionRoutes     = require('./src/routes/cotizaciones');
const ventasRoutes         = require('./src/routes/ventas');
const pedidosRoutes        = require('./src/routes/pedidos');
const cierresRoutes        = require('./src/routes/cierres');
const { startAlertScheduler } = require('./src/services/alertScheduler');

const app = express();
const server = http.createServer(app);
// Acepta múltiples orígenes separados por coma en FRONTEND_URL
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5174')
  .split(',').map(s => s.trim()).filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

app.set('io', io);

app.use('/api/auth',       authRoutes);
app.use('/api/insumos',    insumoRoutes);
app.use('/api/catalogo',   catalogoRoutes);
app.use('/api/mermas',     mermaRoutes);
app.use('/api/proveedores',proveedorRoutes);
app.use('/api/gastos',     gastoRoutes);
app.use('/api/nomina',     nominaRoutes);
app.use('/api/compras',    compraRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/webhooks',   webhookRoutes);
app.use('/api/whatsapp',   whatsappRoutes);
app.use('/api/reportes',        reporteRoutes);
app.use('/api/notificaciones', notificacionRoutes);
app.use('/api/cotizaciones',   cotizacionRoutes);
app.use('/api/ventas',         ventasRoutes);
app.use('/api/pedidos',        pedidosRoutes);
app.use('/api/cierres',        cierresRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', sistema: 'Floristería Alma Caribeña', timestamp: new Date() });
});

app.use((err, req, res, next) => {
  logger.error(`${err.message} - ${req.originalUrl}`);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Error interno' });
});

io.on('connection', (socket) => {
  logger.info(`Cliente conectado: ${socket.id}`);
  socket.on('disconnect', () => logger.info(`Cliente desconectado: ${socket.id}`));
});

const PORT = process.env.PORT || 3002;

async function start() {
  await connectDB();
  await require('./src/controllers/catalogoController').ensureCodigo();
  await require('./src/controllers/insumoController').ensureCodigoInsumos();
  await require('./src/controllers/cierresController').ensureTable();
  require('./src/services/sync/phpCatalogSync').ensureSyncSchema().catch(e => logger.warn(`phpCatalogSync init: ${e.message}`));
  startAlertScheduler();

  // Reconectar WhatsApp automáticamente si hay sesión guardada
  const WA_AUTH = path.join(__dirname, 'whatsapp-auth-floreria');
  if (fs.existsSync(path.join(WA_AUTH, 'creds.json'))) {
    logger.info('Sesión WhatsApp encontrada — reconectando automáticamente...');
    initWhatsApp(io).catch(e => logger.warn(`Auto-reconexión WhatsApp: ${e.message}`));
  }

  server.listen(PORT, () => {
    logger.info(`Floristería Alma Caribeña Backend corriendo en puerto ${PORT}`);
    logger.info(`Ambiente: ${process.env.NODE_ENV}`);
  });
}

start();
