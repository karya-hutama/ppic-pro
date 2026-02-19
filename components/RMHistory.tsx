
import React, { useState, useMemo } from 'react';
import { SavedRMRequirement, RawMaterial, FinishGood } from '../types';

interface RMHistoryProps {
  history: SavedRMRequirement[];
  rawMaterials: RawMaterial[];
  finishGoods: FinishGood[];
}

const RMHistory: React.FC<RMHistoryProps> = ({ history = [], rawMaterials = [], finishGoods = [] }) => {
  const [selectedReq, setSelectedReq] = useState<SavedRMRequirement | null>(null);

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">History Raw Material Needs</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Arsip perhitungan logistik mingguan</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {(history || []).length === 0 ? (
          <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center">
            <span className="text-5xl block mb-4 opacity-20">📊</span>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada riwayat kebutuhan ditemukan</p>
          </div>
        ) : (
          history.map(item => (
            <div key={item.id} className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-indigo-50 text-indigo-400 rounded-3xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-black uppercase leading-none mb-1">RM</span>
                      <span className="text-2xl font-black font-mono leading-none">{new Date(item.startDate).getDate()}</span>
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-lg tracking-tight">Kebutuhan Produksi: {new Date(item.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Disimpan: {new Date(item.createdAt).toLocaleString('id-ID')}</p>
                   </div>
                </div>
                <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                   <div className="text-right">
                      <div className="text-2xl font-black text-slate-900 leading-none">{Object.keys(item.globalData || {}).length}</div>
                      <div className="text-[10px] font-black text-slate-300 uppercase mt-1">Total Material</div>
                   </div>
                   <button onClick={() => setSelectedReq(item)} className="px-6 py-3 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-[#1C0770] group-hover:text-white transition-all shadow-sm">View Details</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[40px] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
             <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 bg-[#1C0770] text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg">📄</div>
                   <div>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight">Detail Kebutuhan RM</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Periode Produksi: {new Date(selectedReq.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                   </div>
                </div>
                <button onClick={() => setSelectedReq(null)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200">Close</button>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12">
                <section>
                   <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                      <div className="h-px bg-slate-100 flex-1"></div>
                      GLOBAL SUMMARY
                      <div className="h-px bg-slate-100 flex-1"></div>
                   </h4>
                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {Object.entries(selectedReq.globalData || {}).map(([id, amount]) => {
                         const rm = (rawMaterials || []).find(m => m.id === id);
                         return (
                            <div key={id} className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 text-center">
                               <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2 truncate px-1">{rm?.name || id}</div>
                               <div className="text-xl font-black text-[#1C0770]">{(amount || 0).toLocaleString()}</div>
                               <div className="text-[9px] font-bold text-slate-300 uppercase mt-1">{rm?.usageUnit}</div>
                            </div>
                         )
                      })}
                   </div>
                </section>

                <section>
                   <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                      <div className="h-px bg-slate-100 flex-1"></div>
                      PER SKU BREAKDOWN
                      <div className="h-px bg-slate-100 flex-1"></div>
                   </h4>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Object.entries(selectedReq.perSkuData || {}).map(([skuId, needs]) => {
                         const sku = (finishGoods || []).find(s => s.id === skuId);
                         return (
                            <div key={skuId} className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm">
                               <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                                  <div className="font-black text-slate-800 text-xs tracking-tight">{sku?.name}</div>
                                  <div className="text-[9px] font-black text-indigo-400 uppercase">{skuId}</div>
                               </div>
                               <div className="space-y-4">
                                  {Object.entries(needs || {}).map(([rmId, amount]) => {
                                     const rm = (rawMaterials || []).find(m => m.id === rmId);
                                     return (
                                        <div key={rmId} className="flex justify-between items-center text-xs">
                                           <span className="text-slate-400 font-medium">{rm?.name}</span>
                                           <span className="font-black text-slate-800">{(amount || 0).toLocaleString()} {rm?.usageUnit}</span>
                                        </div>
                                     )
                                  })}
                               </div>
                            </div>
                         )
                      })}
                   </div>
                </section>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RMHistory;
