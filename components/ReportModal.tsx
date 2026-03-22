import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Colors, StatusColors, StatusLabels } from '../constants/theme';
import { type Lot } from '../data/types';

interface ReportModalProps {
  lot: Lot | null;
  onReport: (lotId: string, type: 'found' | 'full') => void;
  onDismiss: () => void;
}

export function ReportModal({ lot, onReport, onDismiss }: ReportModalProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['35%'], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleReport = useCallback(
    (type: 'found' | 'full') => {
      if (lot) {
        onReport(lot.id, type);
        bottomSheetRef.current?.close();
      }
    },
    [lot, onReport],
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={lot ? 0 : -1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.indicator}
    >
      {lot && (
        <View style={styles.content}>
          <Text style={styles.title}>{lot.name}</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: StatusColors[lot.status] },
              ]}
            >
              <Text style={styles.statusText}>
                {StatusLabels[lot.status]}
              </Text>
            </View>
          </View>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.foundButton]}
              onPress={() => handleReport('found')}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Found a space ✅</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.fullButton]}
              onPress={() => handleReport('full')}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>It's full 🔴</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: Colors.BG_MODAL,
  },
  indicator: {
    backgroundColor: Colors.TEXT_SECONDARY,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 13,
    fontWeight: '600',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  foundButton: {
    backgroundColor: Colors.STATUS_AVAILABLE,
  },
  fullButton: {
    backgroundColor: Colors.STATUS_FULL,
  },
  buttonText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '700',
  },
});
