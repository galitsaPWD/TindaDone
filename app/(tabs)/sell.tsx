import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  TextInput, 
  Alert,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  InteractionManager,
  Platform,
  Vibration
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS
} from 'expo-av';
import * as Haptics from 'expo-haptics';
import { 
  Search, 
  Plus, 
  Minus, 
  ShoppingCart, 
  Trash2, 
  ChevronRight, 
  CheckCircle2, 
  X,
  CreditCard,
  Clock,
  Rocket,
  Camera,
  Store,
  QrCode,
  ReceiptText,
  AlertTriangle,
  Info,
  Package,
  Tag,
  ArrowRightLeft
} from 'lucide-react-native';
import Animated, { SlideInDown, SlideOutDown, FadeInDown } from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import { getTransactions, getProducts, saveTransaction, hasSeenWelcome, markWelcomeAsSeen, saveBusinessSettings, addUtangRecord } from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { Product, TransactionItem, BusinessSettings, UtangRecord } from '../../lib/types';
import { getTopSoldProducts } from '../../lib/calculations';
import { getTrialStatus, isActivated, TrialStatus } from '../../lib/license';
import { Theme } from '../../constants/Theme';

import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width } = Dimensions.get('window');

export default function SellScreen() {
  const { businessSettings, updateSettings } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<TransactionItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [paymentType, setPaymentType] = useState<'cash' | 'gcash'>('cash');
  const [topProducts, setTopProducts] = useState<any[]>([]);
  
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

  const handlePaymentTypeChange = (type: 'cash' | 'gcash') => {
    if (type === 'gcash' && !businessSettings.gcashQrUri) {
      showAlert('No QR Code', 'Please upload your GCash QR code in the Settings first.', 'warning');
      return;
    }
    setPaymentType(type);
  };

  // Modals
  const [checkoutModalVisible, setCheckoutModalVisible] = useState(false);
  const [utangModalVisible, setUtangModalVisible] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [activated, setActivated] = useState(false);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [editingItem, setEditingItem] = useState<TransactionItem | null>(null);
  const [tempQty, setTempQty] = useState('');
  
  // Welcome & Settings
  const [showWelcome, setShowWelcome] = useState(false);
  const [storeName, setStoreName] = useState('');
  
  // Scanner HUD
  const [isScanningMode, setIsScanningMode] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanTime = useRef<number>(0);
  const beepSound = useRef<Audio.Sound | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadProducts();
        checkLicense();
        checkFirstLaunch();
        loadBeep();
      });
      return () => {
        task.cancel();
        if (beepSound.current) {
          beepSound.current.unloadAsync();
        }
      };
    }, [])
  );

  const loadBeep = async () => {
    try {
      // Safe check for asset existence via try/catch
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/beep.mp3')
      );
      beepSound.current = sound;
    } catch (e) {
      // Fallback silently if asset is missing
    }
  };

  const playBeep = async () => {
    try {
      if (businessSettings.scannerBeep !== false && beepSound.current) {
        await beepSound.current.replayAsync();
      }
      
      // Vibration and Haptics check
      if (businessSettings.scannerVibrate !== false) {
        // Haptics for modern devices
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Classic vibration as fallback
        Vibration.vibrate(100);
      }
    } catch (e) {}
  };

  const checkFirstLaunch = async () => {
    const seen = await hasSeenWelcome();
    if (!seen) setShowWelcome(true);
  };

  const handleSaveInitialSettings = async () => {
    if (!storeName.trim()) {
      showAlert('Required', 'Please enter your store name to continue.', 'warning');
      return;
    }
    const updated = { ...businessSettings, storeName: storeName.trim() };
    await updateSettings(updated);
    await markWelcomeAsSeen();
    showAlert('All Set!', `Welcome to TindaDone, ${storeName.trim()}!`, 'success');
  };

  const checkLicense = async () => {
    const isAct = await isActivated();
    setActivated(isAct);
    if (!isAct) {
      const status = await getTrialStatus();
      setTrial(status);
    }
  };

  useEffect(() => {
    let filtered = products;

    if (activeCategory !== 'All') {
      filtered = filtered.filter(p => (p.category || 'Others') === activeCategory);
    }

    if (search !== '') {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        (p.category || 'Others').toLowerCase().includes(search.toLowerCase())
      );
    }
    
    setFilteredProducts(filtered);
  }, [search, products, activeCategory]);

  const categories = [
    'All',
    ...Array.from(new Set(products.map(p => p.category || 'Others')))
      .filter(c => c !== 'Others')
      .sort(),
    ...(products.some(p => !p.category || p.category === 'Others') ? ['Others'] : []),
  ];

  const loadProducts = async () => {
    const pData = await getProducts();
    const tData = await getTransactions();
    // Sanitize stale or broken URLs (Allow Base64 and HTTP)
    const sanitizedData = pData.map(p => {
      if (p.photoUri && !p.photoUri.startsWith('data:image') && !p.photoUri.startsWith('http')) {
        return { ...p, photoUri: undefined };
      }
      return p;
    });

    setProducts(sanitizedData);
    
    // Calculate top 5
    const top = getTopSoldProducts(tData, 5);
    setTopProducts(top);
  };


  const addToCart = (product: Product) => {
    // PRD: Stock Warning
    if (product.stock <= 0) {
      showAlert('Low Stock Warning', `Note: "${product.name}" is out of stock. You can still proceed if needed.`, 'warning');
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        qty: 1,
        isPack: false,
        priceAtSale: product.price,
        costPriceAtSale: product.costPrice
      }];
    });
  };

  const toggleItemPack = (productId: string) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const product = products.find(p => p.id === productId);
        if (!product) return item;
        
        const nextIsPack = !item.isPack;
        // Optimization: Default to regular price * pieces if packPrice is not set
        const defaultPackPrice = product.price * (product.piecesPerPack || 1);
        
        return {
          ...item,
          isPack: nextIsPack,
          priceAtSale: nextIsPack 
            ? (product.packPrice || defaultPackPrice)
            : product.price,
          costPriceAtSale: product.costPrice
        };
      }
      return item;
    }));
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    const now = Date.now();
    if (now - lastScanTime.current < 1500) return; // Debounce 1.5s
    
    const product = products.find(p => p.barcode === data);
    if (product) {
      lastScanTime.current = now;
      playBeep();
      setScanStatus(`Scanned: ${product.name}`);
      setTimeout(() => setScanStatus(null), 1000);
      addToCart(product);
    }
  };

  const startScanning = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        showAlert('Permission Denied', 'Camera permission is required to scan products.', 'error');
        return;
      }
    }
    setIsScanningMode(true);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQty = Math.max(0, item.qty + delta);
        return { ...item, qty: newQty };
      }
      return item;
    }).filter(item => item.qty > 0));
  };

  const handleManualQtyPress = (item: TransactionItem) => {
    setEditingItem(item);
    setTempQty(item.qty.toString());
    setQtyModalVisible(true);
  };

  const confirmManualQty = () => {
    if (!editingItem) return;
    const num = parseInt(tempQty || '0');
    if (num > 0) {
      setCart(prev => prev.map(item => 
        item.productId === editingItem.productId ? { ...item, qty: num } : item
      ));
    } else if (num === 0) {
      removeFromCart(editingItem.productId);
    }
    setQtyModalVisible(false);
    setEditingItem(null);
  };

  const total = cart.reduce((sum, item) => sum + (item.priceAtSale * item.qty), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    
    // Map cart items to include current cost prices for permanent profit tracking
    const itemsWithCost = cart.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      const baseCost = p?.costPrice || 0;
      return {
        ...item,
        costPriceAtSale: item.isPack ? baseCost * (p?.piecesPerPack || 1) : baseCost
      };
    });

    const transaction = {
      id: Date.now().toString(),
      items: itemsWithCost,
      total,
      paymentType,
      timestamp: new Date().toISOString()
    };

    try {
      await saveTransaction(transaction);
      setCart([]);
      setCheckoutModalVisible(false);
      showAlert('Success', 'Transaction completed!', 'success');
      loadProducts(); // Refresh stocks
    } catch (e: any) {
      showAlert('Unable to Complete Sale', e.message || 'Failed to save transaction.', 'error');
    }
  };

  const handleUtangCheckout = async () => {
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      showAlert('Required', 'Please enter a customer name for the Utang record.', 'warning');
      return;
    }

    const itemsWithCost = cart.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      const baseCost = p?.costPrice || 0;
      return {
        ...item,
        costPriceAtSale: item.isPack ? baseCost * (p?.piecesPerPack || 1) : baseCost
      };
    });

    const utangRecord: UtangRecord = {
      id: Date.now().toString(),
      customerName: customerName.trim(),
      amount: total,
      items: itemsWithCost,
      isPaid: false,
      createdAt: new Date().toISOString(),
    };

    try {
      await addUtangRecord(utangRecord);
      setCart([]);
      setUtangModalVisible(false);
      setCheckoutModalVisible(false);
      setCustomerName('');
      showAlert('Success', `Charged ₱${total.toFixed(0)} to ${customerName.trim()}'s Utang.`, 'success');
      loadProducts(); // Refresh stocks for sold items
    } catch (e: any) {
      showAlert('Unable to Create Utang', e.message || 'Failed to save Utang record.', 'error');
    }
  };

  const renderProduct = ({ item, index }: { item: Product, index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 30).springify()} style={{ flex: 1 }}>
      <TouchableOpacity 
        style={styles.productCard} 
        onPress={() => addToCart(item)}
        disabled={item.stock <= 0}
      >
        <View style={styles.productImageContainer}>
          {item.photoUri ? (
            <Image source={{ uri: item.photoUri }} style={styles.productImage} />
          ) : (
            <View style={styles.letterPlaceholder}>
              <Text style={styles.letterText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.productPrice}>₱{item.price.toFixed(0)}</Text>
          <Text style={[styles.productStock, item.stock <= 5 && { color: Theme.colors.tertiary }]}>
            Stock: {item.stock}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Trial Countdown Banner */}
      {!activated && trial?.active && (
        <View style={styles.trialBanner}>
          <Clock size={12} color="#FFF" />
          <Text style={styles.trialBannerText}>Free Trial Active — {trial.hoursLeft}h remaining</Text>
        </View>
      )}

      {/* Sticky Fast Access */}
      {topProducts.length > 0 && !search && (
        <View style={styles.topProductsSection}>
          <Text style={styles.sectionTitle}>Fast Access</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topProductsScroll}
          >
            {topProducts.map((p) => {
              const fullProd = products.find(fp => fp.id === p.id);
              if (!fullProd) return null;
              return (
                <TouchableOpacity 
                  key={p.id} 
                  style={styles.shortcutCard}
                  onPress={() => addToCart(fullProd)}
                >
                  <View style={styles.shortcutIcon}>
                    {fullProd.photoUri ? (
                      <Image source={{ uri: fullProd.photoUri }} style={styles.shortcutImage} />
                    ) : (
                      <View style={styles.shortcutPlaceholder}>
                        <Text style={styles.shortcutLetter}>{fullProd.name[0].toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.shortcutLabel} numberOfLines={1}>{fullProd.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Sticky Categories Filter */}
      {categories.length > 1 && (
        <View style={styles.categoriesSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {categories.map(c => (
              <TouchableOpacity 
                key={c}
                style={[styles.catChip, activeCategory === c && styles.catChipActive]}
                onPress={() => setActiveCategory(c)}
              >
                <Text style={[styles.catChipText, activeCategory === c && styles.catChipTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Sticky Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color={Theme.colors.outline} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={Theme.colors.outlineVariant}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        numColumns={2}
        contentContainerStyle={[styles.productList, filteredProducts.length === 0 && { flex: 1 }]}
        ListEmptyComponent={
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100, paddingHorizontal: 40 }}>
            {products.length === 0 ? (
              <>
                <Store size={60} color={Theme.colors.surfaceVariant} style={{ marginBottom: 16 }} />
                <Text style={{ fontFamily: Theme.typography.headline, fontSize: 18, color: Theme.colors.outline, textAlign: 'center', marginBottom: 8 }}>Your shop is empty!</Text>
                <Text style={{ fontFamily: Theme.typography.body, fontSize: 14, color: Theme.colors.outlineVariant, textAlign: 'center' }}>Head over to the Inventory tab to start adding your items.</Text>
              </>
            ) : (
              <>
                <Search size={60} color={Theme.colors.surfaceVariant} style={{ marginBottom: 16 }} />
                <Text style={{ fontFamily: Theme.typography.headline, fontSize: 18, color: Theme.colors.outline, textAlign: 'center', marginBottom: 8 }}>No items found</Text>
                <Text style={{ fontFamily: Theme.typography.body, fontSize: 14, color: Theme.colors.outlineVariant, textAlign: 'center' }}>We couldn't find any products matching your search.</Text>
              </>
            )}
          </View>
        }
      />

      {cart.length > 0 && (
        <Animated.View 
          entering={SlideInDown.duration(300)} 
          exiting={SlideOutDown.duration(300)} 
          style={styles.cartPanel}
        >
          <View style={styles.cartHeader}>
            <View style={styles.cartTitleRow}>
              <ShoppingCart size={18} color={Theme.colors.primary} />
              <Text style={styles.cartTitle}>{cart.length} in cart</Text>
            </View>
            <TouchableOpacity onPress={() => setCart([])}>
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cartScroll}>
            {cart.map(item => {
              const product = products.find(p => p.id === item.productId);
              const canSellPack = businessSettings.enableBulkMode !== false && product && product.piecesPerPack && product.piecesPerPack > 1 && product.packPrice && product.packPrice > 0;
              
              return (
              <View key={item.productId} style={styles.cartChip}>
                {canSellPack && (
                  <TouchableOpacity 
                    onPress={() => toggleItemPack(item.productId)} 
                    style={{ marginRight: 8, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {item.isPack ? <Package size={12} color="#FFF" /> : <Tag size={12} color="#FFF" />}
                      <Text style={{ fontSize: 11, color: '#FFF', fontFamily: Theme.typography.bodyBold }}>
                        {item.isPack ? 'Pack' : 'Unit'}
                      </Text>
                      <ArrowRightLeft size={10} color="#FFF" style={{ marginLeft: 2, opacity: 0.8 }} />
                    </View>
                  </TouchableOpacity>
                )}
                <Text style={styles.cartChipName} numberOfLines={1}>{item.productName} ₱{item.priceAtSale}</Text>
                <View style={styles.qtyControls}>
                  <TouchableOpacity onPress={() => updateQty(item.productId, -1)}>
                    <Minus size={14} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleManualQtyPress(item)}>
                    <Text style={styles.qtyText}>{item.qty}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => updateQty(item.productId, 1)}>
                    <Plus size={14} color="#FFF" />
                  </TouchableOpacity>
                </View>
                {/* Floating Delete Button at Top Right */}
                <TouchableOpacity 
                   style={styles.removeChipBtn} 
                   onPress={() => removeFromCart(item.productId)}
                >
                  <X size={12} color={Theme.colors.tertiary} strokeWidth={3} />
                </TouchableOpacity>
              </View>
              );
            })}
          </ScrollView>

          <View style={styles.checkoutSection}>
            <View style={styles.paymentToggle}>
              <TouchableOpacity 
                style={[styles.payOption, paymentType === 'cash' && styles.payOptionActive]} 
                onPress={() => setPaymentType('cash')}
              >
                <Text style={[styles.payOptionText, paymentType === 'cash' && styles.payOptionTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.payOption, 
                  paymentType === 'gcash' && styles.payOptionActive,
                  !businessSettings.gcashQrUri && { opacity: 0.5 }
                ]} 
                onPress={() => handlePaymentTypeChange('gcash')}
              >
                <Text style={[styles.payOptionText, paymentType === 'gcash' && styles.payOptionTextActive]}>GCash</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.payButton} onPress={() => setCheckoutModalVisible(true)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.payButtonText}>Pay ₱{total.toFixed(0)}</Text>
                <ChevronRight size={20} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Floating Scan Button */}
      <TouchableOpacity 
        style={[
          styles.scanFAB, 
          cart.length > 0 && { bottom: 180 } // Lift it up when cart is visible
        ]} 
        onPress={startScanning}
      >
        <QrCode size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Manual Qty Modal (Cross-platform) */}
      <Modal visible={qtyModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.qtyModalContent}>
            <Text style={styles.qtyModalTitle}>Set Quantity</Text>
            <Text style={styles.qtyModalSub}>{editingItem?.productName}</Text>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              value={tempQty}
              onChangeText={setTempQty}
              autoFocus
              placeholder="0"
              placeholderTextColor={Theme.colors.outlineVariant}
            />
            <View style={styles.qtyModalBtns}>
              <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]} onPress={() => setQtyModalVisible(false)}>
                <Text style={styles.qtyBtnTextCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.qtyBtn, { backgroundColor: Theme.colors.primary }]} onPress={confirmManualQty}>
                <Text style={styles.qtyBtnTextConfirm}>Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Checkout Summary Modal */}
      <Modal visible={checkoutModalVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <View style={styles.checkoutModalContent}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Complete Sale</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
            </View>

            <View style={styles.paymentSummary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>₱{total.toLocaleString()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payment Method</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{paymentType.toUpperCase()}</Text>
                </View>
              </View>
            </View>

            {paymentType === 'gcash' && (
              <View style={styles.qrContainer}>
                {businessSettings.gcashQrUri ? (
                  <Image source={{ uri: businessSettings.gcashQrUri }} style={styles.qrImage} />
                ) : (
                  <View style={styles.noQrPlaceholder}>
                    <CreditCard size={48} color={Theme.colors.outlineVariant} />
                    <Text style={styles.noQrText}>No QR Set in Summary</Text>
                  </View>
                )}
                <Text style={styles.qrHint}>Ask customer to scan to pay</Text>
              </View>
            )}

            <TouchableOpacity style={styles.confirmCheckoutBtn} onPress={handleCheckout}>
              <CheckCircle2 size={24} color="#FFF" style={{ marginRight: 8 }} />
              <Text style={styles.confirmCheckoutText}>Confirm Payment</Text>
            </TouchableOpacity>

            <View style={styles.utangSeparator}>
              <View style={styles.utangLine} />
              <Text style={styles.utangSepText}>OR</Text>
              <View style={styles.utangLine} />
            </View>

            <TouchableOpacity 
              style={styles.utangCheckoutBtn} 
              onPress={() => setUtangModalVisible(true)}
            >
              <ReceiptText size={20} color={Theme.colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.utangCheckoutText}>Charge to Utang (Credit)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Utang Customer Name Modal */}
      <Modal visible={utangModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.utangPromptCard}>
            <Text style={styles.utangPromptTitle}>Customer Name</Text>
            <Text style={styles.utangPromptSub}>Who is this debt for?</Text>
            <TextInput
              style={styles.utangInput}
              placeholder="Enter name..."
              value={customerName}
              onChangeText={setCustomerName}
              autoFocus
            />
            <View style={styles.utangPromptButtons}>
              <TouchableOpacity 
                style={styles.utangCancelBtn} 
                onPress={() => setUtangModalVisible(false)}
              >
                <Text style={styles.utangCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.utangConfirmBtn} 
                onPress={handleUtangCheckout}
              >
                <Text style={styles.utangConfirmText}>Create Utang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Welcome Modal */}
      <Modal visible={showWelcome} transparent animationType="slide">
        <View style={styles.welcomeOverlay}>
          <View style={styles.welcomeCard}>
            <Rocket size={64} color={Theme.colors.primary} style={{ marginBottom: 20 }} />
            <Text style={styles.welcomeTitle}>Welcome to TindaDone!</Text>
            <Text style={styles.welcomeDesc}>Your store is ready to go. You can start adding items or making sales right away!</Text>
            <TouchableOpacity 
              style={styles.welcomeBtn} 
              onPress={async () => {
                await markWelcomeAsSeen();
                setShowWelcome(false);
              }}
            >
              <Text style={styles.welcomeBtnText}>Let's Go!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Rapid-Fire Scanner Mode HUD */}
      <Modal visible={isScanningMode} animationType="slide">
        <SafeAreaView style={styles.scannerHUDContainer}>
          <View style={styles.scannerHUDHeader}>
            <Text style={styles.scannerHUDTitle}>Rapid-Fire Scanner</Text>
            <TouchableOpacity onPress={() => setIsScanningMode(false)} style={styles.closeHUDButton}>
              <X size={28} color={Theme.colors.onSurface} />
            </TouchableOpacity>
          </View>

          <View style={styles.cameraFrame}>
            <CameraView 
              style={styles.cameraViewHUD} 
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
              }}
            />
            {scanStatus && (
              <Animated.View entering={FadeInDown} style={styles.scanToast}>
                <CheckCircle2 size={16} color="#FFF" />
                <Text style={styles.scanToastText}>{scanStatus}</Text>
              </Animated.View>
            )}
            <View style={styles.scannerCrosshair} />
            <Text style={styles.lightingHintFloating}>Tip: Use good lighting for faster scanning</Text>
          </View>

          <View style={styles.miniCartContainer}>
            <View style={styles.miniCartHeader}>
               <Text style={styles.miniCartTitle}>Recent Scans ({cart.length})</Text>
               <Text style={styles.miniCartTotal}>₱{total.toFixed(0)}</Text>
            </View>
            
            <FlatList
              data={[...cart].reverse()}
              keyExtractor={(item) => item.productId}
              renderItem={({ item }) => (
                <View key={item.productId} style={styles.cartItem}>
                  <View style={styles.cartItemMain}>
                    <Text style={styles.cartItemName} numberOfLines={1}>{item.productName}</Text>
                    <View style={styles.cartItemPriceRow}>
                      <Text style={styles.cartItemPrice}>₱{(item.priceAtSale * item.qty).toFixed(0)}</Text>
                      {item.qty > 1 && (
                         <Text style={styles.cartItemUnit}>₱{item.priceAtSale.toFixed(0)} / {item.isPack ? 'pack' : 'pc'}</Text>
                      )}
                    </View>
                  </View>

                  {/* Pack/Piece Toggle */}
                  <TouchableOpacity 
                    style={[styles.unitToggle, item.isPack && styles.unitTogglePack]}
                    onPress={() => toggleItemPack(item.productId)}
                  >
                    <Text style={[styles.unitToggleText, item.isPack && styles.unitToggleTextActive]}>
                      {item.isPack ? 'PACK' : 'PC'}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.miniControls}>
                    <TouchableOpacity onPress={() => updateQty(item.productId, -1)}>
                      <Minus size={20} color={Theme.colors.primary} />
                    </TouchableOpacity>
                    <Text style={styles.miniItemQty}>{item.qty}</Text>
                    <TouchableOpacity onPress={() => updateQty(item.productId, 1)}>
                      <Plus size={20} color={Theme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyHUDCart}>
                  <QrCode size={40} color={Theme.colors.outlineVariant} />
                  <Text style={styles.emptyHUDText}>Scan a barcode to start</Text>
                </View>
              }
            />

            {cart.length > 0 && (
              <TouchableOpacity style={styles.hudCheckoutBtn} onPress={() => setIsScanningMode(false)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.hudCheckoutText}>Done Scanning</Text>
                  <ChevronRight size={20} color="#FFF" />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
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
    position: 'relative',
  },
  trialBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.primary,
    paddingVertical: 6,
    gap: 8,
  },
  trialBannerText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: '#FFF',
  },
  searchSection: {
    padding: 12,
    paddingBottom: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 48,
  },
  categoriesSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Theme.colors.surfaceContainerHighest,
    borderRadius: 16,
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: Theme.colors.primary,
  },
  catChipText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 13,
  },
  catChipTextActive: {
    color: '#FFF',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  productList: {
    padding: 8,
    paddingBottom: 220,
  },
  productCard: {
    width: (width - 16) / 2 - 12,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    margin: 6,
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  productImageContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  letterPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.colors.secondaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.onSecondaryContainer,
    fontSize: 24,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontFamily: Theme.typography.headline,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  productPrice: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 16,
    color: Theme.colors.primary,
    marginVertical: 2,
  },
  productStock: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.outline,
  },
  addButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: Theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartPanel: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  clearAllText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.tertiary,
  },
  cartScroll: {
    marginBottom: 12,
    overflow: 'visible',
  },
  cartChip: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginTop: 6, 
  },
  cartChipName: {
    color: '#FFF',
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    marginRight: 8,
    maxWidth: 100,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qtyText: {
    color: '#FFF',
    fontFamily: Theme.typography.headlineBlack,
    marginHorizontal: 8,
    fontSize: 13,
  },
  removeChipBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFF',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  checkoutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentToggle: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 4,
  },
  payOption: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  payOptionActive: {
    backgroundColor: Theme.colors.primary,
  },
  payOptionText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.outline,
  },
  payOptionTextActive: {
    color: '#FFF',
  },
  payButton: {
    flex: 1.5,
    backgroundColor: Theme.colors.primary,
    height: 52,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  payButtonText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
    marginTop: -2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  qtyModalContent: {
    backgroundColor: Theme.colors.surface,
    width: '85%',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
  },
  qtyModalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    marginBottom: 4,
    color: Theme.colors.onSurface,
  },
  qtyModalSub: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.onSurfaceVariant,
    marginBottom: 20,
  },
  qtyInput: {
    width: '100%',
    height: 60,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 32,
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.primary,
    marginBottom: 20,
  },
  qtyModalBtns: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cartItem: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginTop: 6,
  },
  cartItemMain: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    color: '#FFF',
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
  },
  cartItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cartItemPrice: {
    color: '#FFF',
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 11,
  },
  cartItemUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 9,
  },
  unitToggle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  unitTogglePack: {
    backgroundColor: '#FFF',
  },
  unitToggleText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: '#FFF',
  },
  unitToggleTextActive: {
    color: Theme.colors.primary,
  },
  qtyBtn: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnTextCancel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurfaceVariant,
  },
  qtyBtnTextConfirm: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
  checkoutModalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    padding: 24,
    maxHeight: '90%',
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dialogTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
  },
  paymentSummary: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
    fontSize: 13,
  },
  totalValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.primary,
  },
  badge: {
    backgroundColor: Theme.colors.primaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 12,
  },
  qrContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: 16,
    marginBottom: 12,
  },
  // Welcome & Setup Styles
  welcomeOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    padding: 24,
    alignItems: 'center',
  },
  welcomeCard: {
    backgroundColor: '#FFF',
    borderRadius: 40,
    padding: 40,
    alignItems: 'center',
    width: '100%',
  },
  welcomeTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    textAlign: 'center',
    color: Theme.colors.onSurface,
  },
  welcomeDesc: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    textAlign: 'center',
    color: Theme.colors.outline,
    marginTop: 12,
    marginBottom: 32,
  },
  welcomeBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 20,
    width: '100%',
    alignItems: 'center',
  },
  welcomeBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 16,
  },
  setupCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 24,
    width: '90%',
  },
  setupLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
    color: Theme.colors.outline,
    marginBottom: 8,
    marginTop: 16,
  },
  setupInput: {
    width: '100%',
    height: 56,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.onSurface,
    marginBottom: 24,
  },
  noQrPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  noQrText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    marginTop: 8,
  },
  qrHint: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 12,
  },
  confirmCheckoutBtn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmCheckoutText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 18,
  },
  // Shortcuts Style
  topProductsSection: {
    paddingVertical: 12,
    paddingLeft: 16,
    backgroundColor: Theme.colors.background,
  },
  topProductsScroll: {
    paddingRight: 16,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.primary,
    letterSpacing: 1.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  shortcutCard: {
    width: 64,
    alignItems: 'center',
  },
  shortcutIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  shortcutPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.colors.secondaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shortcutImage: {
    width: '100%',
    height: '100%',
  },
  shortcutLetter: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSecondaryContainer,
  },
  shortcutLabel: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 10,
    color: Theme.colors.onSurface,
    textAlign: 'center',
  },
  // Scanner HUD Styles
  scanToggleBtn: {
    padding: 8,
    marginLeft: 4,
  },
  scanFAB: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    backgroundColor: Theme.colors.primary,
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 100,
  },
  scannerHUDContainer: {
    flex: 1,
    backgroundColor: Theme.colors.surface,
  },
  scannerHUDHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: Platform.OS === 'android' ? 50 : 50,
    backgroundColor: Theme.colors.surface,
  },
  scannerHUDTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
  },
  closeHUDButton: {
    padding: 4,
  },
  cameraFrame: {
    width: '100%',
    height: 250,
    backgroundColor: '#000',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraViewHUD: {
    width: '100%',
    height: '100%',
  },
  scannerCrosshair: {
    position: 'absolute',
    width: 200,
    height: 100,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scanToast: {
    position: 'absolute',
    top: 20,
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    elevation: 10,
  },
  scanToastText: {
    color: '#FFF',
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
  },
  miniCartContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    padding: 20,
  },
  miniCartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  miniCartTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.outline,
  },
  miniCartTotal: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.primary,
  },
  miniCartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '30',
  },
  miniItemName: {
    flex: 1,
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
    color: Theme.colors.onSurface,
  },
  miniControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniItemQty: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 14,
    color: Theme.colors.onSurface,
    minWidth: 20,
    textAlign: 'center',
  },
  emptyHUDCart: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    opacity: 0.5,
  },
  emptyHUDText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 16,
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
  hudCheckoutBtn: {
    backgroundColor: Theme.colors.primary,
    height: 56,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  hudCheckoutText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
  },
  lightingHintFloating: {
    position: 'absolute',
    bottom: 20,
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
    fontSize: 12,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  utangSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  utangLine: {
    flex: 1,
    height: 1,
    backgroundColor: Theme.colors.outlineVariant,
    opacity: 0.3,
  },
  utangSepText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.outline,
  },
  utangCheckoutBtn: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  utangCheckoutText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 16,
  },
  utangPromptCard: {
    width: '90%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  utangPromptTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    textAlign: 'center',
  },
  utangPromptSub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 14,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 20,
  },
  utangInput: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    height: 56,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    color: Theme.colors.onSurface,
    marginBottom: 24,
  },
  utangPromptButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  utangCancelBtn: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  utangCancelText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
  },
  utangConfirmBtn: {
    flex: 1,
    height: 50,
    backgroundColor: Theme.colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  utangConfirmText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
});
