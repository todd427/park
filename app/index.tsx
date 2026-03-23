import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
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

  const loadLots = useCallback(async () => {
    try {
      const data = await fetchLots();
      setLots(data);
    } catch {
      // Fallback to current state (mock data on first load)
    }
  }, []);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const handleLotPress = useCallback(
    (lotId: string) => {
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots],
  );

  const handleReport = useCallback(
    async (lotId: string, type: 'found' | 'full') => {
      setSelectedLot(null);
      setToastVisible(true);
      try {
        await submitReport(lotId, type, userId);
        await loadLots(); // Refresh after reporting
      } catch {
        // Toast already shown — best effort
      }
    },
    [userId, loadLots],
  );

  const handleDismiss = useCallback(() => setSelectedLot(null), []);
  const handleToastDismiss = useCallback(() => setToastVisible(false), []);

  const { backgroundEnabled } = useGeofence(handleLotPress);

  return (
    <GestureHandlerRootView style={styles.container}>
      {backgroundEnabled && (
        <View style={styles.geofenceBanner}>
          <Text style={styles.geofenceText}>
            Auto-detect is on — we'll prompt you when you're near a lot
          </Text>
        </View>
      )}
      <MapView
        style={styles.map}
        initialRegion={CAMPUS_CENTER}
      >
        {lots.map((lot) => (
          <LotOverlay
            key={lot.id}
            lot={lot}
            onPress={() => handleLotPress(lot.id)}
          />
        ))}
      </MapView>

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
});
