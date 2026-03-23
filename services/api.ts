import { type ParkingStatus } from '../constants/theme';
import { type DataSource, type Lot } from '../data/types';
import { MOCK_LOTS } from '../data/mockData';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000' // Android emulator → host machine
  : 'https://park-api.fly.dev';

interface ApiLot {
  id: string;
  name: string;
  capacity: number;
  status: string;
  fill_pct: number;
  report_count: number;
  last_updated: string | null;
  cv_occupancy: number | null;
  cv_confidence: number | null;
  cv_source: string | null;
  data_source: string;
  active_sessions: number;
}

/** Map API response to frontend Lot type, preserving coordinates from mock data */
function mapApiLot(apiLot: ApiLot): Lot {
  const mockLot = MOCK_LOTS.find((l) => l.id === apiLot.id);
  return {
    id: apiLot.id,
    name: apiLot.name,
    capacity: apiLot.capacity,
    status: apiLot.status as ParkingStatus,
    fillPct: apiLot.fill_pct,
    reportCount: apiLot.report_count,
    coordinates: mockLot?.coordinates ?? [],
    centroid: mockLot?.centroid ?? { latitude: 0, longitude: 0 },
    cvOccupancy: apiLot.cv_occupancy,
    cvConfidence: apiLot.cv_confidence,
    cvSource: apiLot.cv_source,
    dataSource: (apiLot.data_source ?? 'crowd') as DataSource,
    activeSessions: apiLot.active_sessions ?? 0,
  };
}

export async function fetchLots(): Promise<Lot[]> {
  const res = await fetch(`${API_BASE}/api/lots`);
  if (!res.ok) throw new Error(`Failed to fetch lots: ${res.status}`);
  const data: ApiLot[] = await res.json();
  return data.map(mapApiLot);
}

export async function fetchLot(lotId: string): Promise<Lot> {
  const res = await fetch(`${API_BASE}/api/lots/${lotId}`);
  if (!res.ok) throw new Error(`Failed to fetch lot ${lotId}: ${res.status}`);
  const data: ApiLot = await res.json();
  return mapApiLot(data);
}

export async function submitReport(
  lotId: string,
  reportType: 'found' | 'full',
  userId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lot_id: lotId,
      report_type: reportType,
      user_id: userId,
    }),
  });
  if (!res.ok) throw new Error(`Failed to submit report: ${res.status}`);
}
