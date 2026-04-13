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
  syncTrialWithServer,
  TrialStatus 
} from '../lib/license';
import { getBusinessSettings, saveBusinessSettings } from '../lib/storage';
import { useSettings } from '../context/SettingsContext';
import { Theme } from '../constants/Theme';
import { CheckCircle2, Lock, Play, Clock, AlertTriangle } from 'lucide-react-native';

export default function ActivateScreen() {
  const router = useRouter();
  const { updateSettings } = useSettings();
  const [deviceCode, setDeviceCode] = useState('');
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [storeName, setStoreName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingSuccessType, setPendingSuccessType] = useState<'trial' | 'key' | null>(null);
  
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const toastAnim = useRef(new Animated.Value(40)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const init = async () => {
      const code = await generateDeviceCode();
      const settings = await getBusinessSettings();
      if (settings.storeName) setStoreName(settings.storeName);

      setLoading(true);
      await syncTrialWithServer();
      
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

  const showNotification = (msg: string) => {
    setError(msg);
    setShowToast(true);
    
    Animated.parallel([
      Animated.spring(toastAnim, { toValue: 0, useNativeDriver: true, tension: 50 }),
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastAnim, { toValue: 20, duration: 300, useNativeDriver: true }),
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setShowToast(false));
    }, 3000);
  };

  const persistStoreName = async () => {
    try {
      const settings = await getBusinessSettings();
      await updateSettings({ ...settings, storeName: storeName.trim() });
    } catch (e) {
      console.error('Failed to save store name to settings:', e);
    }
  };

  const handleActivate = async () => {
    if (activationKey.trim().length < 8) {
      showNotification('Please enter a valid activation key.');
      shake();
      return;
    }
    
    // For Activation: Validate KEY first, then ask NAME
    setVerifying(true);
    const valid = await validateActivationKey(deviceCode, activationKey);
    if (valid) {
      setPendingSuccessType('key');
      setShowNameModal(true);
      setVerifying(false);
    } else {
      shake();
      showNotification('Invalid key. Contact your seller.');
      setVerifying(false);
    }
  };

  const handleStartTrial = () => {
    // For Trial: Ask NAME first, then Handshake
    setPendingSuccessType('trial');
    setShowNameModal(true);
  };

  const handleFinalizeOnboarding = async () => {
    if (!storeName.trim()) {
      Vibration.vibrate();
      shake();
      return;
    }
    
    setVerifying(true);
    try {
      if (pendingSuccessType === 'trial') {
        // TRIAL Handshake with the REAL name now
        const result = await startTrial(storeName.trim());
        if (!result.success) {
          showNotification(result.error || 'Connection error. Try Again.');
          setVerifying(false);
          return;
        }
      } else {
        // ACTIVATION Persistence
        await saveActivation();
      }

      // Save locally to Settings
      await persistStoreName();
      
      setShowNameModal(false);
      router.replace('/(tabs)/sell');
    } catch (e) {
      showNotification('Error saving registration.');
    }
    setVerifying(false);
  };

  const formatKeyInput = (text: string) => {
    setActivationKey(text.toUpperCase().replace(/[^A-Z0-9-]/g, ''));
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

        <View style={styles.spacer} />

        {/* Device Code Card */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>YOUR DEVICE CODE</Text>
          <Text style={styles.codeValue}>{deviceCode}</Text>
          <Text style={styles.codeHint}>Send this code to your seller to get your key</Text>
        </View>

        {/* Key Input Section */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>ENTER ACTIVATION KEY</Text>
          <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
            <TextInput
              style={[styles.keyInput, error === 'Please enter a valid activation key.' ? styles.keyInputError : null]}
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

        <View style={styles.divider} />

        {/* Trial Options */}
        {trial?.notStarted && (
          <TouchableOpacity 
            style={[styles.trialBtn, verifying && { opacity: 0.7 }]} 
            onPress={handleStartTrial}
            disabled={verifying}
          >
            {verifying ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator color={Theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.trialBtnText}>Handshaking...</Text>
              </View>
            ) : (
              <>
                <Play size={18} color={Theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={styles.trialBtnText}>Start 3-Day Free Trial</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {trial?.active && (
          <TouchableOpacity 
            style={styles.trialBtn} 
            onPress={() => router.replace('/(tabs)/sell')}
          >
            <Text style={styles.trialBtnText}>Continue to Dashboard</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footer}>
          Permanent activation keeps all your data safe forever.
        </Text>
      </ScrollView>

      {/* 🏙️ Registration Modal */}
      {showNameModal && (
        <View style={styles.modalOverlay}>
          <Animated.View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <CheckCircle2 size={32} color={Theme.colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Success!</Text>
            <Text style={styles.modalSub}>
              {pendingSuccessType === 'key' ? 'License activated' : 'Trial started'} successfully. 
              One last thing—what is the name of your Store?
            </Text>

            <View style={[styles.inputSection, { marginBottom: 20 }]}>
              <Text style={styles.inputLabel}>BUSINESS / STORE NAME</Text>
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                <TextInput
                  style={[styles.keyInput, { fontSize: 16, textAlign: 'center', letterSpacing: 0, paddingHorizontal: 20 }]}
                  placeholder="e.g. Aling Nena's Store"
                  placeholderTextColor={Theme.colors.outlineVariant}
                  value={storeName}
                  onChangeText={setStoreName}
                  autoFocus
                />
              </Animated.View>
            </View>

            <TouchableOpacity 
              style={styles.activateBtn} 
              onPress={handleFinalizeOnboarding}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.activateBtnText}>Enter My Store</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* Floating Toast Notification */}
      {showToast && (
        <Animated.View style={[
          styles.toastContainer, 
          { 
            opacity: toastOpacity,
            transform: [{ translateY: toastAnim }]
          }
        ]}>
          <AlertTriangle size={18} color="#FFF" style={{ marginRight: 10 }} />
          <Text style={styles.toastText}>{error}</Text>
        </Animated.View>
      )}
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
    padding: 24,
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
  spacer: {
    height: 10,
  },
  divider: {
    height: 1,
    width: '80%',
    backgroundColor: Theme.colors.surfaceVariant,
    marginVertical: 24,
    opacity: 0.5,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: '#BA1A1A',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: '#FFF',
    flex: 1,
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
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
  },
  modalIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: Theme.colors.secondaryContainer,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: '#000',
    marginBottom: 8,
  },
  modalSub: {
    fontFamily: Theme.typography.body,
    fontSize: 14,
    color: Theme.colors.outline,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
});
