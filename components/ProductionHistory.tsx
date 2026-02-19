
import React, { useState, useMemo } from 'react';
import { SavedSchedule, FinishGood } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

interface ProductionHistoryProps {
  history: SavedSchedule[];
  finishGoods: FinishGood[];
}

const ProductionHistory: React.FC<ProductionHistoryProps> = ({ history = [], finishGoods = [] }) => {
  const [selectedSchedule, setSelectedSchedule] = useState<SavedSchedule | null>(null);
  const [detailTab, setDetailTab] = useState<'batch' | 'output'>('batch');
  
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');

  const safeHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history.filter(h => h && h.id && h.startDate);
  }, [history]);

  const filteredHistory = useMemo(() => {
    return safeHistory.filter(item => {
      const itemDate = item.startDate; 
      if (filterStart && itemDate < filterStart) return false;
      if (filterEnd && itemDate > filterEnd) return false;
      return true;
    });
  }, [safeHistory, filterStart, filterEnd]);

  const handleResetFilter = () => {
    setFilterStart('');
    setFilterEnd('');
  };

  const detailData = useMemo(() => {
    if (!selectedSchedule) return [];
    
    let scheduleMap: any = selectedSchedule.data || {};
    let targetMap: Record<string, number> = selectedSchedule.targets || {};

    // Jika data masih berupa string (belum ter-parse di backend)
    if (typeof scheduleMap === 'string') {
      try { scheduleMap = JSON.parse(scheduleMap); } catch (e) { scheduleMap = {}; }
    }
    if (typeof targetMap === 'string') {
      try { targetMap = JSON.parse(targetMap); } catch (e) { targetMap = {}; }
    }

    // Ambil SEMUA ID unik yang ada di dalam record ini (baik di schedule maupun di targets)
    const scheduleIds = Object.keys(scheduleMap);
    const targetIds = Object.keys(targetMap);
    
    // Gabungkan semua ID unik agar tidak ada data yang terlewat
    const allRecordedIds = Array.from(new Set([...scheduleIds, ...targetIds]));

    return allRecordedIds.map(id => {
      // Cari informasi produk di master data (untuk nama dan qty per batch)
      const skuInMaster = finishGoods.find(f => 
        f.id.trim().toLowerCase() === id.trim().toLowerCase() || 
        f.name.trim().toLowerCase() === id.trim().toLowerCase()
      );

      // Gunakan ID sebagai nama jika tidak ditemukan di master (produk mungkin sudah dihapus)
      const displayName = skuInMaster ? skuInMaster.name : id;
      const qtyPerBatch = skuInMaster ? (skuInMaster.qtyPerBatch || 1) : 1;
      
      // Ambil data batch harian
      const rawBatchValues = scheduleMap[id] || null;
      let dailyBatches: number[] = new Array(7).fill(0);
      if (Array.isArray(rawBatchValues)) {
        dailyBatches = rawBatchValues.map(v => Number(v) || 0);
      }

      const totalBatches = dailyBatches.reduce((a, b) => a + b, 0);
      const dailyPacks = dailyBatches.map(b => b * qtyPerBatch);
      const totalPacks = dailyPacks.reduce((a, b) => a + b, 0);
      
      const referenceTarget = Number(targetMap[id]) || 0;
      
      let keterangan = "Tanpa Target";
      if (referenceTarget > 0) {
        if (totalBatches >= referenceTarget) keterangan = "Mencapai Target";
        else keterangan = "Kurang dari Target";
        if (totalBatches > referenceTarget) keterangan = "Melebihi Target";
      }
      
      return { 
        id, 
        name: displayName, 
        dailyBatches, 
        totalBatches, 
        dailyPacks, 
        totalPacks, 
        keterangan, 
        referenceTarget,
        isDeleted: !skuInMaster 
      };
    })
    // FILTER: Hanya tampilkan yang produksinya > 0 batch
    .filter(item => item.totalBatches > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedSchedule, finishGoods]);

  const handleDownloadPDF = () => {
    if (!selectedSchedule) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const dateStr = new Date(selectedSchedule.startDate).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    doc.setFontSize(22);
    doc.setTextColor(28, 7, 112); 
    doc.text('PPIC PRO - LAPORAN PRODUKSI', 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${dateStr}`, 14, 22);
    
    const head = [['Produk SKU', ...DAYS, detailTab === 'batch' ? 'Total Batch' : 'Total Packs', 'Status Target']];
    const body = detailData.map(d => [
      d.name,
      ...(detailTab === 'batch' ? d.dailyBatches : d.dailyPacks.map(p => p.toLocaleString())),
      (detailTab === 'batch' ? d.totalBatches : d.totalPacks.toLocaleString()),
      d.keterangan
    ]);

    autoTable(doc, {
      startY: 35,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: { fillColor: detailTab === 'batch' ? [28, 7, 112] : [16, 185, 129], fontSize: 9 },
      styles: { fontSize: 8 }
    });

    doc.save(`Laporan_PPIC_${selectedSchedule.startDate}.pdf`);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Production History</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Arsip jadwal produksi terkonfirmasi</p>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-3 bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm w-full md:w-auto">
          <div className="flex-1 sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Dari Tanggal</label>
            <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
          </div>
          <div className="flex-1 sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Sampai</label>
            <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
          </div>
          {(filterStart || filterEnd) && (
            <button onClick={handleResetFilter} className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 h-[34px]">Reset</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredHistory.length === 0 ? (
          <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center flex flex-col items-center">
            <span className="text-5xl block mb-4 opacity-20">📁</span>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada riwayat ditemukan atau database sedang memuat</p>
          </div>
        ) : (
          filteredHistory.map(item => (
            <div key={item.id} className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div className="flex items-center gap-6">
                   <div className="w-16 h-16 bg-[#1C0770]/5 rounded-3xl flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Date</span>
                      <span className="text-2xl font-black text-[#1C0770] font-mono leading-none">{new Date(item.startDate).getDate()}</span>
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 text-lg tracking-tight">Produksi: {new Date(item.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">ID: {item.id}</p>
                   </div>
                </div>
                <div className="flex items-center gap-8 w-full md:w-auto justify-between md:justify-end">
                   <div className="text-right">
                      <div className="text-2xl font-black text-slate-900 leading-none">{item.totalBatches}</div>
                      <div className="text-[10px] font-black text-slate-300 uppercase mt-1">Total Batches</div>
                   </div>
                   <button onClick={() => { setSelectedSchedule(item); setDetailTab('batch'); }} className="px-6 py-3 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-[#1C0770] group-hover:text-white transition-all shadow-sm">View Detail</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[40px] w-full max-w-7xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-slate-50/20">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-[#1C0770] text-white rounded-2xl flex items-center justify-center text-2xl shadow-lg shrink-0">📄</div>
                <div>
                  <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Detail Produksi</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Periode: {new Date(selectedSchedule.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button onClick={handleDownloadPDF} className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-lg"><span>📥</span> Download PDF</button>
                <button onClick={() => setSelectedSchedule(null)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors">Close</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-10">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
                <button onClick={() => setDetailTab('batch')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${detailTab === 'batch' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}>Input Batch</button>
                <button onClick={() => setDetailTab('output')} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${detailTab === 'output' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}>Hasil Output (Packs)</button>
              </div>

              <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[1100px]">
                    <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400">
                      <tr>
                        <th className="px-8 py-5 border-r border-slate-100 sticky left-0 bg-slate-50 z-10">Product SKU</th>
                        {DAYS.map(day => <th key={day} className="px-4 py-5 text-center border-r border-slate-100">{day}</th>)}
                        <th className="px-8 py-5 text-center font-black text-slate-600 border-r border-slate-100">Total</th>
                        <th className="px-8 py-5 text-center font-black text-indigo-600">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm font-medium">
                        {detailData.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-8 py-20 text-center text-slate-400 italic">
                              Tidak ada produksi tercatat (>0 batch) untuk periode ini.
                            </td>
                          </tr>
                        ) : (
                          detailData.map(d => (
                            <tr key={d.id} className="hover:bg-slate-50/50">
                              <td className="px-8 py-5 border-r border-slate-100 font-bold text-slate-800 sticky left-0 bg-white z-10">
                                 <div className="flex items-center gap-2">
                                    {d.name}
                                    {d.isDeleted && <span className="px-2 py-0.5 bg-rose-50 text-rose-500 text-[8px] font-black uppercase rounded">Deleted</span>}
                                 </div>
                                 <div className="text-[9px] text-slate-300 font-bold uppercase">{d.id}</div>
                              </td>
                              {d.dailyBatches.map((val, i) => {
                                const displayVal = detailTab === 'batch' ? val : d.dailyPacks[i];
                                return (
                                  <td key={i} className={`px-4 py-5 text-center border-r border-slate-100 font-black ${displayVal > 0 ? (detailTab === 'batch' ? 'text-[#1C0770]' : 'text-emerald-600') : 'text-slate-200'}`}>
                                    {displayVal > 0 ? displayVal.toLocaleString() : '-'}
                                  </td>
                                );
                              })}
                              <td className={`px-8 py-5 text-center border-r border-slate-100 font-black bg-slate-50/10 ${detailTab === 'batch' ? 'text-slate-900' : 'text-emerald-600'}`}>
                                {(detailTab === 'batch' ? d.totalBatches : d.totalPacks).toLocaleString()}
                              </td>
                              <td className="px-8 py-5 text-center">
                                 <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                   d.keterangan === "Mencapai Target" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                                   d.keterangan === "Melebihi Target" ? "bg-blue-50 text-blue-600 border border-blue-100" :
                                   d.keterangan === "Kurang dari Target" ? "bg-rose-50 text-rose-600 border border-rose-100" :
                                   "bg-slate-50 text-slate-400"
                                 }`}>
                                   {d.keterangan}
                                 </span>
                              </td>
                            </tr>
                          ))
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionHistory;
