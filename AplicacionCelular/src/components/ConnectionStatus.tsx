// Componente para mostrar el estado de conexión con el servidor

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, NEUMORPHIC, BORDER_RADIUS, SPACING, FONTS } from '../constants/theme';

interface ConnectionStatusProps {
  isConnected: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ isConnected }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isConnected) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [isConnected, pulseAnim]);

  const statusColor = isConnected ? COLORS.success : COLORS.danger;
  const statusText = isConnected ? 'Conectado' : 'Desconectado';

  return (
    <View style={[
      styles.container, 
      isConnected ? styles.containerConnected : styles.containerDisconnected,
      isConnected ? NEUMORPHIC.raised : NEUMORPHIC.flat
    ]}>
      <Animated.View
        style={[
          styles.statusIndicator,
          { 
            backgroundColor: statusColor,
            transform: [{ scale: pulseAnim }]
          },
        ]}
      />
      <Text style={[styles.text, { color: statusColor }]}>
        {statusText}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.card,
    gap: SPACING.xs,
  },
  containerConnected: {
    borderWidth: 1,
    borderColor: COLORS.success + '30',
  },
  containerDisconnected: {
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    opacity: 0.7,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontSize: 10,
    letterSpacing: 0.5,
    ...FONTS.bold,
  },
});

export default ConnectionStatus;

