// Componente para mostrar datos de un sensor

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, NEUMORPHIC, BORDER_RADIUS, SPACING, FONTS } from '../constants/theme';

interface SensorCardProps {
  title: string;
  value: string;
  icon: string;
  threshold?: number;
  currentValue?: number;
  unit?: string;
}

const SensorCard: React.FC<SensorCardProps> = ({
  title,
  value,
  icon,
  threshold,
  currentValue,
  unit = '',
}) => {
  const isOverThreshold =
    threshold !== undefined &&
    currentValue !== undefined &&
    currentValue > threshold;

  const calculatePercentage = (): number => {
    if (threshold && currentValue !== undefined) {
      return Math.min((currentValue / threshold) * 100, 100);
    }
    return 0;
  };

  const percentage = calculatePercentage();

  return (
    <View style={[styles.container, NEUMORPHIC.raised]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, NEUMORPHIC.pressed]}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.value, isOverThreshold && styles.valueWarning]}>
            {value}
          </Text>
        </View>
      </View>

      {threshold !== undefined && (
        <View style={styles.footer}>
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBarBg, NEUMORPHIC.pressed]}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { 
                    width: `${percentage}%`,
                    backgroundColor: isOverThreshold ? COLORS.danger : COLORS.primary,
                  }
                ]}
              />
            </View>
            <Text style={styles.thresholdText}>
              Umbral: {threshold}{unit}
            </Text>
          </View>
        </View>
      )}

      {isOverThreshold && (
        <View style={[styles.warningBadge, NEUMORPHIC.raised]}>
          <Text style={styles.warningIcon}>⚠</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    padding: 10,
    backgroundColor: COLORS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.backgroundDark,
  },
  icon: {
    fontSize: 20,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    ...FONTS.bold,
  },
  value: {
    fontSize: 18,
    color: COLORS.textPrimary,
    ...FONTS.extraBold,
  },
  valueWarning: {
    color: COLORS.danger,
  },
  footer: {
    marginTop: 6,
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 5,
    backgroundColor: COLORS.backgroundLight,
    borderRadius: BORDER_RADIUS.sm,
    overflow: 'hidden',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: COLORS.backgroundDark,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: BORDER_RADIUS.sm,
  },
  thresholdText: {
    fontSize: 8,
    color: COLORS.textMuted,
    ...FONTS.medium,
  },
  warningBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: COLORS.danger,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  warningIcon: {
    fontSize: 14,
    color: '#FFFFFF',
  },
});

export default SensorCard;

