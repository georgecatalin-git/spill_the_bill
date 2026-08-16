import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ONBOARDING_STEPS } from '@/components/onboarding/steps';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useOnboarding } from '@/providers/onboarding-provider';

const LAST_STEP = ONBOARDING_STEPS.length - 1;

/**
 * The admin's first-run tutorial.
 *
 * Everything on these pages is a drawing of the app — no table, bill or claim
 * is touched. Every way out marks the tutorial as seen, so it never asks
 * twice: the buttons, and Android's back button on the first page.
 */
export default function OnboardingScreen() {
  const { finish } = useOnboarding();
  const { width } = useWindowDimensions();
  const border = useThemeColor({}, 'border');
  const accent = useThemeColor({}, 'accent');

  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [step, setStep] = useState(0);

  const goTo = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(LAST_STEP, index));
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setStep(next);
    },
    [width]
  );

  /** Leaves the tutorial and records that it has been seen. */
  const leave = useCallback(
    (destination?: '/new-table' | '/dashboard') => {
      finish();

      if (destination) {
        router.replace(destination);
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/dashboard');
      }
    },
    [finish]
  );

  // Android's back button steps backwards through the tutorial rather than
  // dropping out of it half-read; on the first page it means "skip".
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (step === 0) {
          leave();
        } else {
          goTo(step - 1);
        }
        return true;
      });

      return () => subscription.remove();
    }, [step, goTo, leave])
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <ThemedText type="label" style={styles.counter}>
            {step + 1} / {ONBOARDING_STEPS.length}
          </ThemedText>

          {step < LAST_STEP && (
            <Pressable
              onPress={() => leave()}
              hitSlop={Spacing.md}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="secondary" style={styles.skip}>
                Skip
              </ThemedText>
            </Pressable>
          )}
        </View>

        <View style={[styles.track, { backgroundColor: border }]}>
          <Animated.View
            style={[
              styles.trackFill,
              {
                backgroundColor: accent,
                transform: [
                  {
                    scaleX: scrollX.interpolate({
                      inputRange: [0, LAST_STEP * width],
                      outputRange: [1 / ONBOARDING_STEPS.length, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          />
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
            useNativeDriver: true,
            // Read the page from the offset rather than from onMomentumScrollEnd:
            // a slow drag released without velocity never produces a momentum
            // end on iOS, which would leave the counter naming the wrong step.
            listener: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
              if (width <= 0) return;

              const next = Math.round(event.nativeEvent.contentOffset.x / width);
              setStep((current) => (current === next ? current : next));
            },
          })}
          scrollEventThrottle={16}
          style={styles.pager}>
          {ONBOARDING_STEPS.map((content, index) => {
            const distance = scrollX.interpolate({
              inputRange: [(index - 1) * width, index * width, (index + 1) * width],
              outputRange: [0, 1, 0],
              extrapolate: 'clamp',
            });

            return (
              <ScrollView
                key={content.title}
                style={{ width }}
                contentContainerStyle={styles.page}
                showsVerticalScrollIndicator={false}>
                <Animated.View
                  style={[
                    styles.pageBody,
                    {
                      opacity: distance,
                      transform: [
                        {
                          translateY: distance.interpolate({
                            inputRange: [0, 1],
                            outputRange: [16, 0],
                          }),
                        },
                      ],
                    },
                  ]}>
                  <View style={styles.copy}>
                    <ThemedText type="title" style={styles.title}>
                      {content.title}
                    </ThemedText>

                    {content.subtitle && (
                      <ThemedText style={styles.subtitle}>{content.subtitle}</ThemedText>
                    )}

                    <ThemedText type="secondary" style={styles.description}>
                      {content.description}
                    </ThemedText>
                  </View>

                  <View style={styles.visual}>{content.visual}</View>
                </Animated.View>
              </ScrollView>
            );
          })}
        </Animated.ScrollView>

        <View style={styles.footer}>
          {step === 0 && (
            <>
              <Button label="Get Started" onPress={() => goTo(1)} />
              <Button label="Skip" variant="secondary" onPress={() => leave()} />
            </>
          )}

          {step > 0 && step < LAST_STEP && (
            <>
              <Button label="Next" onPress={() => goTo(step + 1)} />
              <Button label="Back" variant="secondary" onPress={() => goTo(step - 1)} />
            </>
          )}

          {step === LAST_STEP && (
            <>
              <Button label="Create My First Table" onPress={() => leave('/new-table')} />
              <Button label="Explore App" variant="secondary" onPress={() => leave('/dashboard')} />
            </>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  counter: {
    opacity: 0.6,
  },
  skip: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  track: {
    height: 3,
    marginHorizontal: Spacing.xl,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  trackFill: {
    height: 3,
    width: '100%',
    borderRadius: Radius.pill,
    transformOrigin: 'left',
  },
  pager: {
    flex: 1,
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  pageBody: {
    flex: 1,
    gap: Spacing.xxl,
  },
  copy: {
    gap: Spacing.sm,
  },
  title: {
    fontSize: 30,
    lineHeight: 39,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
  },
  visual: {
    flex: 1,
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
});
