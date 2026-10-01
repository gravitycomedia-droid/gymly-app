import { useEffect, useRef, useState } from 'react';

// "Add photo" chooser: open camera, pick from gallery, or pick from files.
// Phones get the native camera via <input capture>; desktops (where capture is
// ignored) get an in-app webcam view instead. Calls onPick(File) with an image.
const isTouchDevice = () => window.matchMedia?.('(pointer: coarse)').matches;

const sheetOverlay = { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,21,43,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 14 };
const sheet = { width: '100%', maxWidth: 400, background: 'var(--gl2-surface, #fff)', borderRadius: 20, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 };
const optionBtn = { display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid var(--gl2-border, #e5e5ea)', background: 'var(--gl2-surface, #fff)', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' };
const iconWrap = { width: 40, height: 40, borderRadius: 20, background: 'var(--gl2-primary-tint)', color: 'var(--gl2-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' };

function WebcamCapture({ onCapture, onClose, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => onErrorRef.current(err));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) onCapture(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.92);
  };

  return (
    <div style={{ ...sheetOverlay, alignItems: 'center' }} onClick={onClose}>
      <div style={{ ...sheet, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, textAlign: 'center' }}>Take photo</p>
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3' }}>
          <video ref={videoRef} autoPlay playsInline muted onLoadedMetadata={() => setReady(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {!ready && <p style={{ position: 'absolute', inset: 0, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14 }}>Starting camera…</p>}
        </div>
        <button type="button" className="gl2-btn gl2-btn-primary gl2-btn-lg" style={{ width: '100%', marginTop: 6 }} onClick={capture} disabled={!ready}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>photo_camera</span>Capture
        </button>
        <button type="button" className="gl2-btn gl2-btn-secondary gl2-btn-lg" style={{ width: '100%' }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function SourceOption({ icon, title, sub, onClick }) {
  return (
    <button type="button" style={optionBtn} onClick={onClick}>
      <span style={iconWrap}><span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span></span>
      <span>
        <span style={{ display: 'block', fontWeight: 700 }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--gl2-muted)' }}>{sub}</span>
      </span>
    </button>
  );
}

export default function PhotoSourceSheet({ open, onClose, onPick, onError }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const filesRef = useRef(null);
  const [webcam, setWebcam] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError?.(new Error('Please choose an image file')); return; }
    onClose();
    onPick(file);
  };

  const openCamera = () => {
    if (!isTouchDevice() && navigator.mediaDevices?.getUserMedia) setWebcam(true);
    else cameraRef.current?.click();
  };

  return (
    <>
      {/* Inputs stay mounted so a picker can return after the sheet closes */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={filesRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.gif" style={{ display: 'none' }} onChange={handleFile} />

      {open && !webcam && (
        <div style={sheetOverlay} onClick={onClose}>
          <div style={sheet} onClick={(e) => e.stopPropagation()}>
            <p style={{ margin: '0 0 4px', fontWeight: 800, textAlign: 'center' }}>Add member photo</p>
            <SourceOption icon="photo_camera" title="Open camera" sub="Take a new photo" onClick={openCamera} />
            <SourceOption icon="photo_library" title="Choose from gallery" sub="Pick an existing photo" onClick={() => galleryRef.current?.click()} />
            <SourceOption icon="folder" title="Choose from files" sub="Browse documents and downloads" onClick={() => filesRef.current?.click()} />
            <button type="button" className="gl2-btn gl2-btn-secondary" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}

      {webcam && (
        <WebcamCapture
          onClose={() => setWebcam(false)}
          onCapture={(file) => { setWebcam(false); onClose(); onPick(file); }}
          onError={(err) => {
            setWebcam(false);
            // No webcam / permission denied — the gallery and files options still work.
            onError?.(new Error(err?.name === 'NotAllowedError' ? 'Camera permission was denied' : 'No camera found on this device'));
          }}
        />
      )}
    </>
  );
}
