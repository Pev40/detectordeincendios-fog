// Componente para mostrar el estado actual del sistema

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertStatus } from '../types';
import { COLORS, NEUMORPHIC, BORDER_RADIUS, SPACING, FONTS } from '../constants/theme';

interface StatusCardProps {
  status: AlertStatus;
  lastUpdate: Date;
}

const StatusCard: React.FC<StatusCardProps> = ({ status, lastUpdate }) => {
  const getStatusConfig = (status: AlertStatus) => {
    switch (status) {
      case AlertStatus.NORMAL:
        return {
          color: COLORS.success,
          icon: '✓',
          title: 'Sistema Normal',
          message: 'Todos los sensores funcionan correctamente',
        };
      case AlertStatus.RISK:
        return {
          color: COLORS.warning,
          icon: '⚠',
          title: 'Alerta de Riesgo',
          message: 'Sensores detectaron valores anormales',
        };
      case AlertStatus.CONFIRMED:
        return {
          color: COLORS.danger,
          icon: '🔥',
          title: 'Fuego Confirmado',
          message: '¡EMERGENCIA! Fuego detectado por sistema IA',
        };
      default:
        return {
          color: COLORS.textMuted,
          icon: '?',
          title: 'Estado Desconocido',
          message: 'Sin información disponible',
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <View style={[styles.container, NEUMORPHIC.raised]}>
      <View style={[styles.iconCircle, { backgroundColor: config.color }]}>
        <Text style={[styles.icon, { color: '#FFFFFF' }]}>{config.icon}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>ESTADO DEL SISTEMA</Text>
        <Text style={[styles.title, { color: config.color }]}>{config.title}</Text>
        <Text style={styles.timestamp}>
          {lastUpdate.toLocaleTimeString('es-ES')}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.card,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  icon: {
    fontSize: 30,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
    ...FONTS.bold,
  },
  title: {
    fontSize: 18,
    marginBottom: 2,
    ...FONTS.extraBold,
  },
  timestamp: {
    fontSize: 10,
    color: COLORS.textSecondary,
    ...FONTS.regular,
  },
});

export default StatusCard;

