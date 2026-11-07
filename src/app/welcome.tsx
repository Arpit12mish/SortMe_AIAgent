import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, glow, radii, spacing } from '../components/theme';
import { PressableScale } from '../components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface WelcomePage {
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  gradient: [string, string, string];
}

const PAGES: WelcomePage[] = [
  {
    eyebrow: 'Hello 👋',
    title: 'Your AI Day Partner',
    subtitle:
      'SortMe listens, plans, and keeps you moving — so you stop juggling tasks, interviews, and notes in your head.',
    accent: colors.primary,
    gradient: ['#0E0E14', '#12182B', '#0E0E14'],
  },
  {
    eyebrow: 'Capture anything',
    title: 'Just Talk It Out',
    subtitle:
      'A new task, an interview, your mood, or notes to revise — say it or type it, and SortMe figures out exactly where it goes.',
    accent: colors.primary,
    gradient: ['#0E0E14', '#16213B', '#0E0E14'],
  },
  {
    eyebrow: 'Your real notes & inbox',
    title: 'Plugs Into Your Life',
    subtitle:
      'Connect Google Docs and Gmail — SortMe reads only what you pick to help you revise for exams and follow up on real opportunities.',
    accent: colors.protected,
    gradient: ['#0E0E14', '#1E1530', '#0E0E14'],
  },
  {
    eyebrow: 'Thinking ahead',
    title: 'An AI That Plans Ahead',
    subtitle:
      'Daily nudges to follow up and revise, smart prep before interviews, and a weekly read on skills worth learning next.',
    accent: colors.warning,
    gradient: ['#0E0E14', '#241C10', '#0E0E14'],
  },
  {
    eyebrow: 'Every single morning',
    title: 'A Plan That Fits Today',
    subtitle:
      'A quick guided check-in — tap, type, or speak — turns your mood and energy into a schedule built for how today actually feels.',
    accent: colors.success,
    gradient: ['#0E0E14', '#102420', '#0E0E14'],
  },
];

function FloatingOrb({ size, color, style, delay }: { size: number; color: string; style: object; delay: number }) {
  const [pulse] = useState(() => new Animated.Value(0));

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, delay, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, delay]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale }],
          opacity,
        },
        style,
        glow(color),
      ]}
    />
  );
}

function PageVisual({ accent }: { accent: string }) {
  return (
    <View style={styles.visual} pointerEvents="none">
      <FloatingOrb size={170} color={accent} delay={0} style={{ top: '8%', left: '12%' }} />
      <FloatingOrb size={110} color={accent} delay={600} style={{ top: '26%', right: '8%' }} />
      <FloatingOrb size={70} color={accent} delay={1200} style={{ top: '40%', left: '45%' }} />
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isLast = activeIndex === PAGES.length - 1;

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  };

  const goToOnboarding = () => router.replace('/onboarding');

  const handleNext = () => {
    if (isLast) {
      goToOnboarding();
      return;
    }
    scrollRef.current?.scrollTo({ x: (activeIndex + 1) * SCREEN_WIDTH, animated: true });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
      >
        {PAGES.map((page, i) => (
          <View key={i} style={styles.page}>
            <LinearGradient colors={page.gradient} style={StyleSheet.absoluteFill} />
            <PageVisual accent={page.accent} />
            <SafeAreaView style={styles.pageContent} edges={['top', 'bottom']}>
              <View style={styles.topRow}>
                {!isLast && i === activeIndex && (
                  <PressableScale onPress={goToOnboarding} style={styles.skipButton} scaleTo={0.93}>
                    <Text style={styles.skipText}>Skip</Text>
                  </PressableScale>
                )}
              </View>

              <View style={styles.spacer} />

              <View style={styles.textBlock}>
                <Text style={[styles.eyebrow, { color: page.accent }]}>{page.eyebrow}</Text>
                <Text style={styles.title}>{page.title}</Text>
                <Text style={styles.subtitle}>{page.subtitle}</Text>
              </View>

              <View style={styles.dotsRow}>
                {PAGES.map((_, dotIndex) => (
                  <View
                    key={dotIndex}
                    style={[
                      styles.dot,
                      dotIndex === activeIndex && [styles.dotActive, { backgroundColor: page.accent }],
                    ]}
                  />
                ))}
              </View>

              <PressableScale onPress={handleNext} scaleTo={0.97} style={[styles.cta, { backgroundColor: page.accent }, glow(page.accent)]}>
                <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
              </PressableScale>
            </SafeAreaView>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { width: SCREEN_WIDTH, flex: 1 },
  visual: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  pageContent: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  topRow: { height: 40, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' },
  skipButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  skipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  spacer: { flex: 1 },
  textBlock: { marginBottom: spacing.xl },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, marginBottom: spacing.sm },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 42,
    marginBottom: spacing.md,
    letterSpacing: -0.5,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: undefined }),
  },
  subtitle: { fontSize: 16, lineHeight: 23, color: colors.textMuted },
  dotsRow: { flexDirection: 'row', gap: 6, marginBottom: spacing.lg },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { width: 28 },
  cta: {
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
});
