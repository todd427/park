import { type ParkingStatus } from '../constants/theme';
import { type LatLng } from 'react-native-maps';

export type DataSource = 'crowd' | 'cv' | 'blended';

export interface Lot {
  id: string;
  name: string;
  capacity: number;
  status: ParkingStatus;
  fillPct: number;
  reportCount: number;
  coordinates: LatLng[];
  centroid: LatLng;
  cvOccupancy: number | null;
  cvConfidence: number | null;
  cvSource: string | null;
  dataSource: DataSource;
}
