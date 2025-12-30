// Configuración del sistema

export const SERVER_CONFIG = {
  // URL del servidor backend - IP real en la red WiFi
  url: 'http://192.168.1.34', // IP de la PC en la red local
  port: 3000,
  reconnectInterval: 5000, // 5 segundos
};

export const THRESHOLDS = {
  temperature: 35, // Grados Celsius
  light: 800, // Valor de luminosidad (ajustar según sensor)
  smoke: 500, // Valor de detección de humo
  humidity: 30, // Porcentaje de humedad mínimo
};

export const AUDIO_RECORDING = {
  duration: 5000, // 5 segundos en milisegundos
  sampleRate: 44100,
  channels: 1,
  bitsPerSample: 16,
};

export const CAMERA_CONFIG = {
  quality: 0.8,
  maxWidth: 1920,
  maxHeight: 1080,
};

export const STORAGE_KEYS = {
  SERVER_URL: '@fireID_server_url',
  THRESHOLDS: '@fireID_thresholds',
  LAST_ALERT: '@fireID_last_alert',
};

