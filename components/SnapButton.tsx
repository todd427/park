import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Colors } from '../constants/theme';

const API_BASE = __DEV__
  ? 'http://10.0.2.2:8000'
  : 'https://park-api.fly.dev';

interface SnapButtonProps {
  userId: string;
  viewRef: React.RefObject<any>;
}

export function SnapButton({ userId, viewRef }: SnapButtonProps) {
  const [uploading, setUploading] = useState(false);

  const handleSnap = async () => {
    if (!viewRef.current) {
      Alert.alert('Nothing to capture');
      return;
    }

    setUploading(true);
    try {
      const uri = await captureRef(viewRef, {
        format: 'jpg',
        quality: 0.8,
      });

      const formData = new FormData();
      formData.append('file', {
        uri,
        name: `snap_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as any);
      formData.append('user_id', userId);
      formData.append('note', 'Screenshot from Park app');

      const res = await fetch(`${API_BASE}/api/photos`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        Alert.alert('Sent!', 'Screenshot uploaded.');
      } else {
        Alert.alert('Upload failed', 'Try again.');
      }
    } catch (e: any) {
      Alert.alert('Snap failed', e.message || 'Could not capture screen.');
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
