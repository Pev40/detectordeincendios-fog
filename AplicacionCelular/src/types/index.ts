// Tipos para el sistema de detección de fuego

export interface SensorData {
  temperature: number;
  light: number;
  smoke: number;
  humidity?: number;
  timestamp: Date;
}

export interface Threshold {
  temperature: number;
  light: number;
  smoke: number;
  humidity?: number;
}

export enum AlertStatus {
  NORMAL = 'Normal',
  RISK = 'Riesgo',
  CONFIRMED = 'Confirmado',
}

export interface Alert {
  id: string;
  status: AlertStatus;
  timestamp: Date;
  sensorData: SensorData;
  imageUrl?: string;
  audioUrl?: string;
  confidence?: number;
}

export interface CaptureRequest {
  requestId: string;
  timestamp: Date;
  reason: string;
}

export interface CaptureResponse {
  requestId: string;
  imageBase64?: string;
  audioBase64?: string;
  timestamp: Date;
  error?: string;
}

export interface ServerConfig {
  url: string;
  port: number;
  reconnectInterval: number;
}

