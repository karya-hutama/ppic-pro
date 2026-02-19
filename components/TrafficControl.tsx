
import React, { useState, useMemo } from 'react';
import { RequestOrder, DeliveryBatch, RawMaterial, FinishGood } from '../types';

interface TrafficControlProps {
  history: RequestOrder[];
  rawMaterials: RawMaterial[];
  finishGoods: FinishGood[];
  onUpdateRO: (ro: RequestOrder) => void;
}

const TrafficControl: React.FC<TrafficControlProps> = ({ 
  history = [], 
  rawMaterials = [], 
  finishGoods = [], 
  onUpdateRO 
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'fg' | 'rm' | 'tracing' | 'partial-history'>('fg');
  const [showReceiveModal, setShowReceiveModal] = useState<{ roId: string, itemIdx: number } | null>(null);
  const [receiveQty, setReceiveQty] = useState<number>(0);
  
  // Filter states for Tracing Tab
  const [tracingStart, setTracingStart] = useState('');
  const [tracingEnd, setTracingEnd] = useState('');

  // Filter states for Partial History Tab
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');

  // Logistics fields inside receive modal
  const [actualOrderDate, setActualOrderDate] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [actualArrivalDate, setActualArrivalDate] = useState(new Date().toISOString().split('T')[0]);

  // 1. Perhitungan Statistik Inventori Akurat
  const stats = useMemo(() => {
    // Hitung Nilai RM: (Stok * (Harga Beli / Faktor Konversi))
    const rmValue = (rawMaterials || []).reduce((acc, rm) => {
      const unitPrice = (rm.pricePerPurchaseUnit || 0) / (rm.conversionFactor || 1);
      return acc + ((rm.stock || 0) * unitPrice);
    }, 0);

    // Hitung Nilai FG: (Stok * HPP aktual dari spreadsheet)
    const fgValue = (finishGoods || []).reduce((acc, fg) => acc + ((fg.stock || 0) * (fg.hpp || 0)), 0);

    return {
      totalFG: (finishGoods || []).reduce((acc, fg) => acc + (fg.stock || 0), 0),
      totalRM: (rawMaterials || []).reduce((acc, rm) => acc + (rm.stock || 0), 0),
      fgValue,
      rmValue,
      totalValue: rmValue + fgValue
    };
  }, [rawMaterials, finishGoods]);

  // 2. Filter RO Aktif dengan Date Range
  const filteredActiveOrders = useMemo(() => {
    return (history || []).filter(ro => {
      if (ro.status !== 'Sent' && ro.status !== 'Completed') return false;
      if (tracingStart && ro.date < tracingStart) return false;
      if (tracingEnd && ro.date > tracingEnd) return false;
      return true;
    });
  }, [history, tracingStart, tracingEnd]);

  // 3. Flatten All Deliveries for Partial History Tab
  const allDeliveries = useMemo(() => {
    const list: any[] = [];
    (history || []).forEach(ro => {
      (ro.items || []).forEach(item => {
        if (item.deliveries) {
          (item.deliveries || []).forEach(del => {
            if (historyStart && del.date < historyStart) return;
            if (historyEnd && del.date > historyEnd) return;
            list.push({
              ...del,
              roId: ro.id,
              materialName: item.materialName,
              unit: item.unit
            });
          });
        }
      });
    });
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, historyStart, historyEnd]);

  const handleOpenReceiveModal = (roId: string, itemIdx: number) => {
    const ro = history.find(h => h.id === roId);
    const item = ro?.items?.[itemIdx];
    if (item) {
      setActualOrderDate(item.actualOrderDate || ro?.date || '');
      setEstimatedArrival(item.estimatedArrival || ro?.deadline || '');
      setActualArrivalDate(new Date().toISOString().split('T')[0]);
      setReceiveQty(0);
      setShowReceiveModal({ roId, itemIdx });
    }
  };

  const handleReceiveBatch = () => {
    if (!showReceiveModal || receiveQty <= 0) return;

    const ro = history.find(h => h.id === showReceiveModal.roId);
    if (!ro || !ro.items) return;

    const updatedItems = [...ro.items];
    const item = { ...updatedItems[showReceiveModal.itemIdx] };
    
    const newDelivery: DeliveryBatch = {
      id: `DEL-${Date.now()}`,
      date: actualArrivalDate, 
      quantity: receiveQty,
      receivedBy: 'Staff Logistik'
    };

    item.actualOrderDate = actualOrderDate;
    item.estimatedArrival = estimatedArrival;
    item.receivedQuantity = (item.receivedQuantity || 0) + receiveQty;
    item.deliveries = [...(item.deliveries || []), newDelivery];
    
    const targetQty = item.actualOrderQty || item.quantity;
    item.status = item.receivedQuantity >= targetQty ? 'Received' : 'Partial';

    updatedItems[showReceiveModal.itemIdx] = item;
    const allReceived = updatedItems.every(i => i.status === 'Received');
    
    const updatedRO: RequestOrder = {
      ...ro,
      items: updatedItems,
      status: allReceived ? 'Completed' : 'Sent'
    };

    onUpdateRO(updatedRO);
    setShowReceiveModal(null);
    setReceiveQty(0);
  };

  return (
    <div className="py-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">Traffic Control Center</h1>
          <p className="text-slate-500 mt-1 font-medium italic text-sm">Monitoring Logistik, Aset Gudang, dan Arus Barang</p>
        </div>
        <div className="bg-[#1C0770] px-6 py-4 rounded-[24px] text-white shadow-xl shadow-indigo-100 flex items-center gap-4">
           <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">💰</div>
           <div>
              <div className="text-[10px] font-black uppercase text-white/40 tracking-widest leading-none mb-1">Total Nilai Inventori</div>
              <div className="text-xl font-black tracking-tight">Rp {stats.totalValue.toLocaleString('id-ID')}</div>
           </div>
        </div>
      </div>

      <div className="flex bg-white p-2 rounded-[28px] border border-slate-100 shadow-sm w-fit overflow-x-auto no-scrollbar">
        {[
          { id: 'fg', label: 'Finish Goods', icon: '📦' },
          { id: 'rm', label: 'Raw Materials', icon: '🧪' },
          { id: 'tracing', label: 'Tracing PO / RO', icon: '🚚' },
          { id: 'partial-history', label: 'Riwayat Parsial', icon: '📋' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-6 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center gap-3 transition-all whitespace-nowrap ${
              activeSubTab === tab.id 
                ? 'bg-[#1C0770] text-white shadow-lg shadow-indigo-200 scale-105' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {activeSubTab === 'fg' && (
          <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Volume Produk Jadi</div>
                  <div className="text-4xl font-black text-slate-900">{stats.totalFG.toLocaleString()} <span className="text-sm font-bold text-slate-300">Packs</span></div>
               </div>
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Valuasi Produk (HPP)</div>
                  <div className="text-4xl font-black text-emerald-600">Rp {stats.fgValue.toLocaleString('id-ID')}</div>
               </div>
            </div>
            
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-10 py-6">Produk SKU</th>
                    <th className="px-6 py-6 text-center">Stok Gudang</th>
                    <th className="px-6 py-6 text-right">Nilai Aset (HPP)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(finishGoods || []).map(fg => (
                    <tr key={fg.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-6">
                        <div className="font-bold text-slate-800">{fg.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-1">{fg.id}</div>
                      </td>
                      <td className="px-6 py-6 text-center">
                         <div className="text-lg font-black text-[#1C0770]">{(fg.stock || 0).toLocaleString()}</div>
                         <div className="text-[9px] font-bold text-slate-300 uppercase">Packs Available</div>
                      </td>
                      <td className="px-6 py-6 text-right">
                         <div className="font-bold text-slate-800">Rp {((fg.stock || 0) * (fg.hpp || 0)).toLocaleString('id-ID')}</div>
                         <div className="text-[9px] text-slate-400 font-medium">@Rp {(fg.hpp || 0).toLocaleString('id-ID')} (Data Master)</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'rm' && (
          <div className="grid grid-cols-1 gap-6 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Volume Bahan Baku</div>
                  <div className="text-4xl font-black text-slate-900">{stats.totalRM.toLocaleString()} <span className="text-sm font-bold text-slate-300">Unit</span></div>
               </div>
               <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Valuasi Material (Net)</div>
                  <div className="text-4xl font-black text-amber-600">Rp {stats.rmValue.toLocaleString('id-ID')}</div>
               </div>
            </div>

            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-10 py-6">Material Detail</th>
                    <th className="px-6 py-6 text-center">Stok Saat Ini</th>
                    <th className="px-6 py-6 text-right">Nilai Aset</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(rawMaterials || []).filter(m => !m.isProcessed).map(rm => {
                    const unitPrice = (rm.pricePerPurchaseUnit || 0) / (rm.conversionFactor || 1);
                    return (
                      <tr key={rm.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6">
                          <div className="font-bold text-slate-800">{rm.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">{rm.id}</div>
                        </td>
                        <td className="px-6 py-6 text-center">
                           <div className="text-lg font-black text-[#1C0770]">{(rm.stock || 0).toLocaleString()}</div>
                           <div className="text-[9px] font-bold text-slate-300 uppercase">{rm.usageUnit} Available</div>
                        </td>
                        <td className="px-6 py-6 text-right">
                           <div className="font-bold text-slate-800">Rp {((rm.stock || 0) * unitPrice).toLocaleString('id-ID')}</div>
                           <div className="text-[9px] text-slate-400 font-medium">Berdasarkan Harga Beli Terakhir</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'tracing' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 w-full md:w-auto">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Dari Tanggal Order</label>
                   <input type="date" value={tracingStart} onChange={(e) => setTracingStart(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
                </div>
                <div className="flex-1 w-full md:w-auto">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Sampai Tanggal Order</label>
                   <input type="date" value={tracingEnd} onChange={(e) => setTracingEnd(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
                </div>
                <button onClick={() => { setTracingStart(''); setTracingEnd(''); }} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all h-[38px]">Reset Filter</button>
             </div>

             {filteredActiveOrders.length === 0 ? (
                <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center flex flex-col items-center">
                   <div className="text-6xl mb-6 grayscale opacity-20">📦</div>
                   <h3 className="text-xl font-bold text-slate-800">Tidak Ada Order Ditemukan</h3>
                   <p className="text-slate-400 mt-2 text-sm max-w-sm font-medium leading-relaxed">Sesuaikan filter atau buat Request Order baru.</p>
                </div>
             ) : (
               filteredActiveOrders.map(ro => (
                 <div key={ro.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="px-10 py-8 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-6">
                       <div className="flex items-center gap-5">
                          <div className="w-14 h-14 bg-[#1C0770] text-white rounded-2xl flex items-center justify-center text-xl shadow-lg shadow-indigo-100">🚚</div>
                          <div>
                             <h4 className="text-xl font-black text-slate-900 tracking-tight">Order ID: {ro.id}</h4>
                             <div className="flex items-center gap-4 mt-1">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PPIC Deadline: {ro.deadline ? new Date(ro.deadline).toLocaleDateString('id-ID') : '-'}</p>
                                <span className="text-slate-200">•</span>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tanggal Order: {new Date(ro.date).toLocaleDateString('id-ID')}</p>
                             </div>
                          </div>
                       </div>
                       <div className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border ${ro.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                          {ro.status === 'Sent' ? '📦 On Delivery / Partial' : '✅ Received All'}
                       </div>
                    </div>

                    <div className="p-10 space-y-8">
                       {(ro.items || []).map((item, idx) => {
                         const targetQty = item.actualOrderQty || item.quantity || 0;
                         const progress = targetQty > 0 ? ((item.receivedQuantity || 0) / targetQty) * 100 : 0;
                         const isLate = ro.deadline && item.estimatedArrival && new Date(item.estimatedArrival) > new Date(ro.deadline);

                         return (
                           <div key={idx} className="bg-slate-50/30 rounded-[32px] p-8 border border-slate-100">
                              <div className="flex flex-col lg:flex-row gap-10 items-center">
                                 <div className="flex-1 w-full space-y-4">
                                    <div className="flex justify-between items-end">
                                       <div>
                                          <h5 className="font-black text-slate-800 text-lg tracking-tight">{item.materialName}</h5>
                                          <div className={`text-[10px] font-bold uppercase mt-1 ${isLate ? 'text-rose-500 underline' : 'text-slate-400'}`}>
                                            ETA: {item.estimatedArrival ? new Date(item.estimatedArrival).toLocaleDateString('id-ID') : '-'}
                                            {isLate && <span className="ml-2">⚠️ LATE FROM DEADLINE</span>}
                                          </div>
                                       </div>
                                       <div className="text-right">
                                          <span className="text-2xl font-black text-[#1C0770]">{(item.receivedQuantity || 0).toLocaleString()}</span>
                                          <span className="text-xs font-bold text-slate-300 ml-1">/{targetQty.toLocaleString()} {item.unit}</span>
                                       </div>
                                    </div>
                                    
                                    <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden shadow-inner">
                                       <div 
                                         className={`h-full transition-all duration-1000 ease-out flex items-center justify-end px-3 ${progress >= 100 ? 'bg-emerald-500' : 'bg-[#1C0770]'}`}
                                         style={{ width: `${Math.min(progress, 100)}%` }}
                                       >
                                          {progress > 15 && <span className="text-[8px] font-black text-white/40">{Math.round(progress)}%</span>}
                                       </div>
                                    </div>
                                 </div>

                                 <div className="shrink-0 w-full lg:w-48">
                                    <button 
                                      disabled={(item.receivedQuantity || 0) >= targetQty}
                                      onClick={() => handleOpenReceiveModal(ro.id, idx)}
                                      className={`w-full py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg ${
                                        (item.receivedQuantity || 0) >= targetQty 
                                          ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                                          : 'bg-[#1C0770] text-white hover:scale-105 active:scale-95'
                                      }`}
                                    >
                                       {(item.receivedQuantity || 0) >= targetQty ? '✅ Terpenuhi' : '📥 Input Batch'}
                                    </button>
                                 </div>
                              </div>
                           </div>
                         );
                       })}
                    </div>
                 </div>
               ))
             )}
          </div>
        )}

        {activeSubTab === 'partial-history' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
             <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-end gap-4">
                <div className="flex-1 w-full md:w-auto">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Masuk Mulai Tanggal</label>
                   <input type="date" value={historyStart} onChange={(e) => setHistoryStart(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
                </div>
                <div className="flex-1 w-full md:w-auto">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 ml-1">Sampai Tanggal</label>
                   <input type="date" value={historyEnd} onChange={(e) => setHistoryEnd(e.target.value)} className="w-full px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-[#1C0770] outline-none" />
                </div>
                <button onClick={() => { setHistoryStart(''); setHistoryEnd(''); }} className="px-6 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all h-[38px]">Reset Filter</button>
             </div>

             <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                   <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                      <tr>
                         <th className="px-10 py-6">Tanggal Masuk Fisik</th>
                         <th className="px-6 py-6">Material</th>
                         <th className="px-6 py-6 text-center">Jumlah Diterima</th>
                         <th className="px-6 py-6 text-center">Order ID</th>
                         <th className="px-10 py-6 text-right">Diterima Oleh</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-50">
                      {allDeliveries.length === 0 ? (
                         <tr>
                            <td colSpan={5} className="px-10 py-20 text-center">
                               <div className="text-4xl mb-4 grayscale opacity-20">📋</div>
                               <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Belum ada riwayat kedatangan barang.</p>
                            </td>
                         </tr>
                      ) : (
                         allDeliveries.map((del, dIdx) => (
                            <tr key={del.id} className="hover:bg-slate-50/50 transition-colors">
                               <td className="px-10 py-6">
                                  <div className="font-bold text-slate-800">{new Date(del.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                                  <div className="text-[9px] text-slate-300 font-black uppercase mt-0.5 tracking-tighter">TIMESTAMP: {del.id.split('-')[1]}</div>
                               </td>
                               <td className="px-6 py-6 font-bold text-slate-700">{del.materialName}</td>
                               <td className="px-6 py-6 text-center">
                                  <span className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl font-black text-sm border border-emerald-100">
                                     +{(del.quantity || 0).toLocaleString()} {del.unit}
                                  </span>
                               </td>
                               <td className="px-6 py-6 text-center text-[10px] font-mono font-bold text-indigo-400">{del.roId}</td>
                               <td className="px-10 py-6 text-right">
                                  <div className="font-black text-slate-900 text-xs">{del.receivedBy}</div>
                                  <div className="text-[9px] text-slate-300 font-bold uppercase">Logistics Staff</div>
                               </td>
                            </tr>
                         ))
                      )}
                   </tbody>
                </table>
             </div>
          </div>
        )}
      </div>

      {/* Simplified Consolidate Receive Modal */}
      {showReceiveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4">
           <div className="bg-white rounded-[40px] p-10 max-w-lg w-full shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center text-3xl mb-6">📥</div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">Pencatatan Kedatangan</h3>
              <p className="text-sm text-slate-500 mb-8 font-medium">Lengkapi rincian logistik dan jumlah barang yang masuk hari ini.</p>
              
              <div className="space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Tanggal Order (PO)</label>
                       <input 
                         type="date"
                         value={actualOrderDate}
                         onChange={(e) => setActualOrderDate(e.target.value)}
                         className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-[#1C0770] outline-none focus:ring-4 ring-indigo-50/50"
                       />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Estimasi Sampai (ETA)</label>
                       <input 
                         type="date"
                         value={estimatedArrival}
                         onChange={(e) => setEstimatedArrival(e.target.value)}
                         className="w-full px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold text-[#1C0770] outline-none focus:ring-4 ring-indigo-50/50"
                       />
                    </div>
                 </div>

                 <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Tanggal Datang Fisik (Masuk Gudang)</label>
                    <input 
                      type="date"
                      value={actualArrivalDate}
                      onChange={(e) => setActualArrivalDate(e.target.value)}
                      className="w-full px-4 py-3.5 bg-white border-2 border-slate-100 rounded-2xl text-sm font-black text-[#1C0770] outline-none focus:border-[#1C0770] transition-all"
                    />
                 </div>

                 <div className="bg-[#1C0770] p-8 rounded-[32px] shadow-2xl shadow-indigo-100">
                    <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-4 text-center">Jumlah Barang Datang Saat Ini</label>
                    <div className="relative">
                       <input 
                         type="number"
                         autoFocus
                         value={receiveQty || ''}
                         onChange={(e) => setReceiveQty(Number(e.target.value))}
                         className="w-full text-center py-6 bg-white/10 border-2 border-white/10 rounded-3xl text-4xl font-black text-white outline-none focus:border-white/40 transition-all placeholder-white/20"
                         placeholder="0"
                       />
                       <div className="absolute top-1/2 -translate-y-1/2 right-6 text-[10px] font-black text-white/30 uppercase">Unit Qty</div>
                    </div>
                 </div>
              </div>

              <div className="flex gap-4 mt-10">
                 <button onClick={() => setShowReceiveModal(null)} className="flex-1 py-5 text-slate-400 font-bold hover:bg-slate-50 rounded-2xl transition text-xs uppercase tracking-widest">Batal</button>
                 <button onClick={handleReceiveBatch} className="flex-1 py-5 bg-[#1C0770] text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-500/20 hover:scale-105 active:scale-95 transition-all">Simpan Batch</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default TrafficControl;
