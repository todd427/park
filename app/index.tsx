import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, type LatLng, type MapPressEvent } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, StatusColors, StatusLabels, type ParkingStatus } from '../constants/theme';
import { type Lot } from '../data/types';
import { MOCK_LOTS, CAMPUS_CENTER } from '../data/mockData';
import { LotOverlay } from '../components/LotOverlay';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';
import { useGeofence } from '../hooks/useGeofence';
import { useUserId } from '../hooks/useUserId';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { fetchLots, submitReport } from '../services/api';

export default function MapScreen() {
  const [lots, setLots] = useState<Lot[]>(MOCK_LOTS);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const userId = useUserId();
  usePushNotifications(userId);

  // Pin-drop dev mode
  const [pinDropActive, setPinDropActive] = useState(false);
  const [pins, setPins] = useState<LatLng[]>([]);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLots = useCallback(async () => {
    try {
      const data = await fetchLots();
      setLots(data);
    } catch {
      // Fallback to current state
    }
  }, []);

  useEffect(() => {
    loadLots();
    const interval = setInterval(loadLots, 60_000);
    return () => clearInterval(interval);
  }, [loadLots]);

  const handleLotPress = useCallback(
    (lotId: string) => {
      if (pinDropActive) return;
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots, pinDropActive],
  );

  const handleReport = useCallback(
    async (lotId: string, type: 'found' | 'full') => {
      setSelectedLot(null);
      setToastVisible(true);
      try {
        await submitReport(lotId, type, userId);
        await loadLots();
      } catch {
        // Best effort
      }
    },
    [userId, loadLots],
  );

  const handleDismiss = useCallback(() => setSelectedLot(null), []);
  const handleToastDismiss = useCallback(() => setToastVisible(false), []);
  const { backgroundEnabled } = useGeofence(handleLotPress);

  // Triple-tap header to toggle pin-drop mode
  const handleHeaderTap = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 600);
    if (tapCountRef.current >= 3) {
      tapCountRef.current = 0;
      setPinDropActive((prev) => !prev);
      setPins([]);
    }
  }, []);

  // Pin-drop map press
  const handleMapPress = useCallback(
    (e: MapPressEvent) => {
      if (!pinDropActive) return;
      setPins((prev) => [...prev, e.nativeEvent.coordinate]);
    },
    [pinDropActive],
  );

  const handlePinUndo = () => setPins((prev) => prev.slice(0, -1));
  const handlePinCopy = () => {
    if (pins.length < 3) {
      Alert.alert('Need at least 3 points');
      return;
    }
    const ts = pins
      .map(
        (p) =>
          `      { latitude: ${p.latitude.toFixed(7)}, longitude: ${p.longitude.toFixed(7)} },`,
      )
      .join('\n');
    const c = {
      lat: pins.reduce((s, p) => s + p.latitude, 0) / pins.length,
      lon: pins.reduce((s, p) => s + p.longitude, 0) / pins.length,
    };
    const out = `coordinates: [\n${ts}\n    ],\n    centroid: { latitude: ${c.lat.toFixed(6)}, longitude: ${c.lon.toFixed(6)} },`;
    Clipboard.setString(out);
    Alert.alert('Copied!', `${pins.length} vertices as TypeScript.`);
  };
  const handlePinClear = () => setPins([]);

  return (
    <GestureHandlerRootView style={styles.container}>
      {backgroundEnabled && !pinDropActive && (
        <View style={styles.geofenceBanner}>
          <Text style={styles.geofenceText}>
            Auto-detect is on — we'll prompt you when you're near a lot
          </Text>
        </View>
      )}

      {/* Hidden triple-tap target */}
      <TouchableOpacity
        style={styles.headerTap}
        onPress={handleHeaderTap}
        activeOpacity={1}
      />

      <MapView
        style={styles.map}
        mapType="hybrid"
        initialRegion={CAMPUS_CENTER}
        onPress={handleMapPress}
      >
        {lots.map((lot) => (
          <LotOverlay
            key={lot.id}
            lot={lot}
            onPress={() => handleLotPress(lot.id)}
          />
        ))}

        {/* Pin-drop overlay */}
        {pinDropActive && pins.length >= 3 && (
          <Polygon
            coordinates={pins}
            fillColor={Colors.ATU_GOLD + '40'}
            strokeColor={Colors.ATU_GOLD}
            strokeWidth={2}
          />
        )}
        {pinDropActive &&
          pins.map((pin, i) => (
            <Marker
              key={`pin-${i}`}
              coordinate={pin}
              title={`Point ${i + 1}`}
              pinColor="#C8A84B"
            />
          ))}
      </MapView>

      {/* Pin-drop controls */}
      {pinDropActive && (
        <View style={styles.pinControls}>
          <Text style={styles.pinLabel}>
            Pin Drop — {pins.length} point{pins.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.pinButtons}>
            <TouchableOpacity style={styles.pinBtn} onPress={handlePinUndo}>
              <Text style={styles.pinBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pinBtn} onPress={handlePinCopy}>
              <Text style={styles.pinBtnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pinBtn} onPress={handlePinClear}>
              <Text style={styles.pinBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pinBtn, { backgroundColor: Colors.STATUS_FULL }]}
              onPress={() => {
                setPinDropActive(false);
                setPins([]);
              }}
            >
              <Text style={styles.pinBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!pinDropActive && (
        <View style={styles.legend}>
          {(['available', 'filling', 'full', 'unknown'] as ParkingStatus[]).map(
            (s) => (
              <View key={s} style={styles.legendItem}>
                <View
                  style={[styles.legendDot, { backgroundColor: StatusColors[s] }]}
                />
                <Text style={styles.legendText}>{StatusLabels[s]}</Text>
              </View>
            ),
          )}
        </View>
      )}

      <ReportModal
        lot={selectedLot}
        onReport={handleReport}
        onDismiss={handleDismiss}
      />

      <SuccessToast visible={toastVisible} onDismiss={handleToastDismiss} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  headerTap: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 60,
    height: 44,
    zIndex: 20,
  },
  map: {
    flex: 1,
  },
  legend: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.BG_CARD + 'E6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 11,
    fontWeight: '600',
  },
  geofenceBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: Colors.ATU_BLUE + 'E6',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  geofenceText: {
    color: Colors.ATU_GOLD,
    fontSize: 12,
    fontWeight: '600',
  },
  pinControls: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: Colors.BG_MODAL + 'F0',
    borderRadius: 12,
    padding: 12,
    zIndex: 15,
  },
  pinLabel: {
    color: Colors.ATU_GOLD,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  pinButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  pinBtn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pinBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
});
