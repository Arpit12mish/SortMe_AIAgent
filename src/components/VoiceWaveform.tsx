import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, duration } from './theme';

const BAR_COUNT = 5;
// Each bar lags the raw level slightly so they don't move in perfect lockstep — reads as a
// waveform instead of one block pulsing uniformly.
const BAR_DELAY_MS = [0, 40, 80, 40, 0];

export function VoiceWaveform({ level, active }: { level: number; active: boolean }) {
  const [bars] = useState(() => Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15)));

  useEffect(() => {
    const target = active ? Math.max(0.15, level) : 0.15;
    const animations = bars.map((bar, i) =>
      Animated.timing(bar, {
        toValue: target,
        duration: duration.fast,
        delay: BAR_DELAY_MS[i] ?? 0,
        useNativeDriver: false,
      })
    );
    Animated.parallel(animations).start();
  }, [level, active, bars]);

  return (
    <View style={styles.row}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              backgroundColor: active ? colors.primary : colors.border,
              height: bar.interpolate({ inputRange: [0, 1], outputRange: [6, 48] }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, justifyContent: 'center' },
  bar: { width: 6, borderRadius: 3 },
});
