// Utilidades para almacenamiento local

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/config';
import { Threshold } from '../types';

export const storage = {
  // Guardar URL del servidor
  async saveServerUrl(url: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_URL, url);
    } catch (error) {
      console.error('Error al guardar URL del servidor:', error);
    }
  },

  // Obtener URL del servidor
  async getServerUrl(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.SERVER_URL);
    } catch (error) {
      console.error('Error al obtener URL del servidor:', error);
      return null;
    }
  },

  // Guardar umbrales
  async saveThresholds(thresholds: Threshold): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.THRESHOLDS,
        JSON.stringify(thresholds)
      );
    } catch (error) {
      console.error('Error al guardar umbrales:', error);
    }
  },

  // Obtener umbrales
  async getThresholds(): Promise<Threshold | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.THRESHOLDS);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error al obtener umbrales:', error);
      return null;
    }
  },

  // Guardar última alerta
  async saveLastAlert(alert: any): Promise<void> {
    try {
      await AsyncStorage.setItem(
        STORAGE_KEYS.LAST_ALERT,
        JSON.stringify(alert)
      );
    } catch (error) {
      console.error('Error al guardar última alerta:', error);
    }
  },

  // Obtener última alerta
  async getLastAlert(): Promise<any | null> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.LAST_ALERT);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error al obtener última alerta:', error);
      return null;
    }
  },

  // Limpiar todo
  async clearAll(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error al limpiar almacenamiento:', error);
    }
  },
};

