import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, StatusColors, StatusLabels, type ParkingStatus } from '../constants/theme';
import { type Lot } from '../data/types';
import { MOCK_LOTS, CAMPUS_CENTER } from '../data/mockData';
import { LotOverlay } from '../components/LotOverlay';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';
import { useGeofence } from '../hooks/useGeofence';

export default function MapScreen() {
  const [lots, setLots] = useState<Lot[]>(MOCK_LOTS);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const handleLotPress = useCallback(
    (lotId: string) => {
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots],
  );

  const handleReport = useCallback(
    (_lotId: string, _type: 'found' | 'full') => {
      // Phase 0: mock — just show toast
      setSelectedLot(null);
      setToastVisible(true);
    },
    [],
  );

  const handleDismiss = useCallback(() => setSelectedLot(null), []);
  const handleToastDismiss = useCallback(() => setToastVisible(false), []);

  // Geofence — auto-prompt on lot entry
  useGeofence(handleLotPress);

  return (
    <GestureHandlerRootView style={styles.container}>
      <MapView
        style={styles.map}
        mapType="hybrid"
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

      {/* Status legend */}
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
});
