
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { SavedRMRequirement, RawMaterial, FinishGood } from '../types';

const parseSafeDate = (dateInput: any): Date => {
  if (!dateInput) return new Date();
  
  // If it's already a Date object, normalize to local midnight
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }

  if (typeof dateInput === 'string') {
    // 1. Handle ISO strings with timezone (e.g., "2026-03-23T17:00:00.000Z")
    // This is crucial because GAS stringifies Date objects to UTC ISO strings.
    if (dateInput.includes('T') && (dateInput.includes('Z') || dateInput.includes('+'))) {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        // Return local midnight for that specific calendar day
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      }
    }

    // 2. Handle simple date strings (e.g., "2026-03-24" or "24-03-2026")
    const datePart = dateInput.split(/[ T]/)[0];
    const parts = datePart.split(/[-/]/);
    
    if (parts.length === 3) {
      let y, m, d;
      if (parts[0].length === 4) { // YYYY-MM-DD
        y = parseInt(parts[0]);
        m = parseInt(parts[1]);
        d = parseInt(parts[2]);
      } else {
        const p0 = parseInt(parts[0]);
        const p1 = parseInt(parts[1]);
        const p2 = parseInt(parts[2]);
        
        // Smarter detection for DD/MM/YYYY vs MM/DD/YYYY
        if (p1 > 12) { // MM/DD/YYYY
          m = p0; d = p1; y = p2;
        } else { // DD/MM/YYYY (Default for Indonesia)
          d = p0; m = p1; y = p2;
        }
      }

      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return new Date(y, m - 1, d, 0, 0, 0, 0);
      }
    }
  }

  // 3. Final fallback
  const fallback = new Date(dateInput);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0);
  }
  
  return new Date();
};

const formatDateToISO = (dateInput: any): string => {
  const d = parseSafeDate(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface RMHistoryProps {
  history: SavedRMRequirement[];
  rawMaterials: RawMaterial[];
  finishGoods: FinishGood[];
}

const RMHistory: React.FC<RMHistoryProps> = ({ history = [], rawMaterials = [], finishGoods = [] }) => {
  const [selectedReq, setSelectedReq] = useState<SavedRMRequirement | null>(null);

  const handleDownloadExcel = () => {
    const dataToExport: any[] = [];

    history.forEach(item => {
      Object.entries(item.globalData || {}).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        dataToExport.push({
          'No Request Order': item.id,
          'Tanggal Request Order': new Date(item.createdAt).toLocaleDateString('id-ID'),
          'Raw Materials': rm?.name || rmId,
          'Qty': amount
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RM_History");
    XLSX.writeFile(workbook, "RM_History.xlsx");
  };

  const handleDownloadSingleExcel = (req: SavedRMRequirement) => {
    const dataToExport: any[] = [];
    
    // Global Summary
    Object.entries(req.globalData || {}).forEach(([rmId, amount]) => {
      const rm = rawMaterials.find(m => m.id === rmId);
      dataToExport.push({
        'Category': 'GLOBAL SUMMARY',
        'Product/SKU': '-',
        'Material Name': rm?.name || rmId,
        'Quantity': amount,
        'Unit': rm?.usageUnit || '-'
      });
    });

    // Per SKU Breakdown
    Object.entries(req.perSkuData || {}).forEach(([skuId, needs]) => {
      const sku = finishGoods.find(s => s.id === skuId);
      Object.entries(needs || {}).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        dataToExport.push({
          'Category': 'PER SKU BREAKDOWN',
          'Product/SKU': sku?.name || skuId,
          'Material Name': rm?.name || rmId,
          'Quantity': amount,
          'Unit': rm?.usageUnit || '-'
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Detail_Kebutuhan_RM");
    XLSX.writeFile(workbook, `Kebutuhan_RM_${req.id}.xlsx`);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">History Raw Material Needs</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Arsip perhitungan logistik mingguan</p>
        </div>
        <button 
          onClick={handleDownloadExcel}
          className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
        >
          <span>📥</span> Download Excel
        </button>
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
                      <span className="text-2xl font-black font-mono leading-none">
  {parseSafeDate(item.startDate).getDate()}
</span>
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-lg tracking-tight">
  Kebutuhan Produksi: {parseSafeDate(item.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
</h4>
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
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
  Periode Produksi: {parseSafeDate(selectedReq.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                     onClick={() => handleDownloadSingleExcel(selectedReq)}
                     className="px-6 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all"
                   >
                     <span>📥</span> Export Excel
                   </button>
                   <button onClick={() => setSelectedReq(null)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200">Close</button>
                </div>
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
