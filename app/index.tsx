import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { isActivated, getTrialStatus } from '../lib/license';

export default function Index() {
  const [access, setAccess] = useState<{ activated: boolean; trialActive: boolean } | null>(null);

  useEffect(() => {
    const check = async () => {
      const activated = await isActivated();
      const trial = await getTrialStatus();
      setAccess({ activated, trialActive: trial.active });
    };
    check();
  }, []);

  if (access === null) return null;
  
  if (access.activated || access.trialActive) {
    return <Redirect href="/(tabs)/sell" />;
  }
  
  return <Redirect href="/activate" />;
}
