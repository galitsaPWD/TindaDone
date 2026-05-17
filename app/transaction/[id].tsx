import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ReceiptText, Banknote, CreditCard, Clock, Calendar, Wallet, Trash2, RefreshCcw, CheckCircle2, X, AlertTriangle, Info } from 'lucide-react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { getTransactions, voidTransaction, updateTransactionPayment, getUtangRecords } from '../../lib/storage';
import { Transaction, UtangRecord } from '../../lib/types';
import { Theme } from '../../constants/Theme';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [transaction, setTransaction] = useState<Transaction | null>(null);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    showCancel?: boolean;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ title: '', message: '', type: 'info' });

  const showAlert = (
    title: string, 
    message: string, 
    type: 'success' | 'error' | 'warning' | 'info' = 'info', 
    onConfirm?: () => void,
    showCancel?: boolean,
    confirmText?: string
  ) => {
    setAlertConfig({ title, message, type, onConfirm, showCancel, confirmText });
    setAlertVisible(true);
  };

  useEffect(() => {
    loadTransaction();
  }, [id]);

  const loadTransaction = async () => {
    if (typeof id !== 'string') return;
    
    // Check regular transactions
    const data = await getTransactions();
    const found = data.find(t => t.id === id);
    if (found) {
      setTransaction(found);
      return;
    }

    // Check Utang records
    const utang = await getUtangRecords();
    const foundUtang = utang.find(r => r.id === id);
    if (foundUtang) {
      setTransaction({
        id: foundUtang.id,
        items: foundUtang.items || [],
        total: foundUtang.amount,
        paymentType: 'utang' as any,
        timestamp: foundUtang.createdAt
      });
    }
  };

  const handleVoid = async () => {
    if (!transaction) return;
    try {
      await voidTransaction(transaction.id);
      showAlert('Voided', 'Transaction cancelled and stock restored.', 'success', () => router.back());
    } catch (error) {
      showAlert('Error', 'Failed to void transaction', 'error');
    }
  };

  const handleSwitchPayment = async () => {
    if (!transaction) return;
    const newType = transaction.paymentType === 'cash' ? 'gcash' : 'cash';
    try {
      await updateTransactionPayment(transaction.id, newType);
      setTransaction({ ...transaction, paymentType: newType });
      showAlert('Updated', `Payment method changed to ${newType.toUpperCase()}`, 'success');
    } catch (error) {
      showAlert('Error', 'Failed to update payment', 'error');
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
          <ChevronLeft size={24} color={Theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Detail</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.receiptCard}>
          <View style={styles.receiptHeader}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>
                {transaction.items.length === 0 ? 'DEBT SETTLEMENT' : 'COMPLETED'}
              </Text>
            </View>
            <Text style={styles.receiptTotal}>₱{transaction.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            <Text style={styles.receiptId}>Order Ref: {transaction.id.slice(-8).toUpperCase()}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Transaction Info</Text>
            <View style={styles.infoGrid}>
            <View style={styles.infoRow}>
                <View style={[
                  styles.infoIcon, 
                  { backgroundColor: transaction.paymentType === 'cash' ? '#defbe6' : (transaction.paymentType === 'gcash' ? '#e0e7ff' : '#fff7ed') }
                ]}>
                  {transaction.paymentType === 'cash' ? (
                    <Banknote size={16} color="#0a643b" />
                  ) : (
                    transaction.paymentType === 'gcash' ? <CreditCard size={16} color="#1e40af" /> : <AlertTriangle size={16} color="#c2410c" />
                  )}
                </View>
                <Text style={styles.infoText}>
                  {transaction.paymentType === 'cash' ? 'Cash Payment' : (transaction.paymentType === 'gcash' ? 'GCash Payment' : 'Debt (Utang)')}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Calendar size={16} color={Theme.colors.primary} />
                </View>
                <Text style={styles.infoText}>{new Date(transaction.timestamp).toLocaleDateString()} • {new Date(transaction.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {transaction.items.length === 0 ? 'Settlement Breakdown' : 'Line Items'}
            </Text>
            {transaction.items.length === 0 ? (
              <View style={styles.settlementCard}>
                <View style={styles.settlementIcon}>
                  <Wallet size={20} color={Theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>Debt Repayment</Text>
                  <Text style={styles.itemMeta}>Total amount received</Text>
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

          <View style={styles.summarySection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Grand Total</Text>
              <Text style={styles.totalValue}>₱{transaction.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
            </View>
          </View>
        </View>

        {(transaction.paymentType as any) !== 'utang' && (
          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              style={styles.switchBtn}
              onPress={() => showAlert(
                'Switch Payment?',
                `Change this to ${transaction.paymentType === 'cash' ? 'GCash' : 'Cash'}?`,
                'info',
                handleSwitchPayment,
                true,
                'Switch Now'
              )}
            >
              <RefreshCcw size={20} color={Theme.colors.primary} />
              <Text style={styles.switchBtnText}>Change Payment Method</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.voidBtn}
              onPress={() => showAlert(
                'Void Transaction?',
                'This will delete the sale and return items to stock. This cannot be undone.',
                'warning',
                handleVoid,
                true,
                'Void Sale'
              )}
            >
              <Trash2 size={20} color={Theme.colors.tertiary} />
              <Text style={styles.voidBtnText}>Void Transaction</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneButtonText}>Dismiss</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Custom Alert Modal */}
      <Modal visible={alertVisible} transparent animationType="fade" onRequestClose={() => setAlertVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <Animated.View entering={ZoomIn} style={styles.alertCard}>
            {alertConfig.type === 'success' && <CheckCircle2 size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            {alertConfig.type === 'error' && <X size={48} color={Theme.colors.tertiary} style={styles.alertIcon} />}
            {alertConfig.type === 'warning' && <AlertTriangle size={48} color="#f59e0b" style={styles.alertIcon} />}
            {alertConfig.type === 'info' && <Info size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            
            <View style={alertConfig.showCancel ? styles.alertActionRow : { width: '100%' }}>
              {alertConfig.showCancel && (
                <TouchableOpacity 
                  style={[styles.alertBtn, styles.alertCancelBtn]} 
                  onPress={() => setAlertVisible(false)}
                >
                  <Text style={styles.alertCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={[
                  styles.alertBtn, 
                  alertConfig.showCancel && { flex: 1 },
                  { backgroundColor: alertConfig.type === 'error' || alertConfig.type === 'warning' ? Theme.colors.tertiary : Theme.colors.primary }
                ]} 
                onPress={() => {
                  setAlertVisible(false);
                  if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
              >
                <Text style={styles.alertBtnText}>{alertConfig.confirmText || 'Got it'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  receiptCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 40,
    padding: 32,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 10,
  },
  receiptHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statusBadge: {
    backgroundColor: Theme.colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusBadgeText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  receiptTotal: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 48,
    color: Theme.colors.onSurface,
    letterSpacing: -2,
  },
  receiptId: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 13,
    color: Theme.colors.outline,
    letterSpacing: 0.5,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.outlineVariant,
    marginVertical: 24,
    opacity: 0.5,
  },
  section: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  infoGrid: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settlementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Theme.colors.primaryContainer + '20',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '20',
  },
  settlementIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Theme.colors.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  itemMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.outline,
    marginTop: 1,
  },
  itemSubtotal: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  summarySection: {
    marginTop: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  totalValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 32,
    color: Theme.colors.primary,
    letterSpacing: -1,
  },
  doneButton: {
    marginTop: 12,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    height: 64,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButtonText: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.outline,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  actionsContainer: {
    marginTop: 24,
    gap: 12,
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerLow,
    gap: 10,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  switchBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 16,
  },
  voidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: Theme.colors.tertiary + '10',
    gap: 10,
    borderWidth: 1,
    borderColor: Theme.colors.tertiary + '20',
  },
  voidBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.tertiary,
    fontSize: 16,
  },
  // Custom Alert Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertCard: {
    width: '100%',
    backgroundColor: Theme.colors.surface,
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  alertIcon: {
    marginBottom: 20,
  },
  alertTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    marginBottom: 8,
    textAlign: 'center',
  },
  alertMessage: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  alertActionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  alertBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  alertCancelBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.outline,
    fontSize: 16,
  },
  alertBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
  },
});
