import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { 
  generateDeviceCode, 
  validateActivationKey, 
  saveActivation, 
  getTrialStatus, 
  startTrial,
  TrialStatus 
} from '../lib/license';
import { Theme } from '../constants/Theme';
import { CheckCircle2, Lock, Play, Clock, AlertTriangle } from 'lucide-react-native';

export default function ActivateScreen() {
  const router = useRouter();
  const [deviceCode, setDeviceCode] = useState('');
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const init = async () => {
      const code = await generateDeviceCode();
      const status = await getTrialStatus();
      setDeviceCode(code);
      setTrial(status);
      setLoading(false);
    };
    init();
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

  const handleActivate = async () => {
    if (activationKey.trim().length < 8) {
      setError('Please enter a valid activation key.');
      shake();
      return;
    }
    setVerifying(true);
    setError('');
    const valid = await validateActivationKey(deviceCode, activationKey);
    if (valid) {
      await saveActivation();
      router.replace('/(tabs)/sell');
    } else {
      shake();
      setError('Invalid key. Contact your seller.');
      setVerifying(false);
    }
  };

  const handleStartTrial = async () => {
    await startTrial();
    router.replace('/(tabs)/sell');
  };

  const formatKeyInput = (text: string) => {
    setActivationKey(text.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
    setError('');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Lock size={32} color="#FFF" />
          </View>
          <Text style={styles.appName}>TindaDone</Text>
        </View>

        <Text style={styles.title}>Activation Required</Text>
        
        {/* Trial Status Display */}
        {trial?.active && (
          <View style={[styles.statusBanner, { backgroundColor: Theme.colors.secondaryContainer }]}>
            <Clock size={16} color={Theme.colors.secondary} style={{ marginRight: 8 }} />
            <Text style={[styles.statusText, { color: Theme.colors.onSecondaryContainer }]}>
              Trial Active: {trial.daysLeft} days remaining
            </Text>
          </View>
        )}

        {trial?.expired && (
          <View style={[styles.statusBanner, { backgroundColor: '#FFDAD6' }]}>
            <AlertTriangle size={16} color="#BA1A1A" style={{ marginRight: 8 }} />
            <Text style={[styles.statusText, { color: '#410002' }]}>
              Free Trial Expired! Please Activate.
            </Text>
          </View>
        )}

        {/* Device Code Card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR DEVICE CODE</Text>
          <Text style={styles.codeValue}>{deviceCode}</Text>
          <Text style={styles.codeHint}>Send this code to your seller to get your key</Text>
        </View>

        {/* Key Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>ENTER ACTIVATION KEY</Text>
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TextInput
              style={[styles.keyInput, error ? styles.keyInputError : null]}
              placeholder="XXXX-XXXX-XXXX"
              placeholderTextColor={Theme.colors.outlineVariant}
              value={activationKey}
              onChangeText={formatKeyInput}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              maxLength={15}
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
              textContentType="none"
            />
          </Animated.View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <TouchableOpacity
          style={[styles.activateBtn, verifying && { opacity: 0.7 }]}
          onPress={handleActivate}
          disabled={verifying}
        >
          {verifying ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <CheckCircle2 size={20} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.activateBtnText}>Activate App</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Trial Options */}
        {trial?.notStarted && (
          <TouchableOpacity style={styles.trialBtn} onPress={handleStartTrial}>
            <Play size={18} color={Theme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.trialBtnText}>Start 3-Day Free Trial</Text>
          </TouchableOpacity>
        )}

        {trial?.active && (
          <TouchableOpacity style={styles.trialBtn} onPress={() => router.replace('/(tabs)/sell')}>
            <Text style={styles.trialBtnText}>Continue to Dashboard</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footer}>
          Permanent activation keeps all your data safe forever.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    alignItems: 'center',
    padding: 28,
    paddingTop: 60,
    paddingBottom: 120,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  appName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  title: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    marginBottom: 16,
    textAlign: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  statusText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
  },
  codeCard: {
    width: '100%',
    backgroundColor: Theme.colors.primaryContainer,
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  codeLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.onPrimaryContainer,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  codeValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.primary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  codeHint: {
    fontFamily: Theme.typography.body,
    fontSize: 11,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  inputSection: {
    width: '100%',
    marginBottom: 16,
  },
  inputLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.primary,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  keyInput: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    textAlign: 'center',
    letterSpacing: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  keyInputError: {
    borderColor: '#BA1A1A',
  },
  errorText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: '#BA1A1A',
    marginTop: 6,
    marginLeft: 4,
  },
  activateBtn: {
    width: '100%',
    backgroundColor: Theme.colors.primary,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  activateBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 16,
    color: '#FFF',
  },
  trialBtn: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    marginBottom: 20,
  },
  trialBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 16,
    color: Theme.colors.primary,
  },
  footer: {
    fontFamily: Theme.typography.body,
    fontSize: 11,
    color: Theme.colors.outline,
    textAlign: 'center',
    marginTop: 10,
  },
});
