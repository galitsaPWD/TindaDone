import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { Product, Transaction, TransactionItem, UtangRecord, RestockLog, BusinessSettings } from './types';

const PRODUCTS_KEY = '@tindadone/products';
const TRANSACTIONS_KEY = '@tindadone/transactions';
const UTANG_KEY = '@tindadone/utang';
const RESTOCKS_KEY = '@tindadone/restocks';
const SETTINGS_KEY = '@tindadone/settings';
const WELCOME_KEY = '@tindadone/welcome_seen';
const PIN_KEY = '@tindadone/pin';

// Partitioning keys
const TRANSACTION_MONTHS_KEY = '@tindadone/transaction_months'; // Index of months YYYY-MM
const TRANS_PARTITION_PREFIX = '@tindadone/transactions/'; // @tindadone/transactions/YYYY-MM


export async function hashPIN(pin: string): Promise<string> {
  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    pin
  );
}

export async function getPIN(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(PIN_KEY);
    if (!stored) return null;

    // MIGRATION: If stored PIN is a 4-digit numeric string, it's plaintext.
    // Hashed PINs (SHA-256) are 64 characters long hex strings.
    if (stored.length === 4 && /^\d+$/.test(stored)) {
      const hashed = await hashPIN(stored);
      await AsyncStorage.setItem(PIN_KEY, hashed); // Migrate to hashed version
      return hashed;
    }
    
    return stored;
  } catch (e) {
    console.error('Error fetching PIN:', e);
    return null;
  }
}

export async function savePIN(pin: string): Promise<void> {
  try {
    const hashed = await hashPIN(pin);
    await AsyncStorage.setItem(PIN_KEY, hashed);
  } catch (e) {
    console.error('Error saving PIN:', e);
  }
}
export async function clearPIN(): Promise<void> {
  try { await AsyncStorage.removeItem(PIN_KEY); } catch {}
}

// --- Partitioning Helpers ---

/** Get YYYY-MM from a date or ISO string */
export function getYearMonth(date: string | Date | number): string {
  const d = new Date(date);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${d.getFullYear()}-${month}`;
}

/** Get the AsyncStorage key for a specific month */
export function getPartitionKey(monthKey: string): string {
  return `${TRANS_PARTITION_PREFIX}${monthKey}`;
}

/** Register a month in the master index if not already present */
async function registerMonthInIndex(monthKey: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(TRANSACTION_MONTHS_KEY);
    let index: string[] = raw ? JSON.parse(raw) : [];
    if (!index.includes(monthKey)) {
      index.push(monthKey);
      // Sort descending (latest months first)
      index.sort((a, b) => b.localeCompare(a));
      await AsyncStorage.setItem(TRANSACTION_MONTHS_KEY, JSON.stringify(index));
    }
  } catch (e) {
    console.error('Error updating month index:', e);
  }
}

async function getMonthIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TRANSACTION_MONTHS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const CATEGORIES = ['Food', 'Drinks', 'Personal Care', 'Household', 'Others'];

const PRESET_PRODUCTS: Array<{name: string, price: number, category: string}> = [];

export async function getProducts(): Promise<Product[]> {
  try {
    const raw = await AsyncStorage.getItem(PRODUCTS_KEY);
    if (!raw) {
      return await seedPresetProducts();
    }
    const items: Product[] = JSON.parse(raw);
    return items.filter(p => !p.id.startsWith('preset-'));
  } catch (e) {
    console.error('Error fetching products:', e);
    return [];
  }
}

async function seedPresetProducts(): Promise<Product[]> {
  const products: Product[] = PRESET_PRODUCTS.map((p, index) => ({
    id: `preset-${index}`,
    name: p.name,
    price: p.price,
    category: p.category,
    stock: 0,
    lowStockThreshold: 5,
    unit: 'pc',
    createdAt: new Date().toISOString(),
  }));
  await saveProducts(products);
  return products;
}

export async function saveProducts(products: Product[]): Promise<void> {
  try {
    const data = JSON.stringify(products);
    await AsyncStorage.setItem(PRODUCTS_KEY, data);
  } catch (e) {
    console.error('CRITICAL: Error saving products:', e);
    throw new Error('Failed to save to storage. The image might be too large or disk is full.');
  }
}

export async function addProduct(product: Product): Promise<void> {
  try {
    const products = await getProducts();
    products.unshift(product);
    await saveProducts(products);
  } catch (e) {
    console.error('Error adding product:', e);
    throw e;
  }
}

export async function updateProduct(updated: Product): Promise<void> {
  const products = await getProducts();
  const index = products.findIndex((p) => p.id === updated.id);
  if (index !== -1) {
    products[index] = updated;
    await saveProducts(products);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const products = await getProducts();
  const filtered = products.filter((p) => p.id !== id);
  await saveProducts(filtered);
}

/** One-time migration from monolithic transactions to partitioned storage */
async function migrateLegacyTransactions(): Promise<void> {
  try {
    const legacy = await AsyncStorage.getItem(TRANSACTIONS_KEY);
    if (!legacy) return;

    const all: Transaction[] = JSON.parse(legacy);
    if (all.length === 0) {
      await AsyncStorage.removeItem(TRANSACTIONS_KEY);
      return;
    }

    // Group by month
    const groups: Record<string, Transaction[]> = {};
    for (const t of all) {
      const mk = getYearMonth(t.timestamp);
      if (!groups[mk]) groups[mk] = [];
      groups[mk].push(t);
    }

    // Save each partition and update index
    for (const [mk, trans] of Object.entries(groups)) {
      const key = getPartitionKey(mk);
      // Multi-save logic (Legacy was already newest-first)
      await AsyncStorage.setItem(key, JSON.stringify(trans));
      await registerMonthInIndex(mk);
    }

    // Retire legacy key
    await AsyncStorage.removeItem(TRANSACTIONS_KEY);
    console.info(`MIGRATION: Success. Moved ${all.length} transactions to partitioned storage.`);
  } catch (e) {
    console.error('Migration failed:', e);
  }
}

// Transactions
export async function getTransactions(): Promise<Transaction[]> {
  try {
    // 1. One-time Migration check as we transition
    await migrateLegacyTransactions();

    // 2. Load from partitions via index
    const index = await getMonthIndex();
    if (index.length === 0) return [];

    let allTransactions: Transaction[] = [];
    // Currently loads everything to maintain all-time stats, but partitioned keys match.
    // Optimization: In a real POS, we'd limit this to 'Recent' or 'Current Year' only.
    for (const monthKey of index) {
      const raw = await AsyncStorage.getItem(getPartitionKey(monthKey));
      if (raw) {
        const part: Transaction[] = JSON.parse(raw);
        allTransactions = allTransactions.concat(part);
      }
    }
    return allTransactions;
  } catch (e) {
    console.error('Error fetching partitioned transactions:', e);
    return [];
  }
}

export async function saveTransaction(transaction: Transaction): Promise<void> {
  try {
    const products = await getProducts();
    
    // VALIDATION: Check if stock is sufficient for all items
    for (const item of transaction.items) {
      const p = products.find(p => p.id === item.productId);
      if (p) {
        const deduction = item.isPack ? item.qty * (p.piecesPerPack || 1) : item.qty;
        if (p.stock < deduction) {
          throw new Error(`Insufficient stock for ${p.name}. Only ${p.stock} units remaining.`);
        }
      }
    }

    const monthKey = getYearMonth(transaction.timestamp);
    const partitionKey = getPartitionKey(monthKey);
    
    const raw = await AsyncStorage.getItem(partitionKey);
    const transactions: Transaction[] = raw ? JSON.parse(raw) : [];
    
    transactions.unshift(transaction);
    await AsyncStorage.setItem(partitionKey, JSON.stringify(transactions));
    await registerMonthInIndex(monthKey);
    
    // Decrement stock
    transaction.items.forEach(item => {
      const p = products.find(p => p.id === item.productId);
      if (p) {
        const deduction = item.isPack ? item.qty * (p.piecesPerPack || 1) : item.qty;
        p.stock -= deduction;
      }
    });
    await saveProducts(products);
  } catch (e) {
    console.error('Error saving transaction:', e);
    throw e;
  }
}

export async function getTodaysTransactions(): Promise<Transaction[]> {
  try {
    const mk = getYearMonth(new Date());
    const raw = await AsyncStorage.getItem(getPartitionKey(mk));
    const transactions: Transaction[] = raw ? JSON.parse(raw) : [];
    const today = new Date().toISOString().split('T')[0];
    return transactions.filter((t) => t.timestamp.startsWith(today));
  } catch {
    return [];
  }
}

// Utang (Credit)
export async function getUtangRecords(): Promise<UtangRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(UTANG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error fetching utang:', e);
    return [];
  }
}

/** Merges two lists of transaction items, consolidating quantities for matching product IDs */
function mergeTransactionItems(existing?: TransactionItem[], incoming?: TransactionItem[]): TransactionItem[] | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;

  const merged = [...existing];
  incoming.forEach(inItem => {
    const foundIdx = merged.findIndex(exItem => exItem.productId === inItem.productId);
    if (foundIdx !== -1) {
      merged[foundIdx] = {
        ...merged[foundIdx],
        qty: merged[foundIdx].qty + inItem.qty
      };
    } else {
      merged.push(inItem);
    }
  });
  return merged;
}

export async function addUtangRecord(record: UtangRecord): Promise<void> {
  const products = await getProducts();
  
  // VALIDATION: Check if stock is sufficient for all items
  if (record.items) {
    for (const item of record.items) {
      const p = products.find(p => p.id === item.productId);
      if (p && p.stock < item.qty) {
        throw new Error(`Insufficient stock for ${p.name}. Only ${p.stock} remaining.`);
      }
    }
  }

  const raw = await AsyncStorage.getItem(UTANG_KEY);
  const records: UtangRecord[] = raw ? JSON.parse(raw) : [];
  
  // SMART MERGE: Check for existing unpaid record with same name
  const existingIdx = records.findIndex(r => 
    !r.isPaid && 
    r.customerName.trim().toLowerCase() === record.customerName.trim().toLowerCase()
  );

  if (existingIdx !== -1) {
    // MERGE logic
    const existing = records[existingIdx];
    existing.amount += record.amount;
    existing.items = mergeTransactionItems(existing.items, record.items);
    if (record.note) {
      existing.note = existing.note ? `${existing.note} | ${record.note}` : record.note;
    }
  } else {
    // NEW record logic
    records.unshift(record);
  }

  await AsyncStorage.setItem(UTANG_KEY, JSON.stringify(records));

  // Decrement stock for the INCOMING items
  if (record.items) {
    record.items.forEach(item => {
      const p = products.find(p => p.id === item.productId);
      if (p) {
        p.stock -= item.qty;
      }
    });
  }
  await saveProducts(products);
}

export async function updateUtangRecord(updated: UtangRecord): Promise<void> {
  try {
    const records = await getUtangRecords();
    const index = records.findIndex((r) => r.id === updated.id);
    if (index === -1) return;

    const oldRecord = records[index];
    const products = await getProducts();

    // 1. REVERSE inventory for old items
    if (oldRecord.items) {
      oldRecord.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId);
        if (p) {
          p.stock += item.qty; // Reverse decrement
        }
      });
    }

    // 2. APPLY inventory for new items
    if (updated.items) {
      updated.items.forEach(item => {
        const p = products.find(prod => prod.id === item.productId);
        if (p) {
          p.stock -= item.qty; // Apply new decrement
        }
      });
    }

    records[index] = updated;
    await saveProducts(products);
    await AsyncStorage.setItem(UTANG_KEY, JSON.stringify(records));
  } catch (e) {
    console.error('Error updating utang:', e);
    throw e;
  }
}

export async function markUtangPaid(id: string, paymentType: 'cash' | 'gcash'): Promise<void> {
  try {
    const records = await getUtangRecords();
    const index = records.findIndex((r) => r.id === id);
    if (index !== -1) {
      const record = records[index];
      record.isPaid = true;
      record.paymentType = paymentType;
      record.paidAt = new Date().toISOString();
      
      // Save the updated utang record
      await AsyncStorage.setItem(UTANG_KEY, JSON.stringify(records));

      // Create a matching Transaction record for daily stats (Revenue Event)
      // We pass an empty item list to avoid double-decrementing stock.
      const transaction: Transaction = {
        id: `pay-${record.id}-${Date.now()}`,
        items: [],
        total: record.amount,
        paymentType: paymentType,
        timestamp: new Date().toISOString()
      };
      
      await saveTransaction(transaction);
    }
  } catch (e) {
    console.error('Error marking utang paid:', e);
    throw e;
  }
}

export async function deleteUtangRecord(id: string): Promise<void> {
  try {
    const records = await getUtangRecords();
    const record = records.find(r => r.id === id);
    if (!record) return;

    // Optional: Should deleting a debt return stock to products? 
    // Usually no, as the items were actually taken/used. Keeping as is.
    const filtered = records.filter((r) => r.id !== id);
    await AsyncStorage.setItem(UTANG_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Error deleting utang:', e);
  }
}

// Restocks
export async function getRestockLogs(): Promise<RestockLog[]> {
  try {
    const raw = await AsyncStorage.getItem(RESTOCKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error fetching restocks:', e);
    return [];
  }
}

export async function addRestockLog(log: RestockLog): Promise<void> {
  const logs = await getRestockLogs();
  logs.unshift(log);
  await AsyncStorage.setItem(RESTOCKS_KEY, JSON.stringify(logs));
  
  // Update product stock
  const products = await getProducts();
  const p = products.find((prod) => prod.id === log.productId);
  if (p) {
    p.stock += log.qtyAdded;
    await saveProducts(products);
  }
}

// Settings
export async function getBusinessSettings(): Promise<BusinessSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Error fetching settings:', e);
    return {};
  }
}

export async function saveBusinessSettings(settings: BusinessSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Welcome
export async function hasSeenWelcome(): Promise<boolean> {
  const res = await AsyncStorage.getItem(WELCOME_KEY);
  return res === 'true';
}

export async function markWelcomeAsSeen(): Promise<void> {
  await AsyncStorage.setItem(WELCOME_KEY, 'true');
}

// Backup & Export
export async function exportData(): Promise<void> {
  try {
    const keys = [PRODUCTS_KEY, TRANSACTIONS_KEY, UTANG_KEY, RESTOCKS_KEY, SETTINGS_KEY];
    const pairs = await AsyncStorage.multiGet(keys);
    const backup = Object.fromEntries(pairs);
    
    const dataStr = JSON.stringify(backup);

    if (Platform.OS === 'web') {
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tindadone_backup.json';
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const uri = (FileSystem.documentDirectory || '') + 'tindadone_backup.json';
    await FileSystem.writeAsStringAsync(uri, dataStr);
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
    }
  } catch (e) {
    console.error('Error exporting data:', e);
  }
}
