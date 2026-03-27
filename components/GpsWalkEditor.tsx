import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { Circle, Marker, Polygon, type LatLng } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/theme';
import { type Lot } from '../data/types';
import { createLot, updateLot } from '../services/api';
import { refreshLotCache } from '../services/locationTask';

const GPS_SAMPLES = 5;
const GPS_SAMPLE_INTERVAL = 500; // ms
const AUTO_SELECT_RADIUS = 15; // metres
const NUDGE_STEP = 0.000018; // ~2m in lat/lng
const DRAFT_KEY = 'park_walk_draft';

type Mode = 'add' | 'edit';

interface GpsWalkEditorProps {
  mode: Mode;
  editingLot?: Lot;
  onDone: () => void;
  onCancel: () => void;
}

function haversineDistance(a: LatLng, b: LatLng): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function directionLabel(from: LatLng, to: LatLng): string {
  const dLat = to.latitude - from.latitude;
  const dLng = to.longitude - from.longitude;
  let dir = '';
  if (dLat > 0.00001) dir += 'N';
  else if (dLat < -0.00001) dir += 'S';
  if (dLng > 0.00001) dir += 'E';
  else if (dLng < -0.00001) dir += 'W';
  return dir || 'here';
}

/** Average GPS readings, discarding outliers */
async function averageGps(): Promise<{ coord: LatLng; accuracy: number }> {
  const readings: { lat: number; lng: number; acc: number }[] = [];

  for (let i = 0; i < GPS_SAMPLES; i++) {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });
    readings.push({
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      acc: loc.coords.accuracy ?? 10,
    });
    if (i < GPS_SAMPLES - 1) {
      await new Promise((r) => setTimeout(r, GPS_SAMPLE_INTERVAL));
    }
  }

  // Compute centroid
  const cLat = readings.reduce((s, r) => s + r.lat, 0) / readings.length;
  const cLng = readings.reduce((s, r) => s + r.lng, 0) / readings.length;

  // Discard outliers (>2x median distance from centroid)
  const centroid = { latitude: cLat, longitude: cLng };
  const distances = readings.map((r) =>
    haversineDistance(centroid, { latitude: r.lat, longitude: r.lng }),
  );
  const sorted = [...distances].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(median * 2, 3); // at least 3m

  const filtered = readings.filter((_, i) => distances[i] <= threshold);
  const final = filtered.length >= 2 ? filtered : readings;

  const avgLat = final.reduce((s, r) => s + r.lat, 0) / final.length;
  const avgLng = final.reduce((s, r) => s + r.lng, 0) / final.length;
  const avgAcc = final.reduce((s, r) => s + r.acc, 0) / final.length;

  return {
    coord: { latitude: avgLat, longitude: avgLng },
    accuracy: Math.round(avgAcc),
  };
}

export function GpsWalkEditor({
  mode,
  editingLot,
  onDone,
  onCancel,
}: GpsWalkEditorProps) {
  const [points, setPoints] = useState<LatLng[]>(
    mode === 'edit' && editingLot ? editingLot.coordinates.map((c) => ({ ...c })) : [],
  );
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const [marking, setMarking] = useState(false);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState(editingLot?.name ?? '');
  const [formCapacity, setFormCapacity] = useState(
    editingLot ? String(editingLot.capacity) : '',
  );
  const [formId, setFormId] = useState('');
  const [saving, setSaving] = useState(false);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  // Watch position
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, distanceInterval: 1 },
        (loc) => {
          setUserPos({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          setAccuracy(Math.round(loc.coords.accuracy ?? 10));
        },
      );
    })();
    return () => {
      subRef.current?.remove();
    };
  }, []);

  // Auto-save draft
  useEffect(() => {
    if (points.length > 0) {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(points));
    }
  }, [points]);

  // Auto-select nearest vertex in edit mode
  const nearestVertex = (() => {
    if (mode !== 'edit' || !userPos || points.length === 0) return null;
    let minDist = Infinity;
    let minIdx = -1;
    for (let i = 0; i < points.length; i++) {
      const d = haversineDistance(userPos, points[i]);
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }
    if (minDist <= AUTO_SELECT_RADIUS) {
      return { index: minIdx, distance: Math.round(minDist), direction: directionLabel(userPos, points[minIdx]) };
    }
    return null;
  })();

  const handleMark = useCallback(async () => {
    setMarking(true);
    try {
      const { coord } = await averageGps();
      setPoints((prev) => [...prev, coord]);
    } catch (e: any) {
      Alert.alert('GPS Error', e.message);
    } finally {
      setMarking(false);
    }
  }, []);

  const handleMoveHere = useCallback(async () => {
    if (selectedVertex === null) return;
    setMarking(true);
    try {
      const { coord } = await averageGps();
      setPoints((prev) => {
        const updated = [...prev];
        updated[selectedVertex] = coord;
        return updated;
      });
      setSelectedVertex(null);
    } catch (e: any) {
      Alert.alert('GPS Error', e.message);
    } finally {
      setMarking(false);
    }
  }, [selectedVertex]);

  const handleInsertPoint = useCallback(async () => {
    if (!userPos || points.length < 2) return;
    setMarking(true);
    try {
      const { coord } = await averageGps();
      // Find nearest edge to insert after
      let minDist = Infinity;
      let insertIdx = points.length;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        const mid = {
          latitude: (points[i].latitude + points[j].latitude) / 2,
          longitude: (points[i].longitude + points[j].longitude) / 2,
        };
        const d = haversineDistance(coord, mid);
        if (d < minDist) {
          minDist = d;
          insertIdx = j === 0 ? points.length : j;
        }
      }
      setPoints((prev) => {
        const updated = [...prev];
        updated.splice(insertIdx, 0, coord);
        return updated;
      });
    } catch (e: any) {
      Alert.alert('GPS Error', e.message);
    } finally {
      setMarking(false);
    }
  }, [userPos, points]);

  const handleUndo = () => {
    setPoints((prev) => prev.slice(0, -1));
    setSelectedVertex(null);
  };

  const handleNudge = (dLat: number, dLng: number) => {
    const idx = mode === 'add' ? points.length - 1 : selectedVertex;
    if (idx === null || idx < 0 || idx >= points.length) return;
    setPoints((prev) => {
      const updated = [...prev];
      updated[idx] = {
        latitude: prev[idx].latitude + dLat,
        longitude: prev[idx].longitude + dLng,
      };
      return updated;
    });
  };

  const handleDeleteVertex = () => {
    if (selectedVertex === null || points.length <= 3) return;
    setPoints((prev) => prev.filter((_, i) => i !== selectedVertex));
    setSelectedVertex(null);
  };

  const handleSave = () => {
    if (points.length < 3) {
      Alert.alert('Need at least 3 points');
      return;
    }
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) { Alert.alert('Name required'); return; }
    const cap = parseInt(formCapacity, 10);
    if (!cap || cap <= 0) { Alert.alert('Valid capacity required'); return; }

    const coords = points.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    setSaving(true);
    try {
      if (mode === 'add') {
        const id = formId.trim() || formName.trim().replace(/\s+/g, '_').substring(0, 10);
        await createLot({ id, name: formName.trim(), capacity: cap, coordinates: coords });
        Alert.alert('Created', `Lot "${formName.trim()}" added.`);
      } else if (editingLot) {
        await updateLot(editingLot.id, {
          name: formName.trim(),
          capacity: cap,
          coordinates: coords,
        });
        Alert.alert('Updated', `Lot "${formName.trim()}" saved.`);
      }
      await refreshLotCache();
      await AsyncStorage.removeItem(DRAFT_KEY);
      onDone();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Which point can be nudged
  const nudgeTarget = mode === 'add' ? points.length - 1 : selectedVertex;
  const canNudge = nudgeTarget !== null && nudgeTarget >= 0 && nudgeTarget < points.length;

  return {
    // Map overlays
    renderMapOverlays: () => (
      <>
        {/* Polygon preview */}
        {points.length >= 3 && (
          <Polygon
            coordinates={points}
            fillColor={Colors.ATU_GOLD + '30'}
            strokeColor={Colors.ATU_GOLD}
            strokeWidth={2}
          />
        )}
        {/* Lines connecting points (when < 3) */}
        {points.length === 2 && (
          <Polygon
            coordinates={[...points, points[1]]}
            fillColor="transparent"
            strokeColor={Colors.ATU_GOLD}
            strokeWidth={2}
          />
        )}
        {/* Vertex markers */}
        {points.map((pt, i) => (
          <Marker
            key={`walk-v-${i}`}
            coordinate={pt}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => mode === 'edit' && setSelectedVertex(i)}
          >
            <View style={styles.vertexContainer}>
              <View
                style={[
                  styles.vertexDot,
                  (selectedVertex === i || (mode === 'edit' && nearestVertex?.index === i))
                    && styles.vertexSelected,
                ]}
              />
              <Text style={styles.vertexLabel}>{i + 1}</Text>
            </View>
          </Marker>
        ))}
        {/* User position with accuracy circle */}
        {userPos && (
          <>
            <Circle
              center={userPos}
              radius={accuracy}
              fillColor="rgba(0,120,255,0.1)"
              strokeColor="rgba(0,120,255,0.4)"
              strokeWidth={1}
            />
            <Marker coordinate={userPos} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.userDot} />
            </Marker>
          </>
        )}
      </>
    ),

    // Controls panel
    renderControls: () => (
      <>
        {/* Status bar */}
        <View style={styles.statusBar}>
          <Text style={styles.statusTitle}>
            {mode === 'add' ? 'Walk & Mark' : `Editing: ${editingLot?.name}`}
          </Text>
          <Text style={styles.statusInfo}>
            {points.length} point{points.length !== 1 ? 's' : ''}
            {' · '}GPS ±{accuracy}m
            {accuracy > 15 && ' ⚠️ Low accuracy'}
          </Text>
          {mode === 'edit' && nearestVertex && (
            <Text style={styles.statusNearest}>
              Nearest: #{nearestVertex.index + 1} — {nearestVertex.distance}m {nearestVertex.direction}
            </Text>
          )}
          {mode === 'edit' && selectedVertex !== null && (
            <Text style={styles.statusNearest}>
              Selected: #{selectedVertex + 1}
            </Text>
          )}
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomPanel}>
          {/* Nudge controls */}
          {canNudge && (
            <View style={styles.nudgeRow}>
              <Text style={styles.nudgeLabel}>Nudge:</Text>
              <TouchableOpacity style={styles.nudgeBtn} onPress={() => handleNudge(NUDGE_STEP, 0)}>
                <Text style={styles.nudgeBtnText}>N</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nudgeBtn} onPress={() => handleNudge(-NUDGE_STEP, 0)}>
                <Text style={styles.nudgeBtnText}>S</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nudgeBtn} onPress={() => handleNudge(0, -NUDGE_STEP)}>
                <Text style={styles.nudgeBtnText}>W</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nudgeBtn} onPress={() => handleNudge(0, NUDGE_STEP)}>
                <Text style={styles.nudgeBtnText}>E</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons */}
          {mode === 'add' && (
            <TouchableOpacity
              style={[styles.markBtn, marking && styles.markBtnDisabled]}
              onPress={handleMark}
              disabled={marking}
              activeOpacity={0.7}
            >
              <Text style={styles.markBtnText}>
                {marking ? 'Reading GPS...' : 'MARK POINT'}
              </Text>
            </TouchableOpacity>
          )}

          {mode === 'edit' && (
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnGreen, marking && styles.markBtnDisabled]}
                onPress={selectedVertex !== null ? handleMoveHere : handleInsertPoint}
                disabled={marking}
              >
                <Text style={styles.actionBtnText}>
                  {marking
                    ? 'Reading GPS...'
                    : selectedVertex !== null
                      ? 'Move Here'
                      : 'Insert Point Here'}
                </Text>
              </TouchableOpacity>
              {selectedVertex !== null && points.length > 3 && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnRed]}
                  onPress={handleDeleteVertex}
                >
                  <Text style={styles.actionBtnText}>Delete #{selectedVertex + 1}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Footer buttons */}
          <View style={styles.footerBtns}>
            {points.length > 0 && (
              <TouchableOpacity style={styles.footerBtn} onPress={handleUndo}>
                <Text style={styles.footerBtnText}>Undo</Text>
              </TouchableOpacity>
            )}
            {points.length >= 3 && (
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnSave]}
                onPress={handleSave}
              >
                <Text style={styles.footerBtnText}>
                  {mode === 'add' ? 'Close & Save' : 'Save'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.footerBtn} onPress={onCancel}>
              <Text style={styles.footerBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Name/capacity form */}
        <Modal visible={showForm} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                {mode === 'add' ? 'New Lot Details' : 'Update Lot'}
              </Text>
              {mode === 'add' && (
                <TextInput
                  style={styles.input}
                  placeholder="Lot ID (e.g. E)"
                  placeholderTextColor={Colors.TEXT_SECONDARY}
                  value={formId}
                  onChangeText={setFormId}
                  autoCapitalize="characters"
                  maxLength={10}
                />
              )}
              <TextInput
                style={styles.input}
                placeholder="Lot name"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={formName}
                onChangeText={setFormName}
              />
              <TextInput
                style={styles.input}
                placeholder="Capacity"
                placeholderTextColor={Colors.TEXT_SECONDARY}
                value={formCapacity}
                onChangeText={setFormCapacity}
                keyboardType="number-pad"
              />
              <View style={styles.formBtns}>
                <TouchableOpacity
                  style={[styles.footerBtn, styles.footerBtnSave]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  <Text style={styles.footerBtnText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.footerBtn}
                  onPress={() => setShowForm(false)}
                >
                  <Text style={styles.footerBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    ),

    // For map region fitting
    allPoints: userPos ? [...points, userPos] : points,
    userPos,
  };
}

const styles = StyleSheet.create({
  statusBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: Colors.BG_MODAL + 'F0',
    borderRadius: 12,
    padding: 12,
    zIndex: 15,
  },
  statusTitle: {
    color: Colors.ATU_GOLD,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusInfo: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  statusNearest: {
    color: Colors.STATUS_AVAILABLE,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.BG_MODAL + 'F0',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
    zIndex: 15,
  },
  nudgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  nudgeLabel: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
  },
  nudgeBtn: {
    backgroundColor: Colors.BG_CARD,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  markBtn: {
    backgroundColor: Colors.ATU_GOLD,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  markBtnDisabled: {
    opacity: 0.5,
  },
  markBtnText: {
    color: Colors.BG_DARK,
    fontSize: 18,
    fontWeight: '800',
  },
  editActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  actionBtnGreen: {
    backgroundColor: Colors.STATUS_AVAILABLE,
  },
  actionBtnRed: {
    backgroundColor: Colors.STATUS_FULL,
  },
  actionBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700',
  },
  footerBtns: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  footerBtn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  footerBtnSave: {
    backgroundColor: Colors.STATUS_AVAILABLE,
  },
  footerBtnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '600',
  },
  vertexContainer: {
    alignItems: 'center',
  },
  vertexDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.ATU_GOLD,
    borderWidth: 2,
    borderColor: '#fff',
  },
  vertexSelected: {
    backgroundColor: Colors.STATUS_FULL,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  vertexLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
    textShadowColor: '#000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  userDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 3,
    borderColor: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 24,
  },
  formCard: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 16,
    padding: 20,
  },
  formTitle: {
    color: Colors.ATU_GOLD,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.BG_DARK,
    borderRadius: 8,
    padding: 12,
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    marginBottom: 12,
  },
  formBtns: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
});
