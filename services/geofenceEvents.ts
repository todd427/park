/**
 * Simple event emitter to bridge background geofence task → React components.
 * TaskManager runs outside React, so we need a module-level pub/sub.
 */

type Listener = (lotId: string) => void;

const listeners: Set<Listener> = new Set();

export function onGeofenceEntry(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitGeofenceEntry(lotId: string): void {
  for (const listener of listeners) {
    listener(lotId);
  }
}
