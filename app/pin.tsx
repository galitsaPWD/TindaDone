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
      {/* Brand Header */}
      <View style={styles.brandArea}>
        <View style={styles.logoPill}>
          <Text style={styles.logoText}>TD</Text>
        </View>
        <Text style={styles.appName}>TindaDone</Text>
      </View>

      {/* Messaging */}
      <View style={styles.textGroup}>
        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>
      </View>

      {/* PIN Indicators */}
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {[0,1,2,3].map(i => (
          <View
            key={i}
            style={[styles.dot, i < currentLength && styles.dotActive]}
          >
            {i < currentLength && <View style={styles.dotInner} />}
          </View>
        ))}
      </Animated.View>

      {/* Error Feedback */}
      <View style={styles.errorBox}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      {/* Keypad Layout */}
      <View style={styles.keypad}>
        {KEYS.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((k, ki) => {
              if (k === '') return <View key={ki} style={styles.keyPlaceholder} />;
              if (k === 'del') return (
                <TouchableOpacity 
                  key={ki} 
                  style={[styles.keyBtn, styles.deleteBtn]} 
                  onPress={handleDelete}
                  activeOpacity={0.6}
                >
                  <Delete size={24} color={Theme.colors.onSurface} strokeWidth={2} />
                </TouchableOpacity>
              );
              return (
                <TouchableOpacity 
                  key={ki} 
                  style={styles.keyBtn} 
                  onPress={() => handleDigit(k)}
                  activeOpacity={0.7}
                >
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
    paddingTop: '15%',
    paddingBottom: 40,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoPill: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 8,
  },
  logoText: {
    color: '#FFF',
    fontSize: 24,
    fontFamily: Theme.typography.headlineBlack,
  },
  appName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    letterSpacing: 0.5,
  },
  textGroup: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.onSurface,
    marginBottom: 8,
    letterSpacing: -1,
  },
  subtitle: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 14,
    color: Theme.colors.outline,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Theme.colors.outlineVariant,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotActive: {
    borderColor: Theme.colors.primary,
  },
  dotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Theme.colors.primary,
  },
  errorBox: {
    height: 24,
    marginBottom: 32,
  },
  errorText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.tertiary,
  },
  keypad: {
    gap: 20,
  },
  keyRow: {
    flexDirection: 'row',
    gap: 32,
  },
  keyBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  deleteBtn: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  keyPlaceholder: {
    width: 72,
    height: 72,
  },
  keyText: {
    fontSize: 28,
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.onSurface,
  },
});
