/**
 * Background location task — lorg pattern.
 * TaskManager.defineTask MUST be called at module scope, not inside a component.
 * This file is imported in index.ts (app entry) to ensure registration.
 *
 * Tracks enter AND exit events for passive occupancy counting.
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_LOTS } from '../data/mockData';
import { emitGeofenceEntry } from './geofenceEvents';

export const GEOFENCE_TASK = 'park-geofence';
const GEOFENCE_RADIUS_M = 80;
const ACTIVE_LOT_KEY = 'park_active_lot'; // lot ID the user is currently in (or null)
const USER_ID_KEY = 'park_user_id';
const PROMPTED_KEY = 'park_prompted_lots'; // lots already prompted this session

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://park-api.fly.dev';

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

/** POST enter/exit events to backend (best-effort, silent) */
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
  } catch {
    // Best effort — will correct on next position update
  }
}

// Register background task at module scope
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Park geofence task error:', error.message);
    return;
  }

  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const { latitude, longitude } = locations[0].coords;
  const userId = await AsyncStorage.getItem(USER_ID_KEY);
  if (!userId) return; // Not yet registered

  // Determine which lot (if any) the user is currently inside
  let currentLotId: string | null = null;
  for (const lot of MOCK_LOTS) {
    const dist = haversineDistance(
      latitude,
      longitude,
      lot.centroid.latitude,
      lot.centroid.longitude,
    );
    if (dist <= GEOFENCE_RADIUS_M) {
      currentLotId = lot.id;
      break;
    }
  }

  // Load previous active lot
  const previousLotId = await AsyncStorage.getItem(ACTIVE_LOT_KEY);

  // Handle transitions
  if (currentLotId && currentLotId !== previousLotId) {
    // Entered a new lot
    if (previousLotId) {
      // Exit the previous lot first
      await postOccupancyEvent('exit', previousLotId, userId);
    }
    await postOccupancyEvent('enter', currentLotId, userId);
    await AsyncStorage.setItem(ACTIVE_LOT_KEY, currentLotId);

    // Emit entry event for ReportModal prompt (once per lot per session)
    const promptedRaw = await AsyncStorage.getItem(PROMPTED_KEY);
    const prompted: Set<string> = new Set(promptedRaw ? JSON.parse(promptedRaw) : []);
    if (!prompted.has(currentLotId)) {
      prompted.add(currentLotId);
      await AsyncStorage.setItem(PROMPTED_KEY, JSON.stringify([...prompted]));
      emitGeofenceEntry(currentLotId);
    }
  } else if (!currentLotId && previousLotId) {
    // Exited all lots
    await postOccupancyEvent('exit', previousLotId, userId);
    await AsyncStorage.removeItem(ACTIVE_LOT_KEY);
  }
  // If currentLotId === previousLotId, no change — do nothing
});

/** Start background location tracking with foreground service (Android) */
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

/** Stop background tracking */
export async function stopGeofenceTracking(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK);
  if (started) {
    await Location.stopLocationUpdatesAsync(GEOFENCE_TASK);
  }
}

/** Reset session state (e.g. new day) */
export async function resetGeofenceState(): Promise<void> {
  await AsyncStorage.multiRemove([ACTIVE_LOT_KEY, PROMPTED_KEY]);
}
