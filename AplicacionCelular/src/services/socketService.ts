// Servicio para comunicación WebSocket con el backend

import { io, Socket } from 'socket.io-client';
import { SERVER_CONFIG } from '../constants/config';
import { SensorData, CaptureRequest, AlertStatus } from '../types';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(): void {
    const serverUrl = `${SERVER_CONFIG.url}:${SERVER_CONFIG.port}`;
    
    console.log('Conectando a:', serverUrl);

    this.socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: SERVER_CONFIG.reconnectInterval,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('✅ Conectado al servidor');
      this.emit('connectionStatus', { connected: true });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor');
      this.emit('connectionStatus', { connected: false });
    });

    this.socket.on('error', (error) => {
      console.error('Error de socket:', error);
      this.emit('error', error);
    });

    // Escuchar datos de sensores en tiempo real
    this.socket.on('sensorData', (data: SensorData) => {
      console.log('📊 Datos de sensores recibidos:', data);
      this.emit('sensorData', data);
    });

    // Escuchar solicitudes de captura
    this.socket.on('captureRequest', (request: CaptureRequest) => {
      console.log('📸 Solicitud de captura recibida:', request);
      this.emit('captureRequest', request);
    });

    // Escuchar cambios de estado de alerta
    this.socket.on('alertStatus', (status: AlertStatus) => {
      console.log('🚨 Estado de alerta:', status);
      this.emit('alertStatus', status);
    });

    // Escuchar resultado de análisis de IA
    this.socket.on('analysisResult', (result: any) => {
      console.log('🤖 Resultado de análisis:', result);
      this.emit('analysisResult', result);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Enviar respuesta con archivos capturados
  sendCaptureResponse(data: any): void {
    if (this.socket?.connected) {
      this.socket.emit('captureResponse', data);
      console.log('📤 Respuesta de captura enviada');
    } else {
      console.error('No hay conexión con el servidor');
    }
  }

  // Enviar actualización de umbrales
  sendThresholdUpdate(thresholds: any): void {
    if (this.socket?.connected) {
      this.socket.emit('thresholdUpdate', thresholds);
      console.log('⚙️ Umbrales actualizados');
    }
  }

  // Sistema de eventos interno
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

export default new SocketService();

