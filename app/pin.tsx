import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getPIN, savePIN, hashPIN } from '../lib/storage';
import { Theme } from '../constants/Theme';
import { Delete } from 'lucide-react-native';

export default function PinScreen() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [mode, setMode] = useState<'loading' | 'setup' | 'setup-confirm' | 'enter'>('loading');
  const [error, setError] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const stored = await getPIN();
      setMode(stored ? 'enter' : 'setup');
    })();
  }, []);

  const shake = () => {
    Vibration.vibrate(400);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = (digit: string) => {
    setError('');
    const current = mode === 'setup-confirm' ? confirmPin : pin;
    if (current.length >= 4) return;
    const next = current + digit;

    if (mode === 'setup') {
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => setMode('setup-confirm'), 200);
      }
    } else if (mode === 'setup-confirm') {
      setConfirmPin(next);
      if (next.length === 4) {
        setTimeout(async () => {
          if (next === pin) {
            await savePIN(next);
            router.replace('/(tabs)/sell');
          } else {
            shake();
            setError("PINs don't match. Try again.");
            setConfirmPin('');
            setPin('');
            setMode('setup');
          }
        }, 200);
      }
    } else {
      // enter mode
      const entered = pin + digit;
      setPin(entered);
      if (entered.length === 4) {
        setTimeout(async () => {
          const stored = await getPIN();
          const hashedEntered = await hashPIN(entered);
          if (hashedEntered === stored) {
            router.replace('/(tabs)/sell');
          } else {
            shake();
            setError('Incorrect PIN. Try again.');
            setPin('');
          }
        }, 200);
      }
    }
  };

  const handleDelete = () => {
    setError('');
    if (mode === 'setup-confirm') {
      setConfirmPin(p => p.slice(0, -1));
    } else {
      setPin(p => p.slice(0, -1));
    }
  };

  const currentLength = mode === 'setup-confirm' ? confirmPin.length : pin.length;

  const titleText = mode === 'setup'
    ? 'Set Your PIN'
    : mode === 'setup-confirm'
    ? 'Confirm Your PIN'
    : 'Enter PIN';

  const subtitleText = mode === 'setup'
    ? 'Choose a 4-digit PIN for this store'
    : mode === 'setup-confirm'
    ? 'Enter the same PIN again'
    : 'Enter your PIN to continue';

  if (mode === 'loading') return null;

  const KEYS = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','del'],
  ];

  return (
    <View style={styles.container}>
      {/* Logo area */}
      <View style={styles.logoArea}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>TD</Text>
        </View>
        <Text style={styles.appName}>TindaDone</Text>
      </View>

      {/* Title */}
      <Text style={styles.title}>{titleText}</Text>
      <Text style={styles.subtitle}>{subtitleText}</Text>

      {/* Dots */}
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {[0,1,2,3].map(i => (
          <View
            key={i}
            style={[styles.dot, i < currentLength && styles.dotFilled]}
          />
        ))}
      </Animated.View>

      {/* Error */}
      {error ? <Text style={styles.errorText}>{error}</Text> : <Text style={styles.errorText} />}

      {/* Keypad */}
      <View style={styles.keypad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k, ki) => {
              if (k === '') return <View key={ki} style={styles.keyPlaceholder} />;
              if (k === 'del') return (
                <TouchableOpacity key={ki} style={styles.keyBtn} onPress={handleDelete}>
                  <Delete size={22} color={Theme.colors.onSurfaceVariant} />
                </TouchableOpacity>
              );
              return (
                <TouchableOpacity key={ki} style={styles.keyBtn} onPress={() => handleDigit(k)}>
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoText: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: Theme.typography.headlineBlack,
  },
  appName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
  },
  title: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Theme.typography.body,
    fontSize: 14,
    color: Theme.colors.onSurfaceVariant,
    marginBottom: 36,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Theme.colors.primary,
  },
  errorText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.tertiary,
    marginBottom: 24,
    height: 18,
  },
  keypad: {
    gap: 12,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 24,
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyPlaceholder: {
    width: 72,
    height: 72,
  },
  keyText: {
    fontSize: 26,
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.onSurface,
  },
});
