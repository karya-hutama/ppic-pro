
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SalesData, FinishGood } from '../types';
import * as XLSX from 'xlsx';

interface SalesAnalysisProps {
  salesData: SalesData[];
  finishGoods: FinishGood[];
  onUpdateSales?: (data: SalesData[]) => void;
  onSendAnalysis?: (results: any[]) => void;
}

const SalesAnalysis: React.FC<SalesAnalysisProps> = ({ salesData, finishGoods, onUpdateSales, onSendAnalysis }) => {
  // Inisialisasi tanggal lokal 30 hari terakhir
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  // Fungsi pembersihan tanggal yang 100% akurat terhadap zona waktu lokal
  const cleanDate = (d: any): string => {
    if (!d) return "";
    
    let dateObj: Date;
    
    // Jika input adalah string dengan format YYYY-MM-DD murni (tanpa jam/timezone)
    if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return d;
    }

    // Buat objek Date (ini akan menangani format ISO atau string tanggal lainnya)
    dateObj = new Date(d);
    
    // Jika objek date tidak valid
    if (isNaN(dateObj.getTime())) return "";
    
    // Ambil komponen tanggal berdasarkan waktu LOKAL browser (bukan UTC)
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };

  // Mencari tanggal terbaru dari data spreadsheet
  const lastUpdateDate = useMemo(() => {
    if (!salesData || salesData.length === 0) return null;
    
    // Konversi semua tanggal ke string YYYY-MM-DD lokal
    const dates = salesData.map(s => cleanDate(s.date)).filter(d => d !== "");
    if (dates.length === 0) return null;
    
    // Cari string tanggal terbesar
    const latestStr = dates.reduce((max, current) => current > max ? current : max, dates[0]);
    
    // Format ke Bahasa Indonesia
    const [y, m, d] = latestStr.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    
    return localDate.toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }, [salesData]);

  const analysis = useMemo(() => {
    const filtered = salesData.filter(s => {
      const sDate = cleanDate(s.date);
      return sDate && sDate >= startDate && sDate <= endDate;
    });

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const calendarDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const dateRangeList: string[] = [];
    const dayCounts = new Array(7).fill(0);
    const tempDate = new Date(startDate);
    while (tempDate <= end) {
      const dStr = cleanDate(tempDate);
      dateRangeList.push(dStr);
      dayCounts[tempDate.getDay()]++;
      tempDate.setDate(tempDate.getDate() + 1);
    }

    const results = finishGoods.map(sku => {
      const skuSales = filtered.filter(s => s.skuId === sku.id);
      
      const dailyAgg: Record<string, number> = {};
      skuSales.forEach(s => {
        const d = cleanDate(s.date);
        const qty = Number(s.quantitySold ?? (s as any).quantity ?? (s as any).qty ?? 0);
        dailyAgg[d] = (dailyAgg[d] || 0) + qty;
      });

      const total = Object.values(dailyAgg).reduce((sum, q) => sum + q, 0);
      const avgDaily = calendarDays > 0 ? total / calendarDays : 0;
      const avgWeekly = avgDaily * 7;

      let peakDayIdx = -1;
      let maxDayAvg = -1;
      for (let i = 0; i < 7; i++) {
        const occurrences = dayCounts[i];
        if (occurrences === 0) continue;
        
        const targetDates = dateRangeList.filter(d => new Date(d).getDay() === i);
        const totalOnThisDayType = targetDates.reduce((sum, d) => sum + (dailyAgg[d] || 0), 0);
        const dayAvg = totalOnThisDayType / occurrences;

        if (dayAvg > maxDayAvg) {
          maxDayAvg = dayAvg;
          peakDayIdx = i;
        }
      }

      let peakWeekly = 0;
      if (dateRangeList.length >= 7) {
        for (let i = 0; i <= dateRangeList.length - 7; i++) {
          const windowDates = dateRangeList.slice(i, i + 7);
          const windowTotal = windowDates.reduce((sum, d) => sum + (dailyAgg[d] || 0), 0);
          if (windowTotal > peakWeekly) peakWeekly = windowTotal;
        }
      } else {
        peakWeekly = total;
      }
      
      return {
        id: sku.id,
        name: sku.name,
        totalSold: total,
        averageDaily: avgDaily,
        averageWeekly: avgWeekly,
        peakWeekly: peakWeekly,
        peakDayName: total > 0 && peakDayIdx !== -1 ? DAYS_ID[peakDayIdx] : '-',
        peakDayIdx: total > 0 ? peakDayIdx : -1,
        qtyPerBatch: sku.qtyPerBatch
      };
    });

    return { results, calendarDays };
  }, [startDate, endDate, salesData, finishGoods]);

  const handleTransferToTarget = () => {
    if (onSendAnalysis) {
      onSendAnalysis(analysis.results);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      {showNotification && (
        <div className="fixed top-8 right-8 z-[160] bg-[#1C0770] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
          <span>✅</span>
          <span className="font-bold text-sm">{showNotification}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Analisa Penjualan</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm font-medium">Monitoring performa SKU untuk akurasi target produksi.</p>
        </div>
        
        <button onClick={handleTransferToTarget} className="px-8 py-4 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:scale-105 transition-all shadow-xl shadow-indigo-100">
           Kirim Analisa & Rekomendasi 🚀
        </button>
      </div>

      <div className="space-y-4">
        {/* Info Update Terakhir */}
        <div className="flex items-center gap-3 ml-2">
           <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-[#1C0770] rounded-full border border-indigo-100">
              <span className="text-xs">🔄</span>
              <span className="text-[10px] font-black uppercase tracking-widest">
                Data Terakhir Update: {lastUpdateDate || 'Belum ada data'}
              </span>
           </div>
           {!lastUpdateDate && (
             <span className="text-[10px] text-rose-500 font-bold italic">*Sinkronisasi spreadsheet diperlukan</span>
           )}
        </div>

        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-end gap-6 max-w-3xl">
            <div className="flex-1 w-full">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Rentang Awal</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/50" />
            </div>
            <div className="flex-1 w-full">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">Rentang Akhir</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-4 ring-indigo-50/50" />
            </div>
            <div className="bg-indigo-50 px-5 py-3.5 rounded-2xl border border-indigo-100 hidden md:block">
               <div className="text-[8px] font-black text-indigo-400 uppercase">Analisa Periode</div>
               <div className="text-xs font-black text-[#1C0770]">{analysis.calendarDays} Hari</div>
            </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-10 py-6">Product SKU</th>
                <th className="px-4 py-6 text-center">Total Penjualan</th>
                <th className="px-4 py-6 text-center">Rata-rata Harian</th>
                <th className="px-4 py-6 text-center bg-indigo-50/20 text-[#1C0770]">Target Mingguan</th>
                <th className="px-4 py-6 text-center bg-amber-50/20 text-amber-700">Hist Peak (7D)</th>
                <th className="px-10 py-6 text-center">Rekomendasi Hari Puncak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm font-medium">
              {analysis.results.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-10 py-20 text-center text-slate-400 italic">Data tidak ditemukan untuk rentang tanggal ini.</td>
                </tr>
              ) : (
                analysis.results.map(res => (
                  <tr key={res.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-10 py-6">
                      <div className="font-black text-slate-800 tracking-tight">{res.name}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{res.id}</div>
                    </td>
                    <td className="px-4 py-6 text-center font-bold text-slate-800">
                      {res.totalSold.toLocaleString()}
                    </td>
                    <td className="px-4 py-6 text-center font-bold text-slate-500">
                      {res.averageDaily.toFixed(1)}
                    </td>
                    <td className="px-4 py-6 text-center font-black text-[#1C0770] bg-indigo-50/5">
                      {Math.round(res.averageWeekly).toLocaleString()}
                    </td>
                    <td className="px-4 py-6 text-center font-black text-amber-600 bg-amber-50/5">
                      {res.peakWeekly > 0 ? res.peakWeekly.toLocaleString() : '-'}
                    </td>
                    <td className="px-10 py-6 text-center">
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${res.peakDayIdx !== -1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                         <span>{res.peakDayIdx !== -1 ? '🔥' : '❄️'}</span> {res.peakDayName}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SalesAnalysis;
