// src/hooks/useKioskCamera.js
// Centralised camera lifecycle hook for kiosk screens.
// Camera is ONLY opened on explicit user action.
// Camera is ALWAYS stopped after: success, failure, 30s inactivity.

import { useRef, useState, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';

const INACTIVITY_TIMEOUT_MS = 30000; // 30 seconds
const STORAGE_KEY = 'kiosk_camera_facing_mode';

const useKioskCamera = (onQRDetected) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const activeRef = useRef(false);

  const [cameraState, setCameraState] = useState('idle'); // 'idle' | 'active' | 'error'
  const [cameraError, setCameraError] = useState(null);
  
  // Initialize facingMode from localStorage, default to 'environment'
  const [facingMode, setFacingMode] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'environment';
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setCameraState('idle');
  }, []);

  const startInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      stopCamera();
    }, INACTIVITY_TIMEOUT_MS);
  }, [stopCamera]);

  const scanFrame = useCallback(() => {
    if (!activeRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      scanLoopRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      // If front camera, we might want to mirror it for display, but jsQR needs raw image.
      // We flip display via CSS, so we don't need to flip canvas here.
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && code.data) {
        stopCamera();
        onQRDetected(code.data);
        return;
      }
    }

    scanLoopRef.current = requestAnimationFrame(scanFrame);
  }, [stopCamera, onQRDetected]);

  const startCamera = useCallback(async (modeOverride) => {
    const modeToUse = modeOverride || facingMode;
    setCameraError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: modeToUse,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      activeRef.current = true;
      setCameraState('active');
      startInactivityTimer();
      scanLoopRef.current = requestAnimationFrame(scanFrame);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Camera access denied. Please allow camera permissions.');
      setCameraState('error');
    }
  }, [facingMode, scanFrame, startInactivityTimer]);

  const toggleCamera = useCallback((e) => {
    if (e) {
      e.stopPropagation(); // prevent clicking on scanner box
    }
    setFacingMode((prev) => {
      const newMode = prev === 'environment' ? 'user' : 'environment';
      localStorage.setItem(STORAGE_KEY, newMode);
      if (activeRef.current) {
        startCamera(newMode);
      }
      return newMode;
    });
  }, [startCamera]);

  return {
    videoRef,
    canvasRef,
    cameraState,
    cameraError,
    startCamera,
    stopCamera,
    toggleCamera,
    facingMode,
  };
};

export default useKioskCamera;
