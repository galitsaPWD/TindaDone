import { Transaction, Product, TransactionItem } from './types';

export const calculateTodaysSales = (transactions: Transaction[]) => {
  return transactions.reduce((sum, t) => sum + t.total, 0);
};

export const calculateTodaysProfit = (transactions: Transaction[], products: Product[]) => {
  let profit = 0;
  transactions.forEach(t => {
    t.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId);
      const cost = item.costPriceAtSale ?? p?.costPrice;
      if (cost !== undefined) {
        profit += (item.priceAtSale - cost) * item.qty;
      }
    });
  });
  return profit;
};

export const getTopSoldProducts = (transactions: Transaction[], limit: number = 5) => {
  const counts: Record<string, { name: string, count: number }> = {};
  
  transactions.forEach(t => {
    t.items.forEach(item => {
      if (!counts[item.productId]) {
        counts[item.productId] = { name: item.productName, count: 0 };
      }
      counts[item.productId].count += item.qty;
    });
  });

  return Object.entries(counts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, limit)
    .map(([id, data]) => ({ id, ...data }));
};

export const getPaymentBreakdown = (transactions: Transaction[]) => {
  const cash = transactions
    .filter(t => t.paymentType === 'cash')
    .reduce((sum, t) => sum + t.total, 0);
  const gcash = transactions
    .filter(t => t.paymentType === 'gcash')
    .reduce((sum, t) => sum + t.total, 0);
  
  return { cash, gcash };
};
