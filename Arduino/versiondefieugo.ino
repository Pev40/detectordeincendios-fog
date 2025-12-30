#include <Arduino_MKRIoTCarrier.h>
#include <WiFiNINA.h>
#include <ArduinoHttpClient.h>
#include "visuals.h"
#include "pitches.h"
#include <RTCZero.h>


// ==================== CONFIGURACIÓN WIFI ====================
// Reemplaza con tu red WiFi
const char* ssid = "YoPudeYoPuedo";
const char* password = "EnBusquedaDeTiPreciosa05061998";

// IP del servidor backend (reemplaza con la IP de tu computadora)
const char* serverAddress = "192.168.18.19"; // Cambia esto
const int serverPort = 3000;

WiFiClient wifi;
HttpClient client = HttpClient(wifi, serverAddress, serverPort);
RTCZero rtc;

// ==================== OBJETOS Y VARIABLES ====================

MKRIoTCarrier carrier;

// Variables de sensores
float temperature = 0;
float humidity = 0;
float pressure = 0;
int lightValue = 0;
int smokeSimulation = 0; // Simulación de sensor de humo

// Umbrales de detección (estos se pueden ajustar)
const float TEMP_THRESHOLD = 35.0;
const int LIGHT_THRESHOLD = 800;
const int SMOKE_THRESHOLD = 500;

// Estado del sistema
String alertStatus = "Normal";
unsigned long lastSensorRead = 0;

// ===== CONFIGURACIÓN DE FRECUENCIA DE LECTURA =====
// Puedes cambiar este valor según tus necesidades:
// - 1000 = 1 segundo (muy rápido, más consumo)
// - 2000 = 2 segundos (balance recomendado)
// - 5000 = 5 segundos (ahorra batería/WiFi)
// - 10000 = 10 segundos (muy lento, ahorra mucho)
const unsigned long SENSOR_INTERVAL = 2000; // milisegundos

// Colores LED
uint32_t colorGreen = carrier.leds.Color(0, 200, 0);
uint32_t colorYellow = carrier.leds.Color(200, 200, 0);
uint32_t colorRed = carrier.leds.Color(200, 0, 0);

// ==================== MELODÍAS ====================
int alertMelody[] = {
  NOTE_C5, NOTE_E5, NOTE_G5, NOTE_C6
};
int alertDurations[] = {8, 8, 8, 4};

// ==================== SETUP ====================
void setup() {

  CARRIER_CASE = false;
  Serial.begin(9600);


  rtc.begin();
  rtc.setTime(3, 33, 0);     // hora, minuto, segundo
  rtc.setDate(9, 12, 2025);  // día, mes, año


  delay(1500);

  Serial.println("🔥 FIRE ID - Sistema Detector de Fuego");
  Serial.println("======================================");

  // Inicializar carrier
  if (!carrier.begin()) {
    Serial.println("❌ Error: Carrier no conectado");
    while (1);
  }
  Serial.println("✅ Carrier inicializado");

  // Configurar display
  carrier.display.fillScreen(0x0000);
  carrier.display.setRotation(0);
  carrier.display.setTextColor(0xFFFF);
  
  showBootScreen();

  // Conectar a WiFi
  connectWiFi();

  // Configuración inicial
  carrier.leds.fill(colorGreen, 0, 5);
  carrier.leds.show();
  
  Serial.println("\n✅ Sistema listo!");
  Serial.println("📊 Iniciando monitoreo de sensores...\n");
  
  showReadyScreen();
}

// ==================== LOOP PRINCIPAL ====================
void loop() {
  unsigned long currentMillis = millis();

  // Leer sensores periódicamente
  if (currentMillis - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = currentMillis;
    
    readSensors();
    updateDisplay();
    sendDataToServer();
    checkThresholds();
  }

  // Mantener conexión WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi desconectado, reconectando...");
    connectWiFi();
  }

  delay(100);
}


String dimeFecha() {
  char buffer[20];
  sprintf(buffer, "%02d.%02d.%04d %02d:%02d:%02d",
    rtc.getDay(),
    rtc.getMonth(),
    2000 + rtc.getYear(),
    rtc.getHours(),
    rtc.getMinutes(),
    rtc.getSeconds()
  );
  return String(buffer);
}


// ==================== FUNCIONES DE SENSORES ====================

void readSensors() {
  // Leer temperatura
  temperature = carrier.Env.readTemperature();
  
  // Leer humedad
  humidity = carrier.Env.readHumidity();
  
  // Leer presión
  pressure = carrier.Pressure.readPressure();
  
  // Leer sensor de luz (APDS9960)
  int r, g, b;
  carrier.Light.readColor(r, g, b);
  lightValue = (r + g + b) / 3; // Promedio de RGB
  
  // Simular sensor de humo basado en temperatura y luz
  // (En un sistema real usarías un sensor MQ-2 o similar)
  smokeSimulation = calculateSmokeSimulation();
  
  // Mostrar en Serial Monitor
  Serial.println("📊 Lectura de Sensores:");
  Serial.print("  🌡️  Temperatura: "); Serial.print(temperature); Serial.println(" °C");
  Serial.print("  💧 Humedad: "); Serial.print(humidity); Serial.println(" %");
  Serial.print("  📊 Presión: "); Serial.print(pressure); Serial.println(" kPa");
  Serial.print("  💡 Luz: "); Serial.println(lightValue);
  Serial.print("  💨 Humo (sim): "); Serial.println(smokeSimulation);
  Serial.print(" Hora: "); Serial.println(dimeFecha());
  Serial.println();
}

int calculateSmokeSimulation() {
  // Simulación de sensor de humo basado en otros sensores
  // Fórmula: si temp alta y luz alta, probablemente hay fuego
  int smokeValue = 0;
  
  if (temperature > 30) {
    smokeValue += (temperature - 30) * 20;
  }
  
  if (lightValue > 500) {
    smokeValue += (lightValue - 500) / 2;
  }
  
  // Agregar algo de ruido aleatorio
  smokeValue += random(-50, 50);
  
  return constrain(smokeValue, 0, 1000);
}

// ==================== COMUNICACIÓN CON SERVIDOR ====================

void sendDataToServer() {
  Serial.println("📤 Enviando datos al servidor...");
  Serial.print("   Conectando a: ");
  Serial.print(serverAddress);
  Serial.print(":");
  Serial.println(serverPort);
  
  // Crear JSON manualmente (sin librería ArduinoJson para ahorrar memoria)
  String jsonData = "{";
  jsonData += "\"temperature\":" + String(temperature, 2) + ",";
  jsonData += "\"light\":" + String(lightValue) + ",";
  jsonData += "\"smoke\":" + String(smokeSimulation) + ",";
  jsonData += "\"humidity\":" + String(humidity, 2);
  jsonData += "}";
  
  Serial.println("   JSON: " + jsonData);
  
  // Realizar petición POST
  Serial.println("   ⏳ Iniciando petición HTTP...");
  
  client.beginRequest();
  int err = client.post("/sensor-data");
  
  if (err == 0) {
    Serial.println("   ✅ Conexión establecida");
    client.sendHeader("Content-Type", "application/json");
    client.sendHeader("Content-Length", jsonData.length());
    client.beginBody();
    client.print(jsonData);
    client.endRequest();
    
    // Esperar respuesta con timeout
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 5000) {
        Serial.println("   ⏰ Timeout esperando respuesta");
        client.stop();
        return;
      }
    }
    
    // Leer respuesta
    int statusCode = client.responseStatusCode();
    String response = client.responseBody();
    
    Serial.print("   📥 Código HTTP: ");
    Serial.println(statusCode);
    
    if (statusCode == 200) {
      Serial.println("   ✅ Datos enviados correctamente");
      Serial.println("   📥 Respuesta: " + response);
    } else if (statusCode > 0) {
      Serial.println("   ⚠️ Respuesta inesperada");
      Serial.println("   Respuesta: " + response);
    } else {
      Serial.println("   ❌ Sin código de respuesta");
    }
  } else {
    Serial.println("   ❌ Error de conexión");
    Serial.print("   Código de error: ");
    Serial.println(err);
    Serial.println("   ");
    Serial.println("   Posibles causas:");
    Serial.println("   - El servidor no está corriendo");
    Serial.println("   - Firewall bloqueando el puerto 3000");
    Serial.println("   - IP incorrecta: " + String(serverAddress));
    Serial.println("   ");
    Serial.println("   💡 Prueba abrir en tu navegador:");
    Serial.print("      http://");
    Serial.print(serverAddress);
    Serial.print(":");
    Serial.print(serverPort);
    Serial.println("/health");
  }
  
  // Detener cliente
  client.stop();
  
  Serial.println();
}

// ==================== DETECCIÓN DE UMBRALES ====================

void checkThresholds() {
  bool alert = false;
  String reason = "";
  
  if (temperature > TEMP_THRESHOLD) {
    alert = true;
    reason += "Temp alta ";
  }
  
  if (lightValue > LIGHT_THRESHOLD) {
    alert = true;
    reason += "Luz alta ";
  }
  
  if (smokeSimulation > SMOKE_THRESHOLD) {
    alert = true;
    reason += "Humo detectado ";
  }
  
  if (alert) {
    if (alertStatus != "Alerta") {
      alertStatus = "Alerta";
      Serial.println("⚠️⚠️⚠️ ¡ALERTA DE FUEGO! ⚠️⚠️⚠️");
      Serial.println("Razón: " + reason);
      triggerAlert();
    }
  } else {
    if (alertStatus != "Normal") {
      alertStatus = "Normal";
      Serial.println("✅ Sistema normalizado");
      carrier.leds.fill(colorGreen, 0, 5);
      carrier.leds.show();
      carrier.Buzzer.noSound();
    }
  }
}

void triggerAlert() {
  // Activar LEDs rojos parpadeantes
  for (int i = 0; i < 3; i++) {
    carrier.leds.fill(colorRed, 0, 5);
    carrier.leds.show();
    delay(200);
    carrier.leds.fill(0, 0, 5);
    carrier.leds.show();
    delay(200);
  }
  
  // Reproducir sonido de alerta
  for (int i = 0; i < 4; i++) {
    int duration = 1000 / alertDurations[i];
    carrier.Buzzer.sound(alertMelody[i]);
    delay(duration);
    carrier.Buzzer.noSound();
    delay(50);
  }
  
  carrier.leds.fill(colorRed, 0, 5);
  carrier.leds.show();
}

// ==================== FUNCIONES DE DISPLAY ====================

void showBootScreen() {
  carrier.display.fillScreen(0x0000);
  carrier.display.setTextSize(3);
  carrier.display.setCursor(50, 60);
  carrier.display.setTextColor(0xF800); // Rojo
  carrier.display.print("FIRE ID");
  
  carrier.display.setTextSize(2);
  carrier.display.setCursor(20, 100);
  carrier.display.setTextColor(0xFFFF);
  carrier.display.print("Detector Fuego");
  
  carrier.display.setTextSize(1);
  carrier.display.setCursor(60, 140);
  carrier.display.print("Inicializando...");
  
  delay(2000);
}

void showReadyScreen() {
  carrier.display.fillScreen(0x0000);
  carrier.display.setTextSize(2);
  carrier.display.setCursor(40, 100);
  carrier.display.setTextColor(0x07E0); // Verde
  carrier.display.print("SISTEMA LISTO");
  delay(2000);
}

void updateDisplay() {
  carrier.display.fillScreen(0x0000);
  
  // Título
  carrier.display.setTextSize(2);
  carrier.display.setCursor(30, 10);
  
  if (alertStatus == "Alerta") {
    carrier.display.setTextColor(0xF800); // Rojo
    carrier.display.print("!! ALERTA !!");
  } else {
    carrier.display.setTextColor(0x07E0); // Verde
    carrier.display.print("MONITOREANDO");
  }
  
  // Datos de sensores
  carrier.display.setTextSize(2);
  carrier.display.setTextColor(0xFFFF);
  
  carrier.display.setCursor(10, 50);
  carrier.display.print("Temp: ");
  carrier.display.print(temperature, 1);
  carrier.display.print("C");
  
  carrier.display.setCursor(10, 75);
  carrier.display.print("Luz:  ");
  carrier.display.print(lightValue);
  
  carrier.display.setCursor(10, 100);
  carrier.display.print("Humo: ");
  carrier.display.print(smokeSimulation);
  
  carrier.display.setCursor(10, 125);
  carrier.display.print("Hum:  ");
  carrier.display.print(humidity, 1);
  carrier.display.print("%");
  
  // Indicador de conexión WiFi
  carrier.display.setTextSize(1);
  carrier.display.setCursor(10, 210);
  if (WiFi.status() == WL_CONNECTED) {
    carrier.display.setTextColor(0x07E0);
    carrier.display.print("WiFi: Conectado");
  } else {
    carrier.display.setTextColor(0xF800);
    carrier.display.print("WiFi: Desconectado");
  }
}

// ==================== FUNCIONES DE WiFi ====================

void connectWiFi() {
  carrier.display.fillScreen(0x0000);
  carrier.display.setTextSize(2);
  carrier.display.setCursor(20, 80);
  carrier.display.setTextColor(0xFFFF);
  carrier.display.print("Conectando WiFi");
  
  Serial.println("\n📡 Conectando a WiFi...");
  Serial.print("   SSID: ");
  Serial.println(ssid);
  
  // LEDs amarillos mientras conecta
  carrier.leds.fill(colorYellow, 0, 5);
  carrier.leds.show();
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
    
    // Animación de LEDs
    carrier.leds.setPixelColor(attempts % 5, colorYellow);
    carrier.leds.show();
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi conectado!");
    Serial.print("   IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("   RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    
    carrier.leds.fill(colorGreen, 0, 5);
    carrier.leds.show();
    
    carrier.display.fillScreen(0x0000);
    carrier.display.setTextSize(2);
    carrier.display.setCursor(20, 80);
    carrier.display.setTextColor(0x07E0);
    carrier.display.print("WiFi OK!");
    carrier.display.setTextSize(1);
    carrier.display.setCursor(10, 120);
    carrier.display.print(WiFi.localIP());
    delay(2000);
  } else {
    Serial.println("\n❌ Error al conectar WiFi");
    carrier.leds.fill(colorRed, 0, 5);
    carrier.leds.show();
    
    carrier.display.fillScreen(0x0000);
    carrier.display.setTextSize(2);
    carrier.display.setCursor(20, 80);
    carrier.display.setTextColor(0xF800);
    carrier.display.print("WiFi ERROR");
    delay(3000);
  }
}

// ==================== TEST DE SENSORES ====================

void testSensors() {
  Serial.println("\n🧪 MODO TEST DE SENSORES");
  Serial.println("========================\n");
  
  for (int i = 0; i < 5; i++) {
    readSensors();
    delay(2000);
  }
  
  Serial.println("✅ Test completado\n");
}