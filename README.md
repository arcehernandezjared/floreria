# Floristería Alma Caribeña — Sistema de Gestión

Sistema de gestión completo para floristería artesanal. Backend Node.js/Express/MySQL + Frontend React/Vite/Tailwind.

## Credenciales de acceso

| Campo | Valor |
|-------|-------|
| URL Frontend | http://localhost:5174 |
| URL Backend | http://localhost:3002 |
| Email admin | admin@floreria.com |
| Contraseña | floreria123 |
| Webhook API Key | floreria_webhook_key_2024 |

---

## Setup

### 1. Base de datos

```sql
-- En MySQL ejecutar:
source floreria/database/schema.sql
```

### 2. Backend

```bash
cd floreria/backend
npm install
# Configurar .env si se requiere (ya viene pre-configurado)
npm run dev
```

El backend corre en **puerto 3002**.

### 3. Frontend

```bash
cd floreria/frontend
npm install
npm run dev
```

El frontend corre en **puerto 5174**.

---

## Módulos

### Dashboard
Vista general con:
- **Termómetro de Nómina** — barra de progreso del fondo quincena (verde/amarillo/rojo)
- KPIs: ventas hoy, mermas hoy, margen, utilidad del mes
- Alertas de stock bajo y margen bajo en arreglos
- Gráfico de mermas por motivo
- Top 5 insumos más mermados de la semana

### Insumos
- Lista de flores, materiales y empaques con indicador visual de stock
- Barra de progreso verde/amarilla/roja según stock vs mínimo
- Filtros por tipo (flor, material, empaque) y búsqueda
- Modal para crear/editar insumos
- Ajuste manual de stock (+/-)
- Historial de cambios de costo

### Catálogo
- Cards de arreglos con costo calculado **dinámicamente** (suma ficha × costo actual de cada insumo)
- Margen % en verde (>30%), amarillo (15-30%), rojo (<15%)
- Ver ficha técnica completa con ingredientes y costos actuales
- Registrar venta: descuenta stock automáticamente
- Botón "Recalcular Costos" — actualiza todos los costos_calculado y alerta de margen bajo

### Mermas
- Formulario rápido prominente: insumo, cantidad, motivo, notas
- Descuenta stock automáticamente al registrar
- Si stock llega a 0, marca disponible_externo=false en catálogos que dependen del insumo
- Resumen por motivo con total ₡ perdido
- Historial del día con filtro de fecha

### Proveedores
- CRUD de proveedores (finca, distribuidor, otro)
- Historial de compras por proveedor expandible
- Rendimiento: total de pérdidas por defecto de cada proveedor

### Gastos
- Registro de gastos fijos y variables por categorías
- Comparativa mes actual vs mes anterior por categoría
- Filtro por mes

### Fondo de Nómina
- Termómetro grande con barra animada
- Cierre del día: registra ingresos, calcula % de provisión
- Configuración del porcentaje y meta de quincena
- Historial del período actual
- Botón "Cerrar Período"

### Compras
- Crear orden de compra: proveedor, fecha, items (insumo + cantidad + precio)
- Marcar como "Recibida": actualiza stock e historial de costos automáticamente

---

## Webhook para ventas externas

Endpoint para recibir ventas desde sistemas externos (ej. n8n, tienda online):

```
POST http://localhost:3002/api/webhooks/venta-externa
X-API-Key: floreria_webhook_key_2024
Content-Type: application/json

{
  "producto_nombre": "Arreglo Romance",
  "precio": 35000,
  "cliente": "María García",
  "canal": "externo",
  "ref_externa": "ORD-001"
}
```

---

## Lógica de negocio clave

1. **Costos dinámicos**: El costo de un arreglo SIEMPRE se calcula multiplicando la ficha técnica × costo_unitario actual de cada insumo. No se guarda el costo en la ficha.

2. **Al registrar venta**: Descuenta stock de todos los insumos de la ficha. Si alguno llega a 0, marca `disponible_externo=false` en todos los catálogos que dependen de ese insumo.

3. **Al registrar merma**: Igual que venta — descuenta stock y marca indisponible si llega a 0.

4. **Al recibir compra**: Actualiza stock e historial de costos si el precio de compra cambió.

5. **Fondo de nómina**: Cada cierre de día registra los ingresos y calcula la provisión (% configurable). Se acumula por período (quincena por defecto).
