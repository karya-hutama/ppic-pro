
import React, { useState, useMemo, useEffect } from 'react';

interface InventoryROPProps {
  syncedRequirements: any[];
  onCreateRO: (reorderItems: any[]) => void;
}

const InventoryROP: React.FC<InventoryROPProps> = ({ syncedRequirements = [], onCreateRO }) => {
  const [materialSettings, setMaterialSettings] = useState<Record<string, { safetyDays: number }>>({});

  // Initialize safety days for synced materials
  useEffect(() => {
    if (syncedRequirements && syncedRequirements.length > 0) {
      setMaterialSettings(prev => {
        const next = { ...prev };
        syncedRequirements.forEach(req => {
          if (!next[req.id]) {
            next[req.id] = { safetyDays: 2 };
          }
        });
        return next;
      });
    }
  }, [syncedRequirements]);

  const handleSafetyChange = (id: string, val: string) => {
    const num = parseInt(val) || 0;
    setMaterialSettings(prev => ({
      ...prev,
      [id]: { ...prev[id], safetyDays: num }
    }));
  };

  const analysisData = useMemo(() => {
    return (syncedRequirements || []).map(req => {
      const setting = materialSettings[req.id] || { safetyDays: 2 };
      const weeklyUsage = Number(req.usageAmount) || 0;
      const dailyUsage = weeklyUsage / 7;
      const leadTimeDemand = dailyUsage * (Number(req.leadTime) || 0);
      const safetyStockDemand = dailyUsage * (Number(setting.safetyDays) || 0);
      
      // Formula: Weekly Requirement + (Daily * LeadTime) + (Daily * SafetyDays)
      const ropThreshold = weeklyUsage + leadTimeDemand + safetyStockDemand;
      const currentStock = Number(req.currentStock) || 0;
      const isReorder = currentStock < ropThreshold;
      const health = ropThreshold > 0 ? (currentStock / ropThreshold) * 100 : 100;
      
      // Hitung kekurangan (shortage) jika perlu reorder
      const shortage = isReorder ? Math.ceil(ropThreshold - currentStock) : 0;

      return {
        ...req,
        safetyDays: setting.safetyDays,
        dailyUsage,
        leadTimeDemand,
        safetyStockDemand,
        ropThreshold,
        isReorder,
        health,
        shortage
      };
    });
  }, [syncedRequirements, materialSettings]);

  const handleLanjutKeRO = () => {
    const reorderItems = analysisData.filter(d => d.isReorder);
    if (reorderItems.length === 0) {
      alert("Tidak ada material yang perlu dipesan ulang (Status Safe).");
      return;
    }
    
    // Kirim data ke App.tsx untuk diproses jadi RO
    onCreateRO(reorderItems.map(item => ({
      ...item,
      ropThreshold: item.ropThreshold // Pastikan ini dikirim agar App.tsx tahu berapa targetnya
    })));
  };

  if (!syncedRequirements || syncedRequirements.length === 0) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-center animate-in fade-in">
        <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-5xl mb-6 grayscale opacity-30">📉</div>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Belum Ada Data Sinkronisasi</h2>
        <p className="text-slate-400 mt-2 max-w-sm text-sm font-medium">Lakukan "Kalkulasi Bahan Baku" di menu <b>Schedule Prod</b> dan tekan tombol <b>Sync to ROP Planning</b>.</p>
      </div>
    );
  }

  return (
    <div className="py-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight">Inventory ROP Planning</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm font-medium">Batas Aman Inventori Berdasarkan Rencana Produksi</p>
        </div>
        <div className="bg-[#1C0770] text-white px-6 py-3 rounded-2xl flex items-center gap-3 shadow-xl shadow-[#1C0770]/20">
           <span className="text-xl">🛡️</span>
           <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase text-white/40 leading-none mb-1">Status Buffer</span>
              <span className="text-xs font-bold">{analysisData.filter(d => d.isReorder).length} Material Perlu Order</span>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] md:rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-100 bg-slate-50/30">
           <h3 className="font-black text-xl text-slate-800 tracking-tight">Analisis Titik Pemesanan Kembali (ROP)</h3>
           <p className="text-[9px] md:text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Formula: Produksi Minggu Ini + (Daily * LeadTime) + (Daily * SafetyDays)</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-slate-50/50 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-6 md:px-10 py-6">Material Detail</th>
                <th className="px-4 py-6 text-center">Safety Days</th>
                <th className="px-4 py-6 text-center">Produksi (W)</th>
                <th className="px-4 py-6 text-center">Buffer (LT+SS)</th>
                <th className="px-6 py-6 text-center bg-indigo-50/50 text-[#1C0770]">ROP Threshold</th>
                <th className="px-6 md:px-10 py-6 text-center">Current Stock</th>
                <th className="px-4 py-6 text-center bg-rose-50/30 text-rose-600">Shortage</th>
                <th className="px-6 md:px-10 py-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {analysisData.map(item => (
                <tr key={item.id} className={`hover:bg-slate-50/40 transition-colors ${item.isReorder ? 'bg-rose-50/20' : ''}`}>
                  <td className="px-6 md:px-10 py-7">
                    <div className="text-sm font-black text-slate-800">{item.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.id}</span>
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[8px] font-bold">LT: {item.leadTime} Hari</span>
                    </div>
                  </td>
                  <td className="px-4 py-7">
                    <div className="flex items-center justify-center gap-2">
                       <input 
                         type="number"
                         min="0"
                         value={item.safetyDays}
                         onChange={(e) => handleSafetyChange(item.id, e.target.value)}
                         className="w-12 h-10 text-center border-2 border-slate-100 rounded-xl font-black text-[#1C0770] outline-none focus:border-[#1C0770] transition-all bg-white"
                       />
                       <span className="text-[10px] font-black text-slate-300 uppercase">H</span>
                    </div>
                  </td>
                  <td className="px-4 py-7 text-center">
                    <div className="text-sm font-bold text-slate-700">{Math.round(item.usageAmount).toLocaleString()}</div>
                    <div className="text-[8px] text-slate-300 font-bold uppercase">{item.usageUnit}</div>
                  </td>
                  <td className="px-4 py-7 text-center">
                    <div className="text-sm font-bold text-slate-500">+{Math.round(item.leadTimeDemand + item.safetyStockDemand).toLocaleString()}</div>
                    <div className="text-[8px] text-slate-300 font-bold uppercase">Demand Buffer</div>
                  </td>
                  <td className="px-6 py-7 text-center bg-indigo-50/30">
                    <div className="text-lg font-black text-[#1C0770]">{Math.round(item.ropThreshold).toLocaleString()}</div>
                    <div className="text-[8px] text-indigo-400 font-bold uppercase">ROP Limit</div>
                  </td>
                  <td className="px-6 md:px-10 py-7 text-center">
                    <div className={`text-lg font-black ${item.isReorder ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {(item.currentStock || 0).toLocaleString()}
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden max-w-[120px] mx-auto">
                      <div 
                        className={`h-full transition-all duration-700 ${item.health < 100 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'}`} 
                        style={{ width: `${Math.min(item.health, 100)}%` }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-4 py-7 text-center bg-rose-50/10">
                    <div className={`text-lg font-black ${item.shortage > 0 ? 'text-rose-600' : 'text-slate-200'}`}>
                      {item.shortage > 0 ? item.shortage.toLocaleString() : '-'}
                    </div>
                    <div className="text-[8px] text-slate-400 font-bold uppercase">{item.shortage > 0 ? item.usageUnit : ''}</div>
                  </td>
                  <td className="px-6 md:px-10 py-7 text-right">
                    <span className={`inline-block px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${item.isReorder ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                      {item.isReorder ? '⚠️ Reorder' : '✅ Safe'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-6 md:p-10 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-4 text-slate-400">
              <span className="text-2xl">📦</span>
              <p className="text-xs md:text-sm font-medium italic">Ambang batas (ROP) secara dinamis mengikuti perubahan jadwal produksi yang baru disinkronkan.</p>
           </div>
           <button 
             className="w-full md:w-auto px-10 py-5 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-indigo-500/20 hover:scale-[1.03] transition-all"
             onClick={handleLanjutKeRO}
           >
              Buat Pesanan Barang (Request Order)
           </button>
        </div>
      </div>
    </div>
  );
};

export default InventoryROP;
