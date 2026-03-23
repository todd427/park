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
  passive: 'Live',
  blended: 'Blended',
};

function timeAgo(isoString: string | null): string | null {
  if (!isoString) return null;
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function LotCard({ lot, onReport }: LotCardProps) {
  const statusColor = StatusColors[lot.status];
  const updated = timeAgo(lot.lastUpdated);

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
            { width: `${Math.min(lot.fillPct, 100)}%`, backgroundColor: statusColor },
          ]}
        />
      </View>

      {/* Live presence row */}
      {lot.activeSessions > 0 && (
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {lot.activeSessions} device{lot.activeSessions !== 1 ? 's' : ''} here now
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <View style={styles.metaCol}>
          <Text style={styles.meta}>
            {lot.reportCount} report{lot.reportCount !== 1 ? 's' : ''} in last 90 min
          </Text>
          {updated && (
            <Text style={styles.timestamp}>Updated {updated}</Text>
          )}
          {lot.cvOccupancy != null && (
            <Text style={styles.cvMeta}>
              CV: {lot.cvOccupancy.toFixed(0)}% occupied
              {lot.cvConfidence != null &&
                ` (${(lot.cvConfidence * 100).toFixed(0)}% conf)`}
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
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: Colors.BG_DARK,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.STATUS_AVAILABLE,
  },
  liveText: {
    color: Colors.STATUS_AVAILABLE,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  metaCol: {
    flex: 1,
  },
  meta: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 13,
  },
  timestamp: {
    color: Colors.TEXT_SECONDARY,
    fontSize: 11,
    marginTop: 2,
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
