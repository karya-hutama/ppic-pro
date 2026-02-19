
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * PENTING:
 * Salin konfigurasi di bawah ini dari Firebase Console Anda:
 * Project Settings (ikon gerigi) -> General -> Your Apps -> Web App.
 */
const firebaseConfig = {
  // GANTI NILAI DI BAWAH INI DENGAN DATA DARI FIREBASE CONSOLE ANDA
  apiKey: "SALIN_API_KEY_ANDA_DI_SINI", 
  authDomain: "ppic-pro.firebaseapp.com",
  projectId: "ppic-pro",
  storageBucket: "ppic-pro.appspot.com",
  messagingSenderId: "SALIN_SENDER_ID_ANDA",
  appId: "SALIN_APP_ID_ANDA"
};

// Validasi sederhana agar aplikasi memberikan peringatan di console jika config belum diisi
if (firebaseConfig.apiKey.includes("SALIN_")) {
  console.warn("PERINGATAN: firebaseConfig belum diisi dengan API Key yang valid dari Firebase Console.");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
