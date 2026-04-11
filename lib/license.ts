import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const ACTIVATION_STORAGE_KEY = '@tindadone/activated';
const DEVICE_ID_STORAGE_KEY = '@tindadone/device_id';
const TRIAL_START_KEY = '@tindadone/trial_start';
const TRIAL_DAYS = 3;

// ⚠️ THIS MUST MATCH THE SECRET IN YOUR ADMIN PAGE — KEEP IT PRIVATE
const ADMIN_SECRET = 'tindadone_admin_2025_zyxw';

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
  const hash = await sha256(deviceCode + ADMIN_SECRET);
  const clean = hash.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const expected = `${clean.slice(0, 4)}${clean.slice(4, 8)}${clean.slice(8, 12)}`;
  
  // Clean the entered key as well
  const enteredClean = enteredKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  return enteredClean === expected;
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

/** Permanently marks this device as activated */
export async function saveActivation(): Promise<void> {
  await AsyncStorage.setItem(ACTIVATION_STORAGE_KEY, 'true');
}

/** Starts the trial precisely now */
export async function startTrial(): Promise<void> {
  const now = Date.now().toString();
  await AsyncStorage.setItem(TRIAL_START_KEY, now);
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


