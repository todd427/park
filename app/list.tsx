import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../constants/theme';
import { type Lot } from '../data/types';
import { MOCK_LOTS } from '../data/mockData';
import { LotCard } from '../components/LotCard';
import { ReportModal } from '../components/ReportModal';
import { SuccessToast } from '../components/SuccessToast';

export default function ListScreen() {
  const [lots, setLots] = useState<Lot[]>(MOCK_LOTS);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [toastVisible, setToastVisible] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Phase 0: mock refresh
    setTimeout(() => {
      setLots([...MOCK_LOTS]);
      setRefreshing(false);
    }, 600);
  }, []);

  const handleReport = useCallback(
    (lotId: string) => {
      const lot = lots.find((l) => l.id === lotId) ?? null;
      setSelectedLot(lot);
    },
    [lots],
  );

  const handleSubmitReport = useCallback(
    (_lotId: string, _type: 'found' | 'full') => {
      setSelectedLot(null);
      setToastVisible(true);
    },
    [],
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
