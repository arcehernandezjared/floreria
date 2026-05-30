-- ============================================================
-- Floristería Alma Caribeña — Schema MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS floreria CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE floreria;

-- ============================================================
-- USUARIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'empleado') NOT NULL DEFAULT 'empleado',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- PROVEEDORES
-- ============================================================
CREATE TABLE IF NOT EXISTS proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  tipo ENUM('finca', 'distribuidor', 'otro') NOT NULL DEFAULT 'otro',
  contacto VARCHAR(100) NULL,
  telefono VARCHAR(30) NULL,
  email VARCHAR(150) NULL,
  notas TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- CATEGORÍAS DE INSUMO
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias_insumo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  tipo ENUM('flor', 'material', 'empaque', 'otro') NOT NULL DEFAULT 'otro',
  color VARCHAR(20) NULL DEFAULT '#10b981',
  icono VARCHAR(50) NULL DEFAULT 'Package',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- INSUMOS
-- ============================================================
CREATE TABLE IF NOT EXISTS insumos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  categoria_id INT NOT NULL,
  proveedor_id INT NULL,
  unidad ENUM('tallo', 'unidad', 'bloque', 'metro') NOT NULL DEFAULT 'unidad',
  stock_actual DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_minimo DECIMAL(10,2) NOT NULL DEFAULT 10,
  costo_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
  vida_util_dias INT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id) REFERENCES categorias_insumo(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB;

-- ============================================================
-- HISTORIAL DE COSTOS DE INSUMO
-- ============================================================
CREATE TABLE IF NOT EXISTS historial_costos_insumo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  insumo_id INT NOT NULL,
  costo_anterior DECIMAL(10,2) NOT NULL,
  costo_nuevo DECIMAL(10,2) NOT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notas TEXT NULL,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id)
) ENGINE=InnoDB;

-- ============================================================
-- CATÁLOGO DE ARREGLOS
-- ============================================================
CREATE TABLE IF NOT EXISTS catalogo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  imagen_url VARCHAR(255) NULL,
  precio_venta DECIMAL(10,2) NOT NULL DEFAULT 0,
  categoria VARCHAR(100) NULL DEFAULT 'General',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  disponible_externo TINYINT(1) NOT NULL DEFAULT 1,
  costo_calculado DECIMAL(10,2) NOT NULL DEFAULT 0,
  margen_minimo DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- FICHA DE INGREDIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS ficha_ingredientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalogo_id INT NOT NULL,
  insumo_id INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL DEFAULT 1,
  notas TEXT NULL,
  FOREIGN KEY (catalogo_id) REFERENCES catalogo(id) ON DELETE CASCADE,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id)
) ENGINE=InnoDB;

-- ============================================================
-- MERMAS
-- ============================================================
CREATE TABLE IF NOT EXISTS mermas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  insumo_id INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  costo_unitario_momento DECIMAL(10,2) NOT NULL,
  costo_total DECIMAL(10,2) NOT NULL,
  motivo ENUM('marchita_tienda', 'danada_armar', 'defecto_proveedor', 'uso_interno') NOT NULL DEFAULT 'marchita_tienda',
  proveedor_id INT NULL,
  notas TEXT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id),
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB;

-- ============================================================
-- VENTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS ventas_floreria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  catalogo_id INT NULL,
  nombre_arreglo VARCHAR(150) NOT NULL,
  canal ENUM('mostrador', 'externo', 'whatsapp') NOT NULL DEFAULT 'mostrador',
  ref_externa VARCHAR(100) NULL,
  precio_venta DECIMAL(10,2) NOT NULL,
  costo_produccion DECIMAL(10,2) NOT NULL DEFAULT 0,
  notas TEXT NULL,
  nombre_cliente VARCHAR(150) NULL,
  fecha_entrega DATE NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (catalogo_id) REFERENCES catalogo(id)
) ENGINE=InnoDB;

-- ============================================================
-- GASTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS gastos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  concepto VARCHAR(200) NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  tipo ENUM('fijo', 'variable') NOT NULL DEFAULT 'variable',
  categoria ENUM('alquiler', 'servicios_publicos', 'planilla', 'ccss', 'compras_insumos', 'marketing', 'transporte', 'otro') NOT NULL DEFAULT 'otro',
  fecha DATE NOT NULL,
  recurrente TINYINT(1) NOT NULL DEFAULT 0,
  notas TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- COMPRAS
-- ============================================================
CREATE TABLE IF NOT EXISTS compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proveedor_id INT NOT NULL,
  fecha DATE NOT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  estado ENUM('pendiente', 'recibida', 'parcial') NOT NULL DEFAULT 'pendiente',
  notas TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id)
) ENGINE=InnoDB;

-- ============================================================
-- ITEMS DE COMPRA
-- ============================================================
CREATE TABLE IF NOT EXISTS compra_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL,
  insumo_id INT NOT NULL,
  cantidad DECIMAL(10,2) NOT NULL,
  costo_unitario DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id)
) ENGINE=InnoDB;

-- ============================================================
-- CONFIG NÓMINA
-- ============================================================
CREATE TABLE IF NOT EXISTS config_nomina (
  id INT AUTO_INCREMENT PRIMARY KEY,
  porcentaje_provision DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  meta_quincena DECIMAL(10,2) NOT NULL DEFAULT 600000.00,
  periodo_dias INT NOT NULL DEFAULT 15,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- FONDO QUINCENA LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS fondo_quincena_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fecha DATE NOT NULL UNIQUE,
  ingresos_dia DECIMAL(10,2) NOT NULL DEFAULT 0,
  provision_dia DECIMAL(10,2) NOT NULL DEFAULT 0,
  acumulado_periodo DECIMAL(10,2) NOT NULL DEFAULT 0,
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  cerrado TINYINT(1) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accion VARCHAR(100) NOT NULL,
  descripcion TEXT NULL,
  usuario_id INT NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Usuario admin (password: floreria123)
-- Hash generado con bcryptjs rounds=10
INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES
('Administrador', 'admin@floreria.com', '$2a$10$sCp33LQwKnreoftiqge3HOhXUiacwwCEM0QmoErfVU7ISIm/wCZyq', 'admin', 1);

-- Categorías
INSERT INTO categorias_insumo (nombre, tipo, color, icono) VALUES
('Flores Frescas', 'flor', '#ec4899', 'Flower'),
('Materiales de Diseño', 'material', '#f59e0b', 'Scissors'),
('Empaque', 'empaque', '#8b5cf6', 'Package');

-- Proveedores
INSERT INTO proveedores (nombre, tipo, contacto, telefono, email, activo) VALUES
('Finca Las Rosas CR', 'finca', 'Ana Rodríguez', '8888-1111', 'ventas@fincalasrosas.cr', 1),
('Distribuidora Floral Nacional', 'distribuidor', 'Marco Solano', '2222-3333', 'pedidos@floralNacional.cr', 1);

-- Insumos
INSERT INTO insumos (nombre, categoria_id, proveedor_id, unidad, stock_actual, stock_minimo, costo_unitario, vida_util_dias) VALUES
('Rosa Roja', 1, 1, 'tallo', 500, 50, 350.00, 7),
('Rosas Blancas', 1, 1, 'tallo', 300, 50, 320.00, 7),
('Follaje de Temporada', 1, 1, 'tallo', 200, 30, 150.00, 5),
('Base Madera Mediana', 2, 2, 'unidad', 50, 10, 2500.00, NULL),
('Espuma Oasis', 2, 2, 'unidad', 100, 20, 800.00, NULL),
('Cinta Organza', 2, 2, 'metro', 200, 30, 200.00, NULL),
('Peluche Mediano', 2, 2, 'unidad', 30, 5, 3500.00, NULL),
('Tarjeta Dedicatoria', 3, 2, 'unidad', 500, 50, 150.00, NULL);

-- Catálogo
INSERT INTO catalogo (nombre, descripcion, precio_venta, categoria, activo, disponible_externo, margen_minimo) VALUES
('Arreglo Romance #5', 'Arreglo romántico con rosas rojas, follaje y base de madera. Perfecto para San Valentín y aniversarios.', 35000.00, 'Románticos', 1, 1, 30.00),
('Ramo Primaveral', 'Ramo con rosas blancas y follaje fresco envuelto en cinta organza.', 22000.00, 'Ramos', 1, 1, 30.00),
('Centro de Mesa Elegante', 'Centro de mesa con rosas rojas y blancas sobre base de madera. Ideal para eventos.', 45000.00, 'Eventos', 1, 1, 30.00);

-- Fichas técnicas
-- Romance #5: 12 rosas rojas, 4 follaje, 1 base madera, 0.5 oasis
INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad, notas) VALUES
(1, 1, 12, '12 rosas rojas premium'),
(1, 3, 4, 'Follaje como base'),
(1, 4, 1, 'Base madera mediana'),
(1, 5, 0.5, 'Media espuma oasis');

-- Ramo Primaveral: 10 rosas blancas, 3 follaje, 1 cinta organza (metro)
INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad, notas) VALUES
(2, 2, 10, 'Rosas blancas frescas'),
(2, 3, 3, 'Follaje complementario'),
(2, 6, 1, '1 metro cinta organza para envolver');

-- Centro de Mesa: 8 rosas rojas, 6 rosas blancas, 2 follaje, 1 base madera, 1 oasis
INSERT INTO ficha_ingredientes (catalogo_id, insumo_id, cantidad, notas) VALUES
(3, 1, 8, 'Rosas rojas'),
(3, 2, 6, 'Rosas blancas'),
(3, 3, 2, 'Follaje distribuido'),
(3, 4, 1, 'Base madera mediana'),
(3, 5, 1, 'Espuma oasis completa');

-- Config nómina
INSERT INTO config_nomina (porcentaje_provision, meta_quincena, periodo_dias) VALUES
(15.00, 600000.00, 15);

-- Actualizar costos calculados del catálogo
-- Romance #5: (12×350) + (4×150) + (1×2500) + (0.5×800) = 4200+600+2500+400 = 7700
-- Ramo Primaveral: (10×320) + (3×150) + (1×200) = 3200+450+200 = 3850
-- Centro de Mesa: (8×350) + (6×320) + (2×150) + (1×2500) + (1×800) = 2800+1920+300+2500+800 = 8320
UPDATE catalogo SET costo_calculado = 7700.00 WHERE id = 1;
UPDATE catalogo SET costo_calculado = 3850.00 WHERE id = 2;
UPDATE catalogo SET costo_calculado = 8320.00 WHERE id = 3;
