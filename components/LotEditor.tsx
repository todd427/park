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
import { Marker, Polygon, type LatLng, type MapPressEvent } from 'react-native-maps';
import { Colors } from '../constants/theme';
import { type Lot } from '../data/types';
import { createLot, updateLot, deleteLot } from '../services/api';
import { refreshLotCache } from '../services/locationTask';

interface LotEditorProps {
  active: boolean;
  lots: Lot[];
  onClose: () => void;
  onSaved: () => void;
}

type EditorMode = 'idle' | 'add' | 'edit';

export function LotEditor({ active, lots, onClose, onSaved }: LotEditorProps) {
  const [mode, setMode] = useState<EditorMode>('idle');
  const [pins, setPins] = useState<LatLng[]>([]);
  const [selectedPin, setSelectedPin] = useState<number | null>(null);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCapacity, setFormCapacity] = useState('');
  const [formId, setFormId] = useState('');
  const [saving, setSaving] = useState(false);

  if (!active) return null;

  const handleMapPress = (e: MapPressEvent) => {
    if (mode !== 'add' && mode !== 'edit') return;
    const coord = e.nativeEvent.coordinate;

    if (selectedPin !== null) {
      // Move the selected pin to the tapped location
      setPins((prev) => {
        const updated = [...prev];
        updated[selectedPin] = coord;
        return updated;
      });
      setSelectedPin(null);
    } else {
      // Add a new pin
      setPins((prev) => [...prev, coord]);
    }
  };

  const handleMarkerPress = (index: number) => {
    if (selectedPin === index) {
      setSelectedPin(null); // Deselect
    } else {
      setSelectedPin(index); // Select for moving
    }
  };

  const handleLotTap = (lot: Lot) => {
    if (mode !== 'idle') return;
    setEditingLot(lot);
    setPins(lot.coordinates.map((c) => ({ ...c })));
    setFormName(lot.name);
    setFormCapacity(String(lot.capacity));
    setFormId(lot.id);
    setSelectedPin(null);
    setMode('edit');
  };

  const handleStartAdd = () => {
    setPins([]);
    setFormName('');
    setFormCapacity('');
    setFormId('');
    setEditingLot(null);
    setSelectedPin(null);
    setMode('add');
  };

  const handleUndo = () => {
    setSelectedPin(null);
    setPins((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setSelectedPin(null);
    setPins([]);
  };

  const handleDeletePin = () => {
    if (selectedPin === null) return;
    setPins((prev) => prev.filter((_, i) => i !== selectedPin));
    setSelectedPin(null);
  };

  const handleSave = () => {
    if (pins.length < 3) {
      Alert.alert('Need at least 3 points');
      return;
    }
    if (mode === 'add') {
      setFormName('');
      setFormCapacity('');
      setFormId('');
    }
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formName.trim()) {
      Alert.alert('Name required');
      return;
    }
    const cap = parseInt(formCapacity, 10);
    if (!cap || cap <= 0) {
      Alert.alert('Valid capacity required');
      return;
    }

    const coords = pins.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    setSaving(true);

    try {
      if (mode === 'add') {
        const id = formId.trim() || formName.trim().charAt(0).toUpperCase();
        await createLot({ id, name: formName.trim(), capacity: cap, coordinates: coords });
        Alert.alert('Created', `Lot "${formName.trim()}" added.`);
      } else if (mode === 'edit' && editingLot) {
        await updateLot(editingLot.id, {
          name: formName.trim(),
          capacity: cap,
          coordinates: coords,
        });
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
            Alert.alert('Deleted', `Lot "${editingLot.name}" removed.`);
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
    setSelectedPin(null);
  };

  const renderMapOverlays = () => (
    <>
      {(mode === 'add' || mode === 'edit') && pins.length >= 3 && (
        <Polygon
          coordinates={pins}
          fillColor={Colors.ATU_GOLD + '40'}
          strokeColor={Colors.ATU_GOLD}
          strokeWidth={2}
        />
      )}
      {(mode === 'add' || mode === 'edit') &&
        pins.map((pin, i) => (
          <Marker
            key={`editor-pin-${i}`}
            coordinate={pin}
            onPress={() => handleMarkerPress(i)}
            pinColor={selectedPin === i ? '#FF0000' : '#C8A84B'}
            title={selectedPin === i ? 'Tap map to move' : `Point ${i + 1}`}
          />
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
                  <Text style={styles.btnText}>Close Editor</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.toolbarTitle}>
                {mode === 'add' ? 'New Lot' : `Editing: ${editingLot?.name}`}
              </Text>
              <Text style={styles.hint}>
                {selectedPin !== null
                  ? 'Tap map to move selected point (red marker)'
                  : 'Tap map to add points. Tap a marker to select it for moving.'}
                {'\n'}{pins.length} point{pins.length !== 1 ? 's' : ''}
              </Text>
              <View style={styles.toolbarBtns}>
                <TouchableOpacity style={styles.btn} onPress={handleUndo}>
                  <Text style={styles.btnText}>Undo</Text>
                </TouchableOpacity>
                {selectedPin !== null && (
                  <TouchableOpacity
                    style={[styles.btn, { backgroundColor: Colors.STATUS_FILLING }]}
                    onPress={handleDeletePin}
                  >
                    <Text style={styles.btnText}>Remove Point</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btn} onPress={handleClear}>
                  <Text style={styles.btnText}>Clear</Text>
                </TouchableOpacity>
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
                  <Text style={styles.btnText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => setShowForm(false)}
                >
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
