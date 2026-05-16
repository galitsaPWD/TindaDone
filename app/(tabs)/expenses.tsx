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
  Dimensions 
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { 
  Plus, 
  X, 
  Trash2, 
  FileText, 
  AlertTriangle, 
  Info,
  Settings,
  DollarSign,
  TrendingDown,
  Calendar,
  Layers
} from 'lucide-react-native';
import { Theme } from '../../constants/Theme';
import { useTintin } from '../../context/TintinContext';
import { 
  getExpenses, 
  addExpense, 
  deleteExpense 
} from '../../lib/storage';
import { Expense } from '../../lib/types';
import { useSettings } from '../../context/SettingsContext';

const EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Water', 'Internet', 'Supplies', 'Maintenance', 'Salary', 'Marketing', 'Others'];

export default function ExpensesScreen() {
  const { setIsSettingsOpen } = useSettings();
  const tintin = useTintin();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Others');
  
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
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    const data = await getExpenses();
    setExpenses(data);
  };

  const todaysTotal = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return expenses
      .filter(e => e.timestamp.startsWith(today))
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses]);

  const handleSave = async () => {
    if (!description || !amount) {
      showAlert('Missing Info', 'Please enter description and amount.', 'warning');
      return;
    }

    const newExpense: Expense = {
      id: Date.now().toString(),
      description,
      amount: parseFloat(amount),
      category,
      timestamp: new Date().toISOString(),
    };

    await addExpense(newExpense);
    setModalVisible(false);
    resetForm();
    loadExpenses();
    tintin.say('Expense recorded!', 'success');
  };

  const handleDelete = async (id: string) => {
    showAlert('Delete Expense', 'Remove this expense from records?', 'warning', async () => {
      await deleteExpense(id);
      loadExpenses();
    });
  };

  const resetForm = () => {
    setDescription('');
    setAmount('');
    setCategory('Others');
  };

  const renderExpense = ({ item }: { item: Expense }) => (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <View style={styles.categoryIcon}>
          <FileText size={24} color={Theme.colors.tertiary} />
        </View>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseCategory}>{item.category}</Text>
          <Text style={styles.expenseDesc}>{item.description}</Text>
          <Text style={styles.expenseDate}>
            {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>₱{item.amount.toLocaleString()}</Text>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
            <Trash2 size={16} color={Theme.colors.outline} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.boutiqueHeader}>
        <View>
          <Text style={styles.boutiqueTitle}>Costs</Text>
          <Text style={styles.boutiqueSubtitle}>Expense Ledger</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsHeaderBtn} 
          onPress={() => setIsSettingsOpen(true)}
        >
          <Settings size={22} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={item => item.id}
        renderItem={renderExpense}
        ListHeaderComponent={
          <>
            <View style={styles.heroSection}>
              <View style={styles.heroHeader}>
                <View>
                  <Text style={styles.heroLabel}>TODAY'S OUTFLOW</Text>
                  <Text style={styles.heroValue}>₱{todaysTotal.toLocaleString()}</Text>
                </View>
                <View style={styles.heroIconBox}>
                  <TrendingDown size={32} color="#FFF" opacity={0.9} />
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Expenses</Text>
            </View>
          </>
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <DollarSign size={48} color={Theme.colors.outlineVariant} />
            <Text style={styles.emptyText}>No expenses recorded yet.</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Plus size={32} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <BlurView intensity={60} tint="light" style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Expense</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>DESCRIPTION</Text>
              <TextInput 
                style={styles.input} 
                placeholder="e.g. Electricity Bill" 
                placeholderTextColor={Theme.colors.outlineVariant}
                value={description} 
                onChangeText={setDescription} 
              />

              <Text style={styles.inputLabel}>AMOUNT (₱)</Text>
              <TextInput 
                style={styles.input} 
                placeholder="0.00" 
                placeholderTextColor={Theme.colors.outlineVariant}
                keyboardType="numeric" 
                value={amount} 
                onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))} 
              />

              <Text style={styles.inputLabel}>CATEGORY</Text>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.map(cat => (
                  <TouchableOpacity 
                    key={cat}
                    style={[styles.categoryChip, category === cat && styles.activeCategoryChip]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.categoryChipText, category === cat && styles.activeCategoryChipText]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Confirm Expense</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </BlurView>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <BlurView intensity={70} tint="dark" style={styles.centeredOverlay}>
          <View style={styles.alertCard}>
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
        </BlurView>
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
    backgroundColor: Theme.colors.tertiary,
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
  sectionHeader: {
    marginBottom: 16,
    marginLeft: 4,
  },
  sectionTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  expenseCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: 24,
    backgroundColor: Theme.colors.tertiary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseCategory: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  expenseDesc: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  expenseDate: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
    gap: 8,
  },
  amountText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.tertiary,
  },
  deleteBtn: {
    padding: 4,
  },
  fab: {
    position: 'absolute',
    bottom: 130,
    right: 24,
    backgroundColor: Theme.colors.primary,
    width: 60,
    height: 60,
    borderRadius: 30,
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  activeCategoryChip: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  categoryChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.onSurfaceVariant,
  },
  activeCategoryChipText: {
    color: '#FFF',
  },
  saveButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
  },
  centeredOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
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
  },
  alertIcon: {
    marginBottom: 20,
  },
  alertTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    marginBottom: 8,
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
    borderRadius: 28,
    alignItems: 'center',
  },
  alertCancelBtn: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
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
