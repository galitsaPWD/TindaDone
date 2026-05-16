import React, { createContext, useContext, useState, useEffect } from 'react';
import { getBusinessSettings, saveBusinessSettings } from '../lib/storage';
import { BusinessSettings } from '../lib/types';

type SettingsContextType = {
  businessSettings: BusinessSettings;
  updateSettings: (newSettings: BusinessSettings) => Promise<void>;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await getBusinessSettings();
    setBusinessSettings(settings);
  };

  const updateSettings = async (newSettings: BusinessSettings) => {
    setBusinessSettings(newSettings);
    await saveBusinessSettings(newSettings);
  };

  return (
    <SettingsContext.Provider value={{ 
      businessSettings, 
      updateSettings,
      isSettingsOpen,
      setIsSettingsOpen
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
