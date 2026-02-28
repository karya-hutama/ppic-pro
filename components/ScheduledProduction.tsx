
import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { RawMaterial, FinishGood } from '../types';

const DAYS_NAME = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

interface ScheduledProductionProps {
  finishGoods: FinishGood[];
  rawMaterials: RawMaterial[];
  initialPlannedBatches?: Record<string, number> | null;
  initialSchedule?: Record<string, number[]>;
  initialStartDate?: string;
  existingId?: string;
  peakDayRecommendations?: Record<string, number>;
  transferredAnalysis?: any[] | null;
  onSave?: (schedule: Record<string, number[]>, startDate: string, targets: Record<string, number>, existingId?: string) => void;
  onSaveRMHistory?: (global: Record<string, number>, perSku: Record<string, Record<string, number>>, startDate: string) => void;
  onSyncToROP?: (requirements: any[]) => void;
}

const ScheduledProduction: React.FC<ScheduledProductionProps> = ({ 
  finishGoods = [], 
  rawMaterials = [], 
  initialPlannedBatches,
  initialSchedule,
  initialStartDate,
  existingId,
  peakDayRecommendations = {},
  transferredAnalysis = [],
  onSave,
  onSaveRMHistory,
  onSyncToROP 
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'schedule' | 'rm-needs'>('schedule');
  const [startDate, setStartDate] = useState(() => {
    if (initialStartDate) return initialStartDate;
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const activeFinishGoods = useMemo(() => {
    return (finishGoods || []).filter(fg => fg.isProductionReady !== false);
  }, [finishGoods]);

  const [schedule, setSchedule] = useState<Record<string, number[]>>(() => {
    if (initialSchedule) {
      // Ensure we have a deep copy and all active SKUs are present
      const initial: Record<string, number[]> = {};
      activeFinishGoods.forEach(sku => {
        if (initialSchedule[sku.id]) {
          initial[sku.id] = [...initialSchedule[sku.id]];
        } else {
          initial[sku.id] = new Array(7).fill(0);
        }
      });
      return initial;
    }
    const initial: Record<string, number[]> = {};
    activeFinishGoods.forEach(sku => {
      initial[sku.id] = new Array(7).fill(0);
    });
    return initial;
  });

  useEffect(() => {
    if (initialStartDate) setStartDate(initialStartDate);
  }, [initialStartDate]);

  // Only add missing SKUs to the schedule state, don't overwrite existing ones
  useEffect(() => {
    setSchedule(prev => {
      const next = { ...prev };
      let hasNewSku = false;
      activeFinishGoods.forEach(sku => {
        if (!next[sku.id]) {
          next[sku.id] = new Array(7).fill(0);
          hasNewSku = true;
        }
      });
      return hasNewSku ? next : prev;
    });
  }, [activeFinishGoods]);

  const scheduleDates = useMemo(() => {
    const dates = [];
    const [y, m, d] = startDate.split('-').map(Number);
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m - 1, d + i);
      dates.push({
        dayName: DAYS_NAME[date.getDay()],
        dayIdx: date.getDay(),
        formatted: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        fullDate: date
      });
    }
    return dates;
  }, [startDate]);

  const handleBatchChange = (skuId: string, dayRelativeIdx: number, val: string) => {
    const num = parseInt(val) || 0;
    setSchedule(prev => ({
      ...prev,
      [skuId]: (prev[skuId] || new Array(7).fill(0)).map((v, i) => i === dayRelativeIdx ? num : v)
    }));
  };

  const outputData = useMemo(() => {
    return activeFinishGoods.map(sku => {
      const scheduledBatch = (schedule[sku.id] || []).reduce((a, b) => a + (Number(b) || 0), 0);
      const targetBatch = initialPlannedBatches ? initialPlannedBatches[sku.id] || 0 : 0;
      
      const analysis = transferredAnalysis?.find(a => a.id === sku.id);
      const avgDaily = analysis?.averageDaily || 0;
      const daysToOut = avgDaily > 0 ? (sku.stock / avgDaily) : (sku.stock > 0 ? Infinity : 0);

      return { sku, targetBatch, scheduledBatch, daysToOut };
    });
  }, [schedule, initialPlannedBatches, activeFinishGoods, transferredAnalysis]);

  const rmNeeds = useMemo(() => {
    const global: Record<string, number> = {};
    const perSku: Record<string, Record<string, number>> = {};

    activeFinishGoods.forEach(fg => {
      const totalBatches = (schedule[fg.id] || []).reduce((a, b) => a + (Number(b) || 0), 0);
      if (totalBatches > 0 && fg.ingredients) {
        perSku[fg.id] = {};
        (fg.ingredients || []).forEach(ing => {
          const amountNeeded = totalBatches * Number(ing.quantity || 0);
          const material = rawMaterials.find(m => m.id === ing.materialId);
          
          if (material?.isProcessed && material.sourceMaterialId) {
            const yieldFactor = material.processingYield || 1;
            const convertedSourceAmount = amountNeeded / yieldFactor;
            global[material.sourceMaterialId] = (global[material.sourceMaterialId] || 0) + convertedSourceAmount;
            perSku[fg.id][ing.materialId] = amountNeeded;
          } else {
            global[ing.materialId] = (global[ing.materialId] || 0) + amountNeeded;
            perSku[fg.id][ing.materialId] = amountNeeded;
          }
        });
      }
    });

    return { global, perSku };
  }, [schedule, activeFinishGoods, rawMaterials]);

  const handleSyncToROP = () => {
    const requirements = Object.entries(rmNeeds.global).map(([id, amount]) => {
      const rm = (rawMaterials || []).find(m => m.id === id);
      return {
        id,
        name: rm?.name || id,
        usageAmount: Number(amount) || 0,
        usageUnit: rm?.usageUnit || '',
        leadTime: Number(rm?.leadTime) || 0,
        currentStock: Number(rm?.stock) || 0,
        purchaseUnit: rm?.purchaseUnit || '',
        conversionFactor: Number(rm?.conversionFactor) || 1,
        minStock: Number(rm?.minStock) || 0
      };
    });
    
    if (requirements.length === 0) {
      alert("Belum ada kebutuhan bahan baku untuk disinkronkan. Isi jadwal produksi terlebih dahulu.");
      return;
    }
    
    onSyncToROP?.(requirements);
  };

  const handleSaveAll = () => {
    if (onSave) {
      // Pastikan target dikirimkan secara eksplisit dari initialPlannedBatches
      const currentTargets = initialPlannedBatches || {};
      onSave(schedule, startDate, currentTargets, existingId);
    }
  };

  const handleDownloadExcel = () => {
    const globalDataToExport: any[] = [];
    Object.entries(rmNeeds.global || {}).forEach(([id, amount]) => {
      const rm = rawMaterials.find(m => m.id === id);
      globalDataToExport.push({
        'Nama Barang': rm?.name || id,
        'Total Requirement': Math.ceil(amount),
        'Unit': rm?.usageUnit || ''
      });
    });

    const perSkuDataToExport: any[] = [];
    Object.entries(rmNeeds.perSku || {}).forEach(([skuId, needs]) => {
      const sku = activeFinishGoods.find(s => s.id === skuId);
      Object.entries(needs || {}).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        perSkuDataToExport.push({
          'SKU': sku?.name || skuId,
          'Raw Material': rm?.name || rmId,
          'Qty': amount,
          'Unit': rm?.usageUnit || ''
        });
      });
    });

    const workbook = XLSX.utils.book_new();
    
    const globalWorksheet = XLSX.utils.json_to_sheet(globalDataToExport);
    XLSX.utils.book_append_sheet(workbook, globalWorksheet, "Global Needs");

    const perSkuWorksheet = XLSX.utils.json_to_sheet(perSkuDataToExport);
    XLSX.utils.book_append_sheet(workbook, perSkuWorksheet, "Per SKU Needs");

    XLSX.writeFile(workbook, `Kebutuhan_Bahan_Baku_${startDate}.xlsx`);
  };

  return (
    <div className="py-6 space-y-10 animate-in fade-in duration-500 overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Perencanaan Produksi</h1>
            {existingId && (
              <span className="px-3 py-1 bg-amber-100 text-amber-600 text-[10px] font-black uppercase rounded-lg border border-amber-200 animate-pulse">
                Mode Ubah Jadwal
              </span>
            )}
          </div>
          <p className="text-slate-500 mt-1 text-sm font-medium">Atur jadwal dan hitung kebutuhan logistik.</p>
        </div>
        
        <div className="flex bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
           <button 
             onClick={() => setActiveSubTab('schedule')}
             className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'schedule' ? 'bg-[#1C0770] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
           >
             1. Input Jadwal
           </button>
           <button 
             onClick={() => setActiveSubTab('rm-needs')}
             className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'rm-needs' ? 'bg-[#1C0770] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
           >
             2. Kebutuhan Bahan Baku
           </button>
        </div>
      </div>

      {activeSubTab === 'schedule' ? (
        <div className="space-y-8 animate-in slide-in-from-left-4">
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Mulai Produksi</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="bg-slate-50 px-3 py-1.5 rounded-xl text-xs font-black text-[#1C0770] outline-none border border-slate-100"
              />
            </div>
            <div className="flex gap-3">
               <button 
                 onClick={() => setActiveSubTab('rm-needs')}
                 className="px-6 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-all"
               >
                 🔍 Hitung Bahan Baku
               </button>
               <button 
                onClick={handleSaveAll} 
                className="px-8 py-4 bg-[#1C0770] text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-all"
               >
                💾 Simpan Jadwal
               </button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-auto max-h-[70vh] custom-scrollbar">
              <table className="w-full text-left min-w-[1400px] border-separate border-spacing-0">
                <thead className="bg-slate-50 uppercase font-black text-slate-400 sticky top-0 z-30 shadow-sm">
                  <tr className="text-[9px]">
                    <th className="px-10 py-6 border-r border-slate-100 bg-slate-50 sticky left-0 z-40 border-b">Product SKU</th>
                    <th className="px-4 py-6 text-center border-r border-slate-100 bg-slate-50 sticky left-[200px] z-40 border-b w-[80px]">SOH</th>
                    <th className="px-4 py-6 text-center border-r border-slate-100 bg-slate-50 sticky left-[280px] z-40 border-b w-[80px]">Days Out</th>
                    <th className="px-4 py-6 text-center border-r border-slate-100 bg-slate-50 sticky left-[360px] z-40 border-b w-[80px]">Target</th>
                    {scheduleDates.map((dateObj, idx) => (
                      <th key={dateObj.formatted} className="px-1 py-5 text-center border-r border-slate-100 min-w-[120px] border-b">
                        <div className="text-[#1C0770] mb-0.5">{dateObj.dayName}</div>
                        <div className="text-[8px] opacity-60">{dateObj.formatted}</div>
                      </th>
                    ))}
                    <th className="px-4 py-5 text-center border-r border-slate-100 font-black text-[#1C0770] border-b">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outputData.map(({ sku, targetBatch, scheduledBatch, daysToOut }) => {
                    const peakDayIdx = peakDayRecommendations[sku.id];
                    
                    // Conditional coloring logic for Total
                    let totalColorClass = "text-slate-900";
                    if (scheduledBatch > targetBatch) totalColorClass = "text-amber-600";
                    else if (scheduledBatch === targetBatch && targetBatch > 0) totalColorClass = "text-emerald-600";
                    else if (scheduledBatch < targetBatch) totalColorClass = "text-rose-600";

                    return (
                      <tr key={sku.id} className="hover:bg-slate-50/40">
                        <td className="px-10 py-6 border-r border-slate-100 font-black text-slate-800 bg-white sticky left-0 z-10 w-[200px]">
                          <div className="text-xs truncate max-w-[160px]">{sku.name}</div>
                          <div className="text-[8px] text-slate-400 font-bold mt-0.5">{sku.id}</div>
                        </td>
                        <td className="px-4 py-6 text-center border-r border-slate-100 bg-white sticky left-[200px] z-10 text-slate-600 font-bold w-[80px]">
                          {sku.stock.toLocaleString()}
                        </td>
                        <td className={`px-4 py-6 text-center border-r border-slate-100 font-black bg-white sticky left-[280px] z-10 w-[80px] ${daysToOut < 2 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {daysToOut === Infinity ? '∞' : daysToOut.toFixed(1)}H
                        </td>
                        <td className="px-4 py-6 text-center border-r border-slate-100 bg-slate-50/30 text-slate-400 font-bold sticky left-[360px] z-10 w-[80px]">
                          {targetBatch}
                        </td>
                        {scheduleDates.map((dateObj, dayRelIdx) => {
                          const isPeak = peakDayIdx === dateObj.dayIdx;
                          return (
                            <td key={dateObj.formatted} className={`px-2 py-5 border-r border-slate-100 transition-colors ${isPeak ? 'bg-amber-50/30' : ''}`}>
                               <input 
                                  type="number"
                                  placeholder="0"
                                  value={schedule[sku.id]?.[dayRelIdx] || ''}
                                  onChange={(e) => handleBatchChange(sku.id, dayRelIdx, e.target.value)}
                                  className={`w-16 mx-auto block px-1 py-3 text-center border-2 rounded-xl text-sm font-black outline-none transition-all ${isPeak ? 'border-amber-400' : 'bg-slate-50 border-slate-100'}`}
                                />
                            </td>
                          );
                        })}
                        <td className={`px-4 py-6 text-center border-r border-slate-100 font-black text-lg ${totalColorClass}`}>
                          {scheduledBatch}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-10 animate-in slide-in-from-right-4">
          <div className="flex justify-between items-center">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 text-[#1C0770] rounded-2xl flex items-center justify-center text-xl shadow-sm">📊</div>
                <div>
                   <h3 className="text-xl font-black text-slate-800 tracking-tight">Kalkulasi Raw Material (Purchasing Focus)</h3>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Rencana Produksi: {new Date(startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long'})}</p>
                </div>
             </div>
             <div className="flex gap-4">
                <button 
                  onClick={handleDownloadExcel}
                  className="px-6 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase text-[10px] hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
                >
                  <span>📥</span> Download Excel
                </button>
                <button 
                  onClick={() => onSaveRMHistory?.(rmNeeds.global, rmNeeds.perSku, startDate)}
                  className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-200 transition-all"
                >
                  💾 Archive Perhitungan
                </button>
                <button 
                  onClick={handleSyncToROP}
                  className="px-8 py-4 bg-[#1C0770] text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 transition-all flex items-center gap-3"
                >
                  <span>Sync to ROP Planning</span>
                  <span className="text-lg">➔</span>
                </button>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                   <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">Kebutuhan Barang Beli (PO)</h4>
                   <span className="text-[10px] font-bold text-indigo-500 italic">*Sudah dikonversi dari material giling</span>
                </div>
                <div className="overflow-x-auto">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50/50 text-[9px] uppercase font-black text-slate-400">
                         <tr>
                            <th className="px-10 py-4">Nama Barang (Purchasable)</th>
                            <th className="px-6 py-4 text-right">Total Requirement</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                         {Object.keys(rmNeeds.global || {}).length === 0 ? (
                           <tr><td colSpan={2} className="px-10 py-20 text-center text-slate-300 italic">Belum ada jadwal terisi.</td></tr>
                         ) : (
                           Object.entries(rmNeeds.global).map(([id, amount]) => {
                             const rm = (rawMaterials || []).find(m => m.id === id);
                             return (
                               <tr key={id} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-10 py-5 font-bold text-slate-700">
                                    {rm?.name || id}
                                    {rm?.isProcessed && <span className="ml-2 text-[8px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full uppercase">Processed Material</span>}
                                  </td>
                                  <td className="px-6 py-5 text-right font-black text-[#1C0770]">{Math.ceil(amount).toLocaleString()} <span className="text-[10px] text-slate-300 font-bold ml-1">{rm?.usageUnit}</span></td>
                               </tr>
                             )
                           })
                         )}
                      </tbody>
                   </table>
                </div>
             </div>
             <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30">
                   <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">Pemakaian Per SKU (Resep)</h4>
                </div>
                <div className="p-8 space-y-6 overflow-y-auto max-h-[500px] custom-scrollbar">
                   {Object.entries(rmNeeds.perSku || {}).length === 0 ? (
                     <div className="py-20 text-center text-slate-300 italic">Belum ada data distribusi.</div>
                   ) : (
                     Object.entries(rmNeeds.perSku).map(([skuId, needs]) => {
                       const sku = activeFinishGoods.find(s => s.id === skuId);
                       return (
                         <div key={skuId} className="bg-slate-50 rounded-[32px] p-6 border border-slate-100">
                            <div className="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/50">
                               <div className="font-black text-slate-800 text-xs uppercase tracking-tight">{sku?.name}</div>
                               <div className="px-3 py-1 bg-white rounded-lg text-[9px] font-black text-indigo-400 shadow-sm">{skuId}</div>
                            </div>
                            <div className="space-y-3">
                               {Object.entries(needs || {}).map(([rmId, amount]) => {
                                  const rm = (rawMaterials || []).find(m => m.id === rmId);
                                  return (
                                    <div key={rmId} className="flex justify-between items-center text-[11px]">
                                       <span className="text-slate-500 font-medium">
                                         {rm?.name}
                                         {rm?.isProcessed && <span className="ml-1 text-[8px] text-amber-500 font-bold">(Giling)</span>}
                                       </span>
                                       <span className="font-black text-slate-800">{amount.toLocaleString()} {rm?.usageUnit}</span>
                                    </div>
                                  )
                               })}
                            </div>
                         </div>
                       )
                     })
                   )}
                </div>
             </div>
          </div>
          
          <div className="bg-amber-50 p-8 rounded-[40px] border border-amber-100 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
             <div className="flex items-center gap-5">
                <div className="text-4xl">🚀</div>
                <div>
                   <h4 className="font-black text-slate-800 text-lg leading-tight tracking-tight">Siap Sinkronisasi?</h4>
                   <p className="text-xs text-slate-500 font-medium mt-1">Kalkulasi ini sudah mencakup konversi material giling ke material sumber (mentah). Lanjutkan untuk cek kecukupan stok di gudang.</p>
                </div>
             </div>
             <button 
               onClick={handleSyncToROP}
               className="w-full md:w-auto px-12 py-5 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-2xl shadow-indigo-200 hover:scale-[1.03] transition-all"
             >
                Lanjutkan ke Inventory ROP
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduledProduction;
