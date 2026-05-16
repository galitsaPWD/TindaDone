import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Image,
  Modal,
  Platform,
  Vibration,
  Dimensions,
  Alert,
  ActionSheetIOS
} from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { 
  ChevronLeft, 
  Plus, 
  Package, 
  CircleDollarSign, 
  History, 
  TrendingUp, 
  X, 
  Edit2, 
  Camera, 
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  QrCode,
  CheckCircle2,
  Info,
  Tag
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { getProducts, updateProduct, deleteProduct, getRestockLogs, addRestockLog, CATEGORIES } from '../../lib/storage';
import { useSettings } from '../../context/SettingsContext';
import { Product, RestockLog, BusinessSettings } from '../../lib/types';
import { Theme } from '../../constants/Theme';

const { width, height } = Dimensions.get('window');


export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // Core Data
  const [product, setProduct] = useState<Product | null>(null);
  const [restockLogs, setRestockLogs] = useState<RestockLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals Visibility
  const [restockVisible, setRestockVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  
  // Product Edit States
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [category, setCategory] = useState('Others');
  const [unit, setUnit] = useState('pc');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [barcode, setBarcode] = useState('');
  const [piecesPerPack, setPiecesPerPack] = useState('1');
  const [packPrice, setPackPrice] = useState('0');
  const [costPerPack, setCostPerPack] = useState('0');
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Restock States
  const [isPackRestock, setIsPackRestock] = useState(false);
  const [qtyToAdd, setQtyToAdd] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockCostPerPack, setRestockCostPerPack] = useState('');
  const [restockPrice, setRestockPrice] = useState('');
  const [restockPackPrice, setRestockPackPrice] = useState('');
  const [restockPiecesPerPack, setRestockPiecesPerPack] = useState('1');
  const [selectedLog, setSelectedLog] = useState<RestockLog | null>(null);

  // Global UI States
  const [showFullData, setShowFullData] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Scanner Logic
  const [permission, requestPermission] = useCameraPermissions();
  const [hasManuallySetPrice, setHasManuallySetPrice] = useState(false);
  const [hasManuallySetPackPrice, setHasManuallySetPackPrice] = useState(false);

  const { businessSettings, updateSettings } = useSettings();
  const beepSound = useRef<Audio.Sound | null>(null);
  
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

  useFocusEffect(
    useCallback(() => {
      loadData();
      loadRestockLogs();
      loadBeep();
    }, [id])
  );

  useEffect(() => {
    return () => {
      if (beepSound.current) {
        beepSound.current.unloadAsync();
      }
    };
  }, []);

  const loadRestockLogs = async () => {
    try {
      const logs = await getRestockLogs();
      setRestockLogs(logs.filter((l: RestockLog) => l.productId === id).reverse());
    } catch (e) {
      console.error('Error loading restock logs:', e);
    }
  };

  const loadData = async () => {
    try {
      const products = await getProducts();
      const p = products.find((prod: Product) => prod.id === id);
      if (p) {
        setProduct(p);
        setName(p.name || '');
        setPrice(p.price?.toString() || '0');
        setCostPrice(p.costPrice?.toString() || '0');
        setCategory(p.category || 'Others');
        setUnit(p.unit || 'pc');
        setLowStockThreshold(p.lowStockThreshold?.toString() || '5');
        setPhotoUri(p.photoUri);
        setBarcode(p.barcode || '');
        setPiecesPerPack(p.piecesPerPack?.toString() || '1');
        setPackPrice(p.packPrice?.toString() || (p.price * (p.piecesPerPack || 1)).toString());
        
        const multiplier = p.piecesPerPack || 1;
        const baseCost = p.costPrice || 0;
        setCostPerPack((baseCost * multiplier).toFixed(2));
        setIsBulkMode(multiplier > 1 || p.packPrice !== undefined);
        
        // Init restock values
        setRestockPrice(p.price?.toString() || '0');
        setRestockPackPrice(p.packPrice?.toString() || (p.price * multiplier).toString());
        setRestockPiecesPerPack(multiplier.toString());
      }
      await loadRestockLogs();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openRestock = () => {
    setQtyToAdd('');
    setRestockCost('');
    setRestockCostPerPack('');
    setRestockPrice(product?.price.toString() || '');
    setRestockPackPrice(product?.packPrice?.toString() || '0');
    setRestockPiecesPerPack(product?.piecesPerPack?.toString() || '1');
    setHasManuallySetPrice(false);
    setHasManuallySetPackPrice(false);
    setIsPackRestock(false);
    setRestockVisible(true);
  };

  const handleRestock = async () => {
    if (!qtyToAdd || !restockCost || !restockPrice) {
      setShowErrors(true);
      showAlert('Missing Fields', 'Please fill in all boxes marked in red.', 'warning');
      return;
    }
    
    const inputQty = parseInt(qtyToAdd) || 0;
    const cost = parseFloat(restockCost) || 0;
    const newPrice = parseFloat(restockPrice) || 0;
    const newPackPrice = parseFloat(restockPackPrice) || 0;
    const newPiecesPerPack = parseInt(restockPiecesPerPack) || 1;
    
    const addedQty = isPackRestock ? inputQty * newPiecesPerPack : inputQty;
    const unitCost = addedQty > 0 ? cost / addedQty : 0;
    
    try {
      const log: RestockLog = {
        id: Date.now().toString(),
        productId: id as string,
        productName: product!.name,
        qtyAdded: addedQty,
        costPerUnit: unitCost,
        totalCost: cost,
        timestamp: new Date().toISOString(),
        priceAtRestock: newPrice,
        packPriceAtRestock: newPackPrice,
        piecesPerPackAtRestock: newPiecesPerPack,
        isBulk: isPackRestock,
      };

      const updated: Product = {
        ...product!,
        stock: product!.stock + addedQty,
        costPrice: unitCost,
        price: newPrice,
        packPrice: newPackPrice > 0 ? newPackPrice : (product!.packPrice || 0),
        piecesPerPack: newPiecesPerPack,
      };

      await addRestockLog(log);
      await updateProduct(updated);
      
      setRestockVisible(false);
      setQtyToAdd('');
      setRestockCost('');
      setShowErrors(false);
      loadData();
      showAlert('Success', `${isPackRestock ? inputQty + ' Packs' : inputQty + ' Units'} added to inventory.`, 'success');
    } catch (e) {
      showAlert('Error', 'Financial update failed. Please check your inputs or storage space.', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!name || !price || !costPrice || !unit || !lowStockThreshold) {
      setShowErrors(true);
      showAlert('Missing Fields', 'Please fill in all boxes marked in red.', 'warning');
      return;
    }

    try {
      const multiplier = isBulkMode ? (parseInt(piecesPerPack) || 1) : 1;
      const updatedProduct: Product = {
        ...product!,
        name: name.trim(),
        price: parseFloat(price),
        packPrice: isBulkMode ? (parseFloat(packPrice) || undefined) : undefined,
        piecesPerPack: multiplier,
        costPrice: parseFloat(costPrice),
        category,
        unit,
        lowStockThreshold: parseInt(lowStockThreshold),
        barcode: barcode.trim(),
        photoUri,
      };

      await updateProduct(updatedProduct);
      setProduct(updatedProduct);
      setEditVisible(false);
      setShowErrors(false);
      showAlert('Success', 'Product updated successfully!', 'success');
    } catch (e) {
      showAlert('Error', 'Failed to update product. The photo might be too large.', 'error');
    }
  };

  const getMarginInfo = (sPrice: string, cPrice: string) => {
    const s = parseFloat(sPrice) || 0;
    const c = parseFloat(cPrice) || 0;
    if (s <= 0 || c <= 0) return null;
    const profit = s - c;
    const margin = (profit / s) * 100;
    return { profit, margin: margin.toFixed(1), isLoss: profit < 0 };
  };


  const updateCostFromPiece = (unitCost: string) => {
    setCostPrice(unitCost);
    const multiplier = parseInt(piecesPerPack) || 1;
    const unitCostVal = parseFloat(unitCost) || 0;
    if (multiplier > 0 && unitCostVal > 0) {
      setCostPerPack((unitCostVal * multiplier).toFixed(2));
      // Auto-adjust sell prices with ₱5 markup
      setPrice((unitCostVal + 5).toFixed(2));
      setPackPrice(((unitCostVal + 5) * multiplier).toFixed(2));
    }
  };

  const updatePackSize = (size: string) => {
    setPiecesPerPack(size);
    const multiplier = parseInt(size) || 1;
    const packCostVal = parseFloat(costPerPack) || 0;
    if (multiplier > 0 && packCostVal > 0) {
      setCostPrice((packCostVal / multiplier).toFixed(2));
      // Auto-adjust sell prices with ₱5 markup
      const unitCost = packCostVal / multiplier;
      setPrice((unitCost + 5).toFixed(2));
      setPackPrice((packCostVal + 5).toFixed(2));
    }
    // Also sync pack price from unit price if no cost
    const unitSell = parseFloat(price) || 0;
    if (unitSell > 0 && multiplier > 0) {
      setPackPrice((unitSell * multiplier).toFixed(2));
    }
  };

  const updatePiecePriceFromPack = (pPrice: string) => {
    setPackPrice(pPrice);
    const multiplier = parseInt(piecesPerPack) || 1;
    const packPriceVal = parseFloat(pPrice) || 0;
    if (multiplier > 0 && packPriceVal > 0) {
      setPrice((packPriceVal / multiplier).toFixed(2));
    }
  };

  const updateCostFromPack = (pCost: string) => {
    setCostPerPack(pCost);
    const multiplier = parseInt(piecesPerPack) || 1;
    const costVal = parseFloat(pCost) || 0;
    if (multiplier > 0 && costVal > 0) {
      const unitCost = costVal / multiplier;
      setCostPrice(unitCost.toFixed(2));
      // Auto-adjust sell prices with ₱5 markup
      setPrice((unitCost + 5).toFixed(2));
      setPackPrice((costVal + 5).toFixed(2));
    }
  };

  const getDashboardData = () => {
    const uMargin = getMarginInfo(price, costPrice);
    const pMargin = getMarginInfo(packPrice, costPerPack);
    return { uMargin, pMargin };
  };

  const updateRestockTotalFromPackCost = (pCost: string) => {
    setRestockCostPerPack(pCost);
    const packs = parseInt(qtyToAdd) || 0;
    const packCostVal = parseFloat(pCost) || 0;
    if (isPackRestock && packs > 0 && packCostVal > 0) {
      setRestockCost((packCostVal * packs).toFixed(2));
    }
    // Auto-calc unit price from pack cost + ₱5 markup
    const ppp = parseInt(restockPiecesPerPack) || 1;
    if (packCostVal > 0 && ppp > 0) {
      const unitCost = packCostVal / ppp;
      setRestockPrice((unitCost + 5).toFixed(2));
      setRestockPackPrice((packCostVal + 5).toFixed(2));
    }
  };

  const updateRestockPackCostFromTotal = (totalCostVal: string) => {
    setRestockCost(totalCostVal);
    const packs = parseInt(qtyToAdd) || 0;
    const totalVal = parseFloat(totalCostVal) || 0;
    if (isPackRestock && packs > 0 && totalVal > 0) {
      const packCost = totalVal / packs;
      setRestockCostPerPack(packCost.toFixed(2));
      // Auto-calc unit price + ₱5 markup
      const ppp = parseInt(restockPiecesPerPack) || 1;
      setRestockPrice(((packCost / ppp) + 5).toFixed(2));
      setRestockPackPrice((packCost + 5).toFixed(2));
    }
  };

  const updateRestockPiecesPerPack = (val: string) => {
    setRestockPiecesPerPack(val);
    const ppp = parseInt(val) || 1;
    // Recalc unit sell from pack sell
    const packSell = parseFloat(restockPackPrice) || 0;
    if (packSell > 0 && ppp > 0) {
      setRestockPrice((packSell / ppp).toFixed(2));
    }
    // Recalc cost per unit from cost per pack
    const packCost = parseFloat(restockCostPerPack) || 0;
    if (packCost > 0 && ppp > 0) {
      const packs = parseInt(qtyToAdd) || 0;
      if (packs > 0) {
        setRestockCost((packCost * packs).toFixed(2));
      }
    }
  };

  const updateRestockUnitSell = (val: string) => {
    setRestockPrice(val);
    const ppp = parseInt(restockPiecesPerPack) || 1;
    const unitSell = parseFloat(val) || 0;
    if (unitSell > 0 && ppp > 0) {
      setRestockPackPrice((unitSell * ppp).toFixed(2));
    }
  };

  const updateRestockPackSell = (val: string) => {
    setRestockPackPrice(val);
    const ppp = parseInt(restockPiecesPerPack) || 1;
    const packSell = parseFloat(val) || 0;
    if (packSell > 0 && ppp > 0) {
      setRestockPrice((packSell / ppp).toFixed(2));
    }
  };

  const startBarcodeScan = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        showAlert('Permission Denied', 'Camera permission is required to scan barcodes.', 'warning');
        return;
      }
    }
    setScannerVisible(true);
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
    setScannerVisible(false);
    playBeep();
  };



  const handleDelete = async () => {
    await deleteProduct(id as string);
    setDeleteVisible(false);
    router.back();
  };

  const handlePickImage = async (useCamera: boolean = false) => {
    try {
      const permission = useCamera 
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        showAlert('Permission Denied', 'We need access to your camera/photos to update the product image.', 'warning');
        return;
      }

      const pickerResult = useCamera
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

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        let finalUri = pickerResult.assets[0].uri;
        
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
        } else if (pickerResult.assets[0].base64) {
          finalUri = `data:image/jpeg;base64,${pickerResult.assets[0].base64}`;
        }
        
        setPhotoUri(finalUri);
      }
    } catch (error) {
      console.error('Image picker error:', error);
      showAlert('Error', 'Failed to pick image', 'error');
    }
  };

  if (loading || !product) return null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft size={24} color={Theme.colors.onSurface} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Suite</Text>
        <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.editBtn}>
          <Edit2 size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <View style={styles.imageBox}>
            {product.photoUri ? (
              <Image source={{ uri: product.photoUri }} style={styles.productImage} />
            ) : (
              <View style={styles.letterPlaceholder}>
                <Text style={styles.letterText}>{product.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{product.category?.toUpperCase() || 'GENERAL'}</Text>
            </View>
          </View>
          <View style={styles.mainInfo}>
            <Text style={styles.productName}>{product.name}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.productPrice}>₱{product.price.toLocaleString()}</Text>
              <Text style={styles.productUnit}>per {product.unit || 'pc'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bentoGrid}>
          <View style={styles.bentoCard}>
            <View style={styles.bentoIcon}>
              <Package size={18} color={Theme.colors.primary} />
            </View>
            <Text style={styles.bentoLabel}>Inventory Level</Text>
            <Text style={[styles.bentoValue, product.stock <= product.lowStockThreshold && { color: Theme.colors.tertiary }]}>
              {product.stock}
            </Text>
            <Text style={styles.bentoSub}>{product.unit || 'units'} left</Text>
          </View>
          <View style={styles.bentoCard}>
            <View style={[styles.bentoIcon, { backgroundColor: '#defbe6' }]}>
              <TrendingUp size={18} color="#0a643b" />
            </View>
            <Text style={styles.bentoLabel}>Profit Margin</Text>
            <Text style={styles.bentoValue}>
              {product.costPrice ? `₱${(product.price - product.costPrice).toFixed(0)}` : '--'}
            </Text>
            <Text style={styles.bentoSub}>per {product.unit || 'unit'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.primaryActionBtn} onPress={openRestock}>
          <Plus size={22} color="#FFF" />
          <Text style={styles.primaryActionText}>Log New Restock</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIcon}>
              <History size={18} color={Theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Stock Timeline</Text>
          </View>
          {restockLogs.length === 0 ? (
            <View style={styles.emptyLogsCard}>
              <Text style={styles.emptyLogsText}>No restock logs found for this item.</Text>
            </View>
          ) : (
            <View style={styles.logListCard}>
              {restockLogs.map((log, index) => (
                <TouchableOpacity 
                  key={log.id} 
                  style={[styles.logRow, index === restockLogs.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => {
                    setSelectedLog(log);
                    setDetailVisible(true);
                  }}
                >
                  <View style={styles.logInfo}>
                    <Text style={styles.logQty}>
                      {log.isBulk && log.piecesPerPackAtRestock 
                        ? `+${Math.floor(log.qtyAdded / log.piecesPerPackAtRestock)} Packs` 
                        : `+${log.qtyAdded} ${product.unit || 'units'}`}
                    </Text>
                    <Text style={styles.logDate}>{new Date(log.timestamp).toLocaleDateString()} • {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </View>
                  {log.totalCost && (
                    <View style={styles.logCost}>
                      <Text style={styles.logCostLabel}>COST</Text>
                      <Text style={styles.logCostValue}>₱{log.totalCost.toFixed(0)}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <TouchableOpacity 
          style={styles.dangerZoneBtn} 
          onPress={() => setDeleteVisible(true)}
        >
          <Trash2 size={18} color={Theme.colors.tertiary} />
          <Text style={styles.dangerZoneText}>Remove Product from Suite</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Restock Modal */}
      <Modal visible={restockVisible} transparent animationType="slide">
        <BlurView intensity={25} tint="dark" style={styles.modalOverlay}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setRestockVisible(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Stock Integration</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.typeSelector}>
              <TouchableOpacity 
                style={[styles.typeBtn, !isPackRestock && styles.typeBtnActive]}
                onPress={() => setIsPackRestock(false)}
              >
                <Tag size={18} color={!isPackRestock ? '#FFF' : Theme.colors.outline} />
                <Text style={[styles.typeBtnText, !isPackRestock && styles.typeBtnTextActive]}>Single Item</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.typeBtn, isPackRestock && styles.typeBtnActive]}
                onPress={() => setIsPackRestock(true)}
              >
                <Package size={18} color={isPackRestock ? '#FFF' : Theme.colors.outline} />
                <Text style={[styles.typeBtnText, isPackRestock && styles.typeBtnTextActive]}>Bulk Packs</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.inputLabel}>QTY TO ADD ({isPackRestock ? 'Packs' : 'Pieces'})</Text>
                <TextInput
                  style={[styles.input, showErrors && !qtyToAdd && styles.errorInput]}
                  placeholder="0"
                  keyboardType="numeric"
                  value={qtyToAdd}
                  onChangeText={(val) => {
                    setQtyToAdd(val);
                    const qty = parseInt(val) || 0;
                    const cost = parseFloat(restockCost) || 0;
                    if (qty > 0 && cost > 0) {
                      const totalUnits = isPackRestock ? qty * (parseInt(restockPiecesPerPack) || 1) : qty;
                      setRestockPrice(((cost / totalUnits) + 5).toFixed(2));
                      if (isPackRestock) {
                        const packCost = parseFloat(restockCostPerPack) || 0;
                        setRestockCost((packCost * qty).toFixed(2));
                      }
                    }
                  }}
                />
              </View>
              {isPackRestock && (
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>PIECES IN PACK</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="1"
                    keyboardType="numeric"
                    value={restockPiecesPerPack}
                    onChangeText={updateRestockPiecesPerPack}
                  />
                </View>
              )}
            </View>

            {isPackRestock ? (
              <>
                <Text style={styles.inputLabel}>COST PER PACK (₱)</Text>
                <TextInput
                  style={[styles.input, showErrors && !restockCostPerPack && styles.errorInput]}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={restockCostPerPack}
                  onChangeText={updateRestockTotalFromPackCost}
                />
                <Text style={styles.inputLabel}>TOTAL COST (₱) — auto-sum</Text>
                <TextInput
                  style={[styles.input, showErrors && !restockCost && styles.errorInput]}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={restockCost}
                  onChangeText={updateRestockPackCostFromTotal}
                />
              </>
            ) : (
              <>
                <Text style={styles.inputLabel}>TOTAL COST (₱)</Text>
                <TextInput
                  style={[styles.input, showErrors && !restockCost && styles.errorInput]}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={restockCost}
                  onChangeText={(val) => {
                    setRestockCost(val);
                    const qty = parseInt(qtyToAdd) || 0;
                    const totalVal = parseFloat(val) || 0;
                    if (qty > 0 && totalVal > 0) {
                      setRestockPrice(((totalVal / qty) + 5).toFixed(2));
                    }
                  }}
                />
              </>
            )}

            {/* Auto Cost-Per-Unit Insight */}
            {(() => {
              const qty = parseInt(qtyToAdd) || 0;
              const cost = parseFloat(restockCost) || 0;
              const totalUnits = isPackRestock ? qty * (parseInt(restockPiecesPerPack) || 1) : qty;
              const costPerUnit = totalUnits > 0 ? cost / totalUnits : 0;
              if (costPerUnit > 0) {
                return (
                  <View style={styles.insightBox}>
                    <View style={styles.insightRow}>
                      <CircleDollarSign size={14} color={Theme.colors.primary} />
                      <Text style={styles.insightText}>
                        Cost per unit: ₱{costPerUnit.toFixed(2)} ({totalUnits} total pieces)
                      </Text>
                    </View>
                  </View>
                );
              }
              return null;
            })()}

            <Text style={styles.inputLabel}>UNIT PRICE (₱)</Text>
            <TextInput
              style={[styles.input, showErrors && !restockPrice && styles.errorInput]}
              placeholder="0.00"
              keyboardType="numeric"
              value={restockPrice}
              onChangeText={updateRestockUnitSell}
            />

            {isPackRestock && (
              <>
                <Text style={styles.inputLabel}>PACK PRICE (₱)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  keyboardType="numeric"
                  value={restockPackPrice}
                  onChangeText={updateRestockPackSell}
                />
              </>
            )}

            {/* Profit Margin Visual */}
            {(() => {
              const sellPrice = parseFloat(restockPrice) || 0;
              const qty = parseInt(qtyToAdd) || 0;
              const cost = parseFloat(restockCost) || 0;
              const totalUnits = isPackRestock ? qty * (parseInt(restockPiecesPerPack) || 1) : qty;
              const costPerUnit = totalUnits > 0 ? cost / totalUnits : 0;
              if (sellPrice > 0 && costPerUnit > 0) {
                const profit = sellPrice - costPerUnit;
                const margin = ((profit / sellPrice) * 100).toFixed(1);
                const isLoss = profit < 0;
                return (
                  <View style={styles.insightBox}>
                    <View style={styles.insightRow}>
                      <TrendingUp size={14} color={isLoss ? Theme.colors.tertiary : Theme.colors.primary} />
                      <Text style={[styles.insightText, isLoss && { color: Theme.colors.tertiary }]}>
                        {isLoss ? 'Loss' : 'Profit'}: ₱{Math.abs(profit).toFixed(2)}/unit ({margin}% margin)
                      </Text>
                    </View>
                    {isPackRestock && parseFloat(restockPackPrice) > 0 && (
                      <View style={styles.insightRow}>
                        <TrendingUp size={14} color={Theme.colors.primary} />
                        <Text style={styles.insightText}>
                          Pack profit: ₱{(parseFloat(restockPackPrice) - (parseFloat(restockCostPerPack) || 0)).toFixed(2)}/pack
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }
              return null;
            })()}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRestockVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleRestock}>
                <Text style={styles.saveBtnText}>Log Integration</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </BlurView>
      </Modal>

      {/* Edit Product Modal */}
      <Modal visible={editVisible} transparent animationType="slide">
        <BlurView intensity={30} tint="light" style={styles.modalOverlay}>
          <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={() => setEditVisible(false)} />
          <View style={styles.modalCard}>
             <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <X size={24} color={Theme.colors.onSurface} />
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

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.imagePickerSection}>
                <TouchableOpacity 
                  style={styles.imagePickerBox}
                  onPress={() => {
                    if (Platform.OS === 'web') {
                      handlePickImage(false);
                    } else if (Platform.OS === 'ios') {
                      ActionSheetIOS.showActionSheetWithOptions(
                          { options: ['Cancel', 'Take Photo', 'Gallery'], cancelButtonIndex: 0 },
                          (index: number) => { if (index === 1) handlePickImage(true); if (index === 2) handlePickImage(false); }
                        );
                    } else {
                      Alert.alert('Change Photo', 'Choose source', [
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
              <TextInput style={styles.input} value={name} onChangeText={setName} />
              
              <Text style={styles.inputLabel}>UNIT PRICE (Selling ₱)</Text>
              <TextInput 
                style={styles.input} 
                value={price} 
                onChangeText={setPrice} 
                keyboardType="numeric" 
                placeholder="0.00"
                placeholderTextColor={Theme.colors.outlineVariant}
              />
              
              {isBulkMode && (
                <View style={[styles.inputRow, { marginTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.inputLabel}>PCS PER PACK</Text>
                    <TextInput 
                      style={styles.input} 
                      placeholder="1" 
                      placeholderTextColor={Theme.colors.outlineVariant}
                      keyboardType="numeric" 
                      value={piecesPerPack} 
                      onChangeText={setPiecesPerPack} 
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
                      onChangeText={updateCostFromPack} 
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
                    onChangeText={updateCostFromPiece} 
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
                      onChangeText={updatePiecePriceFromPack} 
                    />
                  </View>
                )}
              </View>

              <View style={styles.insightBox}>
                {getDashboardData().uMargin && (
                  <View style={styles.insightRow}>
                    <TrendingUp size={14} color={getDashboardData().uMargin?.isLoss ? Theme.colors.tertiary : Theme.colors.primary} />
                    <Text style={[styles.insightText, getDashboardData().uMargin?.isLoss && { color: Theme.colors.tertiary }]}>
                      Piece Margin: {getDashboardData().uMargin?.margin}% (₱{getDashboardData().uMargin?.profit.toFixed(2)} profit/unit)
                    </Text>
                  </View>
                )}
                {parseInt(piecesPerPack) > 1 && getDashboardData().pMargin && (
                   <View style={styles.insightRow}>
                     <TrendingUp size={14} color={getDashboardData().pMargin?.isLoss ? Theme.colors.tertiary : Theme.colors.primary} />
                     <Text style={[styles.insightText, getDashboardData().pMargin?.isLoss && { color: Theme.colors.tertiary }]}>
                       Pack Margin: {getDashboardData().pMargin?.margin}% (₱{getDashboardData().pMargin?.profit.toFixed(2)} profit/pack)
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
                    style={styles.input} 
                    value={unit} 
                    onChangeText={setUnit} 
                    placeholder="pc"
                    placeholderTextColor={Theme.colors.outlineVariant}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>LOW STOCK ALERT</Text>
                  <TextInput 
                    style={styles.input} 
                    value={lowStockThreshold} 
                    onChangeText={setLowStockThreshold} 
                    keyboardType="numeric" 
                    placeholder="5"
                    placeholderTextColor={Theme.colors.outlineVariant}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>BARCODE (OPTIONAL)</Text>
              <View style={styles.barcodeInputRow}>
                <TextInput 
                  style={[styles.input, { flex: 1, marginBottom: 0 }]} 
                  value={barcode} 
                  onChangeText={setBarcode} 
                  placeholder="Scan or enter barcode"
                  placeholderTextColor={Theme.colors.outlineVariant}
                />
                <TouchableOpacity style={styles.scanBtn} onPress={startBarcodeScan}>
                  <Camera size={20} color="#FFF" />
                </TouchableOpacity>
              </View>

              <View style={[styles.modalActions, { marginTop: 24 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditVisible(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleSaveEdit}>
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </BlurView>
      </Modal>

      {/* Log Detail Modal */}
      <Modal visible={detailVisible} transparent animationType="fade">
        <BlurView intensity={40} tint="light" style={styles.modalOverlay}>
          <TouchableOpacity 
            activeOpacity={1} 
            style={StyleSheet.absoluteFill} 
            onPress={() => { setDetailVisible(false); setShowFullData(false); }} 
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Integration Details</Text>
              <TouchableOpacity onPress={() => { setDetailVisible(false); setShowFullData(false); }}>
                <X size={24} color={Theme.colors.onSurface} />
              </TouchableOpacity>
            </View>

            {selectedLog && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.logDetailBasic}>
                  <View style={styles.logDetailIcon}>
                    <Package size={32} color={Theme.colors.primary} />
                  </View>
                  <Text style={styles.logDetailTitle}>
                    +{selectedLog.qtyAdded} {product.unit || 'units'}
                  </Text>
                  <Text style={styles.logDetailSubtitle}>
                    Logged on {new Date(selectedLog.timestamp).toLocaleDateString()} at {new Date(selectedLog.timestamp).toLocaleTimeString()}
                  </Text>
                </View>

                <View style={[styles.insightBox, { marginTop: 12 }]}>
                  <View style={styles.insightRow}>
                    <CircleDollarSign size={16} color={Theme.colors.primary} />
                    <Text style={styles.insightText}>Capital Investment: ₱{(selectedLog.totalCost || 0).toFixed(2)}</Text>
                  </View>
                </View>

                <TouchableOpacity 
                  style={styles.auditToggle} 
                  onPress={() => setShowFullData(!showFullData)}
                >
                  <Text style={styles.auditToggleText}>
                    {showFullData ? 'Hide Audit Details' : 'View Full Audit Details'}
                  </Text>
                  <TrendingUp size={16} color={Theme.colors.primary} style={{ marginLeft: 6, opacity: showFullData ? 1 : 0.5 }} />
                </TouchableOpacity>

                {showFullData && (
                  <View style={styles.auditContainer}>
                    <View style={styles.auditLine}>
                      <Text style={styles.auditLabel}>Product ID</Text>
                      <Text style={styles.auditValue}>{selectedLog.productId}</Text>
                    </View>
                    <View style={styles.auditLine}>
                      <Text style={styles.auditLabel}>Cost per Unit</Text>
                      <Text style={styles.auditValue}>₱{(selectedLog.costPerUnit || 0).toFixed(2)}</Text>
                    </View>
                    <View style={styles.auditLine}>
                      <Text style={styles.auditLabel}>Selling Price at Restock</Text>
                      <Text style={styles.auditValue}>₱{selectedLog.priceAtRestock?.toFixed(2) || '--'}</Text>
                    </View>
                    {selectedLog.isBulk && (
                      <>
                        <View style={styles.auditLine}>
                          <Text style={styles.auditLabel}>Pack Price</Text>
                          <Text style={styles.auditValue}>₱{selectedLog.packPriceAtRestock?.toFixed(2) || '--'}</Text>
                        </View>
                        <View style={styles.auditLine}>
                          <Text style={styles.auditLabel}>Pieces Per Pack</Text>
                          <Text style={styles.auditValue}>{selectedLog.piecesPerPackAtRestock || '--'}</Text>
                        </View>
                      </>
                    )}
                    <View style={styles.auditLine}>
                      <Text style={styles.auditLabel}>Log Reference</Text>
                      <Text style={styles.auditValue}>{selectedLog.id}</Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity 
                  style={[styles.saveBtn, { marginTop: 24 }]} 
                  onPress={() => { setDetailVisible(false); setShowFullData(false); }}
                >
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </BlurView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteVisible} transparent animationType="fade">
        <BlurView intensity={50} tint="dark" style={styles.centeredModalOverlay}>
          <View style={styles.centeredModalCard}>
            <Text style={styles.modalTitle}>Delete Product</Text>
            <Text style={styles.deleteDesc}>Are you sure you want to delete "{product.name}"? This action cannot be undone.</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: Theme.colors.tertiary, flex: 1 }]} onPress={handleDelete}>
                <Text style={styles.saveBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>

      {/* Barcode Scanner Modal */}
      <Modal visible={scannerVisible} transparent animationType="fade">
        <View style={styles.scannerOverlay}>
          <CameraView
            style={styles.scannerView}
            onBarcodeScanned={handleBarcodeScanned}
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14"],
            }}
          >
            <View style={[styles.scannerHUDHeaderInModal, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 50 : 40) }]}>
              <Text style={styles.scannerHUDTitleInModal}>Scan Barcode</Text>
              <TouchableOpacity onPress={() => setScannerVisible(false)}>
                <X size={28} color="#FFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.scannerCrosshair} />
            <Text style={styles.scannerHint}>Align barcode within the box</Text>
          </CameraView>
        </View>
      </Modal>

      {/* Custom Alert Modal */}
      <Modal visible={alertVisible} transparent animationType="fade">
        <BlurView intensity={60} tint="dark" style={styles.modalOverlay}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  editBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary + '15', // Glassy emerald
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '20',
  },
  headerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 10,
  },
  imageBox: {
    width: 160,
    height: 160,
    borderRadius: 48,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Theme.colors.outlineVariant,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    marginBottom: 24,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  letterPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.primaryContainer,
  },
  letterText: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 56,
    color: Theme.colors.onPrimaryContainer,
  },
  categoryBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  categoryText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 10,
    letterSpacing: 1.5,
  },
  mainInfo: {
    alignItems: 'center',
  },
  productName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 32,
    color: Theme.colors.onSurface,
    textAlign: 'center',
    letterSpacing: -1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  productPrice: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.primary,
  },
  productUnit: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 14,
    color: Theme.colors.outline,
  },
  bentoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  bentoCard: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  bentoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Theme.colors.primary + '10', // Soft glassy background
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '15',
  },
  bentoLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.outline,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  bentoValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  bentoSub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  primaryActionBtn: {
    backgroundColor: Theme.colors.primary, // Back to solid for 'pop'
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 40,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  primaryActionText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  sectionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Theme.colors.primary + '10', // Matching glassy style
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.primary + '15',
  },
  sectionTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 20,
    color: Theme.colors.onSurface,
    letterSpacing: -0.5,
  },
  emptyLogsCard: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    borderStyle: 'dashed',
  },
  emptyLogsText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 14,
  },
  logListCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 4,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '40',
  },
  logInfo: {
    flex: 1,
  },
  logQty: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  logDate: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  logCost: {
    alignItems: 'flex-end',
  },
  logCostLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.outline,
    letterSpacing: 1,
  },
  logCostValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  dangerZoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.colors.tertiary + '30',
  },
  dangerZoneText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.tertiary,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)', // Almost clear, handled by BlurView
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    padding: 32,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },
  centeredModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)', // Lightened for BlurView
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  centeredModalCard: {
    width: '100%',
    backgroundColor: Theme.colors.background,
    borderRadius: 32,
    padding: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  deleteDesc: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
    marginVertical: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 26,
    color: Theme.colors.onSurface,
    letterSpacing: -1,
  },
  inputLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)', // Frosted glass input
    height: 64,
    borderRadius: 20,
    paddingHorizontal: 20,
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant,
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  errorInput: {
    borderColor: Theme.colors.tertiary,
    backgroundColor: Theme.colors.tertiary + '05',
  },
  insightBox: {
    backgroundColor: Theme.colors.primaryContainer + '30',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '20',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  insightText: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 13,
    color: Theme.colors.onSurface,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    height: 60,
    paddingHorizontal: 24,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  cancelBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
    fontSize: 16,
  },
  saveBtn: {
    height: 60,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary, // Back to solid
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  saveBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 16,
  },
  imagePickerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  imagePickerBox: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderWidth: 2,
    borderColor: Theme.colors.outlineVariant,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  pickedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 8,
  },
  cameraBadgeFloating: {
    position: 'absolute',
    bottom: -8,
    right: -8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 32,
    padding: 6,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '40',
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 26,
    gap: 8,
  },
  typeBtnActive: {
    backgroundColor: Theme.colors.primary,
    elevation: 4,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  typeBtnText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 14,
    color: Theme.colors.outline,
  },
  typeBtnTextActive: {
    color: '#FFF',
  },

  catChip: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerLow,
    marginRight: 10,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant + '60',
  },
  catChipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
    elevation: 4,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  catChipText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  catChipTextActive: {
    color: '#FFF',
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
    textAlign: 'center',
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
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

  logDetailBasic: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  logDetailIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Theme.colors.primaryContainer + '60',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logDetailTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  logDetailSubtitle: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  auditToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginVertical: 8,
  },
  auditToggleText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.primary,
  },
  auditContainer: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  auditLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  auditLabel: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
  },
  auditValue: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 12,
    color: Theme.colors.onSurface,
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
    borderRadius: 28,
    alignItems: 'center',
  },
  alertBtnText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
