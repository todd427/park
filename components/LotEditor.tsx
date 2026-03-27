import React, { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Circle, Marker, Polygon, type LatLng, type MapPressEvent } from 'react-native-maps';
import { Colors } from '../constants/theme';
import { type Lot } from '../data/types';
import { createLot, updateLot, deleteLot } from '../services/api';
import { refreshLotCache } from '../services/locationTask';

interface LotEditorProps {
  active: boolean;
  lots: Lot[];
  mapCenter: LatLng;
  onClose: () => void;
  onSaved: () => void;
}

type EditorMode = 'idle' | 'add' | 'edit';

/** Calculate midpoint of two coordinates */
function midpoint(a: LatLng, b: LatLng): LatLng {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

/** Get edges as pairs of indices + their midpoints */
function getEdges(pts: LatLng[]) {
  const edges: { i: number; j: number; mid: LatLng }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    edges.push({ i, j, mid: midpoint(pts[i], pts[j]) });
  }
  return edges;
}

/** Create a default square at a given center, ~50m side */
function defaultSquare(center: LatLng): LatLng[] {
  const d = 0.00025; // ~25m in lat/lng at this latitude
  return [
    { latitude: center.latitude + d, longitude: center.longitude - d },
    { latitude: center.latitude + d, longitude: center.longitude + d },
    { latitude: center.latitude - d, longitude: center.longitude + d },
    { latitude: center.latitude - d, longitude: center.longitude - d },
  ];
}

export function LotEditor({ active, lots, mapCenter, onClose, onSaved }: LotEditorProps) {
  const [mode, setMode] = useState<EditorMode>('idle');
  const [pins, setPins] = useState<LatLng[]>([]);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCapacity, setFormCapacity] = useState('');
  const [formId, setFormId] = useState('');
  const [saving, setSaving] = useState(false);

  if (!active) return null;

  const edges = pins.length >= 3 ? getEdges(pins) : [];

  const handleMapPress = (e: MapPressEvent) => {
    if (mode !== 'add' && mode !== 'edit') return;
    const coord = e.nativeEvent.coordinate;

    if (selectedEdge !== null && pins.length >= 3) {
      // Move the selected edge: shift both vertices by the delta from midpoint to tap
      const edge = edges[selectedEdge];
      const delta = {
        latitude: coord.latitude - edge.mid.latitude,
        longitude: coord.longitude - edge.mid.longitude,
      };
      setPins((prev) => {
        const updated = [...prev];
        updated[edge.i] = {
          latitude: prev[edge.i].latitude + delta.latitude,
          longitude: prev[edge.i].longitude + delta.longitude,
        };
        updated[edge.j] = {
          latitude: prev[edge.j].latitude + delta.latitude,
          longitude: prev[edge.j].longitude + delta.longitude,
        };
        return updated;
      });
      setSelectedEdge(null);
    } else if (selectedVertex !== null) {
      // Move the selected vertex to tap location
      setPins((prev) => {
        const updated = [...prev];
        updated[selectedVertex] = coord;
        return updated;
      });
      setSelectedVertex(null);
    }
    // If nothing selected, ignore map tap (no more adding random points)
  };

  const handleEdgeTap = (edgeIndex: number) => {
    setSelectedVertex(null);
    setSelectedEdge(selectedEdge === edgeIndex ? null : edgeIndex);
  };

  const handleVertexTap = (vertexIndex: number) => {
    setSelectedEdge(null);
    setSelectedVertex(selectedVertex === vertexIndex ? null : vertexIndex);
  };

  const handleLotTap = (lot: Lot) => {
    if (mode !== 'idle') return;
    setEditingLot(lot);
    setPins(lot.coordinates.map((c) => ({ ...c })));
    setFormName(lot.name);
    setFormCapacity(String(lot.capacity));
    setFormId(lot.id);
    setSelectedEdge(null);
    setSelectedVertex(null);
    setMode('edit');
  };

  const handleStartAdd = () => {
    setPins(defaultSquare(mapCenter));
    setFormName('');
    setFormCapacity('');
    setFormId('');
    setEditingLot(null);
    setSelectedEdge(null);
    setSelectedVertex(null);
    setMode('add');
  };

  const handleAddVertex = () => {
    // Insert a new vertex at the selected edge's midpoint
    if (selectedEdge === null || pins.length < 3) return;
    const edge = edges[selectedEdge];
    setPins((prev) => {
      const updated = [...prev];
      updated.splice(edge.j, 0, edge.mid);
      return updated;
    });
    setSelectedEdge(null);
  };

  const handleRemoveVertex = () => {
    if (selectedVertex === null || pins.length <= 3) return;
    setPins((prev) => prev.filter((_, i) => i !== selectedVertex));
    setSelectedVertex(null);
  };

  const handleSave = () => {
    if (pins.length < 3) {
      Alert.alert('Need at least 3 points');
      return;
    }
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) { Alert.alert('Name required'); return; }
    const cap = parseInt(formCapacity, 10);
    if (!cap || cap <= 0) { Alert.alert('Valid capacity required'); return; }

    const coords = pins.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    setSaving(true);
    try {
      if (mode === 'add') {
        const id = formId.trim() || formName.trim().charAt(0).toUpperCase();
        await createLot({ id, name: formName.trim(), capacity: cap, coordinates: coords });
        Alert.alert('Created', `Lot "${formName.trim()}" added.`);
      } else if (mode === 'edit' && editingLot) {
        await updateLot(editingLot.id, { name: formName.trim(), capacity: cap, coordinates: coords });
        Alert.alert('Updated', `Lot "${formName.trim()}" saved.`);
      }
      await refreshLotCache();
      onSaved();
      resetEditor();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editingLot) return;
    Alert.alert('Delete lot?', `Remove "${editingLot.name}" permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteLot(editingLot.id);
            await refreshLotCache();
            onSaved();
            resetEditor();
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const resetEditor = () => {
    setMode('idle');
    setPins([]);
    setEditingLot(null);
    setShowForm(false);
    setSelectedEdge(null);
    setSelectedVertex(null);
  };

  const selectionHint = selectedEdge !== null
    ? 'Edge selected (blue). Tap map to move it there.'
    : selectedVertex !== null
      ? 'Vertex selected (red). Tap map to move it.'
      : 'Tap a blue circle to select an edge. Tap a corner to select a vertex.';

  const renderMapOverlays = () => (
    <>
      {(mode === 'add' || mode === 'edit') && pins.length >= 3 && (
        <Polygon
          coordinates={pins}
          fillColor={Colors.ATU_GOLD + '30'}
          strokeColor={Colors.ATU_GOLD}
          strokeWidth={2}
        />
      )}
      {/* Vertex markers (corners) */}
      {(mode === 'add' || mode === 'edit') &&
        pins.map((pin, i) => (
          <Marker
            key={`v-${i}`}
            coordinate={pin}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => handleVertexTap(i)}
          >
            <View
              style={[
                styles.vertexDot,
                selectedVertex === i && styles.vertexDotSelected,
              ]}
            />
          </Marker>
        ))}
      {/* Edge midpoint handles */}
      {(mode === 'add' || mode === 'edit') &&
        edges.map((edge, i) => (
          <Marker
            key={`e-${i}`}
            coordinate={edge.mid}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => handleEdgeTap(i)}
          >
            <View
              style={[
                styles.edgeDot,
                selectedEdge === i && styles.edgeDotSelected,
              ]}
            />
          </Marker>
        ))}
    </>
  );

  return {
    handleMapPress,
    handleLotTap,
    renderMapOverlays,
    renderControls: () => (
      <>
        <View style={styles.toolbar}>
          {mode === 'idle' ? (
            <>
              <Text style={styles.toolbarTitle}>Lot Editor</Text>
              <Text style={styles.hint}>Tap a lot to edit, or add a new one</Text>
              <View style={styles.toolbarBtns}>
                <TouchableOpacity style={styles.btn} onPress={handleStartAdd}>
                  <Text style={styles.btnText}>+ Add Lot</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: Colors.STATUS_FULL }]}
                  onPress={onClose}
                >
                  <Text style={styles.btnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.toolbarTitle}>
                {mode === 'add' ? 'New Lot' : `Editing: ${editingLot?.name}`}
              </Text>
              <Text style={styles.hint}>{selectionHint}</Text>
              <View style={styles.toolbarBtns}>
                {selectedEdge !== null && (
                  <TouchableOpacity style={styles.btn} onPress={handleAddVertex}>
                    <Text style={styles.btnText}>Split Edge</Text>
                  </TouchableOpacity>
                )}
                {selectedVertex !== null && pins.length > 3 && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: Colors.STATUS_FILLING }]}
                    onPress={handleRemoveVertex}
                  >
                    <Text style={styles.btnText}>Remove Vertex</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: Colors.STATUS_AVAILABLE }]}
                  onPress={handleSave}
                >
                  <Text style={styles.btnText}>Save</Text>
                </TouchableOpacity>
                {mode === 'edit' && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: Colors.STATUS_FULL }]}
                    onPress={handleDelete}
                  >
                    <Text style={styles.btnText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btn} onPress={resetEditor}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <Modal visible={showForm} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>
                {mode === 'add' ? 'New Lot Details' : 'Edit Lot Details'}
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
                  style={[styles.btn, { backgroundColor: Colors.STATUS_AVAILABLE }]}
                  onPress={handleSubmit}
                  disabled={saving}
                >
                  <Text style={styles.btnText}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btn} onPress={() => setShowForm(false)}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </>
    ),
  };
}

const styles = StyleSheet.create({
  toolbar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    backgroundColor: Colors.BG_MODAL + 'F0',
    borderRadius: 12,
    padding: 12,
    zIndex: 15,
  },
  toolbarTitle: {
    color: Colors.ATU_GOLD,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  hint: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  toolbarBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  btn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  vertexDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.ATU_GOLD,
    borderWidth: 2,
    borderColor: '#fff',
  },
  vertexDotSelected: {
    backgroundColor: Colors.STATUS_FULL,
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  edgeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.ATU_BLUE,
    borderWidth: 2,
    borderColor: '#fff',
  },
  edgeDotSelected: {
    backgroundColor: '#00BFFF',
    width: 16,
    height: 16,
    borderRadius: 8,
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
