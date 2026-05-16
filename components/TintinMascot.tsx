import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Platform } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming, 
  withDelay,
  FadeInRight,
  FadeOutRight,
  Layout
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useTintin } from '../context/TintinContext';
import { Theme } from '../constants/Theme';

const { width } = Dimensions.get('window');

export const TintinMascot = () => {
  const { message } = useTintin();
  const peekX = useSharedValue(100); // Start off-screen right
  const bubbleScale = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);

  useEffect(() => {
    if (message) {
      // Trigger arrival
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Peek in - Smooth timing instead of bouncy spring
      peekX.value = withTiming(0, { duration: 400 });
      
      // Show bubble smoothly
      bubbleScale.value = withDelay(300, withTiming(1, { duration: 300 }));
      bubbleOpacity.value = withDelay(300, withTiming(1, { duration: 200 }));
    } else {
      // Exit smoothly
      bubbleScale.value = withTiming(0, { duration: 200 });
      bubbleOpacity.value = withTiming(0, { duration: 200 });
      peekX.value = withDelay(200, withTiming(100, { duration: 400 }));
    }
  }, [message]);

  const mascotStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: peekX.value }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubbleOpacity.value,
    transform: [{ scale: bubbleScale.value }],
  }));

  if (!message && peekX.value === 100) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.wrapper, mascotStyle]}>
        {/* Modern Floating Message Pill */}
        <Animated.View style={[styles.bubbleContainer, bubbleStyle]}>
          <BlurView 
            intensity={80} 
            tint="light" 
            style={[
              styles.bubble,
              { 
                borderColor: message?.type === 'success' ? '#10b981' : 
                             message?.type === 'warning' ? '#f59e0b' : 
                             message?.type === 'error' ? '#ef4444' : 
                             'rgba(255,255,255,0.6)' 
              }
            ]}
          >
            <Text style={styles.bubbleText}>{message?.text}</Text>
          </BlurView>
        </Animated.View>

        {/* Tintin Image */}
        <Image 
          source={require('../assets/tintin.png')} 
          style={styles.tintinImage}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 150, // Peeking from upper-middle right
    right: 0,
    zIndex: 9999,
    width: 250,
    alignItems: 'flex-end',
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -5, // Nudged back to the right for a subtler peek
  },
  bubbleContainer: {
    marginRight: -35, // Keep it tight next to her
    marginBottom: 50,
    maxWidth: 200,
  },
  bubble: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30, // More rounded pill
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 8,
  },
  bubbleText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
    color: Theme.colors.onSurface,
    lineHeight: 18,
    textAlign: 'center',
    letterSpacing: -0.2, // Tighter, more professional tracking
  },
  tintinImage: {
    width: 100,
    height: 100,
  },
});
