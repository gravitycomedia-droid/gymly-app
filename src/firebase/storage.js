import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './config';

/**
 * Compress an image File/Blob using a canvas element, returning a Blob.
 * Max dimension is 400px. Falls back to original if canvas is unavailable.
 */
async function compressImage(file, maxDim = 400) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Upload (and compress) a member profile photo.
 * Returns the public download URL.
 */
export const uploadMemberPhoto = async (gymId, memberId, file) => {
  const compressed = await compressImage(file);
  const storageRef = ref(storage, `members/${gymId}/${memberId}/profile_photo`);
  await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  return getDownloadURL(storageRef);
};

export const uploadLogo = async (gymId, file) => {
  const storageRef = ref(storage, `gyms/${gymId}/logo`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return url;
};

export const uploadPhoto = async (gymId, file, index) => {
  const storageRef = ref(storage, `gyms/${gymId}/photos/photo_${index}_${Date.now()}`);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return url;
};

export const deletePhoto = async (url) => {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting photo:', error);
  }
};
