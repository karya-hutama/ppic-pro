
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * PENTING:
 * Salin konfigurasi di bawah ini dari Firebase Console Anda:
 * Project Settings (ikon gerigi) -> General -> Your Apps -> Web App.
 */
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "SALIN_API_KEY_ANDA_DI_SINI", 
  authDomain: "ppic-pro.firebaseapp.com",
  projectId: "ppic-pro",
  storageBucket: "ppic-pro.appspot.com",
  messagingSenderId: "SALIN_SENDER_ID_ANDA",
  appId: "SALIN_APP_ID_ANDA"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
