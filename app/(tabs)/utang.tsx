import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  Alert,
  Image,
  ScrollView,
  } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Plus, 
  User, 
  CheckCircle2, 
  Trash2, 
  X, 
  Contact,
  CreditCard,
  Search,
  AlertTriangle,
  Info
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { getUtangRecords, addUtangRecord, updateUtangRecord, markUtangPaid, deleteUtangRecord, getProducts } from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { UtangRecord, Product, TransactionItem } from '../../lib/types';
import { Theme } from '../../constants/Theme';
import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export default function UtangScreen() {
  const [records, setRecords] = useState<UtangRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<UtangRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  
  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  
  // New Record State
  const [customerName, setCustomerName] = useState('');
  const [selectedItems, setSelectedItems] = useState<TransactionItem[]>([]);
  const [manualAmount, setManualAmount] = useState('');
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UtangRecord | null>(null);

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
  }>({ title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', onConfirm?: () => void) => {
    setAlertConfig({ title, message, type, onConfirm });
    setAlertVisible(true);
  };

  // Payment Selection
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [payingRecord, setPayingRecord] = useState<UtangRecord | null>(null);
  const [paymentStep, setPaymentStep] = useState<'choose' | 'confirm_gcash'>('choose');
  const { businessSettings, updateSettings } = useSettings();

  // Stats
  const [totalOwed, setTotalOwed] = useState(0);

  useFocusEffect(
    useCallback(() => {
      loadRecords();
      loadProducts();
    }, [])
  );

  useEffect(() => {
    if (!search) {
      setFilteredRecords(records);
    } else {
      setFilteredRecords(records.filter(r => 
        r.customerName.toLowerCase().includes(search.toLowerCase()) ||
        r.note?.toLowerCase().includes(search.toLowerCase())
      ));
    }
  }, [search, records]);

  const loadRecords = async () => {
    const data = await getUtangRecords();
    setRecords(data);
    const owed = data.filter(r => !r.isPaid).reduce((sum, r) => sum + r.amount, 0);
    setTotalOwed(owed);
  };

  const loadProducts = async () => {
    const data = await getProducts();
    setProducts(data);
  };

  const calculateTotal = () => {
    const itemsTotal = selectedItems.reduce((sum, item) => sum + (item.priceAtSale * item.qty), 0);
    return itemsTotal || parseFloat(manualAmount || '0');
  };

  const handleSelectItem = (product: Product) => {
    setSelectedItems(prev => {
      const existing = prev.find(i => i.productId === product.id);
      if (existing) {
        return prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        qty: 1,
        priceAtSale: product.price,
        costPriceAtSale: product.costPrice
      }];
    });
  };

  const removeSelectedItem = (productId: string) => {
    setSelectedItems(prev => prev.filter(i => i.productId !== productId));
  };

  const handleSaveMonth = async () => {
    const finalAmount = calculateTotal();
    const hasItems = selectedItems.length > 0;
    const hasManual = manualAmount.length > 0;

    if (!customerName || (!hasItems && !hasManual)) {
      setShowErrors(true);
      showAlert('Missing Info', 'Please enter customer name and picked items or a manual amount.', 'warning');
      return;
    }

    if (finalAmount <= 0) {
      showAlert('Error', 'Amount must be greater than 0', 'error');
      return;
    }

    if (editingRecord) {
      await updateUtangRecord({
        ...editingRecord,
        customerName,
        amount: finalAmount,
        items: selectedItems.length > 0 ? selectedItems : undefined,
        note,
      });
    } else {
      const newRecord: UtangRecord = {
        id: Date.now().toString(),
        customerName,
        amount: finalAmount,
        items: selectedItems.length > 0 ? selectedItems : undefined,
        note,
        isPaid: false,
        createdAt: new Date().toISOString(),
      };
      await addUtangRecord(newRecord);
    }
    
    setModalVisible(false);
    resetForm();
    loadRecords();
  };

  const handleEdit = (record: UtangRecord) => {
    if (record.isPaid) return; // Don't edit paid ones
    setEditingRecord(record);
    setCustomerName(record.customerName);
    setSelectedItems(record.items || []);
    setManualAmount(record.items ? '' : record.amount.toString());
    setNote(record.note || '');
    setModalVisible(true);
  };

  const handleMarkPaidPress = (record: UtangRecord) => {
    setPayingRecord(record);
    setPaymentStep('choose');
    setPaymentModalVisible(true);
  };

  const confirmPayment = async (type: 'cash' | 'gcash') => {
    if (!payingRecord) return;
    
    if (type === 'gcash') {
      if (!businessSettings.gcashQrUri) {
        showAlert('No QR Code', 'Please upload your GCash QR code in the Settings first.', 'warning');
        return;
      }
      if (paymentStep === 'choose') {
        setPaymentStep('confirm_gcash');
        return;
      }
    }

    await markUtangPaid(payingRecord.id, type);
    setPaymentModalVisible(false);
    setPayingRecord(null);
    setPaymentStep('choose');
    loadRecords();
  };

  const handleDelete = async (id: string) => {
    showAlert('Delete Record', 'Are you sure you want to remove this debt record? This cannot be undone.', 'warning', async () => {
      await deleteUtangRecord(id);
      loadRecords();
    });
  };

  const resetForm = () => {
    setCustomerName('');
    setSelectedItems([]);
    setManualAmount('');
    setNote('');
    setEditingRecord(null);
    setShowErrors(false);
  };

  const renderRecord = ({ item }: { item: UtangRecord }) => (
    <TouchableOpacity 
      style={[styles.recordCard, item.isPaid && styles.recordCardPaid]}
      onPress={() => handleEdit(item)}
      activeOpacity={0.7}
    >
      <View style={styles.recordHeader}>
        <View style={styles.customerIcon}>
          <User size={24} color={item.isPaid ? Theme.colors.outline : Theme.colors.primary} />
        </View>
        <View style={styles.customerInfo}>
          <Text style={[styles.customerName, item.isPaid && styles.textPaid]}>{item.customerName}</Text>
          <Text style={styles.recordDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <Text style={[styles.amountText, item.isPaid && styles.textPaid]}>₱{item.amount.toFixed(0)}</Text>
      </View>
      
      {(item.items || item.note) && (
        <View style={styles.noteSection}>
          {item.items && item.items.map((it, idx) => (
            <Text key={idx} style={styles.itemSummaryText}>• {it.qty}x {it.productName}</Text>
          ))}
          {item.note && <Text style={[styles.noteText, item.items && { marginTop: 4 }]}>{item.note}</Text>}
        </View>
      )}

      {!item.isPaid && (
        <View style={styles.cardButtons}>
          <TouchableOpacity style={[styles.actionButton, styles.paidButton]} onPress={() => handleMarkPaidPress(item)}>
            <CheckCircle2 size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.paidButtonText}>Mark Paid</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => handleDelete(item.id)}>
            <Trash2 size={18} color={Theme.colors.tertiary} />
          </TouchableOpacity>
        </View>
      )}
      
      {item.isPaid && (
        <View style={styles.paidBadge}>
          <CheckCircle2 size={12} color={Theme.colors.primary} style={{ marginRight: 4 }} />
          <Text style={styles.paidBadgeText}>
            PAID VIA {item.paymentType?.toUpperCase()} ON {new Date(item.paidAt!).toLocaleDateString()}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredRecords}
        keyExtractor={item => item.id}
        renderItem={renderRecord}
        ListHeaderComponent={
          <>
            <View style={styles.overviewCard}>
              <View style={styles.overviewInfo}>
                <Text style={styles.overviewLabel}>TOTAL CREDIT</Text>
                <Text style={styles.overviewValue}>₱{totalOwed.toLocaleString()}</Text>
              </View>
              <View style={styles.overviewIcon}>
                <CreditCard size={32} color={Theme.colors.onPrimaryContainer} />
              </View>
            </View>

            <View style={styles.searchBar}>
              <Search size={20} color={Theme.colors.outline} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search credits..."
                placeholderTextColor={Theme.colors.outlineVariant}
                value={search}
                onChangeText={setSearch}
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Credit History</Text>
            </View>
          </>
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Contact size={48} color={Theme.colors.outlineVariant} />
            <Text style={styles.emptyText}>{search ? 'No results found' : 'No active debts'}</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Plus size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRecord ? 'Edit Utang' : 'New Utang'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}><X size={24} color={Theme.colors.outline} /></TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>CUSTOMER NAME</Text>
              <TextInput 
                style={[styles.input, showErrors && !customerName && styles.errorInput]} 
                placeholder="e.g. Aling Nena" 
                placeholderTextColor={Theme.colors.outlineVariant}
                value={customerName} 
                onChangeText={setCustomerName} 
              />

              <View style={styles.amountHeader}>
                <Text style={styles.inputLabel}>WHAT DID THEY TAKE?</Text>
                <TouchableOpacity onPress={() => setPickerVisible(true)}>
                  <Text style={styles.addItemText}>+ Pick Items</Text>
                </TouchableOpacity>
              </View>

              {selectedItems.length > 0 ? (
                <View style={styles.selectedItemsList}>
                  {selectedItems.map(item => (
                    <View key={item.productId} style={styles.selectedItemRow}>
                      <Text style={styles.selectedItemName}>{item.qty}x {item.productName}</Text>
                      <TouchableOpacity onPress={() => removeSelectedItem(item.productId)}>
                        <X size={16} color={Theme.colors.tertiary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={styles.autoTotalBox}>
                    <Text style={styles.autoTotalLabel}>Total Calculated:</Text>
                    <Text style={styles.autoTotalValue}>₱{calculateTotal()}</Text>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.helpText}>Pick items to calculate total automatically, or enter manually below.</Text>
                  <Text style={styles.inputLabel}>MANUAL AMOUNT (₱)</Text>
                  <TextInput 
                    style={[styles.input, showErrors && selectedItems.length === 0 && !manualAmount && styles.errorInput]} 
                    placeholder="0.00" 
                    placeholderTextColor={Theme.colors.outlineVariant}
                    keyboardType="numeric" 
                    value={manualAmount} 
                    onChangeText={(t) => setManualAmount(t.replace(/[^0-9.]/g, ''))} 
                  />
                </>
              )}

              <Text style={styles.inputLabel}>EXTRA NOTE (OPTIONAL)</Text>
              <TextInput 
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]} 
                placeholder="Details..." 
                placeholderTextColor={Theme.colors.outlineVariant}
                multiline 
                value={note} 
                onChangeText={setNote} 
              />

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveMonth}>
                <Text style={styles.saveButtonText}>{editingRecord ? 'Update Utang' : 'Confirm Utang'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickerVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Items</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}><X size={24} color={Theme.colors.outline} /></TouchableOpacity>
            </View>
            <FlatList
              data={products}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerItem} onPress={() => handleSelectItem(item)}>
                  <View style={styles.pickerItemInfo}>
                    <Text style={styles.pickerItemName}>{item.name}</Text>
                    <Text style={styles.pickerItemPrice}>₱{item.price}</Text>
                  </View>
                  {selectedItems.some(si => si.productId === item.id) && (
                    <View style={styles.pickerBadge}>
                      <Text style={styles.pickerBadgeText}>{selectedItems.find(si => si.productId === item.id)?.qty}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
            <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setPickerVisible(false)}>
              <Text style={styles.pickerDoneText}>Done picking</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Payment Selection Modal */}
      <Modal visible={paymentModalVisible} transparent animationType="fade">
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentPickerCard}>
            <Text style={styles.paymentPickerTitle}>
              {paymentStep === 'confirm_gcash' ? 'Scan to Pay' : 'Payment Method'}
            </Text>
            <Text style={styles.paymentPickerSub}>
              {paymentStep === 'confirm_gcash' 
                ? `Ask ${payingRecord?.customerName} to scan this QR code`
                : `Select how ${payingRecord?.customerName} settled this debt`
              }
            </Text>
            
            <View style={styles.paymentOptions}>
              {paymentStep === 'choose' ? (
                <>
                  <TouchableOpacity 
                    style={[styles.paymentBtn, { backgroundColor: Theme.colors.primary }]}
                    onPress={() => confirmPayment('cash')}
                  >
                    <Text style={styles.paymentBtnText}>PAY VIA CASH</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[
                      styles.paymentBtn, 
                      { backgroundColor: Theme.colors.secondary },
                      !businessSettings.gcashQrUri && { opacity: 0.4 }
                    ]}
                    onPress={() => confirmPayment('gcash')}
                  >
                    <Text style={styles.paymentBtnText}>PAY VIA GCASH</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.qrPaymentContainer}>
                  {businessSettings.gcashQrUri ? (
                    <Image source={{ uri: businessSettings.gcashQrUri }} style={styles.paymentQrImage} />
                  ) : (
                    <View style={styles.qrFallback}>
                      <CreditCard size={48} color={Theme.colors.outline} />
                      <Text style={styles.qrFallbackText}>No QR Code Found</Text>
                    </View>
                  )}
                  
                  <TouchableOpacity 
                    style={[styles.paymentBtn, { backgroundColor: Theme.colors.primary, marginTop: 24 }]}
                    onPress={() => confirmPayment('gcash')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CheckCircle2 size={24} color="#FFF" />
                      <Text style={styles.paymentBtnText}>CONFIRM RECEIPT</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <TouchableOpacity 
              style={styles.paymentCancelBtn}
              onPress={() => setPaymentModalVisible(false)}
            >
              <Text style={styles.paymentCancelText}>
                {paymentStep === 'confirm_gcash' ? 'Go Back' : 'Cancel for now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertCard}>
            {alertConfig.type === 'success' && <CheckCircle2 size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            {alertConfig.type === 'error' && <X size={48} color={Theme.colors.tertiary} style={styles.alertIcon} />}
            {alertConfig.type === 'warning' && <AlertTriangle size={48} color="#f59e0b" style={styles.alertIcon} />}
            {alertConfig.type === 'info' && <Info size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            
            <TouchableOpacity 
              style={[
                styles.alertBtn, 
                { backgroundColor: alertConfig.type === 'error' || alertConfig.type === 'warning' ? Theme.colors.tertiary : Theme.colors.primary }
              ]} 
              onPress={() => {
                setAlertVisible(false);
                if (alertConfig.onConfirm) alertConfig.onConfirm();
              }}
            >
              <Text style={styles.alertBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
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
  listContent: {
    padding: 20,
    paddingBottom: 100,
  },
  overviewCard: {
    backgroundColor: Theme.colors.primaryContainer,
    borderRadius: 28,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  overviewInfo: {
    flex: 1,
  },
  overviewLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    opacity: 0.7,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  overviewValue: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 32,
  },
  overviewIcon: {
    width: 60,
    height: 60,
    backgroundColor: 'transparent',
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  sectionHeader: {
    marginBottom: 16,
    marginLeft: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  recordCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  recordCardPaid: {
    opacity: 0.6,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerIcon: {
    width: 44,
    height: 44,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
  },
  recordDate: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
  },
  amountText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.tertiary,
  },
  textPaid: {
    color: Theme.colors.outline,
    textDecorationLine: 'line-through',
  },
  noteSection: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    padding: 12,
    borderRadius: 16,
    marginTop: 12,
  },
  itemSummaryText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.onSurface,
  },
  noteText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.onSurfaceVariant,
  },
  cardButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paidButton: {
    flex: 1,
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
  },
  paidButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 13,
  },
  deleteButton: {
    width: 44,
    backgroundColor: Theme.colors.tertiaryContainer + '30',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    opacity: 0.7,
  },
  paidBadgeText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 10,
  },
  // Custom Alert Styles
  alertCard: {
    width: width * 0.85,
    backgroundColor: Theme.colors.surface,
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    // Premium shadow
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
    letterSpacing: -0.5,
  },
  alertMessage: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  alertBtn: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  alertBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: Theme.colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  emptyContainer: {
    padding: 80,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
  },
  inputLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 16,
    marginBottom: 16,
    color: Theme.colors.onSurface,
  },
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addItemText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.primary,
  },
  selectedItemsList: {
    backgroundColor: Theme.colors.primaryContainer + '20',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  selectedItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  selectedItemName: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 14,
  },
  autoTotalBox: {
    borderTopWidth: 1,
    borderTopColor: Theme.colors.outlineVariant,
    marginTop: 8,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoTotalLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.outline,
  },
  autoTotalValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.primary,
  },
  helpText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 18,
  },
  errorInput: {
    borderWidth: 1.5,
    borderColor: Theme.colors.tertiary,
    backgroundColor: Theme.colors.tertiary + '08',
  },
  // Picker
  pickerCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 24,
    margin: 20,
    elevation: 20,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '20',
  },
  pickerItemInfo: {
    flex: 1,
  },
  pickerItemName: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
  },
  pickerItemPrice: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.outline,
  },
  pickerBadge: {
    backgroundColor: Theme.colors.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontFamily: Theme.typography.bodyBold,
  },
  pickerDoneBtn: {
    backgroundColor: Theme.colors.primary,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  pickerDoneText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
  // Payment Modal Styles
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  paymentPickerCard: {
    backgroundColor: '#FFF',
    width: '100%',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  paymentPickerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    textAlign: 'center',
  },
  paymentPickerSub: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
    lineHeight: 20,
  },
  paymentOptions: {
    width: '100%',
    gap: 12,
  },
  paymentBtn: {
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    elevation: 2,
  },
  paymentBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 1,
  },
  paymentCancelBtn: {
    marginTop: 20,
    padding: 12,
  },
  paymentCancelText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
    fontSize: 14,
  },
  // QR Selection Styles
  qrPaymentContainer: {
    alignItems: 'center',
    width: '100%',
  },
  paymentQrImage: {
    width: 240,
    height: 240,
    borderRadius: 24,
    backgroundColor: '#F8F9FA',
  },
  qrFallback: {
    width: 240,
    height: 240,
    borderRadius: 24,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Theme.colors.surfaceVariant,
    borderStyle: 'dashed',
  },
  qrFallbackText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    marginTop: 12,
  },
});
