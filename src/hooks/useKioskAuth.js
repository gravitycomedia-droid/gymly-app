// src/hooks/useKioskAuth.js
// Manages kiosk device pairing state via localStorage.

import { useState, useEffect } from 'react';
import { pairDeviceByCode, updateKioskDevice } from '../firebase/firestore-kiosk';
import { serverTimestamp } from 'firebase/firestore';

const DEVICE_ID_KEY = 'gymly_kiosk_device_id';
const GYM_ID_KEY = 'gymly_kiosk_gym_id';
const MODE_KEY = 'gymly_kiosk_mode';

const useKioskAuth = () => {
  const [deviceId, setDeviceId] = useState(() => localStorage.getItem(DEVICE_ID_KEY));
  const [gymId, setGymId] = useState(() => localStorage.getItem(GYM_ID_KEY));
  const [mode, setMode] = useState(() => localStorage.getItem(MODE_KEY) || 'entry');
  const [pairing, setPairing] = useState(false);
  const [pairingError, setPairingError] = useState(null);

  const isPaired = !!deviceId && !!gymId;

  // Update device lastSeen periodically (every 60 seconds)
  useEffect(() => {
    if (!isPaired) return;
    const updateLastSeen = () => {
      updateKioskDevice(deviceId, { lastSeen: serverTimestamp() }).catch(() => {});
    };
    updateLastSeen();
    const interval = setInterval(updateLastSeen, 60000);
    return () => clearInterval(interval);
  }, [isPaired, deviceId]);

  const pair = async (code) => {
    setPairing(true);
    setPairingError(null);
    try {
      const device = await pairDeviceByCode(code);
      localStorage.setItem(DEVICE_ID_KEY, device.deviceId);
      localStorage.setItem(GYM_ID_KEY, device.gymId);
      localStorage.setItem(MODE_KEY, device.mode);
      setDeviceId(device.deviceId);
      setGymId(device.gymId);
      setMode(device.mode);
      return true;
    } catch (err) {
      setPairingError(err.message);
      return false;
    } finally {
      setPairing(false);
    }
  };

  const unpair = () => {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(GYM_ID_KEY);
    localStorage.removeItem(MODE_KEY);
    setDeviceId(null);
    setGymId(null);
    setMode('entry');
  };

  return {
    isPaired,
    deviceId,
    gymId,
    mode,
    pairing,
    pairingError,
    pair,
    unpair,
  };
};

export default useKioskAuth;
