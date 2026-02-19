
import React, { useState, useMemo, useEffect } from 'react';
import { RawMaterial, FinishGood, SalesData } from '../types';

interface SkuTarget {
  skuId: string;
  name: string;
  avgDaily: number;
  avgWeekly: number;
  peakWeekly: number; // Penjualan Tertinggi
  salesRequest: number;
  qtyPerBatch: number;
  stockOnHand: number;
  peakDayName?: string;
  peakDayIdx?: number;
}

interface ProductionPlanningProps {
  finishGoods: FinishGood[];
  salesData: SalesData[];
  transferredAnalysis: any[] | null;
  onProcess: (data: Record<string, number>, recommendations?: Record<string, number>) => void;
}

const ProductionPlanning: React.FC<ProductionPlanningProps> = ({ 
  finishGoods, 
  salesData, 
  transferredAnalysis,
  onProcess 
}) => {
  const [skuTargets, setSkuTargets] = useState<SkuTarget[]>([]);
  const [safetyDays, setSafetyDays] = useState<number>(2);

  const activeFinishGoods = useMemo(() => {
    return finishGoods.filter(fg => fg.isProductionReady !== false);
  }, [finishGoods]);

  useEffect(() => {
    const newComputedTargets = activeFinishGoods.map(sku => {
      const transferData = transferredAnalysis?.find(t => t.id === sku.id);
      
      return {
        skuId: sku.id,
        name: sku.name,
        avgDaily: transferData?.averageDaily || 0,
        avgWeekly: Math.round(transferData?.averageWeekly || 0),
        peakWeekly: Math.round(transferData?.peakWeekly || 0), // Dari Analisa Penjualan
        qtyPerBatch: sku.qtyPerBatch || 1,
        stockOnHand: sku.stock || 0,
        peakDayName: transferData?.peakDayName,
        peakDayIdx: transferData?.peakDayIdx,
        salesRequest: 0
      };
    });

    setSkuTargets(prev => {
      return newComputedTargets.map(nt => {
        const existing = prev.find(p => p.skuId === nt.skuId);
        return { ...nt, salesRequest: existing ? existing.salesRequest : 0 };
      });
    });
  }, [activeFinishGoods, transferredAnalysis]);

  const handleRequestChange = (skuId: string, val: string) => {
    const num = parseInt(val) || 0;
    setSkuTargets(prev => prev.map(t => t.skuId === skuId ? { ...t, salesRequest: num } : t));
  };

  const finalPlan = useMemo(() => {
    return skuTargets.map(t => {
      const safetyStockQty = Math.round((t.avgDaily || 0) * safetyDays);
      
      // Menggunakan nilai tertinggi antara rata-rata atau request manual
      const baseDemand = Math.max(t.avgWeekly, t.salesRequest);
      
      // Gross requirement (Kebutuhan total sebelum cek stok)
      const grossRequirement = baseDemand + safetyStockQty;
      
      // Final Target (Net) = Gross - Stock On Hand
      const finalTarget = Math.max(0, grossRequirement - t.stockOnHand);

      // Estimasi Stok Setelah Produksi = Final Target + Stock On Hand
      const estimationStock = finalTarget + t.stockOnHand;
      
      // Batch To Produce
      const batchesNeeded = Math.ceil(finalTarget / (t.qtyPerBatch || 1));

      // Kalkulasi Days to Out
      const daysToOut = t.avgDaily > 0 ? (t.stockOnHand / t.avgDaily) : Infinity;

      return {
        ...t,
        safetyStockQty,
        grossRequirement,
        finalTarget,
        estimationStock,
        batchesNeeded: isNaN(batchesNeeded) ? 0 : batchesNeeded,
        isOverridden: t.salesRequest > t.avgWeekly,
        daysToOut
      };
    });
  }, [skuTargets, safetyDays]);

  const handleTriggerProcess = () => {
    const dataToSend: Record<string, number> = {};
    const recommendations: Record<string, number> = {};
    
    finalPlan.forEach(p => {
      dataToSend[p.skuId] = p.batchesNeeded;
      if (p.peakDayIdx !== undefined) {
        recommendations[p.skuId] = p.peakDayIdx;
      }
    });
    onProcess(dataToSend, recommendations);
  };

  return (
    <div className="p-4 md:p-8 space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">Target & Planning Produksi</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Sinkronisasi stok gudang dengan rencana distribusi mingguan.</p>
        </div>
        
        <div className="bg-white px-6 py-4 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-6">
           <div>
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Safety Stock (Hari)</label>
              <div className="flex items-center gap-3">
                <input 
                  type="number" 
                  value={safetyDays} 
                  onChange={(e) => setSafetyDays(Math.max(0, parseInt(e.target.value) || 0))} 
                  className="bg-slate-50 font-black text-xl text-[#1C0770] border border-slate-100 rounded-xl w-16 h-12 text-center outline-none focus:ring-2 ring-indigo-50" 
                />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Hari</span>
              </div>
           </div>
           <div className="w-px h-12 bg-slate-100"></div>
           <div className="text-right">
              <div className="text-[9px] font-black text-slate-400 uppercase">Status Data</div>
              <div className={`text-xs font-black uppercase mt-1 ${transferredAnalysis ? 'text-emerald-500' : 'text-amber-500'}`}>
                {transferredAnalysis ? '● Analisa Aktif' : '○ Estimasi Manual'}
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[1300px]">
            <thead className="bg-slate-50/50 text-[10px] uppercase font-black text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-10 py-6 sticky left-0 bg-slate-50 z-20">Product SKU</th>
                <th className="px-4 py-6 text-center border-x border-slate-100/50">SOH</th>
                <th className="px-4 py-6 text-center">Days to Out</th>
                <th className="px-4 py-6 text-center">Rata-rata Sales</th>
                <th className="px-4 py-6 text-center">Penjualan Tertinggi</th>
                <th className="px-4 py-6 text-center bg-indigo-50/20">Sales Request</th>
                <th className="px-4 py-6 text-center font-black text-slate-900 bg-amber-50/20">Final Target</th>
                <th className="px-4 py-6 text-center font-black text-emerald-700 bg-emerald-50/20">Estimasi Stok</th>
                <th className="px-10 py-6 text-right font-black text-[#1C0770]">Batch to Produce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {finalPlan.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-10 py-20 text-center text-slate-400 italic font-medium">Belum ada SKU yang aktif. Cek Master Data.</td>
                </tr>
              ) : (
                finalPlan.map(t => (
                  <tr key={t.skuId} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-10 py-7 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.01)]">
                       <div className="font-black text-slate-800 tracking-tight text-sm">{t.name}</div>
                       <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mt-1">{t.skuId}</div>
                    </td>
                    <td className="px-4 py-7 text-center border-x border-slate-50">
                       <div className="text-lg font-black text-slate-700">{t.stockOnHand.toLocaleString()}</div>
                       <div className="text-[8px] font-bold text-slate-300 uppercase">Stock On Hand</div>
                    </td>
                    <td className="px-4 py-7 text-center">
                       <div className={`text-lg font-black ${t.daysToOut < 2 ? 'text-rose-600 animate-pulse' : 'text-slate-700'}`}>
                         {t.daysToOut === Infinity ? '∞' : t.daysToOut.toFixed(1)}
                       </div>
                       <div className="text-[8px] font-bold text-slate-300 uppercase">Hari Tersisa</div>
                    </td>
                    <td className="px-4 py-7 text-center">
                      <div className="font-bold text-slate-500">{t.avgWeekly.toLocaleString()}</div>
                      <div className="text-[8px] font-medium text-slate-300 uppercase">Avg / Minggu</div>
                    </td>
                    <td className="px-4 py-7 text-center">
                      <div className="font-bold text-amber-600">{t.peakWeekly.toLocaleString()}</div>
                      <div className="text-[8px] font-medium text-amber-300 uppercase">Peak 7D</div>
                    </td>
                    <td className="px-4 py-7 text-center bg-indigo-50/5">
                      <input 
                        type="number" 
                        value={t.salesRequest || ''} 
                        onChange={(e) => handleRequestChange(t.skuId, e.target.value)} 
                        placeholder="0"
                        className={`w-24 px-2 py-3 text-center border-2 rounded-2xl font-black outline-none transition-all ${
                          t.isOverridden 
                            ? 'border-indigo-400 bg-white text-indigo-700' 
                            : 'bg-slate-50 border-transparent text-slate-400 focus:bg-white focus:border-indigo-200'
                        }`} 
                      />
                    </td>
                    <td className="px-4 py-7 text-center bg-amber-50/5">
                       <div className={`text-xl font-black ${t.finalTarget > 0 ? 'text-slate-900' : 'text-emerald-500'}`}>
                         {t.finalTarget.toLocaleString()}
                       </div>
                       <div className="text-[8px] font-bold text-slate-400 uppercase">Net Requirement</div>
                    </td>
                    <td className="px-4 py-7 text-center bg-emerald-50/5">
                       <div className="text-xl font-black text-emerald-600">
                         {t.estimationStock.toLocaleString()}
                       </div>
                       <div className="text-[8px] font-bold text-emerald-400 uppercase">Stock After Prod</div>
                    </td>
                    <td className="px-10 py-7 text-right">
                       <div className={`text-3xl font-black ${t.batchesNeeded > 0 ? 'text-[#1C0770]' : 'text-slate-200'}`}>
                         {t.batchesNeeded}
                       </div>
                       <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Total Batches</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-8 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="flex gap-6">
              <div className="flex items-center gap-3">
                 <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Aman</span>
              </div>
              <div className="flex items-center gap-3">
                 <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stok Menipis (&lt;2H)</span>
              </div>
           </div>
           
           <button 
             disabled={finalPlan.length === 0}
             onClick={handleTriggerProcess} 
             className="w-full md:w-auto px-12 py-5 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-[1.03] active:scale-95 transition-all shadow-2xl shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
           >
              <span>Buat Jadwal Mingguan</span>
              <span className="text-xl">➔</span>
           </button>
        </div>
      </div>
    </div>
  );
};

export default ProductionPlanning;
