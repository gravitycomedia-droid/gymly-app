import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, orderBy, getDocs } from "firebase/firestore";

const app = initializeApp({
  apiKey: "AIzaSyAIlJiIhj3Am9Rvtrm2LJLrA1EUmHwFNoQ",
  authDomain: "gymly-app-06.firebaseapp.com",
  projectId: "gymly-app-06"
});
const db = getFirestore(app);

async function run() {
  try {
    const q = query(
      collection(db, 'users'),
      where('gym_id', '==', 'random_id'),
      where('role', '==', 'member'),
      orderBy('created_at', 'desc')
    );
    const snap = await getDocs(q);
    console.log("Query SUCCESS! Docs:", snap.size);
  } catch(e) {
    console.error("Query FAILED:", e.message);
  }
}
run();
