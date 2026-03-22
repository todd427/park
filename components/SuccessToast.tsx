import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';

interface SuccessToastProps {
  visible: boolean;
  onDismiss: () => void;
}

export function SuccessToast({ visible, onDismiss }: SuccessToastProps) {
  const translateY = useSharedValue(100);

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 300 });
      translateY.value = withDelay(
        2500,
        withTiming(100, { duration: 300 }, () => {
          runOnJS(onDismiss)();
        }),
      );
    } else {
      translateY.value = 100;
    }
  }, [visible, onDismiss, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.text}>Thanks! Your report helps other students.</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    backgroundColor: Colors.ATU_BLUE,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  text: {
    color: Colors.TEXT_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
});
