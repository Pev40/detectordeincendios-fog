// Pantalla de actividad reciente - Última captura y últimos datos de sensores

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import apiService from '../services/apiService';
import { COLORS, SPACING, BORDER_RADIUS, FONTS, NEUMORPHIC, SHADOWS } from '../constants/theme';
import { formatTemperature, formatPercentage, formatDate } from '../utils/formatters';

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

const ActivityScreen: React.FC = () => {
  const [latestCapture, setLatestCapture] = useState<CaptureRecord | null>(null);
  const [sensorDataList, setSensorDataList] = useState<SensorDataRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [capture, sensorData] = await Promise.all([
        apiService.getLatestCapture(),
        apiService.getLatestSensorData(10),
      ]);

      setLatestCapture(capture);
      setSensorDataList(sensorData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert(
        'Error',
        'No se pudieron cargar los datos. Verifica la conexión al servidor.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderLatestCapture = () => {
    if (!latestCapture) {
      return (
        <View style={[styles.captureCard, NEUMORPHIC.raised]}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📸</Text>
            <Text style={styles.emptyText}>No hay capturas disponibles</Text>
          </View>
        </View>
      );
    }

    const imageUrl = apiService.getCaptureImageUrl(latestCapture.image_path);
    const fireDetected = latestCapture.fire_detected === 1;
    const confidenceValue = parseFloat((latestCapture.confidence * 100).toFixed(1));
    
    // Log para debugging
    console.log('📸 Ruta original:', latestCapture.image_path);
    console.log('🌐 URL construida:', imageUrl);
    
    // Resetear error de imagen cuando cambia la captura
    if (imageError) {
      setImageError(false);
    }
    
    // Determinar estilo del badge según confianza
    const getConfidenceStyle = () => {
      if (confidenceValue >= 70) {
        return { bg: COLORS.danger, icon: '🔥' };
      }
      if (confidenceValue >= 40) {
        return { bg: COLORS.warning, icon: '⚠️' };
      }
      return { bg: COLORS.success, icon: '✅' };
    };
    
    const confidenceStyle = getConfidenceStyle();

    return (
      <View style={[styles.captureCard, NEUMORPHIC.raised]}>
        <View style={styles.captureHeader}>
          <View style={styles.captureHeaderLeft}>
            <Text style={styles.captureTitle}>
              {fireDetected ? '🔥 Fuego Detectado' : '✅ Sin Detección'}
            </Text>
            <Text style={styles.captureTimestamp}>
              {formatDate(new Date(latestCapture.timestamp))}
            </Text>
          </View>
          <View style={[styles.confidenceBadge, { backgroundColor: confidenceStyle.bg }]}>
            <Text style={styles.confidenceIcon}>{confidenceStyle.icon}</Text>
            <Text style={styles.confidenceText}>{confidenceValue}%</Text>
          </View>
        </View>

        {imageUrl && !imageError ? (
          <View style={styles.imageContainer}>
            <Image
              source={{ 
                uri: imageUrl,
                cache: 'reload' // Forzar recarga de la imagen
              }}
              style={styles.captureImage}
              resizeMode="cover"
              onError={(error) => {
                console.error('❌ Error al cargar imagen:', error.nativeEvent.error);
                console.error('URL intentada:', imageUrl);
                console.error('Ruta original:', latestCapture.image_path);
                setImageError(true);
              }}
              onLoad={() => {
                console.log('✅ Imagen cargada exitosamente:', imageUrl);
              }}
            />
          </View>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>
              {imageError ? '❌ Error al cargar imagen' : '📷 Imagen no disponible'}
            </Text>
            <Text style={styles.imagePlaceholderSubtext}>
              {imageUrl ? `URL: ${imageUrl.substring(0, 50)}...` : (latestCapture.image_path || 'No hay ruta de imagen')}
            </Text>
            {imageError && (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => setImageError(false)}>
                <Text style={styles.retryButtonText}>Reintentar</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.captureFooter}>
          <Text style={styles.captureId}>
            ID: {latestCapture.request_id.substring(0, 24)}...
          </Text>
        </View>
      </View>
    );
  };

  const renderSensorDataItem = (item: SensorDataRecord) => {
    return (
      <View key={item.id} style={[styles.sensorItem, NEUMORPHIC.flat]}>
        <View style={styles.sensorItemHeader}>
          <Text style={styles.sensorItemTimestamp}>
            {formatDate(new Date(item.timestamp))}
          </Text>
        </View>

        <View style={styles.sensorItemData}>
          <View style={styles.sensorItemRow}>
            <Text style={styles.sensorItemLabel}>🌡️ Temp:</Text>
            <Text style={styles.sensorItemValue}>
              {formatTemperature(item.temperature)}
            </Text>
          </View>
          <View style={styles.sensorItemRow}>
            <Text style={styles.sensorItemLabel}>💡 Luz:</Text>
            <Text style={styles.sensorItemValue}>{item.light}</Text>
          </View>
          <View style={styles.sensorItemRow}>
            <Text style={styles.sensorItemLabel}>💨 Humo:</Text>
            <Text style={styles.sensorItemValue}>{item.smoke}</Text>
          </View>
          <View style={styles.sensorItemRow}>
            <Text style={styles.sensorItemLabel}>💧 Humedad:</Text>
            <Text style={styles.sensorItemValue}>
              {formatPercentage(item.humidity)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
        {/* Sección: Última Captura */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Última Captura</Text>
          {renderLatestCapture()}
        </View>

        {/* Sección: Últimos 10 Datos de Sensores */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Últimos Datos de sensores</Text>
          </View>

          {sensorDataList.length === 0 ? (
            <View style={[styles.emptyCard, NEUMORPHIC.raised]}>
              <Text style={styles.emptyIcon}>📊</Text>
              <Text style={styles.emptyText}>No hay datos de sensores disponibles</Text>
            </View>
          ) : (
            sensorDataList.map((item) => renderSensorDataItem(item))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    ...FONTS.medium,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 20,
    color: COLORS.textPrimary,
    ...FONTS.bold,
    marginBottom: SPACING.md,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
    ...FONTS.medium,
  },
  // Estilos para captura
  captureCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  captureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  captureHeaderLeft: {
    flex: 1,
  },
  captureTitle: {
    fontSize: 18,
    color: COLORS.textPrimary,
    ...FONTS.bold,
    marginBottom: SPACING.xs,
  },
  captureTimestamp: {
    fontSize: 12,
    color: COLORS.textMuted,
    ...FONTS.regular,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    gap: SPACING.xs,
    ...SHADOWS.small,
  },
  confidenceIcon: {
    fontSize: 14,
  },
  confidenceText: {
    fontSize: 13,
    color: '#FFFFFF',
    ...FONTS.bold,
    letterSpacing: 0.3,
  },
  imageContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    ...SHADOWS.medium,
  },
  captureImage: {
    width: '100%',
    height: 250,
    backgroundColor: COLORS.backgroundLight,
  },
  imagePlaceholder: {
    height: 250,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.backgroundDark,
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  imagePlaceholderSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
    ...FONTS.regular,
    marginTop: SPACING.xs,
  },
  retryButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    ...SHADOWS.small,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    ...FONTS.bold,
    textAlign: 'center',
  },
  captureFooter: {
    marginTop: SPACING.sm,
  },
  captureId: {
    fontSize: 10,
    color: COLORS.textMuted,
    ...FONTS.regular,
    fontFamily: 'monospace',
  },
  // Estilos para datos de sensores
  sensorItem: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sensorItemHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.backgroundDark,
  },
  sensorItemTimestamp: {
    fontSize: 11,
    color: COLORS.textMuted,
    ...FONTS.regular,
  },
  sensorItemData: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sensorItemRow: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  sensorItemLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    ...FONTS.medium,
  },
  sensorItemValue: {
    fontSize: 14,
    color: COLORS.textPrimary,
    ...FONTS.bold,
  },
  // Estilos para estados vacíos
  emptyState: {
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    ...FONTS.medium,
    textAlign: 'center',
  },
});

export default ActivityScreen;

