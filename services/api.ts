import { type ParkingStatus } from '../constants/theme';
import { type DataSource, type Lot } from '../data/types';
import { type LatLng } from 'react-native-maps';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000' // Android emulator → host machine
  : 'https://park-api.fly.dev';

interface ApiCoord {
  lat: number;
  lng: number;
}

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
  coordinates: ApiCoord[];
  centroid: ApiCoord;
}

function toLatLng(c: ApiCoord): LatLng {
  return { latitude: c.lat, longitude: c.lng };
}

function mapApiLot(apiLot: ApiLot): Lot {
  return {
    id: apiLot.id,
    name: apiLot.name,
    capacity: apiLot.capacity,
    status: apiLot.status as ParkingStatus,
    fillPct: apiLot.fill_pct,
    reportCount: apiLot.report_count,
    coordinates: (apiLot.coordinates ?? []).map(toLatLng),
    centroid: apiLot.centroid
      ? toLatLng(apiLot.centroid)
      : { latitude: 0, longitude: 0 },
    cvOccupancy: apiLot.cv_occupancy,
    cvConfidence: apiLot.cv_confidence,
    cvSource: apiLot.cv_source,
    dataSource: (apiLot.data_source ?? 'crowd') as DataSource,
    activeSessions: apiLot.active_sessions ?? 0,
    lastUpdated: apiLot.last_updated,
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

// --- Lot definition CRUD (admin) ---

export interface LotDefinition {
  id: string;
  name: string;
  capacity: number;
  coordinates: { lat: number; lng: number }[];
  centroid: { lat: number; lng: number };
}

export async function createLot(lot: {
  id: string;
  name: string;
  capacity: number;
  coordinates: { lat: number; lng: number }[];
}): Promise<LotDefinition> {
  const res = await fetch(`${API_BASE}/api/lots/definitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lot),
  });
  if (!res.ok) throw new Error(`Failed to create lot: ${res.status}`);
  return res.json();
}

export async function updateLot(
  lotId: string,
  updates: {
    name?: string;
    capacity?: number;
    coordinates?: { lat: number; lng: number }[];
  },
): Promise<LotDefinition> {
  const res = await fetch(`${API_BASE}/api/lots/definitions/${lotId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update lot: ${res.status}`);
  return res.json();
}

export async function deleteLot(lotId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/lots/definitions/${lotId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete lot: ${res.status}`);
}
