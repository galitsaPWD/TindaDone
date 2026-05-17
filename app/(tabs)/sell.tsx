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
  Vibration,
  LayoutAnimation
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ArrowRightLeft,
  ShoppingBag,
  Settings
} from 'lucide-react-native';
import Animated, { 
  SlideInDown, 
  SlideOutDown, 
  FadeInDown, 
  FadeOutDown,
  FadeIn,
  FadeOut,
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from 'react-native-reanimated';
import DraggableFlatList, { ScaleDecorator, OpacityDecorator, ShadowDecorator } from 'react-native-draggable-flatlist';
import { useRouter, useFocusEffect } from 'expo-router';
import { getTransactions, getProducts, saveTransaction, hasSeenWelcome, markWelcomeAsSeen, saveBusinessSettings, addUtangRecord, getUtangRecords, DEFAULT_CATEGORIES } from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { Product, TransactionItem, BusinessSettings, UtangRecord } from '../../lib/types';
import { getTopSoldProducts } from '../../lib/calculations';
import { getTrialStatus, isActivated, syncTrialWithServer, TrialStatus } from '../../lib/license';
import { Theme } from '../../constants/Theme';
import { useTintin } from '../../context/TintinContext';

import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width } = Dimensions.get('window');

const DraggableCategoryChip = ({ item, drag, isActive, isDraggingGlobal, activeCategory, setActiveCategory }: any) => {
  const rotateVal = useSharedValue(0);

  useEffect(() => {
    if (isDraggingGlobal && !isActive && item !== 'All') {
      rotateVal.value = withRepeat(
        withSequence(withTiming(-2, { duration: 100 }), withTiming(2, { duration: 100 })),
        -1,
        true
      );
    } else {
      rotateVal.value = withTiming(0, { duration: 150 });
    }
  }, [isDraggingGlobal, isActive, item]);

  const jiggleStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateVal.value}deg` }]
    };
  });

  return (
    <ShadowDecorator>
      <OpacityDecorator activeOpacity={0.8}>
        <ScaleDecorator activeScale={1.05}>
          <Animated.View style={jiggleStyle}>
            <TouchableOpacity 
              style={[
                styles.catChip, 
                activeCategory === item && styles.catChipActive, 
                // @ts-ignore
                Platform.OS === 'web' && { cursor: isActive ? 'grabbing' : 'grab', touchAction: 'none' }
              ]}
              onPress={() => setActiveCategory(item)}
              onLongPress={drag}
              delayLongPress={300}
            >
              <Text style={[styles.catChipText, activeCategory === item && styles.catChipTextActive]}>{item}</Text>
            </TouchableOpacity>
          </Animated.View>
        </ScaleDecorator>
      </OpacityDecorator>
    </ShadowDecorator>
  );
};

export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { businessSettings, updateSettings, setIsSettingsOpen } = useSettings();
  const tintin = useTintin();
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
  const [isCartPeeking, setIsCartPeeking] = useState(false);
  
  // Welcome & Settings
  const [showWelcome, setShowWelcome] = useState(false);
  const [storeName, setStoreName] = useState('');
  
  // Custom categories state for drag-and-drop
  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);
  const categories = businessSettings.customCategories || DEFAULT_CATEGORIES;
  const [localCategories, setLocalCategories] = useState(categories);
  
  useEffect(() => {
    setLocalCategories(categories);
  }, [businessSettings.customCategories, categories]);
  
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
    const active = await isActivated();
    setActivated(active);
    
    // HYBRID SYNC: Silent check with server in background
    await syncTrialWithServer();
    
    const status = await getTrialStatus();
    setTrial(status);
    
    if (!active && status.expired) {
      router.replace('/activate');
    }
  };

  useEffect(() => {
    const checkEOD = () => {
      const hours = new Date().getHours();
      if (hours >= 18) { // 6 PM
        tintin.say("It's been a busy day! Ready to generate your Daily Performance report?", 'info');
      }
    };
    checkEOD();
  }, []);

  useEffect(() => {
    let filtered = products;

    if (activeCategory !== 'All') {
      filtered = filtered.filter(p => {
        const itemCat = p.category || 'Others';
        if (itemCat === activeCategory) return true;
        return itemCat.toLowerCase().startsWith('other') && activeCategory.toLowerCase().startsWith('other');
      });
    }

    if (search !== '') {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) || 
        (p.category || 'Others').toLowerCase().includes(search.toLowerCase())
      );
    }
    
    setFilteredProducts(filtered);
  }, [search, products, activeCategory]);


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
      tintin.say(`Note: "${product.name}" is out of stock.`, 'warning');
    } else if (product.stock <= 5) {
      tintin.say(`Sales are spiking for ${product.name}! It might sell out soon.`, 'info');
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        // Stock Intelligence check
        if (existing.qty + 1 > product.stock) {
          tintin.say(`Only ${product.stock} ${product.name} left!`, 'warning');
          return prev;
        }
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
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
       LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    }
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
      tintin.say(`Added ${product.name}!`, 'success');
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
        const product = products.find(p => p.id === productId);
        const newQty = Math.max(0, item.qty + delta);
        
        // Stock Intelligence check
        if (delta > 0 && product && newQty > product.stock) {
          tintin.say(`Limit reached: ${product.stock} in stock.`, 'warning');
          return item;
        }
        
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
    
    const itemsWithCost = cart.map(item => {
      const p = products.find(prod => prod.id === item.productId);
      const baseCost = p?.costPrice || 0;
      const packCost = p?.costPerPack ? parseFloat(p.costPerPack.toString()) : (baseCost * (p?.piecesPerPack || 1));
      
      return {
        ...item,
        costPriceAtSale: item.isPack ? packCost : baseCost
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
      
      // Feature 4: Boutique Compliments
      if (total > 2000) {
        tintin.say(`Wow, a ₱${total.toFixed(0)} sale! Your shop is on fire today! 🔥`, 'success');
      } else {
        tintin.say('Sale Complete!', 'success');
      }
      
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
      const packCost = p?.costPerPack ? parseFloat(p.costPerPack.toString()) : (baseCost * (p?.piecesPerPack || 1));
      
      return {
        ...item,
        costPriceAtSale: item.isPack ? packCost : baseCost
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
      // Feature 3: Debt Awareness (Fetch existing debts for this customer)
      const allUtang = await getUtangRecords();
      const existingDebt = allUtang
        .filter(r => r.customerName.toLowerCase() === customerName.trim().toLowerCase() && !r.isPaid)
        .reduce((sum, r) => sum + r.amount, 0);

      await addUtangRecord(utangRecord);
      setCart([]);
      setUtangModalVisible(false);
      setCheckoutModalVisible(false);
      setCustomerName('');
      
      if (existingDebt > 0) {
        tintin.say(`Charged ₱${total.toFixed(0)}. Heads up! ${customerName.trim()} now has ₱${(existingDebt + total).toFixed(0)} in total unpaid debts.`, 'warning');
      } else {
        showAlert('Success', `Charged ₱${total.toFixed(0)} to ${customerName.trim()}'s Utang.`, 'success');
      }
      
      loadProducts(); // Refresh stocks for sold items
    } catch (e: any) {
      showAlert('Unable to Create Utang', e.message || 'Failed to save Utang record.', 'error');
    }
  };

  const renderProduct = ({ item, index }: { item: Product, index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 30).springify()} style={{ flex: 1 }}>
      <TouchableOpacity 
        style={[styles.productCard, item.stock <= 0 && styles.productCardDisabled]} 
        onPress={() => addToCart(item)}
        activeOpacity={0.8}
      >
        <View style={styles.productImageContainer}>
          {item.photoUri ? (
            <Image source={{ uri: item.photoUri }} style={styles.productImage} />
          ) : (
            <View style={styles.letterPlaceholder}>
              <Text style={styles.letterText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {item.stock <= 5 && item.stock > 0 && (
            <View style={styles.lowStockBadge}>
              <AlertTriangle size={8} color="#FFF" />
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.productFooter}>
            <Text style={styles.productPrice}>₱{item.price.toLocaleString()}</Text>
            <View style={styles.quickAddBtn}>
              <Plus size={12} color="#FFF" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.boutiqueHeader}>
        <View>
          <Text style={styles.boutiqueTitle}>Terminal</Text>
          <Text style={styles.boutiqueSubtitle}>Point of Sale</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsHeaderBtn} 
          onPress={() => setIsSettingsOpen(true)}
        >
          <Settings size={22} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>
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
      {categories.length > 0 && (
        <View style={styles.categoriesSection}>
          <DraggableFlatList
            horizontal
            activationDistance={15}
            showsHorizontalScrollIndicator={false}
            data={localCategories}
            onDragBegin={() => setIsDraggingGlobal(true)}
            onDragEnd={({ data }) => {
              setIsDraggingGlobal(false);
              setLocalCategories(data);
              // Defer global state update to prevent JS thread blocking during the drop animation
              setTimeout(() => {
                updateSettings({ ...businessSettings, customCategories: data });
              }, 300);
            }}
            keyExtractor={(item) => item}
            ListHeaderComponent={
              <TouchableOpacity 
                style={[styles.catChip, activeCategory === 'All' && styles.catChipActive]}
                onPress={() => setActiveCategory('All')}
              >
                <Text style={[styles.catChipText, activeCategory === 'All' && styles.catChipTextActive]}>All</Text>
              </TouchableOpacity>
            }
            renderItem={({ item, drag, isActive }) => (
              <DraggableCategoryChip
                item={item}
                drag={drag}
                isActive={isActive}
                isDraggingGlobal={isDraggingGlobal}
                activeCategory={activeCategory}
                setActiveCategory={setActiveCategory}
              />
            )}
            contentContainerStyle={{ paddingVertical: 16, overflow: 'visible' }}
            containerStyle={{ overflow: 'visible' }}
          />
        </View>
      )}

      {/* Sticky Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputContainer}>
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
          <View style={styles.emptyStateContainer}>
            {products.length === 0 ? (
              <>
                <View style={styles.emptyIconCircle}>
                  <Store size={48} color={Theme.colors.primary} />
                </View>
                <Text style={styles.emptyStateTitle}>Your shop is empty!</Text>
                <Text style={styles.emptyStateSub}>Head over to the Inventory tab to start adding your items.</Text>
                <TouchableOpacity 
                  style={styles.emptyStateBtn}
                  onPress={() => router.push({ pathname: '/(tabs)/products', params: { action: 'add' } })}
                >
                  <Text style={styles.emptyStateBtnText}>Add First Product</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.emptyIconCircle, { backgroundColor: Theme.colors.surfaceContainerHigh }]}>
                  <Search size={48} color={Theme.colors.outline} />
                </View>
                <Text style={styles.emptyStateTitle}>No items found</Text>
                <Text style={styles.emptyStateSub}>We couldn't find any products matching your search.</Text>
              </>
            )}
          </View>
        }
      />

      {cart.length > 0 && (
        <Animated.View 
          entering={FadeInDown.springify()} 
          exiting={FadeOutDown} 
          style={styles.floatingCartContainer}
        >
          {/* Thought Bubble Peek Extension */}
          {isCartPeeking && (
            <Animated.View 
              entering={ZoomIn.duration(200)}
              exiting={ZoomOut.duration(150)}
              style={styles.cartPeekExtension}
            >
              <View style={styles.peekBubbleContainer}>
                <View style={styles.peekShadowWrapper}>
                  <BlurView intensity={95} tint="light" style={styles.peekBlur}>
                    <Text style={styles.peekTitle}>Quick Review</Text>
                    <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                      {cart.map((item) => (
                        <View key={item.productId} style={styles.peekItem}>
                          <Text style={styles.peekItemName} numberOfLines={1}>{item.productName}</Text>
                          <Text style={styles.peekItemQty}>×{item.qty}</Text>
                        </View>
                      ))}
                    </ScrollView>
                  </BlurView>
                </View>
                {/* Speech Bubble Tail */}
                <View style={styles.peekTail} />
              </View>
            </Animated.View>
          )}

          <TouchableOpacity 
            style={styles.floatingCartPill}
            onPress={() => setCheckoutModalVisible(true)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setIsCartPeeking(true);
            }}
            onPressOut={() => {
              if (isCartPeeking) {
                setIsCartPeeking(false);
              }
            }}
            activeOpacity={0.9}
          >
            <View style={styles.pillLeft}>
              <View style={styles.itemCountBadge}>
                <Text style={styles.itemCountText}>{cart.reduce((sum, item) => sum + item.qty, 0)}</Text>
              </View>
              <Text style={styles.pillLabel}>{cart.reduce((sum, item) => sum + item.qty, 0) === 1 ? 'Item' : 'Items'} Selected</Text>
            </View>
            <View style={styles.pillRight}>
              <Text style={styles.pillTotal}>₱{total.toLocaleString()}</Text>
              <View style={styles.pillAction}>
                <ShoppingBag size={20} color="#FFF" />
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Floating Scan Button */}
      <TouchableOpacity 
        style={[
          styles.scanFAB, 
          cart.length > 0 && { bottom: 210 } // Lift it up when cart is visible
        ]} 
        onPress={startScanning}
      >
        <QrCode size={30} color="#FFF" />
      </TouchableOpacity>

      {/* Manual Qty Modal (Cross-platform) */}
      <Modal visible={qtyModalVisible} transparent animationType="slide" onRequestClose={() => setQtyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.qtyModalContent}>
            <Text style={styles.qtyModalTitle}>Set Quantity</Text>
            <Text style={styles.qtyModalSub}>{editingItem?.productName}</Text>
            <TextInput
              style={styles.qtyInput}
              keyboardType="numeric"
              value={tempQty}
              onChangeText={(t) => setTempQty(t.replace(/[^0-9]/g, ''))}
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
      <Modal visible={checkoutModalVisible} transparent animationType="slide" onRequestClose={() => setCheckoutModalVisible(false)}>
        <View style={styles.sheetOverlay}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.checkoutModalContent}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Complete Sale</Text>
              <TouchableOpacity onPress={() => setCheckoutModalVisible(false)}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
            </View>

            <View style={styles.cartReviewSection}>
              <View style={styles.cartHeader}>
                <View style={styles.cartTitleRow}>
                  <ShoppingBag size={18} color={Theme.colors.primary} />
                  <Text style={styles.cartTitle}>Cart Items</Text>
                </View>
                <TouchableOpacity onPress={() => setCart([])}>
                  <Text style={styles.clearAllText}>Clear All</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.cartScroll}
                contentContainerStyle={{ paddingBottom: 10 }}
              >
                {cart.map((item) => (
                  <View key={item.productId} style={styles.cartChip}>
                    <Text style={styles.cartChipName} numberOfLines={1}>{item.productName}</Text>
                    <View style={styles.qtyControls}>
                      <TouchableOpacity onPress={() => updateQty(item.productId, -1)}>
                        <Minus size={14} color="#FFF" strokeWidth={3} />
                      </TouchableOpacity>
                      <Text style={styles.qtyText}>{item.qty}</Text>
                      <TouchableOpacity onPress={() => updateQty(item.productId, 1)}>
                        <Plus size={14} color="#FFF" strokeWidth={3} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity 
                      style={styles.removeChipBtn} 
                      onPress={() => removeFromCart(item.productId)}
                    >
                      <X size={12} color={Theme.colors.tertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Payment Method Toggle */}
              <View style={styles.paymentToggle}>
                <TouchableOpacity 
                  style={[styles.payOption, paymentType === 'cash' && styles.payOptionActive]}
                  onPress={() => handlePaymentTypeChange('cash')}
                >
                  <Text style={[styles.payOptionText, paymentType === 'cash' && styles.payOptionTextActive]}>Cash</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.payOption, paymentType === 'gcash' && styles.payOptionActive]}
                  onPress={() => handlePaymentTypeChange('gcash')}
                >
                  <Text style={[styles.payOptionText, paymentType === 'gcash' && styles.payOptionTextActive]}>GCash</Text>
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

            <TouchableOpacity 
              style={styles.confirmCheckoutBtn} 
              onPress={() => showAlert(
                'Confirm Sale', 
                `Proceed with ₱${total.toLocaleString()} payment?`, 
                'info', 
                handleCheckout, 
                true, 
                'Process Sale'
              )}
            >
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
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Utang Customer Name Modal */}
      <Modal visible={utangModalVisible} transparent animationType="fade" onRequestClose={() => setUtangModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
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
                onPress={() => {
                  if (!customerName.trim()) {
                    showAlert('Required', 'Please enter customer name', 'warning');
                    return;
                  }
                  showAlert(
                    'Confirm Utang', 
                    `Charge ₱${total.toLocaleString()} to ${customerName}?`, 
                    'warning', 
                    handleUtangCheckout, 
                    true, 
                    'Charge Account'
                  );
                }}
              >
                <Text style={styles.utangConfirmText}>Create Utang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Welcome Modal */}
      <Modal visible={showWelcome} transparent animationType="slide" onRequestClose={() => setShowWelcome(false)}>
        <View style={styles.welcomeOverlay}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.welcomeCard}>
            <Rocket size={64} color={Theme.colors.primary} style={{ marginBottom: 20 }} />
            <Text style={styles.welcomeTitle}>Welcome to TindaDone!</Text>
            <Text style={styles.welcomeDesc}>Your store is ready to go. You can start adding items or making sales right away!</Text>
            <TouchableOpacity 
              style={styles.welcomeBtn} 
              onPress={() => {
                setShowWelcome(false);
                markWelcomeAsSeen();
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
          <View style={[styles.scannerHUDHeader, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 50 : 40) }]}>
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
  floatingCartContainer: {
    position: 'absolute',
    bottom: 120, // Clearly above the floating tab bar
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 100,
  },
  floatingCartPill: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.primary, // Premium Boutique Green
    width: '100%',
    height: 72,
    borderRadius: 36,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  pillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
  },
  itemCountBadge: {
    backgroundColor: Theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemCountText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
  },
  pillLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 14,
    opacity: 0.9,
  },
  pillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: 56,
    borderRadius: 28,
    paddingLeft: 20,
    paddingRight: 6,
  },
  pillTotal: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 20,
  },
  pillAction: {
    backgroundColor: Theme.colors.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 26,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 16,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  categoriesSection: {
    backgroundColor: Theme.colors.background,
  },
  catChip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    marginRight: 10,
    marginLeft: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  catChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  catChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  catChipTextActive: {
    color: '#FFF',
  },
  productList: {
    padding: 12,
    paddingBottom: 140,
  },
  // Compact Grid Product Cards
  productCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 6,
    margin: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    width: (width - 40) / 2,
  },
  productCardDisabled: {
    opacity: 0.4,
  },
  productImageContainer: {
    width: '100%',
    aspectRatio: 1.2,
    borderRadius: 18,
    backgroundColor: Theme.colors.surfaceContainerLow,
    marginBottom: 6,
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  letterPlaceholder: {
    flex: 1,
    backgroundColor: Theme.colors.secondaryContainer + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  letterText: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.primary,
    fontSize: 28,
    opacity: 0.25,
  },
  lowStockBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Theme.colors.tertiary,
    width: 20,
    height: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: {
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  productName: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 13,
    color: Theme.colors.onSurface,
    marginBottom: 4,
  },
  productFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productPrice: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 15,
    color: Theme.colors.primary,
  },
  quickAddBtn: {
    backgroundColor: Theme.colors.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },

  addButton: {
    backgroundColor: Theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 120,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    zIndex: 99,
  },
  cartPanel: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 32,
    padding: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  checkoutModalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    padding: 24,
    paddingBottom: 40,
    height: Dimensions.get('window').height * 0.85,
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
  cartReviewSection: {
    marginBottom: 20,
    marginTop: -10,
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
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    marginTop: 8,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  cartChipName: {
    color: '#FFF',
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
    marginRight: 12,
    maxWidth: 120,
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  qtyText: {
    color: '#FFF',
    fontFamily: Theme.typography.headlineBlack,
    marginHorizontal: 10,
    fontSize: 14,
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
    height: 56,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  payButtonText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 18,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20, // Circular Pill
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  unitTogglePack: {
    backgroundColor: '#FFF',
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  unitToggleText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 9,
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.5,
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
  paymentSummary: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 28,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 14,
  },
  totalValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 32,
    color: Theme.colors.primary,
    letterSpacing: -1,
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
    width: 72,
    alignItems: 'center',
    marginRight: 8,
  },
  shortcutIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  shortcutPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shortcutImage: {
    width: '100%',
    height: '100%',
  },
  shortcutLetter: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.primary,
  },
  shortcutLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.onSurface,
    textAlign: 'center',
    marginTop: 2,
  },
  // Scanner HUD Styles
  scanToggleBtn: {
    padding: 8,
    marginLeft: 4,
  },
  scanFAB: {
    position: 'absolute',
    bottom: 110, // Clearly above floating tab bar
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
    backgroundColor: Theme.colors.surfaceContainerHigh, // Darker Obsidian Tint
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
    fontSize: 20,
    color: Theme.colors.primary, // Back to Emerald/Primary for visibility
    minWidth: 30,
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
    backgroundColor: 'rgba(255,255,255,0.92)', // Crystal Glass
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
    borderRadius: 28, // Pill shape
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  alertActionRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
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
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  utangCheckoutText: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.primary,
    fontSize: 16,
    letterSpacing: 0.5,
  },
  utangPromptCard: {
    width: '90%',
    backgroundColor: 'rgba(255,255,255,0.95)', // Glassy prompt
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
  // Empty States
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 80,
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
  emptyStateTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.outline,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  emptyStateBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 14,
  },
  cartPeekExtension: {
    position: 'absolute',
    bottom: 85, // Lifted slightly for the tail
    left: 20,
    right: 40,
    alignItems: 'flex-start',
    zIndex: 100, // Show above for smoothness
  },
  peekBubbleContainer: {
    alignItems: 'flex-start',
  },
  peekShadowWrapper: {
    borderRadius: 20,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
    elevation: 10,
  },
  peekBlur: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 20,
    padding: 12,
    width: 220,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden', // Force perfect corners
  },
  peekTail: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(255,255,255,0.98)',
    marginLeft: 24, // Position the tail
  },
  peekTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  peekItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  peekItemName: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 14,
    color: Theme.colors.onSurface,
    flex: 1,
  },
  peekItemQty: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 14,
    color: Theme.colors.primary,
    marginLeft: 12,
  },
});
