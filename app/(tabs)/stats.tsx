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
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, { 
  FadeIn, 
  FadeOut, 
  SlideInDown, 
  Layout, 
  FadeInDown,
  useAnimatedStyle,
  withSpring,
  ZoomIn,
  withTiming
} from 'react-native-reanimated';
import { 
  TrendingUp, 
  TrendingDown,
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
  BarChart2,
  Settings,
  ChevronDown,
  RefreshCw
} from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { 
  getTransactions, 
  getProducts, 
  saveBusinessSettings,
  getUtangRecords,
  getExpenses,
  DEFAULT_CATEGORIES
} from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { calculateTodaysSales, calculateTodaysProfit, getPaymentBreakdown } from '../../lib/calculations';
import { Transaction, Product, UtangRecord, Expense } from '../../lib/types';
import { Theme } from '../../constants/Theme';

const { width } = Dimensions.get('window');

export default function StatsScreen() {
  const router = useRouter();
  const { businessSettings, setIsSettingsOpen } = useSettings();
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
  
  const [totalInventoryValue, setTotalInventoryValue] = useState(0);
  const [totalDebt, setTotalDebt] = useState(0);
  
  const [todaysUtangIssued, setTodaysUtangIssued] = useState(0);
  const [todaysUtangCollected, setTodaysUtangCollected] = useState(0);
  const [todaysExpenses, setTodaysExpenses] = useState(0);
  const [allUtangRecords, setAllUtangRecords] = useState<UtangRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'sales' | 'credit'>('all');

  const [showCloseout, setShowCloseout] = useState(false);
  const [showGcash, setShowGcash] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);

  const cashCardStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(showGcash ? '#eff6ff' : '#FFFFFF', { duration: 300 })
    };
  });


  useFocusEffect(
    React.useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    const transactions = await getTransactions();
    const products = await getProducts();
    const utang = await getUtangRecords();
    const expenses = await getExpenses();

    setAllTransactions(transactions);
    setAllProducts(products);
    setAllUtangRecords(utang);

    const today = new Date().toISOString().split('T')[0];
    const issuedToday = utang.filter(r => r.createdAt.startsWith(today)).reduce((s, r) => s + r.amount, 0);
    const collectedToday = utang.filter(r => r.isPaid && r.paidAt?.startsWith(today)).reduce((s, r) => s + r.amount, 0);
    
    const todayExpenses = expenses.filter(e => e.timestamp.startsWith(today)).reduce((s, e) => s + e.amount, 0);
    setTodaysExpenses(todayExpenses);

    setTodaysUtangIssued(issuedToday);
    setTodaysUtangCollected(collectedToday);

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
    
    // Combine regular sales with new debt records for history
    const today = new Date().toISOString().split('T')[0];
    const todayNewDebt = allUtangRecords
      .filter(r => r.createdAt.startsWith(today))
      .map(r => ({
        id: r.id,
        items: r.items || [],
        total: r.amount,
        paymentType: 'utang' as any,
        timestamp: r.createdAt,
        customerName: r.customerName
      }));

    const combined = [...activeData, ...todayNewDebt]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Apply History Filter
    let filtered = combined;
    if (historyFilter === 'sales') {
      filtered = combined.filter(t => (t as any).paymentType !== 'utang');
    } else if (historyFilter === 'credit') {
      filtered = combined.filter(t => (t as any).paymentType === 'utang');
    }

    setRecentTransactions(filtered.slice(0, 5));
  }, [periodTransactions, chartData, selectedChartIndex, allProducts, allUtangRecords, historyFilter]);



  const getTransactionIcon = (t: any) => {
    if (t.paymentType === 'utang') return <AlertTriangle size={20} color={Theme.colors.tertiary} />;
    if (t.items.length === 0) return <Wallet size={20} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.length > 2) return <ShoppingBasket size={24} color={Theme.colors.onSecondaryContainer} />;
    if (t.items.some((i: any) => i.productName.toLowerCase().includes('load'))) return <Smartphone size={24} color={Theme.colors.onSecondaryContainer} />;
    return <ReceiptText size={20} color={Theme.colors.onSecondaryContainer} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.boutiqueHeader}>
        <View>
          <Text style={styles.boutiqueTitle}>Analytics</Text>
          <Text style={styles.boutiqueSubtitle}>Performance Overview</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsHeaderBtn} 
          onPress={() => setIsSettingsOpen(true)}
        >
          <Settings size={22} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 }]}>

        {/* Period Selector Tabs */}
        <View style={styles.periodTabs}>
          {['daily', 'monthly', 'yearly'].map((p) => (
            <TouchableOpacity 
              key={p} 
              style={[styles.periodTab, period === p && styles.periodTabActive]}
              onPress={() => setPeriod(p as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodTabText, period === p && styles.periodTabTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue Hero */}
        <Animated.View layout={Layout.springify()} style={styles.heroSection}>
          <View style={styles.heroHeader}>
            <View>
              <Animated.Text key={`${period}-${selectedChartIndex}`} entering={FadeInDown.duration(400)} style={styles.heroLabel}>
                {selectedChartIndex !== null ? chartData[selectedChartIndex].label.toUpperCase() : period.toUpperCase()} REVENUE
              </Animated.Text>
              <Animated.Text key={`val-${todaysSales}`} entering={FadeIn.duration(500)} style={styles.heroValue}>₱{todaysSales.toLocaleString()}</Animated.Text>
              <Animated.View key={`profit-${todaysProfit}`} entering={FadeInDown.delay(100)} style={styles.profitBadge}>
                <TrendingUp size={16} color="#FFF" />
                <Text style={styles.profitText}>Est. Profit: ₱{todaysProfit.toLocaleString()}</Text>
              </Animated.View>
            </View>
            <TouchableOpacity onPress={() => setShowChart(!showChart)} style={styles.chartToggleBtn}>
              <BarChart2 size={24} color="#FFF" opacity={showChart ? 1 : 0.6} />
            </TouchableOpacity>
          </View>

          {showChart && (
            <Animated.View 
              layout={Layout.springify()} 
              entering={FadeIn.duration(400)}
              exiting={FadeOut.duration(300)}
              style={styles.chartContainer}
            >
              {chartData.map((d, i) => {
                const isActive = selectedChartIndex === null || selectedChartIndex === i;
                return (
                  <TouchableOpacity 
                    key={`${period}-${i}`} 
                    style={[styles.chartBarCol, { opacity: isActive ? 1 : 0.4 }]}
                    onPress={() => setSelectedChartIndex(selectedChartIndex === i ? null : i)}
                  >
                    <View style={styles.chartBarTrack}>
                      <Animated.View 
                        entering={ZoomIn.delay(i * 50).springify()}
                        style={[styles.chartBarFill, { height: `${d.height}%` }]} 
                      />
                    </View>
                    <Text style={[styles.chartLabel, isActive && styles.chartLabelActive]} numberOfLines={1}>{d.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          )}
        </Animated.View>

        {/* Quick Summaries Bento */}
        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => setShowCloseout(true)}>
            <View style={[styles.actionIcon, { backgroundColor: '#defbe6' }]}>
              <FileText size={20} color="#0a643b" />
            </View>
            <Text style={styles.actionLabel}>Daily Report</Text>
          </TouchableOpacity>
          <View style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: '#fef3c7' }]}>
              <Package size={20} color="#92400e" />
            </View>
            <Text style={styles.actionLabel}>₱{totalInventoryValue.toLocaleString()}</Text>
            <Text style={styles.actionSubLabel}>Inv. Value</Text>
          </View>
          <View style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: '#fee2e2' }]}>
              <Wallet size={20} color="#b91c1c" />
            </View>
            <Text style={styles.actionLabel}>₱{totalDebt.toLocaleString()}</Text>
            <Text style={styles.actionSubLabel}>Total Debt</Text>
          </View>
        </View>

        <View style={styles.bentoGrid}>
          <Animated.View style={[styles.bentoCard, cashCardStyle]}>
            <View style={styles.bentoHeader}>
              <Text style={[styles.bentoLabel]}>{showGcash ? 'GCash Sales' : 'Cash Sales'}</Text>
              <TouchableOpacity
                style={[styles.bentoToggle, showGcash && styles.bentoToggleActive]}
                onPress={() => setShowGcash(!showGcash)}
                activeOpacity={0.7}
              >
                <RefreshCw size={12} color={showGcash ? '#FFF' : Theme.colors.outline} />
              </TouchableOpacity>
            </View>
            <Text style={styles.bentoValue}>₱{(showGcash ? paymentStats.gcash : paymentStats.cash).toLocaleString()}</Text>
          </Animated.View>
          <View style={[styles.bentoCard, { backgroundColor: (todaysProfit - todaysExpenses) >= 0 ? '#f0fdf4' : '#fdf2f2' }]}>
            <View style={styles.bentoHeader}>
              <Text style={styles.bentoLabel}>Net Profit</Text>
              <Info size={14} color={(todaysProfit - todaysExpenses) >= 0 ? '#16a34a' : Theme.colors.tertiary} />
            </View>
            <Text style={[styles.bentoValue, { color: (todaysProfit - todaysExpenses) >= 0 ? '#16a34a' : Theme.colors.tertiary }]}>
              ₱{(todaysProfit - todaysExpenses).toLocaleString()}
            </Text>
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
              <Text style={styles.sectionTitle}>Daily Activity</Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/sales-history')}>
              <Text style={styles.viewAllText}>Full History</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.historySwitcher}>
            <TouchableOpacity 
              style={[styles.historyTab, historyFilter === 'all' && styles.historyTabActive]}
              onPress={() => setHistoryFilter('all')}
            >
              <Text style={[styles.historyTabText, historyFilter === 'all' && styles.historyTabTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.historyTab, historyFilter === 'sales' && styles.historyTabActive]}
              onPress={() => setHistoryFilter('sales')}
            >
              <Text style={[styles.historyTabText, historyFilter === 'sales' && styles.historyTabTextActive]}>Sales</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.historyTab, historyFilter === 'credit' && styles.historyTabActive]}
              onPress={() => setHistoryFilter('credit')}
            >
              <Text style={[styles.historyTabText, historyFilter === 'credit' && styles.historyTabTextActive]}>Credit</Text>
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
                      {(t as any).paymentType === 'utang' 
                        ? `Utang: ${(t as any).customerName}`
                        : (t.items.length === 0 
                          ? 'Debt Settlement' 
                          : (t.items.length > 1 ? `${t.items[0].productName} +${t.items.length - 1}` : t.items[0].productName))
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
      <Modal visible={showCloseout} transparent animationType="slide" onShow={() => setShowScrollHint(true)} onRequestClose={() => setShowCloseout(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.summaryCard}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              onScroll={(e) => {
                const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
                const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 30;
                setShowScrollHint(!isNearBottom);
              }}
              scrollEventThrottle={16}
            >
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
                <Text style={styles.summaryItemValue}>{recentTransactions.length} sales</Text>
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

              <View style={styles.divider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <AlertTriangle size={18} color={Theme.colors.tertiary} />
                  <Text style={styles.summaryItemLabel}>Debt Issued (Utang)</Text>
                </View>
                <Text style={[styles.summaryItemValue, { color: Theme.colors.tertiary }]}>+₱{todaysUtangIssued.toLocaleString()}</Text>
              </View>

              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <CheckCircle2 size={18} color="#0a643b" />
                  <Text style={styles.summaryItemLabel}>Debt Collected</Text>
                </View>
                <Text style={[styles.summaryItemValue, { color: '#0a643b' }]}>-₱{todaysUtangCollected.toLocaleString()}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.summaryRow}>
                <View style={styles.summaryRowLabelGroup}>
                  <TrendingDown size={18} color={Theme.colors.tertiary} />
                  <Text style={styles.summaryItemLabel}>Daily Costs</Text>
                </View>
                <Text style={[styles.summaryItemValue, { color: Theme.colors.tertiary }]}>
                  - ₱{todaysExpenses.toLocaleString()}
                </Text>
              </View>

              <View style={[styles.summaryRow, { backgroundColor: Theme.colors.primaryContainer + '20', borderRadius: 20, paddingHorizontal: 16, marginTop: 8 }]}>
                <Text style={[styles.summaryItemLabel, { fontFamily: Theme.typography.headlineBlack }]}>Net Performance</Text>
                <Text style={[styles.summaryItemValue, { fontSize: 22, color: Theme.colors.primary }]}>
                  ₱{(todaysProfit - todaysExpenses).toLocaleString()}
                </Text>
              </View>
            </View>
            <View style={{ height: 20 }} />
          </ScrollView>
            
            {showScrollHint && (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={styles.scrollHintContainer}>
                <View style={styles.scrollHint}>
                  <ChevronDown size={14} color={Theme.colors.outline} />
                  <Text style={styles.scrollHintText}>Scroll for more</Text>
                </View>
              </Animated.View>
            )}

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


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 160,
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
    backgroundColor: Theme.colors.primary,
    borderRadius: 32,
    padding: 24,
  },
  heroLabel: {
    fontFamily: Theme.typography.bodyMedium,
    color: '#FFF',
    opacity: 0.8,
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  heroValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 48,
    color: '#FFF',
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
    color: '#FFF',
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
    borderRadius: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    borderRadius: 32,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  actionLabel: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 13,
    textAlign: 'center',
    color: Theme.colors.onSurface,
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
    borderRadius: 32,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  bentoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bentoLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.outline,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bentoValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  bentoToggle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.colors.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  bentoToggleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
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
    gap: 10,
  },
  sectionTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  viewAllText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 14,
  },
  historySwitcher: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 24,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  historyTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 20,
  },
  historyTabActive: {
    backgroundColor: Theme.colors.primary,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  historyTabText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  historyTabTextActive: {
    color: '#FFF',
  },
  alertsGrid: {
    gap: 12,
  },
  alertCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 32,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  alertInfo: {
    flex: 1,
  },
  alertName: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  alertStatus: {
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.tertiary,
    fontSize: 13,
    marginTop: 2,
  },
  restockButton: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  restockButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
    fontSize: 12,
  },
  ledgerCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '40',
  },
  transactionIcon: {
    width: 48,
    height: 48,
    backgroundColor: Theme.colors.secondaryContainer,
    borderRadius: 20,
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
  transactionAmount: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 12,
    height: Dimensions.get('window').height * 0.85,
  },
  summaryHeader: {
    alignItems: 'center',
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant,
    paddingBottom: 24,
  },
  summaryTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.onSurface,
    textAlign: 'center',
  },
  summarySubtitle: {
    fontFamily: Theme.typography.bodyBold,
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
    opacity: 0.5,
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
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
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
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
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
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
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
  scrollHintContainer: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'none',
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  scrollHintText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.outline,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
