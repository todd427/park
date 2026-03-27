import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/theme';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://park-api.fly.dev';

interface SnapButtonProps {
  userId: string;
}

export function SnapButton({ userId }: SnapButtonProps) {
  const [uploading, setUploading] = useState(false);

  const handleSnap = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'Allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: `snap_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      formData.append('user_id', userId);
      formData.append('note', 'Snap from Park app');

      const res = await fetch(`${API_BASE}/api/photos`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        Alert.alert('Sent!', 'Photo uploaded successfully.');
      } else {
        Alert.alert('Upload failed', 'Could not send photo. Try again.');
      }
    } catch {
      Alert.alert('Upload failed', 'Network error. Try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={handleSnap}
      activeOpacity={0.8}
      disabled={uploading}
    >
      <Text style={styles.text}>{uploading ? '...' : 'Snap'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  text: {
    color: Colors.ATU_GOLD,
    fontSize: 13,
    fontWeight: '700',
  },
});
