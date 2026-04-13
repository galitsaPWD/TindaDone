import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  Modal, 
  StyleSheet, 
  Alert,
  Image,
  Dimensions,
  ScrollView,
  InteractionManager,
  Platform,
  ActionSheetIOS,
  Vibration
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { 
  Search, 
  Plus, 
  AlertTriangle, 
  Package, 
  ChevronRight, 
  Camera, 
  X,
  ChevronLeft,
  Zap,
  TrendingUp,
  CheckCircle2,
  Info,
  Tag
} from 'lucide-react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { getProducts, addProduct, CATEGORIES } from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { Product, BusinessSettings } from '../../lib/types';
import { Theme } from '../../constants/Theme';

const { width, height } = Dimensions.get('window');

export default function ProductsScreen() {
  const router = useRouter();
  const { filter } = useLocalSearchParams();
  const { businessSettings } = useSettings();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [isLowStockFilterExplicitlyActive, setIsLowStockFilterExplicitlyActive] = useState(false);
  
  // Add Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [category, setCategory] = useState('Others');
  const [unit, setUnit] = useState('pc');
  const [threshold, setThreshold] = useState('5');
  const [barcode, setBarcode] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [piecesPerPack, setPiecesPerPack] = useState('1');
  const [packPrice, setPackPrice] = useState('0');
  const [initialPacks, setInitialPacks] = useState('0');
  const [initialPieces, setInitialPieces] = useState('0');
  const [costPerPack, setCostPerPack] = useState('');
  const [hasManuallySetPrice, setHasManuallySetPrice] = useState(false);
  const [hasManuallySetPackPrice, setHasManuallySetPackPrice] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  
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
  
  const [permission, requestPermission] = useCameraPermissions();
  const beepSound = useRef<Audio.Sound | null>(null);

  // Stats
  const [totalValue, setTotalValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadProducts();
        loadBeep();
        if (filter === 'lowStock') {
          setIsLowStockFilterExplicitlyActive(true);
        }
      });
      return () => {
        task.cancel();
        if (beepSound.current) {
          beepSound.current.unloadAsync();
        }
      };
    }, [filter])
  );

  useEffect(() => {
    let filtered = products;

    // Apply Low Stock filter if explicitly active
    if (isLowStockFilterExplicitlyActive) {
      filtered = filtered.filter(p => p.stock <= p.lowStockThreshold);
    }

    if (search !== '') {
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase())
      );
    }
    setFilteredProducts(filtered);
    
    // Calculate stats
    const total = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
    const lowCount = products.filter(p => p.stock <= p.lowStockThreshold).length;
    setTotalValue(total);
    setLowStockCount(lowCount);
  }, [search, products, isLowStockFilterExplicitlyActive]);

  const loadProducts = async () => {
    const data = await getProducts();
    // Sanitize stale or broken URLs from previous sessions
    const sanitizedData = data.map(p => {
      // Only wipe if it's a legacy file URI that won't persist
      if (p.photoUri && !p.photoUri.startsWith('data:image') && !p.photoUri.startsWith('http')) {
        return { ...p, photoUri: undefined };
      }
      return p;
    });
    setProducts(sanitizedData);
  };

  const handlePickImage = async (useCamera: boolean = false) => {
    try {
      const permission = useCamera 
        ? await ImagePicker.requestCameraPermissionsAsync() 
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        showAlert('Permission Denied', 'We need access to your photos to add a product image.', 'warning');
        return;
      }

      const result = useCamera 
        ? await ImagePicker.launchCameraAsync({ 
            allowsEditing: true, 
            aspect: [1, 1], 
            quality: 0.3,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({ 
            allowsEditing: true, 
            aspect: [1, 1], 
            quality: 0.3,
            base64: true,
          });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        let finalUri = result.assets[0].uri;
        
        if (Platform.OS === 'web' && finalUri.startsWith('blob:')) {
          try {
            const response = await fetch(finalUri);
            const blob = await response.blob();
            finalUri = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.error('Blob conversion failed', e);
          }
        } else if (result.assets[0].base64) {
          finalUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
        }
        
        setPhotoUri(finalUri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      showAlert('Error', 'Failed to pick image', 'error');
    }
  };

  const handleSave = async () => {
    if (!name || !price || !category || !unit || !costPrice) {
      setShowErrors(true);
      showAlert('Missing Fields', 'Please fill in all boxes marked in red.', 'warning');
      return;
    }

    try {
      const multiplier = isBulkMode ? (parseInt(piecesPerPack) || 1) : 1;
      const totalInitialStock = isBulkMode 
        ? (parseInt(initialPacks) || 0) * multiplier + (parseInt(initialPieces) || 0)
        : (parseInt(initialPieces) || 0);

      const newProduct: Product = {
        id: Date.now().toString(),
        name: name.trim(),
        price: parseFloat(price),
        packPrice: isBulkMode ? (parseFloat(packPrice) || undefined) : undefined,
        piecesPerPack: multiplier,
        costPrice: costPrice ? parseFloat(costPrice) : 0,
        stock: totalInitialStock, 
        lowStockThreshold: threshold ? parseInt(threshold) : 5,
        category,
        unit: unit || 'pc',
        barcode: barcode.trim(),
        photoUri,
        createdAt: new Date().toISOString(),
      };

      await addProduct(newProduct);
      setModalVisible(false);
      resetForm();
      loadProducts();
      showAlert('Success', `${newProduct.name} registered!`, 'success');
    } catch (e) {
      showAlert('Error', 'Failed to save product. The image might be too large.', 'error');
    }
  };

  const resetForm = () => {
    setName('');
    setPrice('');
    setCostPrice('');
    setCategory('Others');
    setUnit('pc');
    setThreshold('5');
    setBarcode('');
    setPhotoUri(undefined);
    setInitialPacks('0');
    setInitialPieces('0');
    setCostPerPack('');
    setIsBulkMode(false);
    setShowErrors(false);
  };


  const getMarginInfo = (s: string, c: string) => {
    const sVal = parseFloat(s) || 0;
    const cVal = parseFloat(c) || 0;
    if (sVal <= 0 || cVal <= 0) return null;
    
    const profit = sVal - cVal;
    const margin = (profit / sVal) * 100;
    return {
      profit,
      margin: margin.toFixed(1),
      isLoss: profit < 0
    };
  };

  const getDashboardData = () => {
    const packs = parseInt(initialPacks) || 0;
    const pieces = parseInt(initialPieces) || 0;
    const multiplier = parseInt(piecesPerPack) || 1;
    const totalUnits = (packs * multiplier) + pieces;
    const uCost = parseFloat(costPrice) || 0;
    const totalInvestment = totalUnits * uCost;
    
    const uMargin = getMarginInfo(price, costPrice);
    const pMargin = getMarginInfo(packPrice, costPerPack);
    
    return {
      totalUnits,
      totalInvestment,
      uMargin,
      pMargin
    };
  };

  const updateCostFromPack = (pCost: string) => {
    setCostPerPack(pCost);
    const multiplier = parseInt(piecesPerPack) || 1;
    const costVal = parseFloat(pCost) || 0;
    if (multiplier > 0 && costVal > 0) {
      setCostPrice((costVal / multiplier).toFixed(2));
    }
  };

  const updateCostFromPiece = (unitCost: string) => {
    setCostPrice(unitCost);
    const multiplier = parseInt(piecesPerPack) || 1;
    const unitCostVal = parseFloat(unitCost) || 0;
    if (multiplier > 0 && unitCostVal > 0) {
      setCostPerPack((unitCostVal * multiplier).toFixed(2));
    }
  };

  const updatePackSize = (size: string) => {
    setPiecesPerPack(size);
    const multiplier = parseInt(size) || 1;
    const packCostVal = parseFloat(costPerPack) || 0;
    if (multiplier > 0 && packCostVal > 0) {
      setCostPrice((packCostVal / multiplier).toFixed(2));
    }
  };

  // Smart Recommendation Engine (Cost + 5)
  useEffect(() => {
    if (modalVisible && !hasManuallySetPrice) {
      const c = parseFloat(costPrice) || 0;
      if (c > 0) setPrice((c + 5).toFixed(2));
    }
  }, [costPrice, modalVisible]);

  useEffect(() => {
    if (modalVisible && !hasManuallySetPackPrice) {
      const cp = parseFloat(costPerPack) || 0;
      if (cp > 0) setPackPrice((cp + 5).toString());
    }
  }, [costPerPack, modalVisible]);

  const updatePackPriceFromPiece = (pieceVal: string) => {
    setPrice(pieceVal);
    setHasManuallySetPrice(true);
    const multiplier = parseInt(piecesPerPack) || 1;
    const piecePriceVal = parseFloat(pieceVal) || 0;
    if (multiplier > 1 && piecePriceVal > 0) {
      setPackPrice((piecePriceVal * multiplier).toString());
      setHasManuallySetPackPrice(true);
    }
  };

  const updatePiecePriceFromPack = (pPriceVal: string) => {
    setPackPrice(pPriceVal);
    setHasManuallySetPackPrice(true);
    const multiplier = parseInt(piecesPerPack) || 1;
    const pPriceValNum = parseFloat(pPriceVal) || 0;
    if (multiplier > 1 && pPriceValNum > 0) {
      setPrice((pPriceValNum / multiplier).toFixed(2));
      setHasManuallySetPrice(true);
    }
  };

  const loadBeep = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../assets/beep.mp3')
      );
      beepSound.current = sound;
    } catch (e) {}
  };

  const playBeep = async () => {
    try {
      if (businessSettings.scannerBeep !== false && beepSound.current) {
        await beepSound.current.replayAsync();
      }
      
      if (businessSettings.scannerVibrate !== false) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Vibration.vibrate(100);
      }
    } catch (e) {}
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    setBarcode(data);
    setIsScanning(false);
    playBeep();
    showAlert('Barcode Found', `Scanned: ${data}`, 'success');
  };

  const startBarcodeScan = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        showAlert('Permission Denied', 'Camera permission is required to scan barcodes.', 'warning');
        return;
      }
    }
    setIsScanning(true);
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity 
      style={styles.productCard} 
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: item.id } })}
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
        <View style={styles.productHeader}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          {item.stock <= item.lowStockThreshold && (
            <View style={styles.lowStockBadge}>
              <Text style={styles.lowStockBadgeText}>Low</Text>
            </View>
          )}
        </View>
        <Text style={styles.productMeta}>
          ₱{item.price.toFixed(0)} • {item.category || 'General'} • {item.stock} {item.unit || 'pc'}
        </Text>
      </View>
      <ChevronRight size={18} color={Theme.colors.outlineVariant} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        ListHeaderComponent={
          <>
            <View style={styles.statsContainer}>
              <View style={styles.mainStatCard}>
                <View>
                  <Text style={styles.statLabel}>Total Stock Value</Text>
                  <Text style={styles.statValue}>₱{totalValue.toLocaleString()}</Text>
                </View>
                <View style={styles.statBadges}>
                  <View style={styles.statBadge}>
                    <Text style={styles.statBadgeText}>{products.length} Items</Text>
                  </View>
                  {lowStockCount > 0 && (
                    <View style={[styles.statBadge, { backgroundColor: Theme.colors.tertiaryContainer }]}>
                      <AlertTriangle size={12} color={Theme.colors.onTertiaryContainer} style={{ marginRight: 4 }} />
                      <Text style={[styles.statBadgeText, { color: Theme.colors.onTertiaryContainer }]}>{lowStockCount} Low</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {isLowStockFilterExplicitlyActive && (
        <View style={styles.filterChipContainer}>
          <View style={styles.filterChip}>
            <AlertTriangle size={14} color={Theme.colors.tertiary} style={{ marginRight: 6 }} />
            <Text style={styles.filterChipText}>Low Stock Active</Text>
          </View>
          <TouchableOpacity 
            style={styles.clearFilterBtn} 
            onPress={() => {
              setIsLowStockFilterExplicitlyActive(false);
              router.setParams({ filter: undefined });
            }}
          >
            <Text style={styles.clearFilterText}>Show All</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchSection}>
              <View style={styles.searchBar}>
                <Search size={20} color={Theme.colors.outline} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search products or categories..."
                  placeholderTextColor={Theme.colors.outlineVariant}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
            </View>
          </>
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Package size={48} color={Theme.colors.outlineVariant} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyText}>No products found.</Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setModalVisible(true)}
      >
        <Plus size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Add Product Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Product</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color={Theme.colors.outline} />
              </TouchableOpacity>
            </View>

            {businessSettings.enableBulkMode !== false && (
              <View style={styles.typeSelector}>
                <TouchableOpacity 
                  style={[styles.typeBtn, !isBulkMode && styles.typeBtnActive]}
                  onPress={() => setIsBulkMode(false)}
                >
                  <Tag size={18} color={!isBulkMode ? '#FFF' : Theme.colors.outline} />
                  <Text style={[styles.typeBtnText, !isBulkMode && styles.typeBtnTextActive]}>Single Item</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.typeBtn, isBulkMode && styles.typeBtnActive]}
                  onPress={() => setIsBulkMode(true)}
                >
                  <Package size={18} color={isBulkMode ? '#FFF' : Theme.colors.outline} />
                  <Text style={[styles.typeBtnText, isBulkMode && styles.typeBtnTextActive]}>Bulk Packs</Text>
                </TouchableOpacity>
              </View>
            )}

            <ScrollView 
              style={styles.modalScroll} 
              contentContainerStyle={{ paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >

            <View style={styles.imagePickerSection}>
              <TouchableOpacity 
                style={styles.imageBox}
                onPress={() => {
                  if (Platform.OS === 'web') {
                    handlePickImage(false);
                  } else if (Platform.OS === 'ios') {
                    ActionSheetIOS.showActionSheetWithOptions(
                        { options: ['Cancel', 'Take Photo', 'Gallery'], cancelButtonIndex: 0 },
                        (index: number) => { if (index === 1) handlePickImage(true); if (index === 2) handlePickImage(false); }
                      );
                  } else {
                    Alert.alert('Add Photo', 'Choose source', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Camera', onPress: () => handlePickImage(true) },
                        { text: 'Gallery', onPress: () => handlePickImage(false) },
                      ]);
                  }
                }}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.pickedImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Camera size={32} color={Theme.colors.outline} />
                    <Text style={styles.imagePlaceholderText}>Add Photo</Text>
                  </View>
                )}
                {/* Visual camera shortcut button */}
                <TouchableOpacity 
                  style={styles.cameraBadgeFloating}
                  onPress={() => handlePickImage(true)}
                >
                  <Camera size={16} color="#FFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

             <Text style={styles.inputLabel}>PRODUCT NAME</Text>
             <TextInput 
               style={[styles.input, showErrors && !name && styles.errorInput]} 
               placeholder="e.g. Coke Mismo" 
               placeholderTextColor={Theme.colors.outlineVariant}
               value={name} 
               onChangeText={setName} 
             />

             {isBulkMode && (
               <View style={styles.inputRow}>
                 <View style={{ flex: 1, marginRight: 12 }}>
                   <Text style={styles.inputLabel}>INITIAL STOCK (Packs)</Text>
                   <TextInput 
                     style={styles.input} 
                     placeholder="0" 
                     placeholderTextColor={Theme.colors.outlineVariant}
                     keyboardType="numeric" 
                     value={initialPacks} 
                     onChangeText={(t) => setInitialPacks(t.replace(/[^0-9]/g, ''))} 
                   />
                 </View>
                 <View style={{ flex: 1 }}>
                   <Text style={styles.inputLabel}>EXTRA LOOSE UNITS</Text>
                   <TextInput 
                     style={styles.input} 
                     placeholder="0" 
                     placeholderTextColor={Theme.colors.outlineVariant}
                     keyboardType="numeric" 
                     value={initialPieces} 
                     onChangeText={(t) => setInitialPieces(t.replace(/[^0-9]/g, ''))} 
                   />
                 </View>
               </View>
              )}

              {!isBulkMode && (
                <View style={[styles.inputRow, { marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>INITIAL STOCK (Pieces)</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="0" 
                      placeholderTextColor={Theme.colors.outlineVariant}
                      keyboardType="numeric" 
                      value={initialPieces} 
                      onChangeText={(t) => setInitialPieces(t.replace(/[^0-9]/g, ''))} 
                    />
                  </View>
                </View>
              )}

              {isBulkMode && (
                <View style={styles.inputRow}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.inputLabel}>PCS PER PACK</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="1" 
                      placeholderTextColor={Theme.colors.outlineVariant}
                      keyboardType="numeric" 
                      value={piecesPerPack} 
                      onChangeText={(t) => updatePackSize(t.replace(/[^0-9]/g, ''))} 
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>PACK COST (Buying ₱)</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="0" 
                      placeholderTextColor={Theme.colors.outlineVariant}
                      keyboardType="numeric" 
                      value={costPerPack} 
                      onChangeText={(t) => updateCostFromPack(t.replace(/[^0-9.]/g, ''))} 
                    />
                  </View>
                </View>
              )}

              <View style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: isBulkMode ? 12 : 0 }}>
                  <Text style={styles.inputLabel}>UNIT COST (Buying ₱)</Text>
                  <TextInput 
                    style={[styles.input, showErrors && !costPrice && styles.errorInput]} 
                    placeholder="0" 
                    placeholderTextColor={Theme.colors.outlineVariant}
                    keyboardType="numeric" 
                    value={costPrice} 
                    onChangeText={(t) => updateCostFromPiece(t.replace(/[^0-9.]/g, ''))} 
                  />
                </View>
                {isBulkMode && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>PACK PRICE (Selling ₱)</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="0" 
                      placeholderTextColor={Theme.colors.outlineVariant}
                      keyboardType="numeric" 
                      value={packPrice} 
                      onChangeText={(t) => updatePiecePriceFromPack(t.replace(/[^0-9.]/g, ''))} 
                    />
                  </View>
                )}
              </View>

             <View style={styles.inputRow}>
               <View style={{ flex: 1 }}>
                 <Text style={styles.inputLabel}>UNIT PRICE (Selling ₱)</Text>
                 <TextInput 
                   style={[styles.input, showErrors && !price && styles.errorInput]} 
                   placeholder="0" 
                   placeholderTextColor={Theme.colors.outlineVariant}
                   keyboardType="numeric" 
                   value={price} 
                   onChangeText={(t) => updatePackPriceFromPiece(t.replace(/[^0-9.]/g, ''))} 
                 />
               </View>
             </View>

             {/* Dashboard Summary */}
             <View style={styles.insightBox}>
               <View style={styles.insightRow}>
                 <Package size={14} color={Theme.colors.primary} />
                 <Text style={styles.insightText}>
                   Opening Stock: {getDashboardData().totalUnits || 0} units
                 </Text>
               </View>
               
               <View style={styles.insightRow}>
                 <Zap size={14} color={Theme.colors.primary} />
                 <Text style={styles.insightText}>
                   Total Investment: ₱{getDashboardData().totalInvestment.toFixed(2)}
                 </Text>
               </View>
               
               {getDashboardData().uMargin && (
                  <View style={styles.insightRow}>
                    <TrendingUp size={14} color={getDashboardData().uMargin?.isLoss ? Theme.colors.tertiary : Theme.colors.primary} />
                    <Text style={[styles.insightText, getDashboardData().uMargin?.isLoss && { color: Theme.colors.tertiary }]}>
                      Piece Margin: {getDashboardData().uMargin?.margin}% (₱{getDashboardData().uMargin?.profit.toFixed(2)} profit / unit)
                    </Text>
                  </View>
                )}

                {parseInt(piecesPerPack) > 1 && getDashboardData().pMargin && (
                  <View style={styles.insightRow}>
                    <TrendingUp size={14} color={getDashboardData().pMargin?.isLoss ? Theme.colors.tertiary : Theme.colors.primary} />
                    <Text style={[styles.insightText, getDashboardData().pMargin?.isLoss && { color: Theme.colors.tertiary }]}>
                      Pack Margin: {getDashboardData().pMargin?.margin}% (₱{getDashboardData().pMargin?.profit.toFixed(2)} profit / pack)
                    </Text>
                  </View>
                )}
             </View>

            <Text style={styles.inputLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <TouchableOpacity 
                  key={c} 
                  style={[styles.catChip, category === c && styles.catChipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.inputLabel}>UNIT</Text>
                <TextInput 
                  style={[styles.input, showErrors && !unit && styles.errorInput]} 
                  placeholder="pc" 
                  placeholderTextColor={Theme.colors.outlineVariant}
                  value={unit} 
                  onChangeText={setUnit} 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>LOW STOCK ALERT</Text>
                <TextInput 
                  style={[styles.input, showErrors && !threshold && styles.errorInput]} 
                  placeholder="5" 
                  placeholderTextColor={Theme.colors.outlineVariant}
                  keyboardType="numeric" 
                  value={threshold} 
                  onChangeText={(t) => setThreshold(t.replace(/[^0-9]/g, ''))} 
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>BARCODE (OPTIONAL)</Text>
            <View style={styles.barcodeInputRow}>
              <TextInput 
                style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                placeholder="Scan or enter barcode" 
                placeholderTextColor={Theme.colors.outlineVariant}
                value={barcode} 
                onChangeText={setBarcode} 
              />
              <TouchableOpacity style={styles.scanBtn} onPress={startBarcodeScan}>
                <Camera size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Add Product</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>

        {/* Inner Barcode Scanner Modal */}
        <Modal visible={isScanning} transparent animationType="fade">
          <View style={styles.scannerOverlay}>
            <CameraView 
              style={styles.scannerView}
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14"],
              }}
            />
            <View style={styles.scannerHUDOverlay}>
              <SafeAreaView style={styles.scannerHUDHeaderInModal}>
                <Text style={styles.scannerHUDTitleInModal}>Register Barcode</Text>
                <TouchableOpacity onPress={() => setIsScanning(false)} style={{ padding: 12 }}>
                  <X size={32} color="#FFF" />
                </TouchableOpacity>
              </SafeAreaView>
              <View style={styles.scannerCrosshair} />
              <View style={styles.scannerControls}>
                <Text style={styles.scannerHint}>Align barcode within the frame</Text>
                <Text style={styles.lightingHint}>Tip: Ensure good lighting for better accuracy</Text>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
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
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: 56,
    backgroundColor: Theme.colors.surface,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  listContent: {
    paddingBottom: 110,
  },
  statsContainer: {
    padding: 16,
  },
  mainStatCard: {
    backgroundColor: Theme.colors.primaryContainer,
    borderRadius: 24,
    padding: 24,
    minHeight: 150,
    justifyContent: 'space-between',
  },
  statLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    opacity: 0.8,
    fontSize: 14,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: Theme.typography.headlineBlack,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 32,
  },
  statBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  statBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBadgeText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onPrimaryContainer,
    fontSize: 12,
  },
  searchSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 52,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLowest,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  productImageContainer: {
    width: 60,
    height: 60,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productName: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  lowStockBadge: {
    backgroundColor: Theme.colors.tertiary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontFamily: Theme.typography.bodyBold,
    textTransform: 'uppercase',
  },
  productMeta: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 2,
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
    padding: 100,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 16,
    marginTop: 12,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    minHeight: height * 0.85,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 4,
    marginBottom: 24,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  typeBtnActive: {
    backgroundColor: Theme.colors.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  typeBtnText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.outline,
  },
  typeBtnTextActive: {
    color: '#FFF',
  },
  modalScroll: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
  },
  imagePickerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imageBox: {
    width: 100,
    height: 100,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  pickedImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.outline,
    marginTop: 4,
  },
  inputLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    marginBottom: 6,
    marginLeft: 4,
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
  inputRow: {
    flexDirection: 'row',
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
  saveButton: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  saveButtonText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 18,
  },
  cameraBadgeFloating: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Theme.colors.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: Theme.colors.surface,
  },
  barcodeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  scanBtn: {
    backgroundColor: Theme.colors.primary,
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerView: {
    flex: 1,
  },
  scannerControls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 24,
  },
  scannerHint: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 14,
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  closeScannerBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerHUDOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerHUDHeaderInModal: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scannerHUDTitleInModal: {
    color: Theme.colors.onSurface,
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
  },
  scannerCrosshair: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  insightBox: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '20',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  insightText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.primary,
  },
  lightingHint: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
    fontSize: 12,
    marginTop: 12,
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    textAlign: 'center',
  },
  errorInput: {
    borderWidth: 1.5,
    borderColor: Theme.colors.tertiary,
    backgroundColor: Theme.colors.tertiary + '08',
  },
  filterChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Theme.colors.surface,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.tertiary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.tertiary + '30',
  },
  filterChipText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.tertiary,
    fontSize: 12,
  },
  clearFilterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  clearFilterText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 13,
  },
});
