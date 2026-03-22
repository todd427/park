/**
 * Background location task — lorg pattern.
 * TaskManager.defineTask MUST be called at module scope, not inside a component.
 * This file is imported in index.ts (app entry) to ensure registration.
 */

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MOCK_LOTS } from '../data/mockData';
import { emitGeofenceEntry } from './geofenceEvents';

export const GEOFENCE_TASK = 'park-geofence';
const GEOFENCE_RADIUS_M = 80;
const VISITED_KEY = 'park_visited_lots';

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

// Register background task at module scope — this runs even when app is backgrounded
TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Park geofence task error:', error.message);
    return;
  }

  const locations = (data as any)?.locations as Location.LocationObject[] | undefined;
  if (!locations?.length) return;

  const { latitude, longitude } = locations[0].coords;

  // Load visited set from AsyncStorage (persists across background wakes)
  const raw = await AsyncStorage.getItem(VISITED_KEY);
  const visited: Set<string> = new Set(raw ? JSON.parse(raw) : []);

  for (const lot of MOCK_LOTS) {
    const dist = haversineDistance(
      latitude,
      longitude,
      lot.centroid.latitude,
      lot.centroid.longitude,
    );

    if (dist <= GEOFENCE_RADIUS_M && !visited.has(lot.id)) {
      visited.add(lot.id);
      await AsyncStorage.setItem(VISITED_KEY, JSON.stringify([...visited]));
      // Emit to any foreground listeners (opens ReportModal if app is active)
      emitGeofenceEntry(lot.id);
    }
  }
});

/** Start background location tracking with foreground service (Android) */
export async function startGeofenceTracking(): Promise<boolean> {
  // Check if already running
  const started = await Location.hasStartedLocationUpdatesAsync(GEOFENCE_TASK);
  if (started) return true;

  // Request foreground first, then background
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') return false;

  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    // Fall back to foreground-only (Phase 0 behaviour still works)
    return false;
  }

  await Location.startLocationUpdatesAsync(GEOFENCE_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,    // Check every 60s
    distanceInterval: 30,    // Or every 30m of movement
    foregroundService: {
      notificationTitle: 'Park',
      notificationBody: 'Detecting nearby car parks',
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

/** Reset visited lots (e.g. new session / new day) */
export async function resetVisitedLots(): Promise<void> {
  await AsyncStorage.removeItem(VISITED_KEY);
}
