
import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { RequestOrder } from '../types';

interface PurchasingProps {
  history: RequestOrder[];
  onUpdateRO?: (ro: RequestOrder) => void;
}

const Purchasing: React.FC<PurchasingProps> = ({ history = [], onUpdateRO }) => {
  const [selectedRO, setSelectedRO] = useState<RequestOrder | null>(null);
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');
  const [tempDeadline, setTempDeadline] = useState<string>('');

  // Helper untuk memastikan kita selalu mendapatkan array items
  const getItems = (ro: any) => {
    if (Array.isArray(ro.items)) return ro.items;
    if (typeof ro.items === 'string' && ro.items !== "") {
      try { return JSON.parse(ro.items); } catch(e) { return []; }
    }
    // Cek fallback ke JSONItems (sesuai screenshot user)
    const fallback = ro.JSONItems || (ro as any).jsonItems;
    if (Array.isArray(fallback)) return fallback;
    if (typeof fallback === 'string' && fallback !== "") {
      try { return JSON.parse(fallback); } catch(e) { return []; }
    }
    return [];
  };

  const handleDownloadExcel = (ro: RequestOrder) => {
    const items = getItems(ro);
    const dataToExport = items.map((item: any) => ({
      'Material ID': item.materialId,
      'Material Name': item.materialName,
      'Quantity': item.quantity,
      'Unit': item.unit,
      'Status': item.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RequestOrder");
    XLSX.writeFile(workbook, `RequestOrder_${ro.id}.xlsx`);
  };

  const handleDownloadPDF = (ro: RequestOrder) => {
    const doc = new jsPDF();
    const items = getItems(ro);

    doc.setFontSize(18);
    doc.text('Request Order Detail', 14, 22);
    
    doc.setFontSize(11);
    doc.text(`ID: ${ro.id}`, 14, 32);
    doc.text(`Status: ${ro.status}`, 14, 38);
    doc.text(`Dibuat: ${new Date(ro.createdAt).toLocaleDateString('id-ID')}`, 14, 44);
    if (ro.deadline) {
      doc.text(`Deadline: ${new Date(ro.deadline).toLocaleDateString('id-ID')}`, 14, 50);
    }

    const tableData = items.map((item: any) => [
      item.materialId,
      item.materialName,
      item.quantity.toLocaleString(),
      item.unit,
      item.status
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['ID', 'Material Name', 'Qty', 'Unit', 'Status']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [28, 7, 112] }
    });

    doc.save(`RequestOrder_${ro.id}.pdf`);
  };

  const filteredHistory = useMemo(() => {
    return (history || []).filter(ro => {
      const roDate = ro.date;
      if (filterStart && roDate < filterStart) return false;
      if (filterEnd && roDate > filterEnd) return false;
      return true;
    });
  }, [history, filterStart, filterEnd]);

  const handleFinalizeRO = () => {
    if (!selectedRO || !onUpdateRO) return;
    const items = getItems(selectedRO);
    const updated: RequestOrder = {
      ...selectedRO,
      status: 'Sent',
      deadline: tempDeadline || selectedRO.deadline,
      items: items.map((i: any) => ({ ...i, status: 'Ordered' }))
    };
    onUpdateRO(updated);
    setSelectedRO(null);
  };

  const handleUpdateDeadlineOnly = () => {
    if (!selectedRO || !onUpdateRO) return;
    const updated: RequestOrder = {
      ...selectedRO,
      deadline: tempDeadline
    };
    onUpdateRO(updated);
    setSelectedRO(null);
  };

  const stats = useMemo(() => {
    const safeHistory = history || [];
    return {
      total: safeHistory.length,
      pending: safeHistory.filter(h => h.status === 'Draft').length,
      totalItems: safeHistory.reduce((acc, curr) => acc + (getItems(curr).length || 0), 0)
    };
  }, [history]);

  const openDetail = (ro: RequestOrder) => {
    setSelectedRO(ro);
    setTempDeadline(ro.deadline || '');
  };

  return (
    <div className="py-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">Request Order Tracking</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm font-medium italic">Manajemen pengadaan bahan baku berdasarkan status RO</p>
        </div>

        <div className="flex flex-col sm:flex-row items-end gap-3 bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm w-full md:w-auto">
          <div className="flex-1 sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Dari Tanggal</label>
            <input type="date" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none focus:ring-2 ring-indigo-50" />
          </div>
          <div className="flex-1 sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Sampai Tanggal</label>
            <input type="date" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none focus:ring-2 ring-indigo-50" />
          </div>
          {(filterStart || filterEnd) && (
            <button onClick={() => { setFilterStart(''); setFilterEnd(''); }} className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 h-[34px]">Reset</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {[
          { label: 'Total Request Order', val: stats.total, color: 'text-[#1C0770]', icon: '📜' },
          { label: 'Status Draft/Pending', val: stats.pending, color: 'text-amber-600', icon: '⏳' },
          { label: 'Total Item Dipesan', val: stats.totalItems, color: 'text-emerald-600', icon: '📦' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-[32px] border border-slate-50 shadow-sm flex items-center gap-5">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl">{stat.icon}</div>
            <div>
              <div className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">{stat.label}</div>
              <div className={`text-2xl font-black tracking-tighter ${stat.color}`}>{stat.val}</div>
            </div>
          </div>
        ))}
      </div>

      {filteredHistory.length === 0 ? (
        <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center">
           <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-6">🛒</div>
           <h3 className="text-xl font-bold text-slate-800">{history.length > 0 ? "Tidak ada hasil filter" : "Belum ada riwayat RO"}</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredHistory.map(ro => {
            const items = getItems(ro);
            return (
              <div key={ro.id} className="bg-white p-6 md:p-8 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 bg-[#1C0770] text-white rounded-3xl flex flex-col items-center justify-center shrink-0 shadow-lg shadow-indigo-100">
                        <span className="text-[10px] font-black uppercase leading-none mb-1 opacity-50">RO</span>
                        <span className="text-lg font-black leading-none">{ro.id.split('-')[1]}</span>
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 text-lg tracking-tight">Request Order ID: {ro.id}</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                          Dibuat: {new Date(ro.createdAt).toLocaleDateString('id-ID')}
                          {ro.deadline && <span className="ml-2 text-rose-500">• Deadline: {new Date(ro.deadline).toLocaleDateString('id-ID')}</span>}
                        </p>
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-8 md:gap-12 w-full md:w-auto justify-between md:justify-end">
                     <div className="text-right">
                        <div className="text-2xl font-black text-slate-900 leading-none">{items.length}</div>
                        <div className="text-[10px] font-black text-slate-300 uppercase mt-1">Item Materials</div>
                     </div>
                     <div className="flex items-center gap-4">
                        <span className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border ${ro.status === 'Draft' ? 'bg-amber-50 text-amber-600 border-amber-100' : ro.status === 'Sent' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                          {ro.status}
                        </span>
                        <button onClick={() => openDetail(ro)} className="px-6 py-3 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-[#1C0770] group-hover:text-white transition-all shadow-sm">View Detail</button>
                     </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedRO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="px-10 py-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/20">
               <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-emerald-100">🛒</div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Rincian Request Order</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {selectedRO.id} • Status: {selectedRO.status}</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleDownloadExcel(selectedRO)} 
                    className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100 hover:bg-emerald-100 transition-all flex items-center gap-2"
                  >
                    <span>📊</span> Excel
                  </button>
                  <button 
                    onClick={() => handleDownloadPDF(selectedRO)} 
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2"
                  >
                    <span>📄</span> PDF
                  </button>
                  <button onClick={() => setSelectedRO(null)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 ml-2">✕</button>
               </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
               <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h4 className="font-black text-slate-800 tracking-tight">Deadline Kedatangan Bahan Baku</h4>
                    <p className="text-xs text-slate-500 mt-1">Atur tanggal estimasi barang harus sampai di gudang.</p>
                  </div>
                  <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-2xl border border-slate-200">
                    <span className="text-xl">📅</span>
                    <input 
                      type="date"
                      value={tempDeadline}
                      onChange={(e) => setTempDeadline(e.target.value)}
                      className="text-sm font-black text-[#1C0770] outline-none bg-transparent"
                    />
                  </div>
               </div>

               <div className="overflow-x-auto">
                 <table className="w-full text-left min-w-[500px]">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4">Material Name</th>
                        <th className="px-6 py-4 text-center">Volume Pesanan</th>
                        <th className="px-6 py-4 text-center">Status Item</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getItems(selectedRO).map((item: any, idx: number) => (
                        <tr key={`${item.materialId}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
                          <td className="px-6 py-5">
                            <div className="font-bold text-slate-800">{item.materialName}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-1">{item.materialId}</div>
                          </td>
                          <td className="px-6 py-5 text-center font-black text-[#1C0770]">
                            {(item.quantity || 0).toLocaleString()} <span className="text-[10px] font-bold text-slate-300 ml-1">{item.unit}</span>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200">{item.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               </div>

               <div className="mt-10 p-8 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
                  {selectedRO.status === 'Draft' ? (
                    <>
                      <div className="text-center md:text-left">
                        <h4 className="font-black text-xl text-slate-900 tracking-tight">Kirim RO ke Purchasing?</h4>
                        <p className="text-slate-500 text-sm mt-1">Dokumen akan diverifikasi dan dipantau di menu Traffic.</p>
                      </div>
                      <button onClick={handleFinalizeRO} className="px-10 py-4 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl hover:scale-105 transition-all">🚀 Finalisasi & Kirim</button>
                    </>
                  ) : (
                    <>
                      <div className="text-center md:text-left">
                        <h4 className="font-black text-xl text-slate-900 tracking-tight">Update Estimasi Deadline?</h4>
                        <p className="text-slate-500 text-sm mt-1">Perbarui deadline kedatangan untuk pantauan Traffic.</p>
                      </div>
                      <button onClick={handleUpdateDeadlineOnly} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-xl hover:scale-105 transition-all">💾 Simpan Perubahan</button>
                    </>
                  )}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchasing;
