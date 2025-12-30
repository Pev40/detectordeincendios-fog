// Pantalla principal del Dashboard

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import ConnectionStatus from '../components/ConnectionStatus';
import StatusCard from '../components/StatusCard';
import SensorCard from '../components/SensorCard';
import socketService from '../services/socketService';
import captureService from '../services/captureService';
import notificationService from '../services/notificationService';
import { SensorData, AlertStatus, CaptureRequest } from '../types';
import { THRESHOLDS } from '../constants/config';
import { formatTemperature, formatPercentage } from '../utils/formatters';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, NEUMORPHIC } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;

const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [isConnected, setIsConnected] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>(AlertStatus.NORMAL);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  // Formateador seguro para números
  const formatValue = (val: number | null | undefined): string =>
    val === null || val === undefined || Number.isNaN(val) ? '--' : `${val}`;

  useEffect(() => {
    // Solicitar permisos de notificación
    notificationService.requestPermissions();

    // Conectar al servidor
    socketService.connect();

    // Escuchar eventos
    socketService.on('connectionStatus', handleConnectionStatus);
    socketService.on('sensorData', handleSensorData);
    socketService.on('alertStatus', handleAlertStatus);
    socketService.on('captureRequest', handleCaptureRequest);
    socketService.on('analysisResult', handleAnalysisResult);

    return () => {
      // Limpiar listeners
      socketService.off('connectionStatus', handleConnectionStatus);
      socketService.off('sensorData', handleSensorData);
      socketService.off('alertStatus', handleAlertStatus);
      socketService.off('captureRequest', handleCaptureRequest);
      socketService.off('analysisResult', handleAnalysisResult);
    };
  }, []);

  const handleConnectionStatus = (data: { connected: boolean }) => {
    setIsConnected(data.connected);
  };

  const handleSensorData = (data: SensorData) => {
    setSensorData(data);
    setLastUpdate(new Date());
  };

  const handleAlertStatus = (status: AlertStatus) => {
    setAlertStatus(status);
    if (status === AlertStatus.CONFIRMED) {
      // Mostrar notificación de alerta de fuego
      notificationService.showFireAlert();
      
      Alert.alert(
        '🔥 ¡ALERTA DE FUEGO!',
        'Se ha confirmado la presencia de fuego. Se han enviado las alertas correspondientes.',
        [{ text: 'Entendido' }]
      );
    }
  };

  const handleCaptureRequest = async (request: CaptureRequest) => {
    console.log('🚨 Captura solicitada automáticamente:', request.requestId);
    
    // Mostrar notificación push (para que el usuario sepa que se está capturando)
    notificationService.showCaptureNotification(request.requestId);

    // CAPTURA AUTOMÁTICA - Sin confirmación del usuario
    try {
      await captureService.handleCaptureRequest(request);
      console.log('✅ Captura automática completada');
    } catch (error) {
      console.error('❌ Error en captura automática:', error);
      // Mostrar alerta solo si hay error
      Alert.alert(
        '❌ Error en Captura',
        'No se pudo capturar la foto automáticamente.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleAnalysisResult = (result: any) => {
    console.log('📊 Resultado de análisis:', result);
    if (result.fireDetected) {
      setAlertStatus(AlertStatus.CONFIRMED);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }>
          
          {/* Header Compacto */}
          <View style={styles.header}>
            <View style={[styles.logoContainer, NEUMORPHIC.raised]}>
              <Text style={styles.logoIcon}>🔥</Text>
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>FireWatch</Text>
              <Text style={styles.subtitle}>Detección Inteligente</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.headerButton, NEUMORPHIC.flat]}
                onPress={() => navigation.navigate('Activity')}
                activeOpacity={0.7}>
                <Text style={styles.headerButtonIcon}>📊</Text>
              </TouchableOpacity>
              <ConnectionStatus isConnected={isConnected} />
            </View>
          </View>

          <View>
            <StatusCard status={alertStatus} lastUpdate={lastUpdate} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Sensores en Tiempo Real</Text>

              {sensorData ? (
                <View style={styles.sensorsGrid}>
                  <View style={styles.gridRow}>
                    <View style={styles.gridItem}>
                      <SensorCard
                        title="Temperatura"
                        value={formatTemperature(sensorData.temperature)}
                        icon="🌡️"
                        threshold={THRESHOLDS.temperature}
                        currentValue={sensorData.temperature ?? 0}
                        unit="°C"
                      />
                    </View>
                    <View style={styles.gridItem}>
                      <SensorCard
                        title="Luminosidad"
                        value={formatValue(sensorData.light)}
                        icon="💡"
                        threshold={THRESHOLDS.light}
                        currentValue={sensorData.light ?? 0}
                      />
                    </View>
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.gridItem}>
                      <SensorCard
                        title="Humo"
                        value={formatValue(sensorData.smoke)}
                        icon="💨"
                        threshold={THRESHOLDS.smoke}
                        currentValue={sensorData.smoke ?? 0}
                      />
                    </View>
                    {sensorData.humidity !== undefined && (
                      <View style={styles.gridItem}>
                        <SensorCard
                          title="Humedad"
                          value={formatPercentage(sensorData.humidity)}
                          icon="💧"
                          threshold={THRESHOLDS.humidity}
                          currentValue={sensorData.humidity ?? 0}
                          unit="%"
                        />
                      </View>
                    )}
                  </View>
                </View>
              ) : (
                <View style={[styles.noDataContainer, NEUMORPHIC.pressed]}>
                  <Text style={styles.noDataIcon}>📡</Text>
                  <Text style={styles.noDataText}>
                    {isConnected
                      ? 'Esperando datos...'
                      : 'Conecta al servidor'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>⚙️ Umbrales</Text>
            <View style={[styles.thresholdContainer, NEUMORPHIC.raised]}>
              <View style={styles.thresholdGrid}>
                <ThresholdItem label="Temp" value={`${THRESHOLDS.temperature}°C`} icon="🌡️" />
                <ThresholdItem label="Luz" value={`${THRESHOLDS.light}`} icon="💡" />
              </View>
              <View style={styles.thresholdGrid}>
                <ThresholdItem label="Humo" value={`${THRESHOLDS.smoke}`} icon="💨" />
                <ThresholdItem label="Humedad" value={`${THRESHOLDS.humidity}%`} icon="💧" />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Botón flotante Neumorphic para configuración */}
        <TouchableOpacity
          style={[styles.fab, NEUMORPHIC.raised]}
          onPress={() => navigation.navigate('Settings')}
          activeOpacity={0.8}>
          <Text style={styles.fabIcon}>⚙️</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </>
  );
};

const ThresholdItem: React.FC<{ label: string; value: string; icon: string }> = ({
  label,
  value,
  icon,
}) => (
  <View style={styles.thresholdItem}>
    <Text style={styles.thresholdIcon}>{icon}</Text>
    <View>
      <Text style={styles.thresholdLabel}>{label}</Text>
      <Text style={styles.thresholdValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  logoContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  logoIcon: {
    fontSize: 26,
  },
  headerText: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.xs,
  },
  headerButtonIcon: {
    fontSize: 18,
  },
  title: {
    fontSize: 24,
    color: COLORS.textPrimary,
    ...FONTS.extraBold,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    ...FONTS.regular,
  },
  content: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 14,
    color: COLORS.textPrimary,
    ...FONTS.bold,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.md,
  },
  sensorsGrid: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  gridItem: {
    flex: 1,
  },
  noDataContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: SPACING.md,
  },
  noDataIcon: {
    fontSize: 36,
    marginBottom: SPACING.sm,
  },
  noDataText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    ...FONTS.regular,
  },
  thresholdContainer: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  thresholdGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  thresholdItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.xs,
  },
  thresholdIcon: {
    fontSize: 20,
  },
  thresholdLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    ...FONTS.medium,
  },
  thresholdValue: {
    fontSize: 12,
    color: COLORS.textPrimary,
    ...FONTS.bold,
  },
  fab: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: {
    fontSize: 24,
  },
});

export default DashboardScreen;

