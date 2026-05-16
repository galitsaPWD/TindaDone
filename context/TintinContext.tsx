import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type TintinType = 'info' | 'success' | 'warning' | 'error';

interface TintinMessage {
  text: string;
  type: TintinType;
  id: number;
}

interface TintinContextType {
  say: (text: string, type?: TintinType) => void;
  message: TintinMessage | null;
  clearMessage: () => void;
}

const TintinContext = createContext<TintinContextType | undefined>(undefined);

export const TintinProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<TintinMessage | null>(null);
  const timeoutRef = useRef<any>(null);

  const say = useCallback((text: string, type: TintinType = 'info') => {
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const id = Date.now();
    setMessage({ text, type, id });

    // Auto-clear after 4 seconds (1s for animation, 2s for reading, 1s for exit)
    timeoutRef.current = setTimeout(() => {
      setMessage(null);
    }, 4000);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return (
    <TintinContext.Provider value={{ say, message, clearMessage }}>
      {children}
    </TintinContext.Provider>
  );
};

export const useTintin = () => {
  const context = useContext(TintinContext);
  if (context === undefined) {
    throw new Error('useTintin must be used within a TintinProvider');
  }
  return context;
};
