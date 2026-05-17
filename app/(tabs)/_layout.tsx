import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Text, Modal, TextInput, Switch, Alert, InteractionManager, Image, ScrollView, useWindowDimensions } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Package, ShoppingBag, BarChart2, ReceiptText, Settings, X, Store, QrCode, Volume2, Vibrate as VibrateIcon, Database, Camera, Save, FileText, CheckCircle2, Plus } from 'lucide-react-native';
import { isActivated, getTrialStatus } from '../../lib/license';
import * as ImagePicker from 'expo-image-picker';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  withTiming,
  interpolateColor,
  FadeInDown,
  FadeOutDown
} from 'react-native-reanimated';
import { useColorScheme } from '../../components/useColorScheme';
import { Theme } from '../../constants/Theme';
import { getBusinessSettings, saveBusinessSettings, exportData, DEFAULT_CATEGORIES } from '../../lib/storage';
import { BusinessSettings } from '../../lib/types';
import { useSettings } from '../../context/SettingsContext';
import { BlurView } from 'expo-blur';

const TAB_BAR_MARGIN = 20;

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { width } = useWindowDimensions();
  const TAB_BAR_WIDTH = width - (TAB_BAR_MARGIN * 2);
  const TAB_WIDTH = (TAB_BAR_WIDTH - 16) / 5;
  
  const translateX = useSharedValue(0);

  useEffect(() => {
    translateX.value = withTiming(state.index * TAB_WIDTH, {
      duration: 300,
    });
  }, [state.index]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.tabBarContainer, { left: TAB_BAR_MARGIN, width: TAB_BAR_WIDTH }]}>
      <BlurView intensity={80} tint="light" style={styles.tabBarMain}>
        {/* Sliding Liquid Pill */}
        <Animated.View style={[styles.activePill, pillStyle, { width: TAB_WIDTH }]} />
        
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const isSell = route.name === 'sell';
          const Icon = options.tabBarIcon;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                {Icon && Icon({ 
                  color: isFocused ? '#FFF' : (isSell ? Theme.colors.primary : Theme.colors.outline), 
                  size: isSell ? 28 : 22 
                })}
              </View>
              <Text style={[
                styles.tabLabel, 
                { color: isFocused ? '#FFF' : (isSell ? Theme.colors.primary : Theme.colors.outline) }
              ]}>
                {options.tabBarLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { businessSettings, updateSettings, isSettingsOpen, setIsSettingsOpen } = useSettings();
  const [tempSettings, setTempSettings] = React.useState<BusinessSettings>({});
  const [newCategory, setNewCategory] = React.useState('');
  const [showToast, setShowToast] = React.useState(false);

  // Security Guard: Ensure user has valid trial or activation
  React.useEffect(() => {
    const checkAuth = async () => {
      const activated = await isActivated();
      if (activated) return;
      const trial = await getTrialStatus();
      if (!trial.active) {
        router.replace('/activate');
      }
    };
    checkAuth();
  }, []);

  // Sync tempSettings with global settings when modal opens
  React.useEffect(() => {
    if (isSettingsOpen) {
      setTempSettings(businessSettings);
    }
  }, [isSettingsOpen, businessSettings]);

  const handleSave = async () => {
    await updateSettings(tempSettings);
    setIsSettingsOpen(false);
    setShowToast(true);
    setTimeout(() => {
      setShowToast(false);
    }, 2500);
  };

  const toggleBeep = (val: boolean) => setTempSettings(prev => ({ ...prev, scannerBeep: val }));
  const toggleVibrate = (val: boolean) => setTempSettings(prev => ({ ...prev, scannerVibrate: val }));
  const toggleBulk = (val: boolean) => setTempSettings(prev => ({ ...prev, enableBulkMode: val }));

  const addCategory = () => {
    if (!newCategory.trim()) return;
    const current = tempSettings.customCategories || DEFAULT_CATEGORIES;
    if (current.includes(newCategory.trim())) {
      Alert.alert('Exists', 'Category already exists.');
      return;
    }
    setTempSettings(prev => ({
      ...prev,
      customCategories: [...current, newCategory.trim()]
    }));
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    const current = tempSettings.customCategories || DEFAULT_CATEGORIES;
    const updated = current.filter(c => c !== cat);
    setTempSettings(prev => ({
      ...prev,
      customCategories: updated
    }));
  };

  const handlePickQR = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        let finalUri = result.assets[0].uri;
        if (result.assets[0].base64) {
          const mimeType = result.assets[0].mimeType || 'image/jpeg';
          finalUri = `data:${mimeType};base64,${result.assets[0].base64}`;
        }
        
        const updated = { ...tempSettings, gcashQrUri: finalUri };
        setTempSettings(updated);
        Alert.alert('QR Staged', 'Your GCash QR Code is ready. Press Save Settings to apply changes.');
      }
    } catch (e) {
      console.error('Error uploading QR:', e);
      Alert.alert('Error', 'Failed to save QR code. The image may be too large.');
    }
  };

  return (
    <>
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: Theme.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 0,
        },
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 0,
          elevation: 0,
          backgroundColor: 'transparent',
          bottom: 0,
          left: 0,
          right: 0,
          height: 0, // Collapses the default bar container
        },
        tabBarBackground: () => null, // Explicitly remove default background
        headerTitleStyle: {
          fontFamily: Theme.typography.headlineBlack,
          fontSize: 22,
          color: Theme.colors.onSurface,
        },
        headerTitleAlign: 'left',
        headerRight: () => (
          <TouchableOpacity 
            onPress={() => setIsSettingsOpen(true)}
            style={{ marginRight: 16, padding: 8 }}
          >
            <Settings size={24} color={Theme.colors.primary} />
          </TouchableOpacity>
        ),
        animation: 'fade',
        sceneStyle: { backgroundColor: Theme.colors.background },
      }}
    >
      <Tabs.Screen
        name="products"
        options={{
          title: 'Inventory',
          tabBarLabel: 'Inventory',
          tabBarIcon: ({ color, size }: any) => <Package color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Business Stats',
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color, size }: any) => <BarChart2 color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Sell Items',
          tabBarLabel: 'Sell',
          tabBarIcon: ({ color, size }: any) => <ShoppingBag color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="utang"
        options={{
          title: 'Credit (Utang)',
          tabBarLabel: 'Utang',
          tabBarIcon: ({ color, size }: any) => <ReceiptText color={color} size={size} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarLabel: 'Costs',
          tabBarIcon: ({ color, size }: any) => <FileText color={color} size={size} />,
          headerShown: false,
        }}
      />
    </Tabs>

    <Modal
      visible={isSettingsOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setIsSettingsOpen(false)}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.modalContent}>
          <View style={styles.modalIndicator} />
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>Store Command</Text>
              <Text style={styles.modalSubtitle}>Configure your boutique experience</Text>
            </View>
            <TouchableOpacity 
              style={styles.closeBtn}
              onPress={() => setIsSettingsOpen(false)}
            >
              <X size={20} color={Theme.colors.onSurface} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Identity</Text>
              <View style={styles.inputCard}>
                <Store size={18} color={Theme.colors.primary} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Official Store Name"
                  placeholderTextColor={Theme.colors.outlineVariant}
                  value={tempSettings.storeName || ''}
                  onChangeText={(text) => setTempSettings(prev => ({ ...prev, storeName: text }))}
                />
              </View>

              <View style={styles.featureCard}>
                <View style={styles.featureInfo}>
                  <Package size={20} color={Theme.colors.primary} />
                  <View>
                    <Text style={styles.featureTitle}>Bulk Operations</Text>
                    <Text style={styles.featureDesc}>Enable pack & case selling logic</Text>
                  </View>
                </View>
                <Switch
                  value={tempSettings.enableBulkMode !== false}
                  onValueChange={toggleBulk}
                  trackColor={{ false: Theme.colors.outlineVariant, true: Theme.colors.primary }}
                  thumbColor="#FFF"
                />
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Precision Scanner</Text>
              
              <View style={styles.toggleCard}>
                <View style={styles.toggleInfo}>
                  <Volume2 size={20} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.toggleTitle}>Audio Feedback</Text>
                </View>
                <Switch
                  value={tempSettings.scannerBeep !== false}
                  onValueChange={toggleBeep}
                  trackColor={{ false: Theme.colors.outlineVariant, true: Theme.colors.primary }}
                  thumbColor="#FFF"
                />
              </View>

              <View style={styles.toggleCard}>
                <View style={styles.toggleInfo}>
                  <VibrateIcon size={20} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.toggleTitle}>Haptic Touch</Text>
                </View>
                <Switch
                  value={tempSettings.scannerVibrate !== false}
                  onValueChange={toggleVibrate}
                  trackColor={{ false: Theme.colors.outlineVariant, true: Theme.colors.primary }}
                  thumbColor="#FFF"
                />
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Payments & QR</Text>
              
              <TouchableOpacity style={styles.qrCommandCard} onPress={handlePickQR}>
                {tempSettings.gcashQrUri ? (
                  <View style={styles.qrActiveRow}>
                    <Image 
                      source={{ uri: tempSettings.gcashQrUri }} 
                      style={styles.qrThumb}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.qrActiveTitle}>GCash QR Active</Text>
                      <Text style={styles.qrActiveSub}>Tap to update terminal QR</Text>
                    </View>
                    <CheckCircle2 size={22} color={Theme.colors.primary} />
                  </View>
                ) : (
                  <View style={styles.qrEmptyRow}>
                    <View style={styles.qrEmptyIcon}>
                      <QrCode size={24} color={Theme.colors.outline} />
                    </View>
                    <View>
                      <Text style={styles.qrEmptyTitle}>No Payment QR</Text>
                      <Text style={styles.qrEmptySub}>Tap to upload your GCash QR</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Product Categories</Text>
              <View style={styles.categoryInputContainer}>
                <TextInput
                  style={styles.categoryInput}
                  placeholder="New category..."
                  value={newCategory}
                  onChangeText={setNewCategory}
                />
                <TouchableOpacity style={styles.addCategoryBtn} onPress={addCategory}>
                  <Plus size={20} color="#FFF" />
                </TouchableOpacity>
              </View>
              <View style={styles.tagsContainer}>
                {(tempSettings.customCategories || DEFAULT_CATEGORIES).map(cat => (
                  <View key={cat} style={styles.tag}>
                    <Text style={styles.tagText}>{cat}</Text>
                    <TouchableOpacity onPress={() => removeCategory(cat)} style={styles.removeTag}>
                      <X size={14} color={Theme.colors.outline} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Maintenance</Text>
              <TouchableOpacity style={styles.backupCard} onPress={exportData}>
                <View style={styles.backupIcon}>
                  <Database size={20} color={Theme.colors.primary} />
                </View>
                <View>
                  <Text style={styles.backupTitle}>Full System Backup</Text>
                  <Text style={styles.backupSub}>Export products & ledger (JSON)</Text>
                </View>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.finalSaveBtn} onPress={handleSave}>
            <CheckCircle2 size={20} color="#FFF" />
            <Text style={styles.finalSaveText}>Apply Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {showToast && (
      <Animated.View 
        entering={FadeInDown.duration(300)} 
        exiting={FadeOutDown.duration(200)} 
        style={styles.toastContainer}
      >
        <View style={styles.toastContent}>
          <CheckCircle2 size={24} color="#FFF" />
          <Text style={styles.toastText}>Settings Applied</Text>
        </View>
      </Animated.View>
    )}
    </>
  );
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    bottom: 120, // Display above tab bar
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    gap: 12,
  },
  toastText: {
    color: '#FFF',
    fontFamily: Theme.typography.bodyBold,
    fontSize: 16,
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 30,
    zIndex: 100,
    borderRadius: 38,
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  tabBarMain: {
    flexDirection: 'row',
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.6)', // Glassy
    overflow: 'hidden',
    padding: 6,
  },
  activePill: {
    position: 'absolute',
    height: 56,
    backgroundColor: Theme.colors.primary,
    borderRadius: 28,
    top: 6,
    left: 6,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 4,
  },
  tabLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.surface, // Solid focus
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingTop: 12,
    paddingBottom: 40,
    height: Dimensions.get('window').height * 0.85,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 20,
  },
  modalIndicator: {
    width: 40,
    height: 5,
    backgroundColor: Theme.colors.outlineVariant,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 20,
    opacity: 0.5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  modalTitle: {
    fontFamily: Theme.typography.headlineBlack,
    fontSize: 26,
    color: Theme.colors.onSurface,
    letterSpacing: -1,
  },
  modalSubtitle: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 14,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsScroll: {
    flex: 1,
    marginBottom: 24,
  },
  settingGroup: {
    marginBottom: 32,
  },
  groupLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
    fontSize: 11,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: 20,
    height: 64,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant,
    gap: 16,
  },
  textInput: {
    flex: 1,
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  featureCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.primaryContainer + '30',
    padding: 20,
    borderRadius: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '20',
  },
  featureInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  featureTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  featureDesc: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 1,
  },
  toggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLowest,
    padding: 20,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  toggleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toggleTitle: {
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  qrCommandCard: {
    backgroundColor: Theme.colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 16,
    borderWidth: 2,
    borderColor: Theme.colors.outlineVariant,
    borderStyle: 'dashed',
  },
  qrActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qrThumb: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  qrActiveTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 15,
    color: Theme.colors.primary,
  },
  qrActiveSub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  qrEmptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  qrEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Theme.colors.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrEmptyTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  qrEmptySub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  backupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLowest,
    padding: 20,
    borderRadius: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  backupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Theme.colors.primaryContainer + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backupTitle: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 15,
    color: Theme.colors.onSurface,
  },
  backupSub: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 1,
  },
  finalSaveBtn: {
    backgroundColor: Theme.colors.primary,
    height: 64,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  finalSaveText: {
    fontFamily: Theme.typography.headlineBlack,
    color: '#FFF',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  categoryInputContainer: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 16,
  },
  categoryInput: {
    flex: 1,
    height: 56,
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: Theme.typography.bodySemiBold,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  addCategoryBtn: {
    width: 56,
    height: 56,
    backgroundColor: Theme.colors.primary,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
    gap: 8,
  },
  tagText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 13,
    color: Theme.colors.onSurfaceVariant,
  },
  removeTag: {
    padding: 2,
  },
});
