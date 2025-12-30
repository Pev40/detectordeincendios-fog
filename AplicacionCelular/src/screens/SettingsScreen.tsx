// Pantalla de configuración de umbrales

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { THRESHOLDS, SERVER_CONFIG } from '../constants/config';
import { storage } from '../utils/storage';
import socketService from '../services/socketService';
import { Threshold } from '../types';

const SettingsScreen: React.FC = () => {
  const [thresholds, setThresholds] = useState<Threshold>({
    temperature: THRESHOLDS.temperature,
    light: THRESHOLDS.light,
    smoke: THRESHOLDS.smoke,
    humidity: THRESHOLDS.humidity,
  });

  const [serverUrl, setServerUrl] = useState(SERVER_CONFIG.url);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedThresholds = await storage.getThresholds();
    if (savedThresholds) {
      setThresholds(savedThresholds);
    }

    const savedUrl = await storage.getServerUrl();
    if (savedUrl) {
      setServerUrl(savedUrl);
    }
  };

  const handleSave = async () => {
    try {
      // Validar que los valores sean números válidos
      if (
        isNaN(thresholds.temperature) ||
        isNaN(thresholds.light) ||
        isNaN(thresholds.smoke)
      ) {
        Alert.alert('Error', 'Por favor ingresa valores numéricos válidos');
        return;
      }

      // Guardar en almacenamiento local
      await storage.saveThresholds(thresholds);
      await storage.saveServerUrl(serverUrl);

      // Enviar al servidor
      socketService.sendThresholdUpdate(thresholds);

      Alert.alert('✅ Guardado', 'La configuración se ha guardado correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la configuración');
      console.error('Error al guardar configuración:', error);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Restablecer valores',
      '¿Estás seguro de que quieres restablecer los valores por defecto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Restablecer',
          style: 'destructive',
          onPress: () => {
            setThresholds({
              temperature: THRESHOLDS.temperature,
              light: THRESHOLDS.light,
              smoke: THRESHOLDS.smoke,
              humidity: THRESHOLDS.humidity,
            });
            setServerUrl(SERVER_CONFIG.url);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>⚙️ Configuración</Text>
          <Text style={styles.subtitle}>
            Ajusta los umbrales y configuración del servidor
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌐 Servidor Backend</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>URL del Servidor</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.100"
              placeholderTextColor="#999"
              keyboardType="url"
            />
            <Text style={styles.helperText}>
              Ejemplo: http://192.168.1.100 o https://tu-servidor.com
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Umbrales de Sensores</Text>
          <Text style={styles.description}>
            Los sensores activarán una alerta cuando superen estos valores
          </Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>🌡️ Temperatura (°C)</Text>
            <TextInput
              style={styles.input}
              value={thresholds.temperature.toString()}
              onChangeText={(text) =>
                setThresholds({ ...thresholds, temperature: parseFloat(text) || 0 })
              }
              placeholder="35"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>💡 Luminosidad</Text>
            <TextInput
              style={styles.input}
              value={thresholds.light.toString()}
              onChangeText={(text) =>
                setThresholds({ ...thresholds, light: parseFloat(text) || 0 })
              }
              placeholder="800"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>💨 Humo</Text>
            <TextInput
              style={styles.input}
              value={thresholds.smoke.toString()}
              onChangeText={(text) =>
                setThresholds({ ...thresholds, smoke: parseFloat(text) || 0 })
              }
              placeholder="500"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>💧 Humedad (%)</Text>
            <TextInput
              style={styles.input}
              value={thresholds.humidity?.toString() || '30'}
              onChangeText={(text) =>
                setThresholds({ ...thresholds, humidity: parseFloat(text) || 0 })
              }
              placeholder="30"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.buttonPrimary} onPress={handleSave}>
            <Text style={styles.buttonPrimaryText}>💾 Guardar Cambios</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buttonSecondary} onPress={handleReset}>
            <Text style={styles.buttonSecondaryText}>🔄 Restablecer</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Información</Text>
          <Text style={styles.infoText}>
            • Los cambios se aplicarán inmediatamente{'\n'}
            • El servidor recibirá los nuevos umbrales{'\n'}
            • Se recomienda configurar la URL del servidor antes de iniciar
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  section: {
    padding: 20,
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    color: '#333',
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  buttonContainer: {
    padding: 20,
    gap: 12,
  },
  buttonPrimary: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonSecondary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  buttonSecondaryText: {
    color: '#2196F3',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    margin: 20,
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1976D2',
    lineHeight: 20,
  },
});

export default SettingsScreen;

