import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ReceiptText, Banknote, CreditCard, Clock, Calendar, Wallet } from 'lucide-react-native';
import { getTransactions } from '../../lib/storage';
import { Transaction } from '../../lib/types';
import { Theme } from '../../constants/Theme';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    loadTransaction();
  }, [id]);

  const loadTransaction = async () => {
    const data = await getTransactions();
    const found = data.find(t => t.id === id);
    if (found) {
      setTransaction(found);
    }
  };

  if (!transaction) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={28} color={Theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.receiptCard}>
          <View style={styles.receiptHeader}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {transaction.items.length === 0 ? 'DEBT SETTLEMENT' : 'COMPLETED'}
              </Text>
            </View>
            <Text style={styles.receiptTotal}>₱{transaction.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <Text style={styles.receiptId}>ORDER #{transaction.id.slice(-6).toUpperCase()}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
            <View style={styles.paymentRow}>
              {transaction.paymentType === 'cash' ? (
                <>
                  <Banknote size={20} color={Theme.colors.primary} />
                  <Text style={styles.paymentText}>Cash Payment</Text>
                </>
              ) : (
                <>
                  <CreditCard size={20} color="#2563eb" />
                  <Text style={styles.paymentText}>GCash Payment</Text>
                </>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DATE & TIME</Text>
            <View style={styles.timeRow}>
              <Calendar size={18} color={Theme.colors.outline} />
              <Text style={styles.timeText}>{new Date(transaction.timestamp).toLocaleDateString()}</Text>
              <View style={styles.dot} />
              <Clock size={18} color={Theme.colors.outline} />
              <Text style={styles.timeText}>{new Date(transaction.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {transaction.items.length === 0 ? 'SETTLEMENT SUMMARY' : 'ITEMS PURCHASED'}
            </Text>
            {transaction.items.length === 0 ? (
              <View style={styles.settlementRow}>
                <Wallet size={20} color={Theme.colors.primary} />
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>Debt Payment Received</Text>
                  <Text style={styles.itemMeta}>via {transaction.paymentType.toUpperCase()}</Text>
                </View>
                <Text style={styles.itemSubtotal}>₱{transaction.total.toFixed(2)}</Text>
              </View>
            ) : (
              transaction.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>{item.productName}</Text>
                    <Text style={styles.itemMeta}>₱{item.priceAtSale.toFixed(2)} × {item.qty}</Text>
                  </View>
                  <Text style={styles.itemSubtotal}>₱{(item.priceAtSale * item.qty).toFixed(2)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Grand Total</Text>
            <Text style={styles.totalValue}>₱{transaction.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.reprintButton} onPress={() => router.back()}>
          <Text style={styles.reprintButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  receiptCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 32,
    padding: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statusBadge: {
    backgroundColor: Theme.colors.primaryContainer + '40',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  statusBadgeText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 12,
    letterSpacing: 1,
  },
  receiptTotal: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 40,
    color: Theme.colors.onSurface,
    marginBottom: 4,
  },
  receiptId: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 14,
    color: Theme.colors.outline,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.outlineVariant + '40',
    marginVertical: 20,
    borderStyle: 'dashed',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    letterSpacing: 1,
    marginBottom: 12,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentText: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.colors.outlineVariant,
    marginHorizontal: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  settlementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Theme.colors.primaryContainer + '30',
    padding: 16,
    borderRadius: 16,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  itemMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  itemSubtotal: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  totalLabel: {
    fontFamily: Theme.typography.headline,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  totalValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  reprintButton: {
    marginTop: 24,
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  reprintButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 18,
  },
});
