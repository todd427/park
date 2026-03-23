import React, { useState } from 'react';
import {
  Alert,
  Clipboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Marker, Polygon, type LatLng, type MapPressEvent } from 'react-native-maps';
import { Colors } from '../constants/theme';

interface PinDropModeProps {
  active: boolean;
  onToggle: () => void;
}

export function PinDropMode({ active, onToggle }: PinDropModeProps) {
  const [pins, setPins] = useState<LatLng[]>([]);

  const handleMapPress = (e: MapPressEvent) => {
    if (!active) return;
    setPins((prev) => [...prev, e.nativeEvent.coordinate]);
  };

  const handleUndo = () => {
    setPins((prev) => prev.slice(0, -1));
  };

  const handleCopy = () => {
    if (pins.length < 3) {
      Alert.alert('Need at least 3 points', 'Tap the map to add polygon vertices.');
      return;
    }
    const ts = pins
      .map(
        (p) =>
          `      { latitude: ${p.latitude.toFixed(7)}, longitude: ${p.longitude.toFixed(7)} },`,
      )
      .join('\n');
    const centroid = {
      latitude: pins.reduce((s, p) => s + p.latitude, 0) / pins.length,
      longitude: pins.reduce((s, p) => s + p.longitude, 0) / pins.length,
    };
    const output = `coordinates: [\n${ts}\n    ],\n    centroid: { latitude: ${centroid.latitude.toFixed(6)}, longitude: ${centroid.longitude.toFixed(6)} },`;
    Clipboard.setString(output);
    Alert.alert(
      'Copied!',
      `${pins.length} vertices copied to clipboard as TypeScript coordinates.`,
    );
  };

  const handleClear = () => {
    setPins([]);
  };

  return (
    <>
      {/* Render pins and polygon on the map — parent MapView must call handleMapPress */}
      {active && pins.length >= 3 && (
        <Polygon
          coordinates={pins}
          fillColor={Colors.ATU_GOLD + '40'}
          strokeColor={Colors.ATU_GOLD}
          strokeWidth={2}
        />
      )}
      {active &&
        pins.map((pin, i) => (
          <Marker
            key={`pin-${i}`}
            coordinate={pin}
            title={`Point ${i + 1}`}
            pinColor={Colors.ATU_GOLD}
          />
        ))}

      {/* Controls overlay */}
      {active && (
        <View style={styles.controls}>
          <Text style={styles.label}>
            Pin Drop Mode — {pins.length} point{pins.length !== 1 ? 's' : ''}
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity style={styles.btn} onPress={handleUndo}>
              <Text style={styles.btnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={handleCopy}>
              <Text style={styles.btnText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btn} onPress={handleClear}>
              <Text style={styles.btnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.closeBtn]}
              onPress={onToggle}
            >
              <Text style={styles.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

// Expose the press handler so the parent MapView can forward onPress
PinDropMode.handleMapPress = null as
  | ((e: MapPressEvent) => void)
  | null;

export function usePinDrop() {
  const [active, setActive] = useState(false);
  const [pins, setPins] = useState<LatLng[]>([]);

  const handleMapPress = (e: MapPressEvent) => {
    if (!active) return;
    setPins((prev) => [...prev, e.nativeEvent.coordinate]);
  };

  return { active, setActive, pins, setPins, handleMapPress };
}

const styles = StyleSheet.create({
  controls: {
    position: 'absolute',
    top: 40,
    left: 12,
    right: 12,
    backgroundColor: Colors.BG_MODAL + 'F0',
    borderRadius: 12,
    padding: 12,
  },
  label: {
    color: Colors.ATU_GOLD,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  btn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  closeBtn: {
    backgroundColor: Colors.STATUS_FULL,
  },
  btnText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
});
