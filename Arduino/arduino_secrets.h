// arduino_secrets.h
// Archivo de configuración WiFi y servidor

#ifndef ARDUINO_SECRETS_H
#define ARDUINO_SECRETS_H

// ==================== CONFIGURACIÓN WIFI ====================
// Reemplaza con los datos de tu red WiFi
#define SECRET_SSID "YoPudeYoPuedo"
#define SECRET_PASS "EnBusquedaDeTiPreciosa05061998"

// ==================== CONFIGURACIÓN SERVIDOR ====================
// Reemplaza con la IP de tu computadora donde corre el servidor Node.js
// Para encontrar tu IP:
// - Windows: abre CMD y escribe "ipconfig"
// - Mac/Linux: abre Terminal y escribe "ifconfig" o "ip addr"
#define SERVER_IP "192.168.56.1"  // ← CAMBIA ESTO
#define SERVER_PORT 3000

// Ejemplo de IPs comunes:
// - 192.168.1.X (routers comunes)
// - 192.168.0.X (algunos routers)
// - 10.0.0.X (algunos routers)

#endif // ARDUINO_SECRETS_H