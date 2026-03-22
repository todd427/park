import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, StatusColors, StatusLabels } from '../constants/theme';
import { type Lot } from '../data/types';

interface LotCardProps {
  lot: Lot;
  onReport: (lotId: string) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  crowd: 'Crowd',
  cv: 'CV',
  blended: 'Blended',
};

export function LotCard({ lot, onReport }: LotCardProps) {
  const statusColor = StatusColors[lot.status];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{lot.name}</Text>
          {lot.dataSource !== 'crowd' && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceText}>
                {SOURCE_LABELS[lot.dataSource] ?? lot.dataSource}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.badge, { backgroundColor: statusColor }]}>
          <Text style={styles.badgeText}>{StatusLabels[lot.status]}</Text>
        </View>
      </View>

      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${lot.fillPct}%`, backgroundColor: statusColor },
          ]}
        />
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.meta}>
            {lot.reportCount} report{lot.reportCount !== 1 ? 's' : ''} in last
            90 min
          </Text>
          {lot.cvOccupancy != null && (
            <Text style={styles.cvMeta}>
              CV: {lot.cvOccupancy.toFixed(0)}% occupied
              {lot.cvConfidence != null &&
                ` (${(lot.cvConfidence * 100).toFixed(0)}% conf)`}
              {lot.cvSource ? ` — ${lot.cvSource}` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => onReport(lot.id)}
          activeOpacity={0.7}
        >
          <Text style={styles.reportBtnText}>Report</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.TEXT_PRIMARY,
  },
  sourceBadge: {
    backgroundColor: Colors.ATU_GOLD,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourceText: {
    color: Colors.BG_DARK,
    fontSize: 10,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeText: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '600',
  },
  barTrack: {
    height: 8,
    backgroundColor: Colors.BG_DARK,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  meta: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
  },
  cvMeta: {
    color: Colors.ATU_GOLD,
    fontSize: 11,
    marginTop: 2,
  },
  reportBtn: {
    backgroundColor: Colors.ATU_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reportBtnText: {
    color: Colors.ATU_GOLD,
    fontSize: 14,
    fontWeight: '600',
  },
});
