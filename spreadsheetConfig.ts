
/**
 * KONFIGURASI GOOGLE SHEETS PPIC PRO
 * 
 * PENTING UNTUK MENGHINDARI "Failed to fetch":
 * 1. Saat klik "Deploy" -> "New Deployment".
 * 2. "Execute as": Pilih "Me" (Email Anda).
 * 3. "Who has access": WAJIB pilih "Anyone". 
 *    (Jangan pilih "Anyone with Google Account" karena akan memicu error CORS).
 * 4. Salin kode dari file "backend-google-apps-script.js" ke editor Apps Script.
 * 5. Tempelkan URL hasil deploy ke variabel webAppUrl di bawah ini.
 */
export const SPREADSHEET_CONFIG = {
  // GANTI URL DI BAWAH INI dengan URL Web App Anda
  webAppUrl: "https://script.google.com/macros/s/AKfycbyX3H0mbGrVBjdYCl-KYKvEMkAk7e5mNhWYizrUSIXyPbNVAVXr-YrZTIEHq5_sC0U55A/exec",
  
  // Interval sinkronisasi otomatis (dalam milidetik)
  pollInterval: 30000 
};
