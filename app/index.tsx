import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { type MapType } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors, StatusColors, StatusLabels, type ParkingStatus } from '../constants/theme';
import { type Lot } from '../data/types';
import { CAMPUS_CENTER } from '../data/mockData';
import { LotOverlay } from '../components/LotOverlay';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';
import { LotEditor } from '../components/LotEditor';
import { GpsWalkEditor } from '../components/GpsWalkEditor';
import { SnapButton } from '../components/SnapButton';
import { useGeofence } from '../hooks/useGeofence';
import { useUserId } from '../hooks/useUserId';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { fetchLots, submitReport, deleteLot } from '../services/api';
import { refreshLotCache } from '../services/locationTask';
import { Alert } from 'react-native';

const MAP_TYPES: { type: MapType; label: string }[] = [
  { type: 'hybrid', label: 'Satellite' },
  { type: 'standard', label: 'Map' },
  { type: 'terrain', label: 'Terrain' },
];

type EditMode = 'none' | 'picker' | 'gps-add' | 'gps-edit' | 'map-edit';

export default function MapScreen() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [mapCenter, setMapCenter] = useState(CAMPUS_CENTER);
  const [mapTypeIndex, setMapTypeIndex] = useState(0);
  const viewRef = useRef<View>(null);
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
      if (editMode !== 'none') return;
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots, editMode],
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

  // GPS walk editor
  const gpsEditor =
    editMode === 'gps-add' || editMode === 'gps-edit'
      ? GpsWalkEditor({
          mode: editMode === 'gps-add' ? 'add' : 'edit',
          editingLot: editingLot ?? undefined,
          onDone: () => {
            setEditMode('none');
            setEditingLot(null);
            loadLots();
          },
          onCancel: () => {
            setEditMode('none');
            setEditingLot(null);
          },
        })
      : null;

  // Map-based fallback editor
  const mapEditor =
    editMode === 'map-edit'
      ? LotEditor({
          active: true,
          lots,
          mapCenter: { latitude: mapCenter.latitude, longitude: mapCenter.longitude },
          onClose: () => {
            setEditMode('none');
            setEditingLot(null);
          },
          onSaved: loadLots,
        })
      : null;

  const handleDeleteLot = (lot: Lot) => {
    Alert.alert('Delete lot?', `Remove "${lot.name}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLot(lot.id);
            await refreshLotCache();
            loadLots();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const isEditing = editMode !== 'none' && editMode !== 'picker';

  return (
    <GestureHandlerRootView style={styles.container}>
      <View ref={viewRef} style={styles.container} collapsable={false}>
        {backgroundEnabled && !isEditing && editMode !== 'picker' && (
          <View style={styles.geofenceBanner}>
            <Text style={styles.geofenceText}>
              Auto-detect is on — we'll prompt you when you're near a lot
            </Text>
          </View>
        )}

        <MapView
          style={styles.map}
          mapType={MAP_TYPES[mapTypeIndex].type}
          initialRegion={CAMPUS_CENTER}
          onPress={mapEditor ? mapEditor.handleMapPress : undefined}
          onRegionChangeComplete={(region) => setMapCenter(region)}
        >
          {lots.map((lot) => (
            <LotOverlay
              key={lot.id}
              lot={lot}
              onPress={() => {
                if (editMode === 'picker') {
                  // In picker mode, tapping a lot opens edit options
                  setEditingLot(lot);
                  Alert.alert(lot.name, 'What do you want to do?', [
                    {
                      text: 'Edit with GPS (walk)',
                      onPress: () => setEditMode('gps-edit'),
                    },
                    {
                      text: 'Edit on map',
                      onPress: () => {
                        setEditMode('map-edit');
                      },
                    },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        handleDeleteLot(lot);
                        setEditMode('none');
                      },
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                } else if (mapEditor) {
                  mapEditor.handleLotTap(lot);
                } else {
                  handleLotPress(lot.id);
                }
              }}
            />
          ))}
          {gpsEditor?.renderMapOverlays()}
          {mapEditor?.renderMapOverlays()}
        </MapView>

        {/* GPS editor controls */}
        {gpsEditor?.renderControls()}

        {/* Map editor controls */}
        {mapEditor?.renderControls()}

        {/* Mode picker */}
        {editMode === 'picker' && (
          <View style={styles.pickerPanel}>
            <Text style={styles.pickerTitle}>Edit Lots</Text>
            <Text style={styles.pickerHint}>
              Tap a lot to edit it, or add a new one
            </Text>
            <View style={styles.pickerBtns}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setEditMode('gps-add')}
              >
                <Text style={styles.pickerBtnText}>+ Walk & Mark</Text>
                <Text style={styles.pickerBtnSub}>Add lot using GPS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setEditMode('map-edit')}
              >
                <Text style={styles.pickerBtnText}>Edit on Map</Text>
                <Text style={styles.pickerBtnSub}>Remote editing</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.pickerClose}
              onPress={() => setEditMode('none')}
            >
              <Text style={styles.pickerCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Normal mode buttons */}
        {editMode === 'none' && (
          <>
            <View style={styles.rightButtons}>
              <SnapButton userId={userId} viewRef={viewRef} />
              <TouchableOpacity
                style={styles.mapTypeBtn}
                onPress={() => setMapTypeIndex((i) => (i + 1) % MAP_TYPES.length)}
                activeOpacity={0.8}
              >
                <Text style={styles.mapTypeBtnText}>
                  {MAP_TYPES[mapTypeIndex].label}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => setEditMode('picker')}
                activeOpacity={0.8}
              >
                <Text style={styles.editBtnText}>Edit Lots</Text>
              </TouchableOpacity>
            </View>

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
          </>
        )}
      </View>
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
  rightButtons: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
    zIndex: 15,
  },
  mapTypeBtn: {
    backgroundColor: Colors.BG_CARD + 'E6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapTypeBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '600',
  },
  editBtn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  editBtnText: {
    color: Colors.ATU_GOLD,
    fontSize: 12,
    fontWeight: '700',
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
  pickerPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.BG_MODAL + 'F8',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
    zIndex: 15,
  },
  pickerTitle: {
    color: Colors.ATU_GOLD,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  pickerHint: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  pickerBtns: {
    flexDirection: 'row',
    gap: 12,
  },
  pickerBtn: {
    flex: 1,
    backgroundColor: Colors.ATU_BLUE,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  pickerBtnText: {
    color: Colors.ATU_GOLD,
    fontSize: 15,
    fontWeight: '700',
  },
  pickerBtnSub: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginTop: 4,
  },
  pickerClose: {
    marginTop: 12,
    alignItems: 'center',
  },
  pickerCloseText: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 14,
  },
});
