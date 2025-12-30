// Tema visual - Neumorphism / Minimalismo Suave

export const COLORS = {
  // Colores principales - Neumorphism
  primary: '#FF6B6B', // Rojo coral suave
  primaryDark: '#EE5A52',
  primaryLight: '#FF8787',
  
  secondary: '#FFA94D', // Naranja suave
  secondaryDark: '#FF922B',
  secondaryLight: '#FFC078',

  // Estados
  success: '#51CF66',
  warning: '#FFD43B',
  danger: '#FF6B6B',
  info: '#74C0FC',

  // Fondo Neumorphism - Gris claro suave
  background: '#E8ECEF',
  backgroundDark: '#D1D9E0',
  backgroundLight: '#F5F7FA',
  
  surface: '#FFFFFF',
  card: '#FFFFFF',
  cardLight: '#F9FAFB',

  // Texto
  textPrimary: '#2C3E50',
  textSecondary: '#546E7A',
  textMuted: '#8B9BA8',

  // Acentos
  accent: '#FFD43B',
  accentDark: '#FFC107',

  // Sombras Neumorphism
  shadowLight: '#FFFFFF',
  shadowDark: '#B8C4CF',
};

// Sombras para Android (necesitan elevation)
export const NEUMORPHIC = {
  pressed: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 1,
    elevation: 1,
  },
  raised: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  flat: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
};

export const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 999,
};

export const FONTS = {
  regular: {
    fontWeight: '400' as const,
  },
  medium: {
    fontWeight: '600' as const,
  },
  bold: {
    fontWeight: '700' as const,
  },
  extraBold: {
    fontWeight: '800' as const,
  },
};

