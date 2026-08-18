<?php
/**
 * Floristería Alma Caribeña — Endpoint de subida de imágenes
 * Subir este archivo a: public_html/api/upload.php
 *
 * Primera vez: crear la carpeta manualmente en el File Manager de Hostinger:
 *   public_html/uploads/floreria/
 * y asegurarse de que tenga permisos 755.
 */

// ── Configuración ─────────────────────────────────────────────────────────────
$SECRET_TOKEN   = getenv('UPLOAD_TOKEN') ?: 'CAMBIA_ESTO_POR_TU_TOKEN_SECRETO';
$UPLOAD_DIR     = __DIR__ . '/../uploads/floreria/';
$BASE_URL       = 'https://xn--almacaribea-beb.store/uploads/floreria/';
$MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
$ALLOWED_TYPES  = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// ── CORS / Headers ────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: X-Upload-Token, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Validaciones básicas ───────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
    exit;
}

$token = $_SERVER['HTTP_X_UPLOAD_TOKEN'] ?? '';
if ($token !== $SECRET_TOKEN) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'No autorizado']);
    exit;
}

if (!isset($_FILES['imagen']) || $_FILES['imagen']['error'] !== UPLOAD_ERR_OK) {
    $err = $_FILES['imagen']['error'] ?? -1;
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => "Error en el archivo (código $err)"]);
    exit;
}

$file = $_FILES['imagen'];

if ($file['size'] > $MAX_SIZE_BYTES) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'La imagen supera los 5 MB']);
    exit;
}

// Verificar tipo MIME real (no solo el que manda el cliente)
$finfo    = new finfo(FILEINFO_MIME_TYPE);
$mimeReal = $finfo->file($file['tmp_name']);

if (!in_array($mimeReal, $ALLOWED_TYPES, true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => "Tipo de archivo no permitido: $mimeReal"]);
    exit;
}

// ── Guardar archivo ────────────────────────────────────────────────────────────
if (!is_dir($UPLOAD_DIR)) {
    if (!mkdir($UPLOAD_DIR, 0755, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => 'No se pudo crear el directorio de uploads']);
        exit;
    }
}

$ext      = match($mimeReal) {
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
    'image/gif'  => 'gif',
    default      => 'jpg',
};
$filename = time() . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
$destPath = $UPLOAD_DIR . $filename;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Error al guardar el archivo']);
    exit;
}

chmod($destPath, 0644);

echo json_encode([
    'success' => true,
    'url'     => $BASE_URL . $filename,
]);
