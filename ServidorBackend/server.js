/**
 * Fire ID Backend Server
 * Sistema de Detección de Fuego IoT
 * 
 * Integra:
 * - Arduino (sensores IoT)
 * - App móvil React Native (captura foto/audio)
 * - Sistema de IA (análisis)
 */

require('dotenv').config();
console.log("DEBUG ENV DYNAMO_TABLE_V2:", process.env.DYNAMO_TABLE_V2);
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const databaseService = require('./services/databaseService');
const syncService = require('./services/syncService');
const aiAdapter = require('./services/aiAdapter');
const storageService = require('./services/storageService');
const cloudDb = require('./services/cloudDb'); // Ensure cloudDb is imported
const uuid = require('uuid');
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

// ==================== CONFIGURACIÓN ====================

const app = express();
const server = http.createServer(app);
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.json());

// Servir archivos estáticos
app.use('/captures', express.static(path.join(__dirname, 'captures')));
app.use(express.static(path.join(__dirname, 'public')));

// Variables de configuración
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '10.7.134.211';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://10.7.50.193:5000/analyze';
//const RTSP_URL = process.env.RTSP_URL || "rtsp://admin:Piero440256@192.168.18.59:554/stream1"; // "rtsp://..." para Opción A
//rtsp://admin:Piero440256@192.

const RTSP_URL = process.env.RTSP_URL || "rtsp://admin:LXLPKM@10.7.134.245:554/stream1"; // "rtsp://..." para Opción A

// ==================== ESTADO DEL SISTEMA ====================

let systemState = {
  sensorData: {
    temperature: null,
    light: null,
    smoke: null,
    humidity: null,
    timestamp: null
  },
  alertStatus: 'Normal', // Normal, Riesgo, Confirmado
  isAnalyzing: false, // Control de concurrencia para IA
  thresholds: {
    temperature: 34,      // Temperatura crítica: 50°C
    light: 1500,          // Luz crítica: 1500 lux (fuego intenso)
    smoke: 1000,          // Humo crítico: 1000 ppm
    humidity: 15          // Humedad mínima: 15%
  },
  connectedClients: 0,
  history: []
};

// Registro de eventos
const eventLog = [];

function logEvent(type, message, data = null) {
  const event = {
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  eventLog.push(event);
  console.log(`[${event.timestamp}] [${type.toUpperCase()}] ${message}`);
  
  // Mantener solo los últimos 100 eventos
  if (eventLog.length > 100) {
    eventLog.shift();
  }
}

// Tracking de endpoints y conexiones
const endpointStats = new Map();
const activeConnections = new Map(); // socketId -> connectionInfo
const recentRequests = []; // Array de requests recientes

// Middleware para trackear TODOS los requests
app.use((req, res, next) => {
  const endpoint = req.path;
  const method = req.method;
  const fullPath = `${method} ${endpoint}`;
  const timestamp = new Date().toISOString();
  
  // Registrar en estadísticas
  if (!endpointStats.has(fullPath)) {
    endpointStats.set(fullPath, {
      method,
      path: endpoint,
      count: 0,
      lastAccess: null,
      firstAccess: timestamp
    });
  }
  
  const stats = endpointStats.get(fullPath);
  stats.count++;
  stats.lastAccess = timestamp;
  
  // Agregar a requests recientes
  const requestInfo = {
    timestamp,
    method,
    path: endpoint,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || 'Unknown',
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    body: req.method === 'POST' ? 'Has body' : undefined
  };
  
  recentRequests.push(requestInfo);
  
  // Mantener solo los últimos 50 requests
  if (recentRequests.length > 50) {
    recentRequests.shift();
  }
  
  // Log en consola
  console.log(`📥 ${method} ${endpoint} - ${req.ip || 'unknown IP'}`);
  
  next();
});


// ==================== API REST - ENDPOINTS PARA ARDUINO ====================

/**
 * GET /health
 * Health check - Verificar si el servidor está corriendo
 */
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const uptimeFormatted = {
    days: Math.floor(uptime / 86400),
    hours: Math.floor((uptime % 86400) / 3600),
    minutes: Math.floor((uptime % 3600) / 60),
    seconds: Math.floor(uptime % 60)
  };

  res.status(200).json({
    status: systemState.connectedClients > 0 ? 'ok' : 'idle',
    message: systemState.connectedClients > 0 
      ? 'Servidor Fire ID corriendo correctamente'
      : 'Servidor Fire ID corriendo pero sin clientes conectados',
    timestamp: new Date().toISOString(),
    uptime: uptimeFormatted,
    uptimeSeconds: Math.floor(uptime),
    service: 'Fire ID Backend Server',
    version: '1.0.0',
    connections: {
      connectedClients: systemState.connectedClients,
      socketIO: io.engine.clientsCount > 0 ? 'active' : 'inactive',
      activeConnections: Object.keys(io.sockets.sockets).length
    },
    lastSensorUpdate: systemState.sensorData.timestamp,
    alertStatus: systemState.alertStatus,
   
    recentEvents: eventLog.slice(-5)
  });
});

/**
 * POST /sensor-data
 * Arduino envía datos de sensores
 */
app.post('/sensor-data', (req, res) => {
  const { temperature, light, smoke, humidity, imageBase64 } = req.body;
  
  logEvent('sensor', '📊 Datos de sensores recibidos', { 
    temperature, 
    light, 
    smoke, 
    humidity,
    hasImage: !!imageBase64
  });

  // Actualizar estado
  systemState.sensorData = {
    temperature: parseFloat(temperature),
    light: parseFloat(light),
    smoke: parseFloat(smoke),
    humidity: humidity ? parseFloat(humidity) : undefined,
    timestamp: new Date()
  };

  // Guardar en SQLite
  try {
    databaseService.saveSensorData({
      temperature: parseFloat(temperature),
      light: parseFloat(light),
      smoke: parseFloat(smoke),
      humidity: humidity ? parseFloat(humidity) : null
    });
  } catch (error) {
    console.error('⚠️  Error al guardar datos en SQLite:', error);
  }

  // Enviar a todas las apps móviles conectadas
  io.emit('sensorData', systemState.sensorData);

  // Verificar si se superan umbrales
  const thresholdExceeded = checkThresholds(systemState.sensorData, systemState.thresholds);
  
  // Lógica asíncrona de análisis
  (async () => {
    if (thresholdExceeded.exceeded) {
      
      // --- THROTTLING: Evitar saturar la IA ---
      if (systemState.isAnalyzing) {
          console.log(`⚠️ [Skipped] Análisis en curso. Ignorando lectura de sensor.`);
          return;
      }
      systemState.isAnalyzing = true;

      try {
      // 1. Generar Event ID (Observability)
      const eventId = uuid.v4();
      const deviceId = "arduino-01"; // Hardcoded por ahora, idealmente viene del request
      const ts_backend_receive_sensor = new Date().getTime(); // Timestamp 1: Recepción sensor

      logEvent('warning', `⚠️ [${eventId}] ¡Umbral superado! Iniciando análisis de IA...`, thresholdExceeded);
      systemState.alertStatus = 'Riesgo';
      io.emit('alertStatus', 'Riesgo');
      
      // Analizar directamente usando RTSP o imagen proporcionada
      if (AI_SERVICE_URL && (RTSP_URL || imageBase64)) {
        logEvent('analysis', `🎥 [${eventId}] Analizando ${imageBase64 ? 'imagen proporcionada' : 'stream RTSP: ' + RTSP_URL}`);
        
        try {
          // --- NUEVO: Guardar estado "ANALYZING" antes de llamar a la IA ---
          const initialRichEvent = {
            event_id: eventId,
            device_id: deviceId,
            timestamp: ts_backend_receive_sensor,
            risk_level: 'ANALYZING', // Estado inicial
            ai_result: null, // Aún no hay resultados
            sensor_data: {
                temperature: systemState.sensorData.temperature,
                light: systemState.sensorData.light,
                smoke: systemState.sensorData.smoke,
                humidity: systemState.sensorData.humidity,
                timestamp: systemState.sensorData.timestamp instanceof Date 
                  ? systemState.sensorData.timestamp.getTime() 
                  : systemState.sensorData.timestamp
            },
            latencies: {
                backend_receive_sensor: ts_backend_receive_sensor
            },
            evidence: null
          };
          
          // Guardar inmediatamente en CloudDB
          await cloudDb.syncEvent(initialRichEvent);
          logEvent('info', `💾 [${eventId}] Evento guardado como ANALYZING en CloudDB`);

          const ts_backend_send_jetson = new Date().getTime(); // Timestamp 2: Inicio llamada IA

          // 2. Llamada a AI Service con Metadata
          const aiResult = await aiAdapter.analyze(
            AI_SERVICE_URL, 
            RTSP_URL, 
            imageBase64, 
            systemState.sensorData,
            eventId,
            { ts_backend_receive_sensor, ts_backend_send_jetson }
          );
          
          const ts_backend_response_jetson = aiResult.ts_backend_response_jetson || new Date().getTime(); // Timestamp 5: Respuesta IA

          // 3. Procesar Evidencia (S3) - Opción A
          let evidenceData = null;
          if (aiResult.image_base64) {
             try {
                evidenceData = await storageService.uploadEvidence(
                    aiResult.image_base64,
                    deviceId,
                    eventId,
                    'jpg'
                );
             } catch (s3Err) {
                console.error(`❌ [${eventId}] Error subiendo evidencia S3:`, s3Err);
             }
          }

          // 4. Construir "Rich Event" FINAL para DynamoDB (Update)
          const richEvent = {
            ...initialRichEvent, // Copiar datos base
            risk_level: 'NORMAL', // Se ajustará abajo
            ai_result: {
                confidence: aiResult.confidence,
                class: aiResult.class,
                boxes: aiResult.boxes,
                fireDetected: aiResult.fireDetected
            },
            latencies: {
                ...initialRichEvent.latencies,
                backend_send_jetson: ts_backend_send_jetson,
                jetson_start: aiResult.timestamps?.jetson_start,
                jetson_end: aiResult.timestamps?.jetson_end,
                backend_response_jetson: ts_backend_response_jetson,
                total_roundtrip: ts_backend_response_jetson - ts_backend_send_jetson
            },
            evidence: evidenceData // { bucket, key, location }
          };

          // Emitir resultado a clientes conectados (dashboard)
          io.emit('analysisResult', aiResult);

          if (aiResult && aiResult.fireDetected && aiResult.confidence > 0.7) {
            systemState.alertStatus = 'Confirmado';
            richEvent.risk_level = 'CONFIRMED';
            
            io.emit('alertStatus', 'Confirmado');
            logEvent('alert', `🔥 [${eventId}] ¡FUEGO CONFIRMADO! Confianza: ${aiResult.confidence}`);
            
            await sendAlerts(aiResult, eventId);

          } else {
             // Riesgo pero no confirmado
             richEvent.risk_level = 'RISK';
             logEvent('info', `✅ [${eventId}] Análisis IA: No confirmado (${aiResult.confidence})`);
          }
          
          // 5. Sync to Cloud (Persistencia)
          // Guardamos SIEMPRE el evento si hubo riesgo inicial (threshold exceeded)
          cloudDb.syncEvent(richEvent);

        } catch (error) {
          logEvent('error', `❌ [${eventId}] Error en análisis/persistencia:`, { message: error.message });
        }
      } else {
        logEvent('warning', '⚠️ No se puede analizar: Falta configurar AI_SERVICE_URL o RTSP_URL');
      }
      } finally {
        systemState.isAnalyzing = false;
      }
    } else {
      // Si los sensores vuelven a normalidad
      if (systemState.alertStatus !== 'Normal' && systemState.alertStatus !== 'Confirmado') {
         // Auto-recovery de estado Riesgo a Normal si sensores bajan
         systemState.alertStatus = 'Normal';
         io.emit('alertStatus', 'Normal');
         logEvent('info', '✅ Niveles de sensores normalizados.');
      }
    }
  })();

  res.json({ 
    success: true, 
    message: 'Datos recibidos',
    alertStatus: systemState.alertStatus,
    thresholdExceeded: thresholdExceeded.exceeded
  });
});

/**
 * GET /status
 * Obtener estado actual del sistema
 */
app.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      sensorData: systemState.sensorData,
      alertStatus: systemState.alertStatus,
      thresholds: systemState.thresholds,
      connectedClients: systemState.connectedClients,
      serverTime: new Date()
    }
  });
});

/**
 * GET /connections
 * Ver todas las conexiones activas y estadísticas de endpoints
 */
app.get('/connections', (req, res) => {
  const connections = Array.from(activeConnections.values());
  const endpointArray = Array.from(endpointStats.values());
  
  // Calcular total de requests
  const totalRequests = endpointArray.reduce((sum, stat) => sum + stat.count, 0);
  
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    summary: {
      activeWebSocketConnections: connections.length,
      totalHTTPRequests: totalRequests,
      uniqueEndpoints: endpointStats.size,
      serverUptime: Math.floor(process.uptime()) + 's'
    },
    webSocketConnections: connections.map(conn => ({
      socketId: conn.socketId,
      connectedAt: conn.connectedAt,
      lastActivity: conn.lastActivity,
      duration: Math.floor((new Date() - new Date(conn.connectedAt)) / 1000) + 's',
      address: conn.address,
      userAgent: conn.userAgent,
      eventsReceived: conn.events
    })),
    httpEndpoints: endpointArray.map(stats => ({
      method: stats.method,
      path: stats.path,
      requests: stats.count,
      firstAccess: stats.firstAccess,
      lastAccess: stats.lastAccess,
      percentage: totalRequests > 0 ? ((stats.count / totalRequests) * 100).toFixed(2) + '%' : '0%'
    })).sort((a, b) => b.requests - a.requests),
    recentRequests: recentRequests.slice(-20).reverse() // Últimos 20, más recientes primero
  });
});

/**
 * POST /trigger-analysis
 * Endpoint manual para solicitar análisis RTSP
 */
app.post('/trigger-analysis', async (req, res) => {
  logEvent('trigger', '🎥 Análisis RTSP solicitado manualmente');
  
  if (!AI_SERVICE_URL || !RTSP_URL) {
    return res.status(400).json({ 
      success: false, 
      message: 'Falta configuración de AI_SERVICE_URL o RTSP_URL' 
    });
  }

  try {
    const aiResult = await aiAdapter.analyze(AI_SERVICE_URL, RTSP_URL, null, systemState.sensorData);
    
    // Emitir resultado
    io.emit('analysisResult', aiResult);
    
    if (aiResult.fireDetected && aiResult.confidence > 0.7) {
       logEvent('alert', '🔥 Manual: Fuego detectado en análisis manual', aiResult);
    } else {
       logEvent('info', '✅ Manual: No se detectó fuego', aiResult);
    }

    res.json({ 
      success: true, 
      message: 'Análisis ejecutado',
      result: aiResult
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /history
 * Obtener historial de eventos
 */
app.get('/history', (req, res) => {
  res.json({
    success: true,
    data: systemState.history
  });
});

/**
 * GET /logs
 * Obtener logs del sistema
 */
app.get('/logs', (req, res) => {
  res.json({
    success: true,
    data: eventLog
  });
});

/**
 * POST /update-thresholds
 * Actualizar umbrales manualmente
 */
app.post('/update-thresholds', (req, res) => {
  const { temperature, light, smoke, humidity } = req.body;
  
  systemState.thresholds = {
    temperature: parseFloat(temperature) || systemState.thresholds.temperature,
    light: parseFloat(light) || systemState.thresholds.light,
    smoke: parseFloat(smoke) || systemState.thresholds.smoke,
    humidity: humidity ? parseFloat(humidity) : systemState.thresholds.humidity
  };

  // Guardar umbrales en SQLite
  try {
    databaseService.setConfig('threshold_temperature', systemState.thresholds.temperature.toString(), 'number');
    databaseService.setConfig('threshold_light', systemState.thresholds.light.toString(), 'number');
    databaseService.setConfig('threshold_smoke', systemState.thresholds.smoke.toString(), 'number');
    databaseService.setConfig('threshold_humidity', systemState.thresholds.humidity.toString(), 'number');
  } catch (error) {
    console.error('⚠️  Error al guardar umbrales en SQLite:', error);
  }

  logEvent('config', '⚙️ Umbrales actualizados vía API', systemState.thresholds);

  res.json({
    success: true,
    message: 'Umbrales actualizados',
    thresholds: systemState.thresholds
  });
});

/**
 * GET /
 * Página de inicio (Dashboard)
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../FrontendDashboard/index.html'));
});

// Servir archivos estáticos del Dashboard
app.use(express.static(path.join(__dirname, '../FrontendDashboard')));

// ==================== FUNCIONES AUXILIARES ====================

function checkThresholds(sensorData, thresholds) {
  const reasons = [];
  let exceeded = false;

  if (sensorData.temperature > thresholds.temperature) {
    reasons.push(`Temperatura alta (${sensorData.temperature}°C > ${thresholds.temperature}°C)`);
    exceeded = true;
  }
  
  if (sensorData.light > thresholds.light) {
    reasons.push(`Luminosidad alta (${sensorData.light} > ${thresholds.light})`);
    exceeded = true;
  }
  
  if (sensorData.smoke > thresholds.smoke) {
    reasons.push(`Humo detectado (${sensorData.smoke} > ${thresholds.smoke})`);
    exceeded = true;
  }
  
  if (sensorData.humidity && sensorData.humidity < thresholds.humidity) {
    reasons.push(`Humedad baja (${sensorData.humidity}% < ${thresholds.humidity}%)`);
    exceeded = true;
  }

  return { exceeded, reasons };
}

/**
 * Invoca una función Lambda de AWS
 * @param {string} functionName - Nombre o ARN de la función
 * @param {object} payload - Datos a enviar
 * @param {string} type - Tipo de alerta (email, sms, telegram)
 */
async function invokeAwsLambda(functionName, payload, type) {
  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Asíncrono (no espera respuesta)
      Payload: JSON.stringify({
        ...payload,
        type: type // Añadir tipo al payload
      })
    });

    const response = await lambdaClient.send(command);
    logEvent('info', `⚡ Lambda invocada (${type}): ${functionName} - Status: ${response.StatusCode}`);
    return response;
  } catch (error) {
    console.error(`❌ Error invocando Lambda ${functionName}:`, error);
    throw error;
  }
}

async function sendAlerts(aiResult, requestId) {
  logEvent('alert', '🚨 ENVIANDO ALERTAS DE FUEGO');
  
  const message = `
🔥 ALERTA DE FUEGO DETECTADO

Confianza: ${(aiResult.confidence * 100).toFixed(1)}%
Ubicación: Sensor Principal
Hora: ${new Date().toLocaleString('es-ES')}

Datos de Sensores:
🌡️ Temperatura: ${systemState.sensorData.temperature}°C
💡 Luminosidad: ${systemState.sensorData.light}
💨 Humo: ${systemState.sensorData.smoke}
💧 Humedad: ${systemState.sensorData.humidity}%

ID de Captura: ${requestId}
  `.trim();

  // Aquí implementarías el envío real de alertas
  // Por ahora solo simulamos
  
  console.log('\n' + '='.repeat(60));
  console.log(message);
  console.log('='.repeat(60) + '\n');

 
  console.log('[ALERT] ☁️  El evento se sincronizará con la nube para enviar alertas reales (Email/SMS/Telegram/WhatsApp) vía AWS Lambda.');

  // NOTA: Ya no invocamos Lambda directamente desde aquí.
  // La sincronización con DynamoDB (cloudDb.syncEvent) disparará el Lambda eventsProcessor automáticamente.
  // Esto evita errores de "event.Records is not iterable" y duplicidad de lógica.
}

// ==================== ENDPOINTS DE API PARA DATOS ====================

/**
 * GET /api/sensor-data
 * Obtener últimos datos de sensores
 */
app.get('/api/sensor-data', (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const data = databaseService.getLatestSensorData(limit);
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/alerts
 * Obtener alertas
 */
app.get('/api/alerts', (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const unresolvedOnly = req.query.unresolved === 'true';
    const data = databaseService.getAlerts(limit, unresolvedOnly);
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/captures
 * Obtener capturas
 */
app.get('/api/captures', (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const data = databaseService.getCaptures(limit);
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/statistics
 * Obtener estadísticas
 */
app.get('/api/statistics', (req, res) => {
  try {
    const stats = databaseService.getStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/alerts/:id/resolve
 * Marcar alerta como resuelta
 */
app.post('/api/alerts/:id/resolve', (req, res) => {
  try {
    const alertId = req.params.id;
    databaseService.resolveAlert(alertId);
    res.json({
      success: true,
      message: 'Alerta marcada como resuelta'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/contacts
 * Agregar nuevo contacto de notificación
 */
app.post('/api/contacts', async (req, res) => {
  try {
    const { type, value, name } = req.body;
    if (!type || !value) {
      return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
    }
    
    const contact = await cloudDb.addContact({ type, value, name });
    res.json({ success: true, contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/contacts
 * Listar contactos
 */
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await cloudDb.getContacts();
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/contacts/:id
 * Eliminar contacto
 */
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    await cloudDb.deleteContact(req.params.id);
    res.json({ success: true, message: 'Contacto eliminado' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/contacts/:id
 * Actualizar contacto
 */
app.put('/api/contacts/:id', async (req, res) => {
  try {
    await cloudDb.updateContact(req.params.id, req.body);
    res.json({ success: true, message: 'Contacto actualizado' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== INICIAR SERVIDOR ====================

// Crear carpetas necesarias
const capturesDir = path.join(__dirname, 'captures');
if (!fs.existsSync(capturesDir)) {
  fs.mkdirSync(capturesDir, { recursive: true });
}

const modelsDir = path.join(__dirname, 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

// Inicializar SQLite
try {
  databaseService.initializeTables();
  console.log('✅ Base de datos SQLite inicializada correctamente');
  
  // Cargar última lectura de sensores desde SQLite
  try {
    const lastSensors = databaseService.getLatestSensorData(1);
    if (lastSensors && lastSensors.length > 0) {
      const last = lastSensors[0];
      systemState.sensorData = {
        temperature: last.temperature,
        light: last.light,
        smoke: last.smoke,
        humidity: last.humidity,
        timestamp: last.timestamp ? new Date(last.timestamp) : new Date(),
      };
      console.log('✅ Última lectura de sensores cargada desde SQLite');
      console.log(`   Temperatura: ${last.temperature}°C, Luz: ${last.light}, Humo: ${last.smoke}`);
    } else {
      console.log('ℹ️ No hay lecturas previas en SQLite; esperando nuevos datos');
    }
  } catch (error) {
    console.error('⚠️  No se pudo cargar última lectura de sensores:', error);
  }
  
  // Cargar último estado de alerta desde SQLite
  try {
    const lastAlertStatus = databaseService.getLastAlertStatus();
    systemState.alertStatus = lastAlertStatus;
    console.log(`✅ Último estado de alerta cargado desde SQLite: ${lastAlertStatus}`);
  } catch (error) {
    console.error('⚠️  No se pudo cargar último estado de alerta:', error);
  }
  
  // Cargar umbrales desde configuración
  try {
    const tempThreshold = databaseService.getConfig('threshold_temperature');
    const lightThreshold = databaseService.getConfig('threshold_light');
    const smokeThreshold = databaseService.getConfig('threshold_smoke');
    const humidityThreshold = databaseService.getConfig('threshold_humidity');
    
    if (tempThreshold) {
      systemState.thresholds.temperature = parseFloat(tempThreshold.value);
    }
    if (lightThreshold) {
      systemState.thresholds.light = parseFloat(lightThreshold.value);
    }
    if (smokeThreshold) {
      systemState.thresholds.smoke = parseFloat(smokeThreshold.value);
    }
    if (humidityThreshold) {
      systemState.thresholds.humidity = parseFloat(humidityThreshold.value);
    }
    
    if (tempThreshold || lightThreshold || smokeThreshold || humidityThreshold) {
      console.log('✅ Umbrales cargados desde SQLite');
    }
  } catch (error) {
    console.error('⚠️  No se pudieron cargar umbrales desde SQLite:', error);
  }
  
} catch (error) {
  console.error('❌ Error al inicializar SQLite:', error);
}

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Iniciar sincronización periódica de sensores a la nube (cada 5 minutos)
if (process.env.ENABLE_CLOUD_SYNC !== 'false') {
  syncService.startPeriodicSync(5 * 60 * 1000);
}

server.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🔥 FIRE ID BACKEND SERVER');
  console.log('HOST:', HOST);
  console.log('='.repeat(60));
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🌐 Acceso desde red: http://${getLocalIP()}:${PORT}`);
  console.log('='.repeat(60));
  console.log('\n📱 Configuración para App Móvil:');
  console.log(`   URL: http://${getLocalIP()}:${PORT}`);
  console.log('');
  console.log('🤖 Configuración para Arduino:');
  console.log(`   URL: http://${getLocalIP()}:${PORT}/sensor-data`);
  console.log('');
  console.log('🧠 Servicio de IA:');
  if (AI_SERVICE_URL && AI_SERVICE_URL !== 'http://localhost:5000/analyze') {
    console.log(`   Externo: ${AI_SERVICE_URL}`);
  } else {
    console.log('   Local: TensorFlow.js (Deep Learning)');
  }
  console.log('');
  console.log('⏳ Esperando conexiones...\n');
});

// Obtener IP local
function getLocalIP() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Manejo de errores
process.on('uncaughtException', (error) => {
  logEvent('error', '❌ Error no capturado', { error: error.message });
  console.error(error);
});

process.on('unhandledRejection', (reason, promise) => {
  logEvent('error', '❌ Promesa rechazada no manejada', { reason });
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

