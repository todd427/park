import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Colors } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ONBOARDING_KEY = 'park_onboarding_seen';

const slides = [
  {
    id: 0,
    title: 'Parking at ATU Letterkenny',
    body: '32.7% of students say parking is the #1 campus complaint.',
    subtitle: 'March 2026 survey, n=79',
  },
  {
    id: 1,
    title: 'Crowdsourced + Smart',
    body: 'Students report when they find spaces or when lots are full. Park blends crowd reports, geofence tracking, and camera data to show real-time availability.',
    features: [
      { icon: '📝', label: 'Report' },
      { icon: '📍', label: 'Auto-detect' },
      { icon: '📡', label: 'Live status' },
    ],
  },
  {
    id: 2,
    title: 'Help other students',
    body: 'Allow location access so Park can detect which lot you\'re in. Your reports make parking easier for everyone.',
    cta: true,
  },
];

export default function OnboardingScreen() {
  const [ready, setReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (val === 'true') {
        router.replace('/');
      } else {
        setReady(true);
      }
    });
  }, []);

  const handleGetStarted = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/');
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  if (!ready) return <View style={styles.container} />;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        scrollEventThrottle={16}
      >
        {/* Slide 1 — The Problem */}
        <View style={styles.slide}>
          <View style={styles.accentBar} />
          <Text style={styles.title}>{slides[0].title}</Text>
          <Text style={styles.statNumber}>32.7%</Text>
          <Text style={styles.body}>{slides[0].body}</Text>
          <Text style={styles.subtitle}>{slides[0].subtitle}</Text>
        </View>

        {/* Slide 2 — How Park Works */}
        <View style={styles.slide}>
          <Text style={styles.title}>{slides[1].title}</Text>
          <Text style={styles.body}>{slides[1].body}</Text>
          <View style={styles.featuresRow}>
            {slides[1].features!.map((f) => (
              <View key={f.label} style={styles.featureItem}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureLabel}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Slide 3 — Get Started */}
        <View style={styles.slide}>
          <Text style={styles.title}>{slides[2].title}</Text>
          <Text style={styles.body}>{slides[2].body}</Text>
          <Pressable style={styles.ctaButton} onPress={handleGetStarted}>
            <Text style={styles.ctaText}>Get Started</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dotsContainer}>
        {slides.map((s) => (
          <View
            key={s.id}
            style={[
              styles.dot,
              activeIndex === s.id ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 36,
  },
  accentBar: {
    width: 60,
    height: 4,
    backgroundColor: Colors.ATU_BLUE,
    borderRadius: 2,
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.ATU_BLUE,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  statNumber: {
    fontSize: 64,
    fontWeight: '900',
    color: Colors.ATU_GOLD,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 18,
    color: Colors.TEXT_PRIMARY,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  featuresRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 40,
  },
  featureItem: {
    alignItems: 'center',
    flex: 1,
  },
  featureIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  featureLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ATU_GOLD,
    textAlign: 'center',
  },
  ctaButton: {
    backgroundColor: Colors.ATU_GOLD,
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 12,
    marginTop: 40,
  },
  ctaText: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.BG_DARK,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 48,
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: Colors.ATU_GOLD,
  },
  dotInactive: {
    backgroundColor: Colors.TEXT_SECONDARY,
    opacity: 0.4,
  },
});
