import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

function Divider() {
  return <View style={styles.divider} />;
}

function DataSourceRow({ label, description }: { label: string; description: string }) {
  return (
    <View style={styles.dataSourceRow}>
      <Text style={styles.dataSourceLabel}>{label}</Text>
      <Text style={styles.dataSourceDesc}> — {description}</Text>
    </View>
  );
}

export default function AboutScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App name and tagline */}
      <Text style={styles.appName}>Park</Text>
      <Text style={styles.tagline}>Crowdsourced parking for ATU Letterkenny</Text>

      <Divider />

      {/* Survey callout card */}
      <View style={styles.surveyCard}>
        <Text style={styles.surveyPercent}>32.7%</Text>
        <Text style={styles.surveyBody}>
          of ATU Letterkenny students cited parking as the #1 campus complaint
        </Text>
        <Text style={styles.surveyCitation}>March 2026 survey, n=79</Text>
      </View>

      <Divider />

      {/* How it works */}
      <Text style={styles.sectionHeader}>3 data sources</Text>
      <DataSourceRow label="Crowd Reports" description="Students tap to report" />
      <DataSourceRow label="Geofence Tracking" description="Passive device counting" />
      <DataSourceRow label="CV Estimates" description="Drone and camera analysis" />

      <Divider />

      {/* Data details */}
      <Text style={styles.sectionHeader}>How data works</Text>
      <View style={styles.bulletContainer}>
        <Text style={styles.bulletText}>Reports decay after 90 minutes</Text>
        <Text style={styles.bulletText}>Geofence sessions expire after 4 hours</Text>
        <Text style={styles.bulletText}>All data is anonymous</Text>
      </View>

      <Divider />

      {/* Version */}
      <Text style={styles.version}>Park v1.0.0 — FoxxeLabs</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.BG_DARK,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  appName: {
    fontSize: 48,
    fontWeight: '900',
    color: Colors.ATU_BLUE,
    textAlign: 'center',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 16,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.TEXT_SECONDARY,
    opacity: 0.2,
    marginVertical: 28,
  },
  surveyCard: {
    backgroundColor: Colors.BG_CARD,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
  },
  surveyPercent: {
    fontSize: 56,
    fontWeight: '900',
    color: Colors.ATU_GOLD,
    marginBottom: 12,
  },
  surveyBody: {
    fontSize: 16,
    color: Colors.TEXT_PRIMARY,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 12,
  },
  surveyCitation: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    fontStyle: 'italic',
  },
  sectionHeader: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.ATU_BLUE,
    marginBottom: 18,
  },
  dataSourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
    paddingLeft: 8,
  },
  dataSourceLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ATU_GOLD,
  },
  dataSourceDesc: {
    fontSize: 15,
    color: Colors.TEXT_PRIMARY,
  },
  bulletContainer: {
    gap: 12,
    paddingLeft: 8,
  },
  bulletText: {
    fontSize: 15,
    color: Colors.TEXT_PRIMARY,
    lineHeight: 22,
  },
  version: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8,
  },
});
