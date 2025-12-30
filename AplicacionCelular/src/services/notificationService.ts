// Servicio para manejar notificaciones push

import PushNotification from 'react-native-push-notification';
import { Platform, PermissionsAndroid } from 'react-native';

class NotificationService {
  private isConfigured: boolean = false;

  constructor() {
    this.configure();
  }

  private configure() {
    if (this.isConfigured) return;

    PushNotification.configure({
      onRegister: function (token) {
        console.log('📱 Token de notificación:', token);
      },

      onNotification: function (notification) {
        console.log('📬 Notificación recibida:', notification);
        
        // Si la notificación fue tocada, abrir la app
        if (notification.userInteraction) {
          console.log('👆 Usuario tocó la notificación');
        }
      },

      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },

      popInitialNotification: true,
      requestPermissions: Platform.OS === 'ios',
    });

    // Crear canal de notificaciones para Android
    if (Platform.OS === 'android') {
      PushNotification.createChannel(
        {
          channelId: 'firewatch-capture',
          channelName: 'FireWatch Capturas',
          channelDescription: 'Notificaciones para capturas de foto solicitadas',
          playSound: true,
          soundName: 'default',
          importance: 4, // Alta importancia
          vibrate: true,
        },
        (created) => console.log(`📢 Canal creado: ${created}`)
      );
    }

    this.isConfigured = true;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        // Android 13+ requiere permisos explícitos
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Permiso de Notificaciones',
              message: 'FireWatch necesita permisos para enviarte alertas de fuego',
              buttonNeutral: 'Preguntar después',
              buttonNegative: 'Cancelar',
              buttonPositive: 'Permitir',
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
      } else {
        // iOS requiere solicitud explícita
        return new Promise((resolve) => {
          PushNotification.requestPermissions((permissions) => {
            resolve(permissions.alert === true);
          });
        });
      }
    } catch (error) {
      console.error('Error al solicitar permisos de notificación:', error);
      return false;
    }
  }

  showCaptureNotification(requestId: string) {
    PushNotification.localNotification({
      channelId: 'firewatch-capture',
      title: '🔥 Captura de Foto Solicitada',
      message: 'El sistema ha detectado valores anormales. Toca para abrir y capturar foto.',
      playSound: true,
      soundName: 'default',
      importance: 'high',
      priority: 'high',
      vibrate: true,
      vibration: 1000,
      userInfo: {
        type: 'capture_request',
        requestId: requestId,
      },
      // Abrir la app cuando se toque la notificación
      invokeApp: true,
    });

    console.log('📬 Notificación de captura enviada');
  }

  showFireAlert() {
    PushNotification.localNotification({
      channelId: 'firewatch-capture',
      title: '🚨 ¡ALERTA DE FUEGO!',
      message: 'Se ha confirmado la presencia de fuego. Abre la app para más detalles.',
      playSound: true,
      soundName: 'default',
      importance: 'max',
      priority: 'max',
      vibrate: true,
      vibration: [1000, 1000, 1000],
      userInfo: {
        type: 'fire_alert',
      },
      // Abrir la app cuando se toque la notificación
      invokeApp: true,
    });

    console.log('🚨 Notificación de alerta de fuego enviada');
  }

  cancelAllNotifications() {
    PushNotification.cancelAllLocalNotifications();
  }
}

export default new NotificationService();

