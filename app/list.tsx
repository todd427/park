import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../constants/theme';
import { type Lot } from '../data/types';
import { MOCK_LOTS } from '../data/mockData';
import { LotCard } from '../components/LotCard';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';
import { useUserId } from '../hooks/useUserId';
import { fetchLots, submitReport } from '../services/api';

export default function ListScreen() {
  const [lots, setLots] = useState<Lot[]>(MOCK_LOTS);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const userId = useUserId();

  const loadLots = useCallback(async () => {
    try {
      const data = await fetchLots();
      setLots(data);
    } catch {
      // Keep current data
    }
  }, []);

  useEffect(() => {
    loadLots();
  }, [loadLots]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLots();
    setRefreshing(false);
  }, [loadLots]);

  const handleReport = useCallback(
    (lotId: string) => {
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots],
  );

  const handleSubmitReport = useCallback(
    async (lotId: string, type: 'found' | 'full') => {
      setSelectedLot(null);
      setToastVisible(true);
      try {
        await submitReport(lotId, type, userId);
        await loadLots();
      } catch {
        // Best effort
      }
    },
    [userId, loadLots],
  );

  const handleDismiss = useCallback(() => setSelectedLot(null), []);
  const handleToastDismiss = useCallback(() => setToastVisible(false), []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <FlatList
        data={lots}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LotCard lot={item} onReport={handleReport} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.ATU_GOLD}
          />
        }
      />

      <ReportModal
        lot={selectedLot}
        onReport={handleSubmitReport}
        onDismiss={handleDismiss}
      />

      <SuccessToast visible={toastVisible} onDismiss={handleToastDismiss} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  list: {
    paddingTop: 12,
    paddingBottom: 24,
  },
});
