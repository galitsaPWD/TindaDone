import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Modal,
  Image,
  Dimensions,
  Platform
} from 'react-native';
import { 
  TrendingUp, 
  AlertTriangle, 
  History, 
  Wallet, 
  ChevronRight, 
  ShoppingBasket, 
  Smartphone, 
  ReceiptText, 
  Rocket, 
  Info, 
  Database, 
  QrCode, 
  Store, 
  Camera, 
  X, 
  FileText, 
  CheckCircle2,
  Package,
  BarChart2
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { 
  getTransactions, 
  getProducts, 
  saveBusinessSettings,
  getUtangRecords
} from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { calculateTodaysSales, calculateTodaysProfit, getPaymentBreakdown } from '../../lib/calculations';
import { Transaction, Product } from '../../lib/types';
import { Theme } from '../../constants/Theme';

const { width } = Dimensions.get('window');

export default function StatsScreen() {
  const router = useRouter();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [chartData, setChartData] = useState<{label: string, value: number, height: number, transactions: Transaction[]}[]>([]);
  const [showChart, setShowChart] = useState(true);
  const [selectedChartIndex, setSelectedChartIndex] = useState<number | null>(null);
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  
  const [todaysSales, setTodaysSales] = useState(0);
  const [todaysProfit, setTodaysProfit] = useState(0);
  const [paymentStats, setPaymentStats] = useState({ cash: 0, gcash: 0 });
  const [lowStockItems, setLowStockItems] = useState<Product[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  
  const { businessSettings } = useSettings();
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [totalDebt, setTotalDebt] = useState(0);
  const [showCloseout, setShowCloseout] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const transactions = await getTransactions();
    const products = await getProducts();
    const utang = await getUtangRecords();

    setAllTransactions(transactions);
    setAllProducts(products);

    setLowStockItems(products.filter(p => p.stock <= p.lowStockThreshold).slice(0, 5));
    setTotalInventoryValue(products.reduce((sum, p) => sum + (p.price * p.stock), 0));
    setTotalDebt(utang.filter(r => !r.isPaid).reduce((sum, r) => sum + r.amount, 0));
  };

  useEffect(() => {
    setSelectedChartIndex(null); // reset selection on period change
    
    const now = new Date();
    const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    const todayStr = localNow.toISOString().split('T')[0];
    const monthStr = localNow.toISOString().slice(0, 7);
    const yearStr = localNow.getFullYear().toString();

    let filtered = allTransactions;
    if (period === 'daily') {
      filtered = allTransactions.filter(t => t.timestamp.startsWith(todayStr));
    } else if (period === 'monthly') {
      filtered = allTransactions.filter(t => t.timestamp.startsWith(monthStr));
    } else if (period === 'yearly') {
      filtered = allTransactions.filter(t => t.timestamp.startsWith(yearStr));
    }
    setPeriodTransactions(filtered);

    // --- Chart Data Calculation ---
    let newChartData: {label: string, value: number, height: number, transactions: Transaction[]}[] = [];
    if (period === 'daily') {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(localNow.getTime() - i * 24 * 60 * 60 * 1000);
        days.push(d.toISOString().split('T')[0]);
      }
      const values = days.map(dayStr => {
        const dayTrans = allTransactions.filter(t => t.timestamp.startsWith(dayStr));
        const daySales = dayTrans.reduce((s, t) => s + t.total, 0);
        return { label: new Date(dayStr).toLocaleDateString('en-US', { weekday: 'short' }), value: daySales, transactions: dayTrans };
      });
      const maxVal = Math.max(...values.map(v => v.value), 1) || 1;
      newChartData = values.map(v => ({ ...v, height: (v.value / maxVal) * 100 }));
    } else if (period === 'monthly') {
      const values = [1, 2, 3, 4].map(week => {
        const weekTrans = filtered.filter(t => {
          const d = new Date(t.timestamp).getDate();
          if (week === 1) return d >= 1 && d <= 7;
          if (week === 2) return d >= 8 && d <= 14;
          if (week === 3) return d >= 15 && d <= 21;
          if (week === 4) return d >= 22;
          return false;
        });
        const weekSales = weekTrans.reduce((s, t) => s + t.total, 0);
        return { label: `W${week}`, value: weekSales, transactions: weekTrans };
      });
      const maxVal = Math.max(...values.map(v => v.value), 1) || 1;
      newChartData = values.map(v => ({ ...v, height: (v.value / maxVal) * 100 }));
    } else if (period === 'yearly') {
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(localNow.getFullYear(), localNow.getMonth() - i, 1);
        months.push({ 
          str: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 7), 
          label: d.toLocaleDateString('en-US', { month: 'short' }) 
        });
      }
      const values = months.map(m => {
        const mTrans = allTransactions.filter(t => t.timestamp.startsWith(m.str));
        const mSales = mTrans.reduce((s, t) => s + t.total, 0);
        return { label: m.label, value: mSales, transactions: mTrans };
      });
      const maxVal = Math.max(...values.map(v => v.value), 1) || 1;
      newChartData = values.map(v => ({ ...v, height: (v.value / maxVal) * 100 }));
    }
    setChartData(newChartData);
  }, [period, allTransactions]);

  useEffect(() => {
    let activeData = periodTransactions;
    if (selectedChartIndex !== null && chartData[selectedChartIndex]) {
      activeData = chartData[selectedChartIndex].transactions;
    }

    setTodaysSales(calculateTodaysSales(activeData));
    setTodaysProfit(calculateTodaysProfit(activeData, allProducts));
    setPaymentStats(getPaymentBreakdown(activeData));
    
    const recent = [...activeData].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentTransactions(recent.slice(0, 5));
  }, [periodTransactions, chartData, selectedChartIndex, allProducts]);



  const getTransactionIcon = (t: Transaction) => {
    if (t.items.length === 0) return <Wallet size={20} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.length > 2) return <ShoppingBasket size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.some(i => i.productName.toLowerCase().includes('load'))) return <Smartphone size={24} color={Theme.colors.onSecondaryContainer} />;
    return <ReceiptText size={20} color={Theme.colors.onSecondaryContainer} />;
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 }]}>
        {/* Period Selector Tabs */}
        <View style={styles.periodTabs}>
          {['daily', 'monthly', 'yearly'].map((p) => (
            <TouchableOpacity 
              key={p} 
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p as any)}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue Hero */}
        <View style={styles.heroSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={styles.heroLabel}>
                {selectedChartIndex !== null ? chartData[selectedChartIndex].label.toUpperCase() : period.toUpperCase()} REVENUE
              </Text>
              <Text style={styles.heroValue}>₱{todaysSales.toLocaleString()}</Text>
              <View style={styles.profitBadge}>
                <TrendingUp size={14} color={Theme.colors.onPrimaryContainer} style={{ marginRight: 6 }} />
                <Text style={styles.profitText}>Est. Profit: ₱{todaysProfit.toLocaleString()}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowChart(!showChart)} style={styles.chartToggleBtn}>
              <BarChart2 size={24} color={Theme.colors.onPrimaryContainer} opacity={showChart ? 1 : 0.5} />
            </TouchableOpacity>
          </View>

          {/* Dynamic Micro-Chart */}
          {showChart && (
            <View style={styles.chartContainer}>
              {chartData.map((d, i) => {
                const isActive = selectedChartIndex === null || selectedChartIndex === i;
                return (
                  <TouchableOpacity 
                    key={i} 
                    style={[styles.chartBarCol, { opacity: isActive ? 1 : 0.4 }]}
                    onPress={() => setSelectedChartIndex(selectedChartIndex === i ? null : i)}
                  >
                    <View style={styles.chartBarTrack}>
                      <View style={[styles.chartBarFill, { height: `${d.height}%` }]} />
                    </View>
                    <Text style={[styles.chartLabel, isActive && styles.chartLabelActive]} numberOfLines={1}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Quick Summaries Bento */}
        <View style={styles.actionGrid}>
          <TouchableOpacity style={[styles.actionCard, { backgroundColor: '#defbe6' }]} onPress={() => setShowCloseout(true)}>
            <FileText size={24} color="#0a643b" />
            <Text style={[styles.actionLabel, { color: '#0a643b' }]}>Daily Report</Text>
          </TouchableOpacity>
          <View style={[styles.actionCard, { backgroundColor: '#fef3c7' }]}>
            <Package size={24} color="#92400e" />
            <Text style={[styles.actionLabel, { color: '#92400e' }]}>₱{totalInventoryValue.toLocaleString()}</Text>
            <Text style={styles.actionSubLabel}>Inv. Value</Text>
          </View>
          <View style={[styles.actionCard, { backgroundColor: '#fee2e2' }]}>
            <Wallet size={24} color="#b91c1c" />
            <Text style={[styles.actionLabel, { color: '#b91c1c' }]}>₱{totalDebt.toLocaleString()}</Text>
            <Text style={styles.actionSubLabel}>Total Debt</Text>
          </View>
        </View>

        <View style={styles.bentoGrid}>
          <View style={styles.bentoCard}>
            <Text style={styles.bentoLabel}>Cash Sales</Text>
            <Text style={styles.bentoValue}>₱{paymentStats.cash.toLocaleString()}</Text>
          </View>
          <View style={[styles.bentoCard, { backgroundColor: Theme.colors.secondaryContainer + '40' }]}>
            <Text style={styles.bentoLabel}>GCash Sales</Text>
            <Text style={styles.bentoValue}>₱{paymentStats.gcash.toLocaleString()}</Text>
          </View>
        </View>

        {lowStockItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <AlertTriangle size={20} color={Theme.colors.tertiary} />
                <Text style={styles.sectionTitle}>Check Stock</Text>
              </View>
              <TouchableOpacity onPress={() => router.push({ pathname: '/(tabs)/products', params: { filter: 'lowStock' } })}>
                <Text style={styles.viewAllText}>List All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.alertsGrid}>
              {lowStockItems.map(item => (
                <View key={item.id} style={styles.alertCard}>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.alertStatus}>Only {item.stock} left</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.restockButton}
                    onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
                  >
                    <Text style={styles.restockButtonText}>Details</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <History size={20} color={Theme.colors.onSurface} />
              <Text style={styles.sectionTitle}>{period.charAt(0).toUpperCase() + period.slice(1)} Sales</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/sales-history')}>
              <Text style={styles.viewAllText}>History</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.ledgerCard}>
            {recentTransactions.length === 0 ? (
              <View style={styles.emptyRecent}><Text style={styles.emptyRecentText}>No sales yet today.</Text></View>
            ) : (
              recentTransactions.map((t, index) => (
                <TouchableOpacity 
                  key={t.id} 
                  style={[styles.transactionItem, index === recentTransactions.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
                >
                  <View style={styles.transactionIcon}>{getTransactionIcon(t)}</View>
                  <View style={styles.transactionInfo}>
                    <Text style={styles.transactionTitle} numberOfLines={1}>
                      {t.items.length === 0 
                        ? 'Debt Settlement' 
                        : (t.items.length > 1 ? `${t.items[0].productName} +${t.items.length - 1}` : t.items[0].productName)
                      }
                    </Text>
                    <Text style={styles.transactionMeta}>
                      {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {t.paymentType.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.transactionAmount}>₱{t.total.toFixed(0)}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      {/* Daily Closeout Modal */}
      <Modal visible={showCloseout} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Store size={40} color={Theme.colors.primary} style={{ marginBottom: 12 }} />
              <Text style={styles.summaryTitle}>{businessSettings.storeName || 'TindaDone'}</Text>
              <Text style={styles.summarySubtitle}>Daily Performance Report</Text>
              <Text style={styles.summaryDate}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
            </View>
            
            <View style={styles.summaryBody}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <Wallet size={18} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.summaryItemLabel}>Gross Sales</Text>
                </View>
                <Text style={styles.summaryItemValue}>₱{todaysSales.toLocaleString()}</Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <Rocket size={18} color={Theme.colors.primary} />
                  <Text style={[styles.summaryItemLabel, { color: Theme.colors.primary }]}>Total Profit</Text>
                </View>
                <Text style={[styles.summaryItemValue, { color: Theme.colors.primary }]}>₱{todaysProfit.toLocaleString()}</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <ShoppingBasket size={18} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.summaryItemLabel}>Sales Count</Text>
                </View>
                <Text style={styles.summaryItemValue}>{recentTransactions.length} transactions</Text>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <Info size={18} color="#0a643b" />
                  <Text style={styles.summaryItemLabel}>Cash Total</Text>
                </View>
                <Text style={styles.summaryItemValue}>₱{paymentStats.cash.toLocaleString()}</Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <Smartphone size={18} color="#2563eb" />
                  <Text style={styles.summaryItemLabel}>GCash Total</Text>
                </View>
                <Text style={styles.summaryItemValue}>₱{paymentStats.gcash.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.summaryFooter}>
              <TouchableOpacity style={styles.shareBtn} onPress={() => setShowCloseout(false)}>
                <CheckCircle2 size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.shareBtnText}>Close Report</Text>
              </TouchableOpacity>
              <Text style={styles.shareHint}>Take a screenshot to save this report</Text>
            </View>
          </View>
        </View>
      </Modal>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: 24,
    paddingBottom: 120,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceVariant,
    borderRadius: 20,
    padding: 4,
    marginBottom: 20,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
  },
  periodTabActive: {
    backgroundColor: '#FFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  periodTabText: {
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.outline,
    fontSize: 14,
  },
  periodTabTextActive: {
    color: '#000',
    fontFamily: Theme.typography.headline,
  },
  heroSection: {
    marginBottom: 24,
    backgroundColor: Theme.colors.primaryContainer,
    borderRadius: 32,
    padding: 24,
  },
  heroLabel: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 48,
    color: Theme.colors.onPrimaryContainer,
  },
  profitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  profitText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 13,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  chartBarCol: {
    alignItems: 'center',
    flex: 1,
  },
  chartBarTrack: {
    height: 50,
    width: 14,
    borderRadius: 7,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  chartBarFill: {
    width: '100%',
    backgroundColor: Theme.colors.onPrimaryContainer,
    borderRadius: 7,
  },
  chartLabel: {
    fontFamily: Theme.typography.bodyMedium,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
  },
  chartLabelActive: {
    color: 'rgba(255,255,255,1)',
    fontFamily: Theme.typography.bodyBold,
  },
  chartToggleBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionLabel: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 14,
    textAlign: 'center',
  },
  actionSubLabel: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 9,
    color: Theme.colors.outline,
    textTransform: 'uppercase',
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  bentoCard: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  bentoLabel: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 11,
    color: Theme.colors.outline,
    marginBottom: 4,
  },
  bentoValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  viewAllText: {
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.primary,
    fontSize: 14,
  },
  alertsGrid: {
    gap: 10,
  },
  alertCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: Theme.colors.tertiary,
  },
  alertInfo: {
    flex: 1,
  },
  alertName: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
  },
  alertStatus: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.tertiary,
    fontSize: 13,
  },
  restockButton: {
    backgroundColor: Theme.colors.surfaceContainerHighest,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  restockButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
    fontSize: 12,
  },
  ledgerCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '20',
  },
  transactionIcon: {
    width: 44,
    height: 44,
    backgroundColor: Theme.colors.secondaryContainer,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 15,
  },
  transactionMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.onSurfaceVariant,
  },
  transactionAmount: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    padding: 24,
  },
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 32,
  },
  summaryHeader: {
    alignItems: 'center',
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '20',
    paddingBottom: 24,
  },
  summaryTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.onSurface,
    textAlign: 'center',
  },
  summarySubtitle: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 12,
    color: Theme.colors.primary,
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  summaryDate: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    marginTop: 8,
    fontSize: 14,
  },
  summaryBody: {
    gap: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  summaryRowLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryItemLabel: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  summaryItemValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  divider: {
    height: 1,
    backgroundColor: Theme.colors.outlineVariant,
    marginVertical: 16,
    opacity: 0.2,
  },
  summaryFooter: {
    marginTop: 32,
    alignItems: 'center',
  },
  shareBtn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    width: '100%',
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 18,
  },
  shareHint: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 12,
    marginTop: 16,
  },
  // Settings
  settingsCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 24,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingsTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
  },
  settingsInfo: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  qrUploadBox: {
    width: '100%',
    height: 200,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Theme.colors.outlineVariant,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  qrFullImage: {
    width: '100%',
    height: '100%',
  },
  qrPlaceholder: {
    alignItems: 'center',
  },
  qrPlaceholderText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
    marginTop: 12,
  },
  saveSettingsBtn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveSettingsBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
  emptyRecent: {
    padding: 40,
    alignItems: 'center',
  },
  emptyRecentText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
  },
});
