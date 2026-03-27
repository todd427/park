import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, StatusColors, StatusLabels, type ParkingStatus } from '../constants/theme';
import { type Lot } from '../data/types';
import { CAMPUS_CENTER } from '../data/mockData';
import { LotOverlay } from '../components/LotOverlay';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';
import { LotEditor } from '../components/LotEditor';
import { SnapButton } from '../components/SnapButton';
import { useGeofence } from '../hooks/useGeofence';
import { useUserId } from '../hooks/useUserId';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { fetchLots, submitReport } from '../services/api';

export default function MapScreen() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [editorActive, setEditorActive] = useState(false);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const userId = useUserId();
  usePushNotifications(userId);

  const loadLots = useCallback(async () => {
    try {
      const data = await fetchLots();
      setLots(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadLots();
    const interval = setInterval(loadLots, 60_000);
    return () => clearInterval(interval);
  }, [loadLots]);

  const handleLotPress = useCallback(
    (lotId: string) => {
      if (editorActive) return;
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots, editorActive],
  );

  const handleReport = useCallback(
    async (lotId: string, type: 'found' | 'full') => {
      setSelectedLot(null);
      setToastVisible(true);
      try {
        await submitReport(lotId, type, userId);
        await loadLots();
      } catch {}
    },
    [userId, loadLots],
  );

  const handleDismiss = useCallback(() => setSelectedLot(null), []);
  const handleToastDismiss = useCallback(() => setToastVisible(false), []);
  const { backgroundEnabled } = useGeofence(handleLotPress);

  const editor = LotEditor({
    active: editorActive,
    lots,
    mapCenter: { latitude: mapCenter.latitude, longitude: mapCenter.longitude },
    onClose: () => setEditorActive(false),
    onSaved: loadLots,
  });

  return (
    <GestureHandlerRootView style={styles.container}>
      {backgroundEnabled && !editorActive && (
        <View style={styles.geofenceBanner}>
          <Text style={styles.geofenceText}>
            Auto-detect is on — we'll prompt you when you're near a lot
          </Text>
        </View>
      )}

      <MapView
        style={styles.map}
        mapType="hybrid"
        initialRegion={CAMPUS_CENTER}
        onPress={editorActive && editor ? editor.handleMapPress : undefined}
        onRegionChangeComplete={(region) => setMapCenter(region)}
      >
        {lots.map((lot) => (
          <LotOverlay
            key={lot.id}
            lot={lot}
            onPress={() => {
              if (editorActive && editor) {
                editor.handleLotTap(lot);
              } else {
                handleLotPress(lot.id);
              }
            }}
          />
        ))}
        {editor?.renderMapOverlays()}
      </MapView>

      {editor?.renderControls()}

      {!editorActive && <SnapButton userId={userId} />}

      {!editorActive && (
        <>
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

          {/* Edit Lots button */}
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditorActive(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.editBtnText}>Edit Lots</Text>
          </TouchableOpacity>

          <ReportModal
            lot={selectedLot}
            onReport={handleReport}
            onDismiss={handleDismiss}
          />
          <SuccessToast visible={toastVisible} onDismiss={handleToastDismiss} />
        </>
      )}
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
    right: 80,
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
  editBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  editBtnText: {
    color: Colors.ATU_GOLD,
    fontSize: 12,
    fontWeight: '700',
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
