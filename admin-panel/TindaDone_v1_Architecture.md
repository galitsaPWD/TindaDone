# TindaDone v1 – System Architecture & Implementation

## Overview
TindaDone is a mobile POS and inventory app for small Filipino businesses (sari-sari stores, hardware, carinderia, clothing). It runs fully offline on Android. No login, no backend, no internet required for core features.

---

## Problem
Small store owners lose track of stock manually. They have no daily sales record. Existing POS apps are too complex, require internet, or charge monthly fees they can't afford.

---

## Target User
Small business owner in Visayas (first target: Pulupandan, Negros Occidental). Low tech literacy. Uses Android. Primarily transacts in cash and GCash. Does not use Google Sheets or any accounting tool.

---

## Tech Stack
- React Native + Expo SDK 51
- Expo Router (file-based navigation, 3 tabs)
- AsyncStorage (all data stored locally on device)
- TypeScript
- No backend, no auth, no internet dependency for MVP

---

## Data Models

```ts
type Product = {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  unit?: string;
  stock: number;
  lowStockThreshold: number;
  category?: string;
  photoUri?: string;
  createdAt: string;
};

type TransactionItem = {
  productId: string;
  productName: string;
  qty: number;
  priceAtSale: number;
  costPriceAtSale?: number;
};

type Transaction = {
  id: string;
  items: TransactionItem[];
  total: number;
  paymentType: 'cash' | 'gcash';
  timestamp: string;
};

type UtangRecord = {
  id: string;
  customerName: string;
  amount: number;
  note?: string;
  isPaid: boolean;
  createdAt: string;
  paidAt?: string;
};

type RestockLog = {
  id: string;
  productId: string;
  productName: string;
  qtyAdded: number;
  costPerUnit?: number;
  totalCost?: number;
  timestamp: string;
};
```

All data is stored in AsyncStorage as JSON arrays under these keys:
- `@tindadone/products`
- `@tindadone/transactions_{YYYY-MM}` (Monthly Sharded)
- `@tindadone/utang`
- `@tindadone/restocks`

---

## App Structure

```
app/
  (tabs)/
    sell.tsx          // Tab 1 – make a sale (default)
    products.tsx      // Tab 2 – manage inventory
    dashboard.tsx     // Tab 3 – daily summary
    utang.tsx         // Tab 4 – credit/utang tracker
  product/
    [id].tsx          // Product detail + edit screen
  transaction/
    [id].tsx          // Transaction detail screen
  sales-history.tsx   // Full sales history with date filter
  restock/
    [id].tsx          // Log restock for a product
  _layout.tsx         // Tab bar layout
lib/
  storage.ts          // AsyncStorage read/write helpers
  types.ts            // Shared TypeScript types
  calculations.ts     // Profit, daily totals, closeout helpers
```

---

## Tab 1: Products

**Purpose:** View, add, edit all products. See stock levels.

**Features:**
- List all products with name, price, current stock
- Search bar filters by product name
- Low stock badge (red) when stock <= lowStockThreshold
- Tap product to edit (name, price, stock, threshold)
- "Add Product" button opens a form
- Preset list of 30 common sari-sari items loaded on first launch (name + suggested price, stock defaults to 0)
- Optional cost price field per product (what she paid the supplier)
- If cost price is set, show profit per item = price - costPrice
- Optional product photo per item
  - If no photo: colored placeholder square with first letter of product name in white
  - If photo set: show as thumbnail on product card in both Products list and Sell grid
  - When adding/editing, offer: Take Photo or Choose from Gallery
  - Store photo as local URI in AsyncStorage via expo-image-picker
- Optional unit field per product (e.g. "pc", "dozen", "pack", "sachet") shown next to price
- Category field with preset options: Beverages, Canned Goods, Snacks, Personal Care, Household, Others
- Tap product → Product Detail screen (name, price, cost, stock, photo, sales count for that item)
- Delete product → confirmation modal before removing

**Preset items to include:**
Coke 8oz, Coke Mismo, Royal 8oz, Sprite 8oz, C2 Apple, C2 Green Tea, Bear Brand 33g, Milo Sachet, Nescafe 3in1, Lucky Me Pancit Canton Original, Lucky Me Pancit Canton Chilimansi, Lucky Me Beef Mami, Nissin Cup Noodles, Argentina Corned Beef 150g, Ligo Sardines, Century Tuna Flakes, Pusit 55g, Tide Powder 66g, Ariel Powder 66g, Head and Shoulders Sachet, Palmolive Shampoo Sachet, Safeguard Bar 60g, Colgate 25ml, Marlboro Red, Marlboro Lights, Winston Red, Mentos Roll, Chippy, Piattos, Magic Flakes

---

## Tab 2: Sell

**Purpose:** Build an order and record a sale.

**Features:**
- Top 5 most sold products pinned at the top of the screen as quick-tap shortcuts
- Search bar to find products quickly
- Tap product to add to current order
- Order list shows each item with qty controls (+ / -)
- Running total displayed at bottom
- "Cash" and "GCash" buttons to confirm sale
- On confirm:
  - Save transaction to AsyncStorage
  - Decrement stock for each product sold
  - Clear the current order
  - Show brief success feedback (toast or quick animation)
- If a product's stock would go below 0, show a warning but still allow the sale

---

## Tab 3: Dashboard

**Purpose:** See how the day is going at a glance.

**Features:**
- Today's total sales (sum of all transactions today)
- Today's estimated profit (sum of price - costPrice × qty, only for products with costPrice set)
- Number of transactions today
- Cash vs GCash breakdown
- Low stock alerts list (products at or below threshold)
- Recent transactions list (latest first) showing items, time, payment type, total
- Tap a transaction to see its full detail
- Daily closeout button — generates a summary card (total sales, profit, transaction count, cash vs GCash) that can be screenshotted or shared
- Backup to Google Drive — one tap exports all data as JSON to Google Drive via expo-file-system + expo-sharing

---

## Tab 4: Utang (Credit Tracker)

**Purpose:** Track customers who take goods on credit (pautang).

**Features:**
- List of all utang records with customer name, amount owed, date
- Add new utang — customer name, amount, optional note
- Mark as paid — moves to paid history
- Total outstanding utang shown at top
- Paid records kept for reference, shown in a separate section
- No interest calculation for MVP — just track the amount

---

## Additional Screens

**Sales History (from Dashboard)**
- Full list of all transactions, not just today
- Filter by: Today, Yesterday, pick a date
- Shows total and transaction count for selected period

**Transaction Detail**
- All items in the transaction with qty and price
- Payment type, timestamp, transaction ID
- Total amount

**Restock Log (from Product Detail)**
- Log qty added to stock + cost paid to supplier
- Updates product stock automatically
- History of all restocks for that product

---

## Storage Helpers to Add

```ts
getUtangRecords(): Promise<UtangRecord[]>
addUtangRecord(record: UtangRecord): Promise<void>
markUtangPaid(id: string): Promise<void>
deleteUtangRecord(id: string): Promise<void>

getRestockLogs(): Promise<RestockLog[]>
addRestockLog(log: RestockLog): Promise<void>
```

---

## MVP Scope (Week 1)

In scope:
- All 4 tabs (Sell, Products, Dashboard, Utang)
- Fully offline with AsyncStorage
- Preset product list on first launch
- Low stock alerts
- Cash and GCash payment toggle
- Product photos via expo-image-picker
- Cost price + profit calculation
- Utang tracker (add, mark paid, view total)
- Restock logging from product detail
- Sales history screen
- Transaction detail screen
- Daily closeout summary (shareable screenshot)
- Google Drive backup via expo-sharing
- Works on Android (Expo Go + APK build)

Out of scope for MVP:
- Barcode scanner
- Cloud sync / Supabase
- User login / multi-device
- Weekly/monthly chart reports
- Multiple users or staff roles
- Printer / receipt output
- Loyalty points
- Generate purchase orders

---

## UI Notes
- Bottom tab bar with 4 tabs: Sell, Products, Dashboard, Utang
- Tab icons: point of sale, inventory, bar chart, receipt long
- Sell tab is the default home screen
- Color scheme: clean white, warm green accent, red/coral for low stock and utang alerts
- Font sizes readable on cheap Android phones (minimum 14px body)
- No heavy animations — keep it fast on low-end devices
- Empty states for every list
- Loading states not needed — AsyncStorage is fast enough to feel instant

---

## First Launch Experience
- Check if products key exists in AsyncStorage
- If empty, load the preset sari-sari product list with stock = 0 and suggested prices
- Show a simple welcome screen: "Welcome to TindaDone. Your products are ready — just set your stock counts."

---
1. `lib/types.ts` — all TypeScript types
2. `lib/storage.ts` — all AsyncStorage helpers
3. `lib/calculations.ts` — profit, daily totals, closeout summary helpers
4. `app/(tabs)/_layout.tsx` — 4-tab bar setup
5. `app/(tabs)/sell.tsx` — sell tab with top products shortcut
6. `app/(tabs)/products.tsx` — products tab with search, add, edit
7. `app/product/[id].tsx` — product detail, edit, delete, restock log
8. `app/(tabs)/dashboard.tsx` — dashboard with profit, closeout, backup
9. `app/transaction/[id].tsx` — transaction detail screen
10. `app/sales-history.tsx` — full sales history with date filter
11. `app/(tabs)/utang.tsx` — utang tracker tab
12. Polish: empty states, first launch flow, preset products, error handling
13. EAS build → APK for Android testing

---

## Post-Launch: Production Polish & Implementation Summary (Final)

TindaDone transitioned from a Minimum Viable Product (MVP) to a fully production-ready Android application. The following outlines the major system and UI architectures implemented to ensure production stability and a premium user experience without external dependencies.

### 1. Performance & State Optimization
- **Settings Modal Stutter Elimination:** Moved heavily bound global states (e.g., switches toggling sound, vibration, stock warnings) into localized component state (`tempSettings`). State changes are now exclusively batched to the global `SettingsContext` via a discrete "Save Settings" commit pattern. This completely resolved React render-loop stuttering on low-end Android devices.
- **Global Context Architecture:** Solidified the global `SettingsContext`, ensuring that enabling/disabling app-wide mechanics (such as UI sound effects) instantly propagates to every child component without requiring a restart.

### 2. High-Performance Interactive Analytics (Stats Tab)
### License & Security System
- **Hybrid Trial Guard:** Prevents trial resets via reinstallation using a server-side handshake.
- **Vercel Cloud Sync:** Stores Device IDs and trial start dates in Vercel KV (Upstash Redis).
- **Offline Resilience:** Trial verification happens during initial start and background syncs; standard POS operations remain 100% offline.
- **Server-Side Key Generation:** Admin Panel secrets are hidden in Vercel Serverless Functions (`/api`), preventing client-side logic extraction.

## 🛠 Tech Stack Frameworks
- **Time-Series Charting:** Built a robust data visualization system natively using pure React Native Flexbox components to completely avoid heavy, crash-prone external graphing libraries. 
- **Drill-Down Filtering:** The micro bar chart allows the user to slice data effortlessly. Tapping a specific time range (e.g., a specific weekday, week of the month, or month of the year) visually isolates that column and recalculates *all* statistics strictly for the transactions bound by that time slice.
- **Dynamic Toggle states:** Mapped "Daily" (7 bars), "Monthly" (4 weekbars), and "Yearly" (6 monthbars) aggregations, equipped with an elegant toggle button to collapse the graph for a cleaner dashboard display. 

### 3. User Interface & Theming Fixes
- **Scanner UI Integrity:** Updated the barcode scanner HUD to be fully aware of `Theme.colors.surface`, guaranteeing the "X" (Close button) remains fully opaque and visible regardless of device dark mode preferences. Addressed Android notch and status bar overlapping by passing strict safe-area insets padding.
- **Typography Alignment:** Disabled Android's stubborn `includeFontPadding` default to correctly center the text vertically on the critical "Pay" checkout buttons.
- **Empty States:** Implemented graceful placeholder displays when searching the `Sell` tab results in zero matches or inventory is completely empty, heavily improving application flow intuition.

### 4. Hardware Integrations (Barcode Engine)
- **Expo Camera Pipeline:** Migrated entirely away from the unstable `expo-barcode-scanner` (deprecated in SDK 51) to `expo-camera`'s `CameraView`. This guarantees native Android stability.
- **Dual-Mode Barcode Architecture:** 
  - **Strict Lookup (Sell Tab):** Scans are strictly cross-referenced against the local SQLite database. Found items instantly drop into the cart with a haptic response; unknown parameters are gracefully ignored to prevent cashier interruption.
  - **Loose Registration (Products Tab):** Scans are leveraged inside input forms to seamlessly map physical packaging barcodes to new or existing database entries.

### 5. Data Scaling & Architecture
- **Chronological Storage Sharding:** Identified that a single monolithic `AsyncStorage` key (`@tindadone/transactions`) would hit Android's local 2MB threshold and crash under heavy shop usage. Redesigned the storage engine to partition files via Monthly shards using the explicit schema: `@tindadone/transactions_YYYY-MM` (e.g. `@tindadone/transactions_2026-04`). This format exponentially scales the application's lifespan for offline persistence and must be adhered to when building external query logic or sales history visualizations.

### 6. Deployment Pipeline & Branding
- **Android Asset Map:** Finalized and injected production Android assets (Adaptive Icons and Splash Screens) utilizing Lucide cryptography mapping to ensure the app maintains its premium aesthetic post-install.
- **Decoupled from Expo Go:** Solidified the `eas.json` pipeline configuration capable of executing native Android compilation via `eas build -p android`. Validated that the `preview` profile generates stable local `.apk` packages, while the default `production` pipeline generates Google Play Store compliant `.aab` artifacts.
