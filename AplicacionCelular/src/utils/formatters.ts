// Utilidades para formateo de datos

export const formatTemperature = (temp: number | null | undefined): string => {
  if (temp === null || temp === undefined || Number.isNaN(temp)) {
    return '--';
  }
  return `${Number(temp).toFixed(1)}°C`;
};

export const formatPercentage = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return `${Number(value).toFixed(0)}%`;
};

export const formatTimestamp = (date: Date): string => {
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(date));
};

export const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'normal':
      return '#4CAF50'; // Verde
    case 'riesgo':
      return '#FF9800'; // Naranja
    case 'confirmado':
      return '#F44336'; // Rojo
    default:
      return '#9E9E9E'; // Gris
  }
};

export const getStatusIcon = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'normal':
      return '✅';
    case 'riesgo':
      return '⚠️';
    case 'confirmado':
      return '🔥';
    default:
      return '❓';
  }
};

