/**
 * Fire ID - Sistema de Detección de Fuego IoT
 * Aplicación móvil para captura de foto y audio
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import databaseService from './src/services/databaseService';

function App() {
  useEffect(() => {
    // Inicializar base de datos SQLite al arrancar
    const initDatabase = async () => {
      try {
        await databaseService.initialize();
        console.log('✅ Base de datos inicializada en App');
      } catch (error) {
        console.error('❌ Error al inicializar base de datos:', error);
      }
    };

    initDatabase();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#2196F3" />
      <AppNavigator />
    </SafeAreaProvider>
  );
}

export default App;
