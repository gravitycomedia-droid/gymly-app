import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage } from './config';

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
