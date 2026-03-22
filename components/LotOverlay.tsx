import React from 'react';
import { Polygon } from 'react-native-maps';
import { StatusColors } from '../constants/theme';
import { type Lot } from '../data/types';

interface LotOverlayProps {
  lot: Lot;
  onPress: () => void;
}

export function LotOverlay({ lot, onPress }: LotOverlayProps) {
  const color = StatusColors[lot.status];

  return (
    <Polygon
      coordinates={lot.coordinates}
      fillColor={color + '73'} // ~0.45 opacity
      strokeColor="rgba(255,255,255,0.8)"
      strokeWidth={2}
      tappable
      onPress={onPress}
    />
  );
}
