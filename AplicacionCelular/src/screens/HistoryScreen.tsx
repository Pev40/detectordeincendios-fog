// Pantalla de historial de capturas y alertas

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import databaseService from '../services/databaseService';
import { formatDate, getStatusColor } from '../utils/formatters';

interface CaptureRecord {
  id: number;
  request_id: string;
  image_path: string | null;
  fire_detected: number;
  confidence: number;
  timestamp: string;
}

const HistoryScreen: React.FC = () => {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'captures' | 'alerts'>('captures');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [capturesData, alertsData] = await Promise.all([
        databaseService.getLocalCaptures(50),
        databaseService.getAllLocalAlerts(),
      ]);

      setCaptures(capturesData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos del historial');
    } finally {
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleClearHistory = () => {
    Alert.alert('Limpiar Historial', '¿Estás seguro de que deseas borrar todo el historial?', [
      { text: 'Cancelar', onPress: () => {} },
      {
        text: 'Borrar',
        onPress: async () => {
          try {
            await databaseService.clearAll();
            setCaptures([]);
            setAlerts([]);
            Alert.alert('Éxito', 'Historial borrado correctamente');
          } catch {
            Alert.alert('Error', 'No se pudo borrar el historial');
          }
        },
      },
    ]);
  };

  const renderCaptureItem = ({ item }: { item: CaptureRecord }) => (
    <View style={[styles.card, item.fire_detected ? styles.cardDanger : styles.cardNormal]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {item.fire_detected ? '🔥 Fuego Detectado' : '✅ Sin Detección'}
        </Text>
        <Text style={styles.timestamp}>{formatDate(new Date(item.timestamp))}</Text>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.row}>
          <Text style={styles.label}>Confianza:</Text>
          <Text style={styles.value}>{(item.confidence * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>ID Captura:</Text>
          <Text style={styles.value}>{item.request_id.substring(0, 20)}...</Text>
        </View>
        {item.image_path && (
          <View style={styles.row}>
            <Text style={styles.label}>Imagen:</Text>
            <Text style={styles.value}>Guardada</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderAlertItem = ({ item }: { item: any }) => {
    const resolvedColor = item.resolved ? '#4CAF50' : '#FF9800';
    
    return (
      <View style={[styles.card, item.fire_detected ? styles.cardDanger : styles.cardWarning]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {item.fire_detected ? '🔥 Alerta Crítica' : '⚠️  Alerta'}
          </Text>
          <Text style={styles.timestamp}>{formatDate(new Date(item.timestamp))}</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.message}>{item.message}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Severidad:</Text>
            <Text style={[styles.value, { color: getStatusColor(item.severity) }]}>
              {item.severity}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Confianza:</Text>
            <Text style={styles.value}>{(item.confidence * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Estado:</Text>
            <Text style={[styles.value, { color: resolvedColor }]}>
              {item.resolved ? 'Resuelta' : 'Pendiente'}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Historial</Text>
        <TouchableOpacity
          onPress={handleClearHistory}
          style={styles.clearButton}
        >
          <Text style={styles.clearButtonText}>Limpiar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          onPress={() => setActiveTab('captures')}
          style={[styles.tab, activeTab === 'captures' && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'captures' && styles.tabTextActive,
            ]}
          >
            📸 Capturas ({captures.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('alerts')}
          style={[styles.tab, activeTab === 'alerts' && styles.tabActive]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'alerts' && styles.tabTextActive,
            ]}
          >
            🚨 Alertas ({alerts.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'captures' && (
        <FlatList
          data={captures}
          renderItem={renderCaptureItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay capturas guardadas</Text>
            </View>
          }
        />
      )}

      {activeTab === 'alerts' && (
        <FlatList
          data={alerts}
          renderItem={renderAlertItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No hay alertas guardadas</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0e27',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomColor: '#1a1f3a',
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ff4444',
    borderRadius: 6,
  },
  clearButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0f1332',
    borderBottomColor: '#1a1f3a',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#00d4ff',
  },
  tabText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#00d4ff',
  },
  listContent: {
    padding: 12,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#0f1332',
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    overflow: 'hidden',
  },
  cardNormal: {
    borderLeftColor: '#4CAF50',
  },
  cardDanger: {
    borderLeftColor: '#ff4444',
  },
  cardWarning: {
    borderLeftColor: '#FF9800',
  },
  cardHeader: {
    padding: 12,
    borderBottomColor: '#1a1f3a',
    borderBottomWidth: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  timestamp: {
    fontSize: 11,
    color: '#888',
  },
  cardContent: {
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#888',
    fontSize: 12,
  },
  value: {
    color: '#00d4ff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  message: {
    color: '#ffffff',
    fontSize: 13,
    marginBottom: 8,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
  },
});

export default HistoryScreen;
