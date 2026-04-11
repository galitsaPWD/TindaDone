import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Text, Modal, TextInput, Switch, Alert, InteractionManager, Image, ScrollView } from 'react-native';
import { Tabs } from 'expo-router';
import { Package, ShoppingBag, BarChart2, ReceiptText, Settings, X, Store, QrCode, Volume2, Vibrate as VibrateIcon, Database, Camera, Save, FileText, CheckCircle2 } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue,
  withTiming,
  interpolateColor
} from 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import { Theme } from '@/constants/Theme';
import { getBusinessSettings, saveBusinessSettings, exportData } from '../../lib/storage';
import { BusinessSettings } from '../../lib/types';

const { width } = Dimensions.get('window');
const TAB_BAR_WIDTH = width;
const TAB_WIDTH = TAB_BAR_WIDTH / 4;

function CustomTabBar({ state, descriptors, navigation }: any) {
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
    <View style={styles.tabBarContainer}>
      <View style={styles.tabBarMain}>
        {/* Sliding Pill */}
        <Animated.View style={[styles.activePill, pillStyle]} />
        
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

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

          const Icon = options.tabBarIcon;

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                {Icon && Icon({ 
                  color: isFocused ? Theme.colors.primary : Theme.colors.outline, 
                  size: 22 
                })}
              </View>
              <Text style={[
                styles.tabLabel, 
                { color: isFocused ? Theme.colors.primary : Theme.colors.outline }
              ]}>
                {options.tabBarLabel}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const [modalVisible, setModalVisible] = React.useState(false);
  const [settings, setSettings] = React.useState<BusinessSettings>({
    storeName: '',
    scannerBeep: true,
    scannerVibrate: true
  });
  const [tempName, setTempName] = React.useState('');

  React.useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await getBusinessSettings();
    setSettings({
      ...data,
      scannerBeep: data.scannerBeep ?? true,
      scannerVibrate: data.scannerVibrate ?? true
    });
    setTempName(data.storeName || '');
  };

  const handleSave = async () => {
    const updated = { ...settings, storeName: tempName };
    await saveBusinessSettings(updated);
    setSettings(updated);
    setModalVisible(false);
    Alert.alert('Success', 'Settings updated!');
  };

  const toggleBeep = (val: boolean) => setSettings(prev => ({ ...prev, scannerBeep: val }));
  const toggleVibrate = (val: boolean) => setSettings(prev => ({ ...prev, scannerVibrate: val }));

  const handlePickQR = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      let finalUri = result.assets[0].uri;
      if (result.assets[0].base64) {
        finalUri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      }
      setSettings(prev => ({ ...prev, gcashQrUri: finalUri }));
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
        headerTitleStyle: {
          fontFamily: Theme.typography.headlineBlack,
          fontSize: 22,
          color: Theme.colors.onSurface,
        },
        headerTitleAlign: 'left',
        headerRight: () => (
          <TouchableOpacity 
            onPress={() => setModalVisible(true)}
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
        name="sell"
        options={{
          title: 'Sell Items',
          tabBarLabel: 'Sell',
          tabBarIcon: ({ color, size }: any) => <ShoppingBag color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Inventory',
          tabBarLabel: 'Inventory',
          tabBarIcon: ({ color, size }: any) => <Package color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Business Stats',
          tabBarLabel: 'Stats',
          tabBarIcon: ({ color, size }: any) => <BarChart2 color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="utang"
        options={{
          title: 'Credit (Utang)',
          tabBarLabel: 'Utang',
          tabBarIcon: ({ color, size }: any) => <ReceiptText color={color} size={size} />,
        }}
      />
    </Tabs>

    <Modal
      visible={modalVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Store Settings</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <X size={24} color={Theme.colors.onSurface} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsScroll}>
            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>General</Text>
              <View style={styles.inputContainer}>
                <Store size={18} color={Theme.colors.primary} style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Store Name"
                  value={tempName}
                  onChangeText={setTempName}
                />
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Scanner Feedback</Text>
              
              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelGroup}>
                  <Volume2 size={20} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.toggleText}>Sound (Beep)</Text>
                </View>
                <Switch
                  value={settings.scannerBeep}
                  onValueChange={toggleBeep}
                  trackColor={{ false: '#767577', true: Theme.colors.primary }}
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.toggleLabelGroup}>
                  <VibrateIcon size={20} color={Theme.colors.onSurfaceVariant} />
                  <Text style={styles.toggleText}>Vibration</Text>
                </View>
                <Switch
                  value={settings.scannerVibrate}
                  onValueChange={toggleVibrate}
                  trackColor={{ false: '#767577', true: Theme.colors.primary }}
                />
              </View>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Payments</Text>
              
              <Text style={styles.settingHint}>Set your GCash QR code for quick customer payments.</Text>
              <TouchableOpacity style={styles.qrPickerBtn} onPress={handlePickQR}>
                {settings.gcashQrUri ? (
                  <View style={styles.qrPreviewContainer}>
                    <Image 
                      source={{ uri: settings.gcashQrUri }} 
                      style={styles.qrThumbnail}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.qrLabel}>Active QR Code</Text>
                      <Text style={styles.qrSetText}>Tap to change</Text>
                    </View>
                    <CheckCircle2 size={20} color={Theme.colors.primary} />
                  </View>
                ) : (
                  <View style={styles.qrPickerEmpty}>
                    <Camera size={24} color={Theme.colors.outline} />
                    <Text style={styles.qrPickerText}>Upload GCash QR</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.settingGroup}>
              <Text style={styles.groupLabel}>Data & Safety</Text>
              <Text style={styles.settingHint}>Export your products and transactions to a backup file.</Text>
              <TouchableOpacity style={styles.backupBtn} onPress={exportData}>
                <Database size={20} color={Theme.colors.primary} style={{ marginRight: 12 }} />
                <Text style={styles.backupBtnText}>Create Full Backup</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.saveBtn} onPress={() => setModalVisible(false)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color="#FFF" />
                <Text style={styles.saveBtnText}>Save Settings</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    width: width,
    backgroundColor: Theme.colors.surface,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBarMain: {
    flexDirection: 'row',
    width: '100%',
    height: 72,
    backgroundColor: Theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.outlineVariant + '40',
    padding: 6,
    paddingBottom: 20,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    width: TAB_WIDTH - 12,
    height: 48,
    backgroundColor: Theme.colors.primary + '12',
    borderRadius: 16,
    top: 5,
    left: 6,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 2,
  },
  tabLabel: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontFamily: Theme.typography.headline,
    fontSize: 22,
    color: Theme.colors.onSurface,
  },
  settingsScroll: {
    marginBottom: 24,
  },
  settingGroup: {
    marginBottom: 20,
  },
  groupLabel: {
    fontFamily: Theme.typography.bodySemiBold,
    color: Theme.colors.primary,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceVariant,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  toggleLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 16,
    color: Theme.colors.onSurface,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: Theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
  },
  qrButtonText: {
    fontFamily: Theme.typography.bodyBold,
    fontSize: 16,
    color: Theme.colors.primary,
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: Theme.colors.outlineVariant + '20',
    padding: 20,
    backgroundColor: Theme.colors.surface,
  },
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: '#FFF',
    fontSize: 16,
  },
  settingHint: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginBottom: 12,
    lineHeight: 18,
  },
  qrPickerBtn: {
    backgroundColor: Theme.colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Theme.colors.outlineVariant,
    borderStyle: 'dashed',
  },
  qrPickerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrPickerText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.outline,
  },
  qrPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qrLabel: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.primary,
  },
  qrThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: Theme.colors.surfaceVariant,
  },
  qrSetText: {
    fontFamily: Theme.typography.bodyMedium,
    fontSize: 12,
    color: Theme.colors.outline,
    marginTop: 2,
  },
  backupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerLow,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Theme.colors.outlineVariant,
  },
  backupBtnText: {
    fontFamily: Theme.typography.bodyBold,
    color: Theme.colors.onSurface,
  },
});
