# Script para verificar conexion con el servidor
# Encoding: UTF-8

$serverIP = "192.168.18.19"
$port = 3000

Write-Host "[INFO] Verificando conexion al servidor Fire ID..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar si el servidor responde
Write-Host "[1] Probando endpoint /health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://${serverIP}:${port}/health" -Method GET -TimeoutSec 5
    $data = $response.Content | ConvertFrom-Json
    Write-Host "[OK] Servidor activo" -ForegroundColor Green
    Write-Host "     Status: $($data.status)" -ForegroundColor White
    Write-Host "     Clientes conectados: $($data.connections.connectedClients)" -ForegroundColor White
} catch {
    Write-Host "[ERROR] No se pudo conectar al servidor" -ForegroundColor Red
    Write-Host "        Error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Verificar endpoint de sensores
Write-Host "[2] Probando endpoint /status..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://${serverIP}:${port}/status" -Method GET -TimeoutSec 5
    $data = $response.Content | ConvertFrom-Json
    Write-Host "[OK] Endpoint /status funcional" -ForegroundColor Green
    Write-Host "     Estado de alerta: $($data.data.alertStatus)" -ForegroundColor White
} catch {
    Write-Host "[ERROR] Error en /status" -ForegroundColor Red
}

Write-Host ""

# 3. Simular envio de datos de sensores
Write-Host "[3] Simulando datos de sensores..." -ForegroundColor Yellow
$sensorData = @{
    temperature = 45
    light = 1200
    smoke = 800
    humidity = 25
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://${serverIP}:${port}/sensor-data" -Method POST -Body $sensorData -ContentType "application/json"
    Write-Host "[OK] Datos enviados correctamente" -ForegroundColor Green
    Write-Host "     Respuesta: $($response | ConvertTo-Json -Compress)" -ForegroundColor White
} catch {
    Write-Host "[ERROR] Error al enviar datos" -ForegroundColor Red
}

Write-Host ""

# 4. Trigger manual de captura
Write-Host "[4] Solicitando captura manual..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://${serverIP}:${port}/trigger-capture" -Method POST -ContentType "application/json"
    Write-Host "[OK] Captura solicitada" -ForegroundColor Green
    Write-Host "     Request ID: $($response.requestId)" -ForegroundColor White
    Write-Host ""
    Write-Host "[AVISO] Verifica en la app movil si recibio la solicitud" -ForegroundColor Yellow
} catch {
    Write-Host "[ERROR] Error al solicitar captura" -ForegroundColor Red
}

Write-Host ""
Write-Host "[OK] Prueba completada" -ForegroundColor Cyan
