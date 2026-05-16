import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const ACTIVATION_STORAGE_KEY = '@tindadone/activated';
const DEVICE_ID_STORAGE_KEY = '@tindadone/device_id';
const TRIAL_START_KEY = '@tindadone/trial_start';
const TRIAL_DAYS = 3;

// 🔗 Vercel Admin API URL
// CRITICAL: Update this to your deployed Vercel URL
const PRODUCTION_URL = 'https://tinda-done-admin.vercel.app';
const API_BASE_URL = PRODUCTION_URL; 

const ADMIN_SECRET = 'tindadone_admin_2026_xyz';

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function getOrCreateDeviceId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) return stored;

    let rawId = '';
    if (Platform.OS === 'android') {
      rawId = Application.getAndroidId() ?? '';
    } else if (Platform.OS === 'ios') {
      rawId = (await Application.getIosIdForVendorAsync()) ?? '';
    }

    if (!rawId) {
      // Web / fallback: generate once and persist
      rawId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }

    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, rawId);
    return rawId;
  } catch {
    return `err_${Date.now()}`;
  }
}

/** Returns the unique device code to show the customer, e.g. "TD-A7K2-9XF3" */
export async function generateDeviceCode(): Promise<string> {
  const id = await getOrCreateDeviceId();
  const hash = await sha256(id + 'tindadone_salt_v1');
  const clean = hash.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `TD-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/** Validates the activation key the customer typed against the device code */
export async function validateActivationKey(deviceCode: string, enteredKey: string): Promise<boolean> {
  // Strip "TD" prefix if present to ensure consistent hashing
  let cleanVal = deviceCode.toUpperCase().replace(/^TD-/, '').replace(/^TD/, '');
  cleanVal = cleanVal.replace(/[^A-Z0-9]/g, '');

  const salt = "TindaDone-Premium-2026";
  let hash = 0;
  const combined = cleanVal + salt;
  
  for (let i = 0; i < combined.length; i++) {
    hash = ((hash << 5) - hash) + combined.charCodeAt(i);
    hash |= 0;
  }
  
  const part1 = Math.abs(hash).toString(36).toUpperCase().substring(0, 4);
  const expectedKey = `TD-${part1}-${cleanVal.substring(0, 4)}`;

  // Clean the entered key as well
  const enteredClean = enteredKey.trim().toUpperCase();

  console.log('[License] Validating:', { 
    deviceCode, 
    cleanVal, 
    expected: expectedKey, 
    entered: enteredClean 
  });

  return enteredClean === expectedKey;
}

/** Returns true if this device has already been activated */
export async function isActivated(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ACTIVATION_STORAGE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/** Permanently marks this device as activated and reports it to the cloud */
export async function saveActivation(licenseKey?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVATION_STORAGE_KEY, 'true');
    
    if (licenseKey) {
      const deviceId = await generateDeviceCode();
      // Silently report to server
      fetch(`${API_BASE_URL}/api/activate-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey, deviceId })
      }).catch(e => console.log('Activation report skipped', e));
    }
  } catch (e) {
    console.error('Failed to save activation:', e);
  }
}

/** Silently checks if the admin revoked this device's license */
export async function syncActivationStatus(): Promise<void> {
  try {
    const isAct = await isActivated();
    if (!isAct) return;

    const deviceId = await generateDeviceCode();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE_URL}/api/check-status?deviceId=${deviceId}`, {
      signal: controller.signal
    }).catch(() => null);
    
    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json();
      if (data && data.revoked) {
        // KILL SWITCH TRIGGERED: Remove local activation
        await AsyncStorage.removeItem(ACTIVATION_STORAGE_KEY);
      }
    }
  } catch (e) {
    // Fail silently, preserve offline functionality
  }
}

export async function startTrial(storeName?: string): Promise<{ success: boolean; error?: string }> {
  const deviceId = await getOrCreateDeviceId();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // 1. Attempt Handshake with server
    console.log('🔗 Connecting to Admin Server:', `${API_BASE_URL}/api/trial-start`);
    const res = await fetch(`${API_BASE_URL}/api/trial-start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, storeName: storeName || 'Unknown store' }),
      signal: controller.signal
    }).catch(err => {
      console.warn('❌ Network Error during Trial Start:', err);
      return null;
    });

    if (res && res.ok) {
      console.log('✅ Server Registration Success!');
    } else {
      console.warn('⚠️ Server rejected registration or is offline:', res?.status);
    }

    clearTimeout(timeoutId);

    // 2. Local Fallback (Always succeed locally to avoid blocking)
    const startTime = Date.now().toString();
    await AsyncStorage.setItem(TRIAL_START_KEY, startTime);
    return { success: true };

  } catch (e) {
    // Absolute fallback
    await AsyncStorage.setItem(TRIAL_START_KEY, Date.now().toString());
    return { success: true };
  }
}

/** Silently syncs local trial with server record if possible */
export async function syncTrialWithServer(): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_BASE_URL}/api/trial-status?deviceId=${deviceId}`, {
      signal: controller.signal
    }).catch(() => null);
    
    clearTimeout(timeoutId);

    if (res && res.ok) {
      const data = await res.json();
      if (data && data.exists && data.startTime) {
        await AsyncStorage.setItem(TRIAL_START_KEY, data.startTime);
      }
    }
  } catch (e) {
    // Fail silently
  }
}

export type TrialStatus = {
  active: boolean;
  daysLeft: number;
  hoursLeft: number;
  expired: boolean;
  notStarted: boolean;
};

/** Checks the trial status and returns time remaining */
export async function getTrialStatus(): Promise<TrialStatus> {
  try {
    const startStr = await AsyncStorage.getItem(TRIAL_START_KEY);
    if (!startStr) {
      return { active: false, daysLeft: TRIAL_DAYS, hoursLeft: TRIAL_DAYS * 24, expired: false, notStarted: true };
    }

    const startTime = parseInt(startStr, 10);
    const now = Date.now();
    const elapsedMs = now - startTime;
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    const totalTrialHours = TRIAL_DAYS * 24;

    if (elapsedHours >= totalTrialHours) {
      return { active: false, daysLeft: 0, hoursLeft: 0, expired: true, notStarted: false };
    }

    const hoursRemaining = totalTrialHours - elapsedHours;

    return {
      active: true,
      daysLeft: Math.ceil(hoursRemaining / 24),
      hoursLeft: Math.ceil(hoursRemaining),
      expired: false,
      notStarted: false
    };
  } catch {
    return { active: false, daysLeft: 0, hoursLeft: 0, expired: false, notStarted: true };
  }
}
