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
import { ChevronLeft, ReceiptText, Smartphone, ShoppingBasket, Calendar, Filter, Wallet } from 'lucide-react-native';
import { getTransactions } from '../lib/storage';
import { Transaction } from '../lib/types';
import { Theme } from '../constants/Theme';

type FilterType = 'all' | 'today' | 'yesterday';

export default function SalesHistoryScreen() {
  const router = useRouter();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [totalSales, setTotalSales] = useState(0);

  useEffect(() => {
    loadTransactions();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [filter, allTransactions]);

  const loadTransactions = async () => {
    const data = await getTransactions();
    setAllTransactions(data);
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

    setFilteredTransactions(filtered);
    setTotalSales(filtered.reduce((sum, t) => sum + t.total, 0));
  };

  const getTransactionIcon = (t: Transaction) => {
    if (t.items.length === 0) return <Wallet size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.length > 2) return <ShoppingBasket size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.some(i => i.productName.toLowerCase().includes('load'))) return <Smartphone size={24} color={Theme.colors.onSecondaryContainer} />;
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
          {item.items.length === 0
            ? 'Debt Settlement'
            : (item.items.length > 1 ? `${item.items[0].productName} +${item.items.length - 1}` : item.items[0].productName)
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
          <ChevronLeft size={28} color={Theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sales History</Text>
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity 
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterChipText, filter === 'all' && styles.filterChipTextActive]}>All Time</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterChip, filter === 'today' && styles.filterChipActive]}
          onPress={() => setFilter('today')}
        >
          <Text style={[styles.filterChipText, filter === 'today' && styles.filterChipTextActive]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.filterChip, filter === 'yesterday' && styles.filterChipActive]}
          onPress={() => setFilter('yesterday')}
        >
          <Text style={[styles.filterChipText, filter === 'yesterday' && styles.filterChipTextActive]}>Yesterday</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>TOTAL SALES</Text>
          <Text style={styles.summaryValue}>₱{totalSales.toLocaleString()}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>COUNT</Text>
          <Text style={styles.summaryValue}>{filteredTransactions.length}</Text>
        </View>
      </View>

      <FlatList
        data={filteredTransactions}
        keyExtractor={item => item.id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Calendar size={48} color={Theme.colors.outlineVariant} />
            <Text style={styles.emptyText}>No sales in this period.</Text>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerHighest,
  },
  filterChipActive: {
    backgroundColor: Theme.colors.primary,
  },
  filterChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.primary,
  },
  filterChipTextActive: {
    color: '#FFF',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainerLow,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 24,
    padding: 20,
    gap: 24,
  },
  summaryItem: {
    flex: 1,
  },
  summaryLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 20,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
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
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  transactionMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 100,
    gap: 12,
  },
  emptyText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 16,
  },
});
