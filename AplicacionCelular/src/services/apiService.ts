// Servicio para peticiones HTTP al backend

import axios from 'axios';
import { SERVER_CONFIG } from '../constants/config';

const API_BASE_URL = `${SERVER_CONFIG.url}:${SERVER_CONFIG.port}`;

interface SensorDataRecord {
  id: number;
  temperature: number;
  light: number;
  smoke: number;
  humidity: number;
  timestamp: string;
}

interface CaptureRecord {
  id: number;
  request_id: string;
  image_path: string | null;
  fire_detected: number;
  confidence: number;
  timestamp: string;
}

class ApiService {
  /**
   * Obtener últimos datos de sensores
   */
  async getLatestSensorData(limit: number = 10): Promise<SensorDataRecord[]> {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/sensor-data`, {
        params: { limit },
        timeout: 10000,
      });
      
      if (response.data.success) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error('❌ Error al obtener datos de sensores:', error);
      throw error;
    }
  }

  /**
   * Obtener última captura
   */
  async getLatestCapture(): Promise<CaptureRecord | null> {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/captures`, {
        params: { limit: 1 },
        timeout: 10000,
      });
      
      if (response.data.success && response.data.data.length > 0) {
        return response.data.data[0];
      }
      return null;
    } catch (error) {
      console.error('❌ Error al obtener última captura:', error);
      throw error;
    }
  }

  /**
   * Obtener imagen de captura (si está guardada en el servidor)
   */
  getCaptureImageUrl(imagePath: string | null): string | null {
    if (!imagePath) {
      console.log('⚠️ imagePath es null o undefined');
      return null;
    }
    
    // Si ya es una URL completa, retornarla
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      console.log('✅ imagePath ya es una URL:', imagePath);
      return imagePath;
    }
    
    // Si es una ruta completa del sistema (Windows o Unix), extraer la parte relativa
    if (imagePath.includes('captures')) {
      // Extraer la parte después de 'captures' (funciona con rutas absolutas y relativas)
      // Ejemplo: "D:\...\captures\capture_123\photo.jpg" -> "captures/capture_123/photo.jpg"
      const capturesIndex = imagePath.indexOf('captures');
      let relativePath = imagePath.substring(capturesIndex);
      
      console.log('📁 Ruta después de extraer "captures":', relativePath);
      
      // Normalizar separadores de ruta (Windows usa \, Unix usa /)
      relativePath = relativePath.replace(/\\/g, '/');
      
      console.log('📁 Ruta normalizada:', relativePath);
      
      // Asegurar que empiece con /
      if (!relativePath.startsWith('/')) {
        relativePath = '/' + relativePath;
      }
      
      const finalUrl = `${API_BASE_URL}${relativePath}`;
      console.log('🌐 URL final construida:', finalUrl);
      
      return finalUrl;
    }
    
    // Si es una ruta relativa que empieza con '/', construir URL completa
    if (imagePath.startsWith('/')) {
      const finalUrl = `${API_BASE_URL}${imagePath}`;
      console.log('🌐 URL construida desde ruta relativa:', finalUrl);
      return finalUrl;
    }
    
    // Si es una ruta relativa sin '/', asumir que está en captures/
    const finalUrl = `${API_BASE_URL}/captures/${imagePath}`;
    console.log('🌐 URL construida desde ruta sin /:', finalUrl);
    return finalUrl;
  }
}

export default new ApiService();

