/**
 * Background location task — lorg pattern.
 * TaskManager.defineTask MUST be called at module scope, not inside a component.
 * This file is imported in index.ts (app entry) to ensure registration.
 *
 * Tracks enter AND exit events for passive occupancy counting.
 * Fetches lot definitions from backend (cached in AsyncStorage).
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitGeofenceEntry } from './geofenceEvents';

export const GEOFENCE_TASK = 'park-geofence';
const GEOFENCE_RADIUS_M = 80;
const ACTIVE_LOT_KEY = 'park_active_lot';
const USER_ID_KEY = 'park_user_id';
const PROMPTED_KEY = 'park_prompted_lots';
const LOTS_CACHE_KEY = 'park_lots_cache';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://park-api.fly.dev';

interface CachedLot {
  id: string;
  centroid: { lat: number; lng: number };
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fetch and cache lot centroids for geofence checks */
async function getLots(): Promise<CachedLot[]> {
  // Try cache first
  const cached = await AsyncStorage.getItem(LOTS_CACHE_KEY);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      // Refresh cache in background if older than 10 min
      if (parsed.ts && Date.now() - parsed.ts < 600_000) {
        return parsed.lots;
      }
    } catch {}
  }

  // Fetch from backend
  try {
    const res = await fetch(`${API_BASE}/api/lots/definitions`);
    if (res.ok) {
      const data = await res.json();
      const lots: CachedLot[] = data.map((d: any) => ({
        id: d.id,
        centroid: d.centroid,
      }));
      await AsyncStorage.setItem(
        LOTS_CACHE_KEY,
        JSON.stringify({ lots, ts: Date.now() }),
      );
      return lots;
    }
  } catch {}

  // Fallback to whatever cache we have (even if stale)
  if (cached) {
    try {
      return JSON.parse(cached).lots ?? [];
    } catch {}
  }
  return [];
}

async function postOccupancyEvent(
  event: 'enter' | 'exit',
  lotId: string,
  userId: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/occupancy/${event}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_id: lotId, user_id: userId }),
    });
  } catch {}
}

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Park geofence task error:', error.message);
    return;
  }

  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const { latitude, longitude } = locations[0].coords;
  const userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) return;

  const lots = await getLots();
  if (!lots.length) return;

  let currentLotId: string | null = null;
  for (const lot of lots) {
    const dist = haversineDistance(
      latitude,
      longitude,
      lot.centroid.lat,
      lot.centroid.lng,
    );
    if (dist <= GEOFENCE_RADIUS_M) {
      currentLotId = lot.id;
      break;
    }
  }

  const previousLotId = await AsyncStorage.getItem(ACTIVE_LOT_KEY);

  if (currentLotId && currentLotId !== previousLotId) {
    if (previousLotId) {
      await postOccupancyEvent('exit', previousLotId, userId);
    }
    await postOccupancyEvent('enter', currentLotId, userId);
    await AsyncStorage.setItem(ACTIVE_LOT_KEY, currentLotId);

    const promptedRaw = await AsyncStorage.getItem(PROMPTED_KEY);
    const prompted: Set<string> = new Set(promptedRaw ? JSON.parse(promptedRaw) : []);
    if (!prompted.has(currentLotId)) {
      prompted.add(currentLotId);
      await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify([...prompted]));
      emitGeofenceEntry(currentLotId);
    }
  } else if (!currentLotId && previousLotId) {
    await postOccupancyEvent('exit', previousLotId, userId);
    await AsyncStorage.removeItem(ACTIVE_LOT_KEY);
  }
});

export async function startGeofenceTracking(): Promise<boolean> {
  const started = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK);
  if (started) return true;

  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') return false;

  await Location.startLocationUpdatesAsync(GEOFENCE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 30,
    foregroundService: {
      notificationTitle: 'Park',
      notificationBody: 'Tracking parking availability',
      notificationColor: '#003087',
    },
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
  });

  return true;
}

export async function stopGeofenceTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(GEOFENCE_TASK);
  }
}

export async function resetGeofenceState(): Promise<void> {
  await AsyncStorage.multiRemove([ACTIVE_LOT_KEY, PROMPTED_KEY]);
}

/** Force refresh the lot cache (call after creating/editing lots) */
export async function refreshLotCache(): Promise<void> {
  await AsyncStorage.removeItem(LOTS_CACHE_KEY);
  await getLots();
}
