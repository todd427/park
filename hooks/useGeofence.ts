import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { MOCK_LOTS } from '../data/mockData';
import { onGeofenceEntry } from '../services/geofenceEvents';
import { startGeofenceTracking } from '../services/locationTask';

const GEOFENCE_RADIUS_M = 80;

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

export function useGeofence(onEnterLot: (lotId: string) => void) {
  const [hasPermission, setHasPermission] = useState(false);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const visitedRef = useRef<Set<string>>(new Set());

  // Listen for background geofence events
  useEffect(() => {
    const unsubscribe = onGeofenceEntry((lotId) => {
      onEnterLot(lotId);
    });
    return unsubscribe;
  }, [onEnterLot]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      // Try to start background tracking first (lorg pattern)
      const bgStarted = await startGeofenceTracking();
      setBackgroundEnabled(bgStarted);

      if (bgStarted) {
        // Background task handles everything — no foreground watcher needed
        setHasPermission(true);
        return;
      }

      // Fallback: foreground-only location watching (Phase 0 behaviour)
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      setHasPermission(true);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 20,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          for (const lot of MOCK_LOTS) {
            const dist = haversineDistance(
              latitude,
              longitude,
              lot.centroid.latitude,
              lot.centroid.longitude,
            );
            if (dist <= GEOFENCE_RADIUS_M && !visitedRef.current.has(lot.id)) {
              visitedRef.current.add(lot.id);
              onEnterLot(lot.id);
            }
          }
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, [onEnterLot]);

  return { hasPermission, backgroundEnabled };
}
