# Script para probar la app en dispositivo fisico
# Encoding: UTF-8

$serverIP = "192.168.18.19"
$port = 3000

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  FIRE ID - TEST EN DISPOSITIVO FISICO" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar servidor
Write-Host "[1] Verificando servidor..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://${serverIP}:${port}/health" -Method GET -TimeoutSec 3
    Write-Host "[OK] Servidor activo en http://${serverIP}:${port}" -ForegroundColor Green
    Write-Host "    Clientes WebSocket: $($health.connections.connectedClients)" -ForegroundColor White
    Write-Host ""
} catch {
    Write-Host "[ERROR] Servidor no responde" -ForegroundColor Red
    exit 1
}

# 2. Simular datos de sensores que superen umbrales
Write-Host "[2] Enviando datos de sensores (superando umbrales)..." -ForegroundColor Yellow
$sensorData = @{
    temperature = 50  # Temperatura ALTA (umbral: 35)
    light = 1200      # Luz ALTA (umbral: 800)
    smoke = 800       # Humo ALTO (umbral: 500)
    humidity = 20
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://${serverIP}:${port}/sensor-data" -Method POST -Body $sensorData -ContentType "application/json"
    Write-Host "[OK] Datos enviados" -ForegroundColor Green
    Write-Host "    Estado de alerta: $($response.alertStatus)" -ForegroundColor $(if($response.alertStatus -eq 'Riesgo'){'Yellow'}else{'White'})
    Write-Host "    Umbral excedido: $($response.thresholdExceeded)" -ForegroundColor $(if($response.thresholdExceeded){'Red'}else{'White'})
    Write-Host ""
    
    if ($response.thresholdExceeded) {
        Write-Host "[IMPORTANTE] Se deberia solicitar captura en la app" -ForegroundColor Yellow
        Write-Host "             Revisa tu celular!" -ForegroundColor Yellow
        Write-Host ""
    }
} catch {
    Write-Host "[ERROR] Error al enviar datos: $_" -ForegroundColor Red
}

# 3. Monitorear conexiones
Write-Host "[3] Estado de conexiones:" -ForegroundColor Yellow
try {
    $conn = Invoke-RestMethod -Uri "http://${serverIP}:${port}/connections" -Method GET -TimeoutSec 3
    
    if ($conn.webSocketConnections.Count -gt 0) {
        Write-Host "[OK] App movil conectada!" -ForegroundColor Green
        foreach ($c in $conn.webSocketConnections) {
            Write-Host "    Socket ID: $($c.socketId.Substring(0,10))..." -ForegroundColor Cyan
            Write-Host "    Conectado desde: $($c.connectedAt)" -ForegroundColor White
            Write-Host "    Duracion: $($c.duration)" -ForegroundColor White
        }
    } else {
        Write-Host "[AVISO] No hay apps conectadas via WebSocket" -ForegroundColor Red
        Write-Host "        Asegurate de abrir la app en el celular" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERROR] Error al consultar conexiones" -ForegroundColor Red
}

Write-Host ""
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Para monitoreo continuo ejecuta:" -ForegroundColor White
Write-Host "  .\monitor-connections.ps1" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
