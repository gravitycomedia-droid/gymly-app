import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAIlJiIhj3Am9Rvtrm2LJLrA1EUmHwFNoQ",
  authDomain: "gymly-app-06.firebaseapp.com",
  projectId: "gymly-app-06",
  storageBucket: "gymly-app-06.firebasestorage.app",
  messagingSenderId: "321118546934",
  appId: "1:321118546934:web:a89b31bff189dadbf575d7"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  try {
    const usersSnapshot = await getDocs(collection(db, "users"));
    const users = [];
    usersSnapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));

    console.log("Found users: ", users.length);
    console.log(users);
  } catch(e) {
    console.error("FAIL:", e);
  }
}
run();
