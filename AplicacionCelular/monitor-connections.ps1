# Script para monitorear conexiones del servidor en tiempo real
# Encoding: UTF-8

$serverIP = "192.168.18.19"
$port = 3000

Write-Host "[INFO] Monitoreando conexiones del servidor Fire ID..." -ForegroundColor Cyan
Write-Host "Presiona Ctrl+C para detener" -ForegroundColor Yellow
Write-Host ""

while ($true) {
    try {
        $response = Invoke-RestMethod -Uri "http://${serverIP}:${port}/connections" -Method GET -TimeoutSec 3
        
        Clear-Host
        Write-Host "===============================================================" -ForegroundColor Cyan
        Write-Host "         FIRE ID - MONITOR DE CONEXIONES                      " -ForegroundColor Cyan
        Write-Host "===============================================================" -ForegroundColor Cyan
        Write-Host ""
        
        # Resumen
        Write-Host "[RESUMEN]" -ForegroundColor Yellow
        Write-Host "   WebSocket Activas: $($response.summary.activeWebSocketConnections)" -ForegroundColor White
        Write-Host "   Total HTTP Requests: $($response.summary.totalHTTPRequests)" -ForegroundColor White
        Write-Host "   Endpoints unicos: $($response.summary.uniqueEndpoints)" -ForegroundColor White
        Write-Host ""
        
        # Conexiones WebSocket
        if ($response.webSocketConnections.Count -gt 0) {
            Write-Host "[CONEXIONES WEBSOCKET ACTIVAS]" -ForegroundColor Green
            foreach ($conn in $response.webSocketConnections) {
                Write-Host "   Socket ID: $($conn.socketId.Substring(0,8))..." -ForegroundColor Cyan
                Write-Host "   Conectado: $($conn.connectedAt)" -ForegroundColor White
                Write-Host "   Duracion: $($conn.duration)" -ForegroundColor White
                Write-Host "   Eventos recibidos: captureResponse=$($conn.eventsReceived.captureResponse), thresholds=$($conn.eventsReceived.thresholdUpdate)" -ForegroundColor White
                Write-Host ""
            }
        } else {
            Write-Host "[AVISO] No hay apps moviles conectadas" -ForegroundColor Red
            Write-Host ""
        }
        
        # Endpoints mas usados
        Write-Host "[TOP ENDPOINTS]" -ForegroundColor Yellow
        $topEndpoints = $response.httpEndpoints | Select-Object -First 5
        foreach ($ep in $topEndpoints) {
            Write-Host "   $($ep.method) $($ep.path)" -ForegroundColor White
            Write-Host "      Requests: $($ep.requests) ($($ep.percentage))" -ForegroundColor Gray
        }
        Write-Host ""
        
        # Requests recientes
        Write-Host "[ULTIMOS REQUESTS]" -ForegroundColor Yellow
        $recentReqs = $response.recentRequests | Select-Object -First 5
        foreach ($req in $recentReqs) {
            $time = ([DateTime]$req.timestamp).ToString("HH:mm:ss")
            Write-Host "   [$time] $($req.method) $($req.path)" -ForegroundColor Gray
        }
        Write-Host ""
        
        Write-Host "Ultima actualizacion: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor DarkGray
        
    } catch {
        Write-Host "[ERROR] Error al conectar: $_" -ForegroundColor Red
    }
    
    Start-Sleep -Seconds 2
}
