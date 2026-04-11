import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  Alert, 
  Image,
  Modal,
  SafeAreaView,
  Platform,
  Vibration
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Audio } from 'expo-av';
import { 
  ChevronLeft, 
  Plus, 
  Package, 
  Tag, 
  CircleDollarSign, 
  History, 
  TrendingUp, 
  X, 
  Edit2, 
  Camera, 
  Image as ImageIcon,
  Trash2,
  AlertTriangle,
  QrCode
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { getProducts, updateProduct, deleteProduct, getRestockLogs, addRestockLog, CATEGORIES, getBusinessSettings } from '../../lib/storage';
import { Product, RestockLog, BusinessSettings } from '../../lib/types';
import { Theme } from '../../constants/Theme';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [restockLogs, setRestockLogs] = useState<RestockLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [restockVisible, setRestockVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  // Form states
  const [qtyToAdd, setQtyToAdd] = useState('');
  const [restockCost, setRestockCost] = useState('');

  // Edit states
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [category, setCategory] = useState('Others');
  const [unit, setUnit] = useState('pc');
  const [lowStockThreshold, setLowStockThreshold] = useState('5');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [showErrors, setShowErrors] = useState(false);
  const [restockPrice, setRestockPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const beepSound = useRef<Audio.Sound | null>(null);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({});

  useEffect(() => {
    loadData();
    loadBeep();
    loadSettings();

    return () => {
      if (beepSound.current) {
        beepSound.current.unloadAsync();
      }
    };
  }, [id]);

  const loadData = async () => {
    const products = await getProducts();
    const found = products.find((p: Product) => p.id === id);
    if (!found) {
      router.back();
      return;
    }
    setProduct(found);
    
    // Set edit form values
    setName(found.name);
    setPrice(found.price.toString());
    setCostPrice(found.costPrice?.toString() || '');
    setCategory(found.category || 'Others');
    setUnit(found.unit || 'pc');
    setLowStockThreshold(found.lowStockThreshold.toString());
    setBarcode(found.barcode || '');
    
    // Sanitize stale or broken URLs (Allow Base64 and HTTP)
    if (found.photoUri && !found.photoUri.startsWith('data:image') && !found.photoUri.startsWith('http')) {
      setPhotoUri(undefined);
      found.photoUri = undefined;
    } else {
      setPhotoUri(found.photoUri);
    }
    
    setRestockPrice(found.price.toString());

    const logs = await getRestockLogs();
    setRestockLogs(logs.filter((l: RestockLog) => l.productId === id));
    setIsLoading(false);
  };

  const handleRestock = async () => {
    if (!qtyToAdd || !restockCost || !restockPrice) {
      setShowErrors(true);
      Alert.alert('Missing Fields', 'Please fill in all boxes marked in red.');
      return;
    }
    
    const qty = parseInt(qtyToAdd);
    const cost = parseFloat(restockCost);
    const newPrice = parseFloat(restockPrice);
    const unitCost = qty > 0 ? cost / qty : 0;
    
    try {
      const log: RestockLog = {
        id: Date.now().toString(),
        productId: id as string,
        productName: product!.name,
        qtyAdded: qty,
        costPerUnit: unitCost,
        totalCost: cost,
        timestamp: new Date().toISOString(),
      };

      // Update Product Stock AND Financials
      const updated: Product = {
        ...product!,
        stock: product!.stock + qty,
        costPrice: unitCost,
        price: newPrice,
      };

      await addRestockLog(log);
      await updateProduct(updated);
      
      setRestockVisible(false);
      setQtyToAdd('');
      setRestockCost('');
      setShowErrors(false);
      loadData();
    } catch (e) {
      Alert.alert('Error Restocking', 'Financial update failed. Please check your inputs or storage space.');
      console.error(e);
    }
  };

  const handleSaveEdit = async () => {
    if (!name || !price || !costPrice || !unit || !lowStockThreshold) {
      setShowErrors(true);
      Alert.alert('Missing Fields', 'Please fill in all boxes marked in red (Cost Price is now required for edits).');
      return;
    }

    try {
      const updated: Product = {
        ...product!,
        name,
        price: parseFloat(price),
        costPrice: parseFloat(costPrice),
        category,
        unit,
        lowStockThreshold: parseInt(lowStockThreshold),
        barcode: barcode.trim(),
        photoUri,
      };

      await updateProduct(updated);
      setEditVisible(false);
      setShowErrors(false);
      loadData();
    } catch (e) {
      Alert.alert('Error Updating', 'Failed to save changes. The image might be too large or storage is full.');
      console.error(e);
    }
  };

  const loadSettings = async () => {
    const data = await getBusinessSettings();
    setBusinessSettings(data);
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
  };

  const startBarcodeScan = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Denied', 'Camera permission is required to scan barcodes.');
        return;
      }
    }
    setIsScanning(true);
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await deleteProduct(id as string);
            setDeleteVisible(false);
            router.back();
          } 
        },
      ]
    );
  };

  const handlePickImage = async (useCamera: boolean = false) => {
    try {
      const permission = useCamera 
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('Permission Denied', 'We need access to your camera/photos to update the product image.');
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
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  if (isLoading || !product) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <ChevronLeft size={28} color={Theme.colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Insights</Text>
        <TouchableOpacity onPress={() => setEditVisible(true)} style={styles.iconButton}>
          <Edit2 size={24} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Visual Summary */}
        <View style={styles.heroSection}>
          <View style={styles.imageBox}>
            {product.photoUri ? (
              <Image source={{ uri: product.photoUri }} style={styles.productImage} />
            ) : (
              <View style={styles.letterPlaceholder}>
                <Text style={styles.letterText}>{product.name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={styles.mainInfo}>
            <Text style={styles.productCategory}>{product.category?.toUpperCase() || 'GENERAL'}</Text>
            <Text style={styles.productName}>{product.name}</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.productPrice}>₱{product.price.toFixed(0)}</Text>
              <Text style={styles.productUnit}>/{product.unit || 'pc'}</Text>
            </View>
          </View>
        </View>

        {/* Stats Bento */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Current Stock</Text>
            <Text style={[styles.statValue, product.stock <= product.lowStockThreshold && { color: Theme.colors.tertiary }]}>
              {product.stock}
            </Text>
            <Text style={styles.statSubText}>{product.unit || 'units'} available</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Theme.colors.secondaryContainer + '40' }]}>
            <Text style={styles.statLabel}>Profit Margin</Text>
            <Text style={styles.statValue}>
              {product.costPrice ? `₱${(product.price - product.costPrice).toFixed(0)}` : '--'}
            </Text>
            <Text style={styles.statSubText}>per {product.unit || 'unit'}</Text>
          </View>
        </View>

        {/* Action Bar */}
        <TouchableOpacity style={styles.restockQuickBtn} onPress={() => setRestockVisible(true)}>
          <Plus size={24} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.restockQuickText}>Log New Restock</Text>
        </TouchableOpacity>

        {/* Restock History */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <History size={20} color={Theme.colors.primary} />
            <Text style={styles.sectionTitle}>Restock History</Text>
          </View>
          {restockLogs.length === 0 ? (
            <View style={styles.emptyLogs}>
              <Text style={styles.emptyLogsText}>No restock logs found for this item.</Text>
            </View>
          ) : (
            restockLogs.map((log, index) => (
              <View key={log.id} style={[styles.logRow, index === restockLogs.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.logInfo}>
                  <Text style={styles.logQty}>+{log.qtyAdded} {product.unit || 'units'}</Text>
                  <Text style={styles.logDate}>{new Date(log.timestamp).toLocaleDateString()} • {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                {log.totalCost && (
                  <View style={styles.logCost}>
                    <Text style={styles.logCostLabel}>COST</Text>
                    <Text style={styles.logCostValue}>₱{log.totalCost.toFixed(0)}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        <TouchableOpacity 
          style={styles.dangerButton} 
          onPress={() => setDeleteVisible(true)}
        >
          <Trash2 size={20} color={Theme.colors.tertiary} style={{ marginRight: 8 }} />
          <Text style={styles.dangerButtonText}>Delete Product permanently</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Restock Modal */}
      <Modal visible={restockVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Stock</Text>
            <Text style={styles.inputLabel}>QUANTITY TO ADD</Text>
            <TextInput
              style={[styles.input, showErrors && !qtyToAdd && styles.errorInput]}
              placeholder="0"
              keyboardType="numeric"
              value={qtyToAdd}
              onChangeText={setQtyToAdd}
            />
            <Text style={styles.inputLabel}>TOTAL COST (₱)</Text>
            <TextInput
              style={[styles.input, showErrors && !restockCost && styles.errorInput]}
              placeholder="0.00"
              keyboardType="numeric"
              value={restockCost}
              onChangeText={setRestockCost}
            />
            <Text style={styles.inputLabel}>NEW SELLING PRICE (₱)</Text>
            <TextInput
              style={[styles.input, showErrors && !restockPrice && styles.errorInput]}
              placeholder="0.00"
              keyboardType="numeric"
              value={restockPrice}
              onChangeText={setRestockPrice}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRestockVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleRestock}>
                <Text style={styles.saveBtnText}>Log Restock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <ScrollView 
            style={styles.sheetContent}
            contentContainerStyle={{ paddingBottom: 60 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Product</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <X size={24} color={Theme.colors.onSurface} title="Close" />
              </TouchableOpacity>
            </View>

            <View style={styles.imagePickerRow}>
              <TouchableOpacity 
                style={styles.editImageBox} 
                onPress={() => {
                  if (Platform.OS === 'web') {
                    handlePickImage(false);
                  } else {
                    Alert.alert('Upload Photo', 'Choose a source', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Camera', onPress: () => handlePickImage(true) },
                      { text: 'Gallery', onPress: () => handlePickImage(false) },
                    ]);
                  }
                }}
              >
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.editImage} />
                ) : (
                  <ImageIcon size={32} color={Theme.colors.outline} />
                )}
                <TouchableOpacity 
                  style={styles.cameraBadge}
                  onPress={() => handlePickImage(true)}
                >
                  <Camera size={16} color="#FFF" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>PRODUCT NAME</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} />

            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.inputLabel}>PRICE (₱)</Text>
                <TextInput 
                  style={[styles.input, showErrors && !price && styles.errorInput]} 
                  value={price} 
                  onChangeText={setPrice} 
                  keyboardType="numeric" 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>COST (₱)</Text>
                <TextInput 
                  style={[styles.input, showErrors && !costPrice && styles.errorInput]} 
                  value={costPrice} 
                  onChangeText={setCostPrice} 
                  keyboardType="numeric" 
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.map((c: string) => (
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
                  value={unit} 
                  onChangeText={setUnit} 
                  placeholder="pc, pack, etc." 
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>THRESHOLD</Text>
                <TextInput 
                  style={[styles.input, showErrors && !lowStockThreshold && styles.errorInput]} 
                  value={lowStockThreshold} 
                  onChangeText={setLowStockThreshold} 
                  keyboardType="numeric" 
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
                <QrCode size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.mainSaveBtn} onPress={handleSaveEdit}>
              <Text style={styles.mainSaveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </ScrollView>
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
              <View style={styles.scannerHUDHeaderInModal}>
                <Text style={styles.scannerHUDTitleInModal}>Update Barcode</Text>
                <TouchableOpacity onPress={() => setIsScanning(false)}>
                  <X size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.scannerCrosshair} />
              <View style={styles.scannerControls}>
                <Text style={styles.scannerHint}>Align barcode within the frame</Text>
                <Text style={styles.lightingHint}>Tip: Ensure good lighting for better accuracy</Text>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>

      {/* Delete Confirmation */}
      <Modal visible={deleteVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.deleteCard}>
            <AlertTriangle size={48} color={Theme.colors.tertiary} style={{ marginBottom: 16 }} />
            <Text style={styles.deleteTitle}>Permanent Delete?</Text>
            <Text style={styles.deleteDesc}>You are about to delete "{product.name}". This will also remove its restock history. This cannot be undone.</Text>
            <View style={styles.deleteActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteVisible(false)}>
                <Text style={styles.cancelBtnText}>Keep it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDelBtn} onPress={handleDelete}>
                <Text style={styles.confirmDelBtnText}>Delete</Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconButton: {
    padding: 8,
  },
  headerTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  imageBox: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
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
    fontSize: 40,
    color: Theme.colors.onPrimaryContainer,
  },
  mainInfo: {
    flex: 1,
    marginLeft: 20,
  },
  productCategory: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    color: Theme.colors.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  productName: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
    lineHeight: 28,
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  productPrice: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 28,
    color: Theme.colors.onSurface,
  },
  productUnit: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 14,
    color: Theme.colors.outline,
    marginLeft: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: Theme.colors.primaryContainer + '40',
    borderRadius: 24,
    padding: 16,
  },
  statLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 11,
    color: Theme.colors.primary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  statValue: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 24,
    color: Theme.colors.onSurface,
  },
  statSubText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  restockQuickBtn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    elevation: 4,
  },
  restockQuickText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 18,
    color: Theme.colors.onSurface,
  },
  emptyLogs: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
  },
  emptyLogsText: {
    fontFamily: Theme.typography.bodyMedium,
    color: Theme.colors.outline,
    fontSize: 14,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.outlineVariant + '30',
  },
  logInfo: {
    flex: 1,
  },
  logQty: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  logDate: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  logCost: {
    alignItems: 'flex-end',
  },
  logCostLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 9,
    color: Theme.colors.outline,
    letterSpacing: 1,
  },
  logCostValue: {
    fontFamily: Theme.typography.headline,
    fontSize: 16,
    color: Theme.colors.primary,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    opacity: 0.6,
  },
  dangerButtonText: {
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.tertiary,
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    padding: 24,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 24,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    marginBottom: 20,
    textAlign: 'center',
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
    color: Theme.colors.onSurface,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerHighest,
  },
  cancelBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
  sheetContent: {
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
    marginBottom: 24,
  },
  imagePickerRow: {
    alignItems: 'center',
    marginBottom: 24,
  },
  editImageBox: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  editImage: {
    width: '100%',
    height: '100%',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Theme.colors.primary,
    padding: 8,
    borderTopLeftRadius: 12,
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
  mainSaveBtn: {
    backgroundColor: Theme.colors.primary,
    height: 60,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  mainSaveBtnText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 18,
    color: '#FFF',
  },
  deleteCard: {
    backgroundColor: '#FFF',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
  },
  deleteTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 22,
    color: Theme.colors.onSurface,
    marginBottom: 12,
  },
  deleteDesc: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 15,
    color: Theme.colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmDelBtn: {
    flex: 1,
    backgroundColor: Theme.colors.tertiary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDelBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
  },
  errorInput: {
    borderWidth: 1.5,
    borderColor: Theme.colors.tertiary,
    backgroundColor: Theme.colors.tertiary + '08',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: 'rgba(0,0,0,0.4)',
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
    color: '#FFF',
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
  lightingHint: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 12,
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
    textAlign: 'center',
  },
});
