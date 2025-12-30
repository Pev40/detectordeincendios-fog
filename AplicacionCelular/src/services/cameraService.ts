// Servicio para captura de fotos

import { launchCamera, CameraOptions } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import { Platform, PermissionsAndroid } from 'react-native';

class CameraService {
  async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Permiso de Cámara',
            message: 'La app necesita acceso a la cámara para capturar fotos cuando se detecte fuego',
            buttonNeutral: 'Preguntar después',
            buttonNegative: 'Cancelar',
            buttonPositive: 'Permitir',
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
      return true; // iOS maneja permisos automáticamente
    } catch (error) {
      console.error('Error al solicitar permisos de cámara:', error);
      return false;
    }
  }

  async capturePhoto(): Promise<string | null> {
    try {
      console.log('📸 Abriendo cámara para capturar...');

      // Solicitar permiso si es necesario
      if (Platform.OS === 'android') {
        const hasPermission = await this.requestPermission();
        if (!hasPermission) {
          throw new Error('Permiso de cámara denegado');
        }
      }

      const options: CameraOptions = {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1920,
        maxHeight: 1080,
        saveToPhotos: false,
        includeBase64: true, // Obtener base64 directamente
      };

      return new Promise((resolve, reject) => {
        launchCamera(options, (response) => {
          if (response.didCancel) {
            console.log('❌ Usuario canceló la captura');
            resolve(null);
          } else if (response.errorCode) {
            console.error('❌ Error de cámara:', response.errorMessage);
            reject(new Error(response.errorMessage || 'Error al capturar foto'));
          } else if (response.assets && response.assets[0]) {
            const asset = response.assets[0];
            console.log('✅ Foto capturada exitosamente');
            
            // Retornar el path o base64
            resolve(asset.uri || null);
          } else {
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('Error al capturar foto:', error);
      return null;
    }
  }

  async convertPhotoToBase64(photoPath: string): Promise<string | null> {
    try {
      // Si la ruta empieza con 'data:', ya es base64
      if (photoPath.startsWith('data:')) {
        return photoPath;
      }

      // Si es un path de archivo, leer y convertir
      const base64 = await RNFS.readFile(photoPath, 'base64');
      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      console.error('Error al convertir foto a base64:', error);
      return null;
    }
  }

  async deletePhoto(photoPath: string): Promise<void> {
    try {
      if (!photoPath || photoPath.startsWith('data:')) {
        return; // No hay archivo físico que eliminar
      }

      const exists = await RNFS.exists(photoPath);
      if (exists) {
        await RNFS.unlink(photoPath);
        console.log('🗑️ Foto temporal eliminada');
      }
    } catch (error) {
      console.error('Error al eliminar foto:', error);
    }
  }
}

export default new CameraService();

