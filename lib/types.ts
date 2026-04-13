export type Product = {
  id: string;
  name: string;
  price: number;
  packPrice?: number;
  piecesPerPack?: number;
  costPrice?: number;
  unit?: string;
  stock: number;
  lowStockThreshold: number;
  category?: string;
  barcode?: string;
  photoUri?: string;
  createdAt: string;
};

export type TransactionItem = {
  productId: string;
  productName: string;
  qty: number;
  isPack?: boolean;
  priceAtSale: number;
  costPriceAtSale?: number;
};

export type Transaction = {
  id: string;
  items: TransactionItem[];
  total: number;
  paymentType: 'cash' | 'gcash';
  timestamp: string;
};

export type UtangRecord = {
  id: string;
  customerName: string;
  amount: number;
  items?: TransactionItem[];
  note?: string;
  isPaid: boolean;
  paymentType?: 'cash' | 'gcash';
  createdAt: string;
  paidAt?: string;
};

export type RestockLog = {
  id: string;
  productId: string;
  productName: string;
  qtyAdded: number;
  costPerUnit?: number;
  totalCost?: number;
  timestamp: string;
  priceAtRestock?: number;
  packPriceAtRestock?: number;
  piecesPerPackAtRestock?: number;
  isBulk?: boolean;
};

export type BusinessSettings = {
  gcashQrUri?: string;
  storeName?: string;
  scannerBeep?: boolean;
  scannerVibrate?: boolean;
  enableBulkMode?: boolean;
};
