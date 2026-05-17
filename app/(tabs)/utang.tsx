import React, { useState, useEffect, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  FlatList, 
  TextInput, 
  ScrollView, 
  Modal, 
  Dimensions, 
  Image 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { 
  User, 
  MapPin, 
  Search, 
  Plus, 
  X, 
  Contact, 
  CheckCircle2, 
  Trash2, 
  CreditCard,
  AlertTriangle,
  Info,
  Settings
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { useTintin } from '../../context/TintinContext';
import { 
  getUtangRecords, 
  addUtangRecord, 
  updateUtangRecord, 
  deleteUtangRecord, 
  markUtangPaid,
  getProducts
} from '../../lib/storage';
import { UtangRecord, Product, TransactionItem } from '../../lib/types';
import { useSettings } from '../../context/SettingsContext';

const { width } = Dimensions.get('window');

export default function UtangScreen() {
  const { businessSettings, setIsSettingsOpen } = useSettings();
  const tintin = useTintin();
  const [records, setRecords] = useState<UtangRecord[]>([]);
  const [totalOwed, setTotalOwed] = useState(0);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  
  // Form State
  const [editingRecord, setEditingRecord] = useState<UtangRecord | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [location, setLocation] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedItems, setSelectedItems] = useState<TransactionItem[]>([]);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  // Filter State
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  // Payment State
  const [payingRecord, setPayingRecord] = useState<UtangRecord | null>(null);
  const [paymentStep, setPaymentStep] = useState<'choose' | 'confirm_gcash'>('choose');

  // Custom Alert State
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm?: () => void;
  }>({ title: '', message: '', type: 'info' });

  const showAlert = (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info', onConfirm?: () => void) => {
    setAlertConfig({ title, message, type, onConfirm });
    setAlertVisible(true);
  };

  useEffect(() => {
    loadRecords();
    loadProducts();
  }, []);

  const locations = useMemo(() => {
    const locs = records.map(r => r.location).filter((l): l is string => !!l);
    return Array.from(new Set(locs));
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = records;
    
    if (selectedLocation) {
      result = result.filter(r => r.location === selectedLocation);
    }
    
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => 
        r.customerName.toLowerCase().includes(s) ||
        r.note?.toLowerCase().includes(s) ||
        r.location?.toLowerCase().includes(s)
      );
    }
    
    return result;
  }, [search, records, selectedLocation]);

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
        location,
        amount: finalAmount,
        items: selectedItems.length > 0 ? selectedItems : undefined,
        note,
      });
    } else {
      const newRecord: UtangRecord = {
        id: Date.now().toString(),
        customerName,
        location,
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
    tintin.say(editingRecord ? 'Record updated!' : 'New debt saved!', 'success');
  };

  const handleEdit = (record: UtangRecord) => {
    if (record.isPaid) return;
    setEditingRecord(record);
    setCustomerName(record.customerName);
    setLocation(record.location || '');
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
    tintin.say('Payment received!', 'success');
  };

  const handleDelete = async (id: string) => {
    showAlert('Delete Record', 'Are you sure you want to remove this debt record? This cannot be undone.', 'warning', async () => {
      await deleteUtangRecord(id);
      loadRecords();
    });
  };

  const resetForm = () => {
    setCustomerName('');
    setLocation('');
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
      activeOpacity={0.8}
    >
      <View style={styles.recordHeader}>
        <View style={styles.customerIcon}>
          <User size={24} color={item.isPaid ? Theme.colors.outline : Theme.colors.primary} />
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.recordCategory}>Ledger Record</Text>
          <Text style={[styles.customerName, item.isPaid && styles.textPaid]}>{item.customerName}</Text>
          <View style={styles.recordMeta}>
            <Text style={styles.recordDate}>
              {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
            {item.location && (
              <View style={styles.recordLocationPill}>
                <MapPin size={10} color={Theme.colors.primary} />
                <Text style={styles.recordLocationText}>{item.location}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.amountContainer}>
          <Text style={[styles.amountText, item.isPaid && styles.textPaid]}>₱{item.amount.toFixed(0)}</Text>
        </View>
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
            <Trash2 size={18} color="#FFF" />
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
      <View style={styles.boutiqueHeader}>
        <View>
          <Text style={styles.boutiqueTitle}>Credit</Text>
          <Text style={styles.boutiqueSubtitle}>Trust Ledger</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsHeaderBtn} 
          onPress={() => setIsSettingsOpen(true)}
        >
          <Settings size={22} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredRecords}
        keyExtractor={item => item.id}
        renderItem={renderRecord}
        ListHeaderComponent={
          <>
            <View style={styles.heroSection}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.heroLabel}>TOTAL CREDIT</Text>
                  <Text style={styles.heroValue}>₱{totalOwed.toLocaleString()}</Text>
                </View>
                <View style={styles.heroIconBox}>
                  <CreditCard size={32} color="#FFF" opacity={0.9} />
                </View>
              </View>
            </View>

            <View style={styles.searchBar}>
              <Search size={20} color={Theme.colors.outline} />
              <TextInput 
                style={styles.searchInput}
                placeholder="Search customer, note, or place..."
                value={search}
                onChangeText={setSearch}
                placeholderTextColor={Theme.colors.outline}
              />
            </View>

            {/* Location Filter Chips */}
            {locations.length > 0 && (
              <View style={styles.filterSection}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                  <TouchableOpacity 
                    style={[styles.filterChip, !selectedLocation && styles.activeFilterChip]}
                    onPress={() => setSelectedLocation(null)}
                  >
                    <Text style={[styles.filterChipText, !selectedLocation && styles.activeFilterChipText]}>All Places</Text>
                  </TouchableOpacity>
                  {locations.map(loc => (
                    <TouchableOpacity 
                      key={loc}
                      style={[styles.filterChip, selectedLocation === loc && styles.activeFilterChip]}
                      onPress={() => setSelectedLocation(loc)}
                    >
                      <Text style={[styles.filterChipText, selectedLocation === loc && styles.activeFilterChipText]}>{loc}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Credit History</Text>
            </View>
          </>
        }
        contentContainerStyle={styles.listContent}
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

      {/* Entry Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => { setModalVisible(false); resetForm(); }}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRecord ? 'Edit Utang' : 'New Utang'}</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
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

              <Text style={styles.inputLabel}>LOCATION (OPTIONAL)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="e.g. Phase 2, Block 4" 
                placeholderTextColor={Theme.colors.outlineVariant}
                value={location} 
                onChangeText={setLocation} 
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

      {/* Item Picker Modal */}
      <Modal visible={pickerVisible} animationType="fade" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.centeredOverlay}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.pickerCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Items</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
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
                      <Text style={styles.pickerBadgeText}>
                        {selectedItems.find(si => si.productId === item.id)?.qty}
                      </Text>
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
      <Modal visible={paymentModalVisible} transparent animationType="fade" onRequestClose={() => setPaymentModalVisible(false)}>
        <View style={styles.centeredOverlay}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
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
      <Modal visible={alertVisible} transparent animationType="fade" onRequestClose={() => setAlertVisible(false)}>
        <View style={styles.centeredOverlay}>
          <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.alertCard}>
            {alertConfig.type === 'success' && <CheckCircle2 size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            {alertConfig.type === 'error' && <X size={48} color={Theme.colors.tertiary} style={styles.alertIcon} />}
            {alertConfig.type === 'warning' && <AlertTriangle size={48} color="#f59e0b" style={styles.alertIcon} />}
            {alertConfig.type === 'info' && <Info size={48} color={Theme.colors.primary} style={styles.alertIcon} />}
            
            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertMessage}>{alertConfig.message}</Text>
            
            <View style={styles.alertActions}>
              {alertConfig.onConfirm && (
                <TouchableOpacity 
                  style={styles.alertCancelBtn}
                  onPress={() => setAlertVisible(false)}
                >
                  <Text style={styles.alertCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={[
                  styles.alertBtn, 
                  alertConfig.onConfirm ? { flex: 1 } : { width: '100%' },
                  { backgroundColor: alertConfig.type === 'error' || alertConfig.type === 'warning' ? Theme.colors.tertiary : Theme.colors.primary }
                ]} 
                onPress={() => {
                  setAlertVisible(false);
                  if (alertConfig.onConfirm) alertConfig.onConfirm();
                }}
              >
                <Text style={styles.alertBtnText}>
                  {alertConfig.onConfirm ? 'Confirm' : 'Got it'}
                </Text>
              </TouchableOpacity>
            </View>
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
  boutiqueHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsHeaderBtn: {
    padding: 8,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: 16,
  },
  boutiqueTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 34,
    color: Theme.colors.onSurface,
    letterSpacing: -1.5,
  },
  boutiqueSubtitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  listContent: {
    padding: 20,
    paddingBottom: 160,
  },
  heroSection: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    opacity: 0.7,
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 32,
  },
  heroIconBox: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 26,
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
  filterSection: {
    paddingVertical: 16,
  },
  filterScroll: {
    paddingHorizontal: 0,
  },
  filterChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    marginRight: 10,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  activeFilterChip: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  filterChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  activeFilterChipText: {
    color: '#FFF',
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
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant + '40',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  recordCardPaid: {
    opacity: 0.7,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerIcon: {
    width: 52,
    height: 52,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  customerInfo: {
    flex: 1,
  },
  recordCategory: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  customerName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  recordMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  recordDate: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.outline,
  },
  recordLocationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.surfaceContainerLow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  recordLocationText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
  },
  amountContainer: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  amountText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  textPaid: {
    color: Theme.colors.outline,
    textDecorationLine: 'line-through',
  },
  noteSection: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
    marginBottom: 16,
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
    gap: 16,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  paidButton: {
    flex: 1,
    backgroundColor: Theme.colors.primary,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  paidButtonText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  deleteButton: {
    width: 52,
    backgroundColor: Theme.colors.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
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
  fab: {
    position: 'absolute',
    bottom: 120,
    right: 24,
    backgroundColor: Theme.colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 99,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)', // Almost clear for blur
    justifyContent: 'flex-end',
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)', // Lightened for BlurView
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Theme.colors.surface, // Solid focus
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
    height: Dimensions.get('window').height * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 20,
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
  errorInput: {
    borderWidth: 1.5,
    borderColor: Theme.colors.tertiary,
    backgroundColor: Theme.colors.tertiary + '08',
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
    alignItems: 'center',
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
  pickerCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 24,
    width: '100%',
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
  paymentPickerCard: {
    backgroundColor: '#FFF',
    width: '100%',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
  },
  paymentPickerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  paymentPickerSub: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 32,
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
  qrPaymentContainer: {
    alignItems: 'center',
    width: '100%',
  },
  paymentQrImage: {
    width: 240,
    height: 240,
    borderRadius: 24,
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
  alertCard: {
    width: width * 0.85,
    backgroundColor: Theme.colors.surface,
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 24,
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
  },
  alertActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  alertBtn: {
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
  },
  alertCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceVariant,
  },
  alertCancelBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurfaceVariant,
    fontSize: 16,
  },
});
