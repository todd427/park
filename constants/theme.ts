export const Colors = {
  ATU_BLUE: '#003087',
  ATU_GOLD: '#C8A84B',
  BG_DARK: '#121212',
  BG_CARD: '#1E1E1E',
  BG_MODAL: '#2A2A2A',
  TEXT_PRIMARY: '#FFFFFF',
  TEXT_SECONDARY: '#A0A0A0',
  STATUS_AVAILABLE: '#4CAF50',
  STATUS_FILLING: '#FF9800',
  STATUS_FULL: '#F44336',
  STATUS_UNKNOWN: '#757575',
} as const;

export type ParkingStatus = 'available' | 'filling' | 'full' | 'unknown';

export const StatusColors: Record<ParkingStatus, string> = {
  available: Colors.STATUS_AVAILABLE,
  filling: Colors.STATUS_FILLING,
  full: Colors.STATUS_FULL,
  unknown: Colors.STATUS_UNKNOWN,
};

export const StatusLabels: Record<ParkingStatus, string> = {
  available: 'Available',
  filling: 'Filling Up',
  full: 'Full',
  unknown: 'No Data',
};
