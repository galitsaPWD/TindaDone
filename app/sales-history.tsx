import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, ReceiptText, Smartphone, ShoppingBasket, Calendar, Filter, Wallet, AlertTriangle } from 'lucide-react-native';
import { getTransactions, getUtangRecords, getProducts, DEFAULT_CATEGORIES } from '../lib/storage';
import { useSettings } from '../context/SettingsContext';
import { Transaction, UtangRecord, Product } from '../lib/types';
import { Theme } from '../constants/Theme';
import { ScrollView } from 'react-native';

type FilterType = 'all' | 'today' | 'yesterday';

export default function SalesHistoryScreen() {
  const router = useRouter();
  const { businessSettings } = useSettings();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const categories = businessSettings.customCategories || DEFAULT_CATEGORIES;
  const categoriesWithAll = ['All', ...categories];
  const [activeCategory, setActiveCategory] = useState('All');
  const [totalSales, setTotalSales] = useState(0);

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [filter, allTransactions, activeCategory]);

  const loadTransactions = async () => {
    const products = await getProducts();
    setAllProducts(products);

    const data = await getTransactions();
    const utangData = await getUtangRecords();
    
    // Convert UtangRecords to Transaction-like objects for the list
    const combinedUtang = utangData.map(r => ({
      id: r.id,
      items: r.items || [],
      total: r.amount,
      paymentType: 'utang' as any,
      timestamp: r.createdAt,
      customerName: r.customerName
    }));

    const combined = [...data, ...combinedUtang].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    setAllTransactions(combined);
  };

  const applyFilter = () => {
    let filtered = allTransactions;
    const now = new Date();
    
    if (filter === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      filtered = allTransactions.filter(t => t.timestamp.startsWith(todayStr));
    } else if (filter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(now.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      filtered = allTransactions.filter(t => t.timestamp.startsWith(yesterdayStr));
    }

    // Apply Category filter
    if (activeCategory !== 'All') {
      filtered = filtered.filter(t => 
        t.items.some(item => {
          const product = allProducts.find(p => p.id === item.productId);
          const itemCat = product?.category || 'Others';
          if (itemCat === activeCategory) return true;
          return itemCat.toLowerCase().startsWith('other') && activeCategory.toLowerCase().startsWith('other');
        })
      );
    }

    setFilteredTransactions(filtered);
    setTotalSales(filtered.reduce((sum, t) => sum + t.total, 0));
  };

  const getTransactionIcon = (t: any) => {
    if (t.paymentType === 'utang') return <AlertTriangle size={24} color={Theme.colors.tertiary} />;
    if (t.items.length === 0) return <Wallet size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.length > 2) return <ShoppingBasket size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.some((i: any) => i.productName.toLowerCase().includes('load'))) return <Smartphone size={24} color={Theme.colors.onSecondaryContainer} />;
    return <ReceiptText size={24} color={Theme.colors.onSecondaryContainer} />;
  };

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TouchableOpacity 
      style={styles.transactionItem}
      onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: item.id } })}
    >
      <View style={styles.transactionIcon}>
        {getTransactionIcon(item)}
      </View>
      <View style={styles.transactionInfo}>
        <Text style={styles.transactionTitle} numberOfLines={1}>
          {(item as any).paymentType === 'utang'
            ? `Utang: ${(item as any).customerName}`
            : (item.items.length === 0
              ? 'Debt Settlement'
              : (item.items.length > 1 ? `${item.items[0].productName} +${item.items.length - 1}` : item.items[0].productName))
          }
        </Text>
        <Text style={styles.transactionMeta}>
          {new Date(item.timestamp).toLocaleDateString()} • {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.paymentType.toUpperCase()}
        </Text>
      </View>
      <View style={styles.amountContainer}>
        <Text style={styles.transactionAmount}>₱{item.total.toFixed(0)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={Theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sales History</Text>
      </View>

      <View style={styles.filterBar}>
        {['all', 'today', 'yesterday'].map((f) => (
          <TouchableOpacity 
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f as FilterType)}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All Time' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.categoriesSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContent}>
          {categoriesWithAll.map(c => (
            <TouchableOpacity 
              key={c}
              style={[styles.catFilterChip, activeCategory === c && styles.catFilterChipActive]}
              onPress={() => setActiveCategory(c)}
            >
              <Text style={[styles.catFilterChipText, activeCategory === c && styles.catFilterChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Period Revenue</Text>
          <Text style={styles.summaryValue}>₱{totalSales.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryPill}>
          <ReceiptText size={14} color={Theme.colors.onPrimaryContainer} />
          <Text style={styles.summaryPillText}>{filteredTransactions.length} Sales</Text>
        </View>
      </View>

      <FlatList
        data={filteredTransactions}
        keyExtractor={item => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Calendar size={40} color={Theme.colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Transactions</Text>
            <Text style={styles.emptyText}>No sales recorded for this period.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  summaryBar: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 32,
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  summaryItem: {
  },
  summaryLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.outline,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.primary,
    letterSpacing: -1,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  summaryPillText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.onPrimaryContainer,
  },
  listContent: {
    paddingBottom: 40,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  transactionIcon: {
    width: 48,
    height: 48,
    backgroundColor: Theme.colors.secondaryContainer,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  transactionMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Theme.colors.primaryContainer + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  categoriesSection: {
    backgroundColor: Theme.colors.surface,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.surfaceVariant,
  },
  categoriesContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  catFilterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceVariant + '40',
    marginRight: 8,
    borderWidth: 1,
    borderColor: Theme.colors.surfaceVariant,
  },
  catFilterChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  catFilterChipText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  catFilterChipTextActive: {
    color: Theme.colors.onPrimary,
    fontFamily: Theme.typography.bodyBold,
  },
});
