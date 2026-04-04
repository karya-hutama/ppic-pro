
import React, { useState, useMemo } from 'react';
import { SavedSchedule, FinishGood } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const DAYS_NAME = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

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

interface ProductionHistoryProps {
  history: SavedSchedule[];
  finishGoods: FinishGood[];
  onEdit?: (schedule: SavedSchedule) => void;
  onRefresh?: () => void;
}

const ProductionHistory: React.FC<ProductionHistoryProps> = ({ history = [], finishGoods = [], onEdit, onRefresh }) => {
  const [mainTab, setMainTab] = useState<'weekly' | 'daily'>('weekly');
  const [selectedSchedule, setSelectedSchedule] = useState<SavedSchedule | null>(null);
  const [detailTab, setDetailTab] = useState<'batch' | 'output'>('batch');
  
  React.useEffect(() => {
    if (selectedSchedule) {
      const updated = history.find(h => String(h.id).trim() === String(selectedSchedule.id).trim());
      if (updated && (updated.startDate !== selectedSchedule.startDate || JSON.stringify(updated.data) !== JSON.stringify(selectedSchedule.data))) {
        setSelectedSchedule(updated);
      }
    }
  }, [history, selectedSchedule]);
  
  const getScheduleDates = (startDateStr: string) => {
    const dates = [];
    const startDateObj = parseSafeDate(startDateStr);
    const y = startDateObj.getFullYear();
    const m = startDateObj.getMonth();
    const d = startDateObj.getDate();
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(y, m, d + i);
      dates.push({
        dayName: DAYS_NAME[date.getDay()],
        dayIdx: date.getDay(),
        formatted: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        fullDate: date
      });
    }
    return dates;
  };

  const selectedDates = useMemo(() => {
    if (!selectedSchedule) return [];
    return getScheduleDates(selectedSchedule.startDate);
  }, [selectedSchedule]);
  
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');

  const safeHistory = useMemo(() => {
    if (!Array.isArray(history)) return [];
    return history
      .filter(h => h && h.id && h.startDate)
      .sort((a, b) => {
        // Sort by startDate descending, then by createdAt descending
        const dateA = a.startDate;
        const dateB = b.startDate;
        if (dateA !== dateB) return dateB.localeCompare(dateA);
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
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

  const allDailyHistory = useMemo(() => {
    const dailyList: {
      parentScheduleId: string;
      parentCreatedAt: string;
      parentStartDate: string;
      date: string;
      rawDate: string;
      dayName: string;
      perSku: Record<string, { batches: number; packs: number; weeklyTarget: number; weeklyTotalBatches: number }>;
    }[] = [];

    safeHistory.forEach(schedule => {
      const dates = getScheduleDates(schedule.startDate);
      let scheduleMap: any = schedule.data || {};
      let targetMap: any = schedule.targets || {};
      if (typeof scheduleMap === 'string') {
        try { scheduleMap = JSON.parse(scheduleMap); } catch (e) { scheduleMap = {}; }
      }
      if (typeof targetMap === 'string') {
        try { targetMap = JSON.parse(targetMap); } catch (e) { targetMap = {}; }
      }

      dates.forEach((day, dayIdx) => {
        const perSku: Record<string, { batches: number; packs: number; weeklyTarget: number; weeklyTotalBatches: number }> = {};
        let hasData = false;

        finishGoods.forEach(fg => {
          const rawBatchValues = scheduleMap[fg.id] || null;
          let dailyBatches: number[] = new Array(7).fill(0);
          if (Array.isArray(rawBatchValues)) {
            dailyBatches = rawBatchValues.map(v => Number(v) || 0);
          }
          const batches = dailyBatches[dayIdx] || 0;
          const weeklyTotalBatches = dailyBatches.reduce((a, b) => a + b, 0);
          const weeklyTarget = Number(targetMap[fg.id]) || 0;

          if (batches > 0) {
            perSku[fg.id] = {
              batches,
              packs: batches * (fg.qtyPerBatch || 1),
              weeklyTarget,
              weeklyTotalBatches
            };
            hasData = true;
          }
        });

        if (hasData) {
          dailyList.push({
            parentScheduleId: schedule.id,
            parentCreatedAt: schedule.createdAt || '',
            parentStartDate: schedule.startDate,
            date: day.formatted,
            rawDate: formatDateToISO(day.fullDate),
            dayName: day.dayName,
            perSku
          });
        }
      });
    });

    return dailyList.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [safeHistory, finishGoods]);

  const filteredDailyHistory = useMemo(() => {
    let data = allDailyHistory;
    if (filterStart) {
      data = data.filter(d => d.rawDate >= filterStart);
    }
    if (filterEnd) {
      data = data.filter(d => d.rawDate <= filterEnd);
    }
    return data;
  }, [allDailyHistory, filterStart, filterEnd]);

  const detailData = useMemo(() => {
    if (!selectedSchedule) return [];
    
    let scheduleMap: any = selectedSchedule.data || {};
    let targetMap: Record<string, number> = selectedSchedule.targets || {};

    if (typeof scheduleMap === 'string') {
      try { scheduleMap = JSON.parse(scheduleMap); } catch (e) { scheduleMap = {}; }
    }
    if (typeof targetMap === 'string') {
      try { targetMap = JSON.parse(targetMap); } catch (e) { targetMap = {}; }
    }

    const scheduleIds = Object.keys(scheduleMap);
    const targetIds = Object.keys(targetMap);
    const allRecordedIds = Array.from(new Set([...scheduleIds, ...targetIds]));

    return allRecordedIds.map(id => {
      const skuInMaster = finishGoods.find(f => 
        f.id.trim().toLowerCase() === id.trim().toLowerCase() || 
        f.name.trim().toLowerCase() === id.trim().toLowerCase()
      );

      const displayName = skuInMaster ? skuInMaster.name : id;
      const qtyPerBatch = skuInMaster ? (skuInMaster.qtyPerBatch || 1) : 1;
      
      const rawBatchValues = scheduleMap[id] || null;
      let dailyBatches: number[] = new Array(7).fill(0);
      if (Array.isArray(rawBatchValues)) {
        dailyBatches = rawBatchValues.map(v => Number(v) || 0);
      }

      const totalBatches = dailyBatches.reduce((a, b) => a + b, 0);
      const dailyPacks = dailyBatches.map(b => b * qtyPerBatch);
      const totalPacks = dailyPacks.reduce((a, b) => a + b, 0);
      
      const referenceTarget = Number(targetMap[id]) || 0;
      const shortfall = Math.max(0, referenceTarget - totalBatches);
      
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
        shortfall,
        qtyPerBatch,
        isDeleted: !skuInMaster 
      };
    })
    .filter(item => item.totalBatches > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedSchedule, finishGoods]);

  const handleDownloadDailyExcel = () => {
    const dataToExport: any[] = [];

    filteredDailyHistory.forEach(day => {
      Object.entries(day.perSku).forEach(([skuId, data]) => {
        const sku = finishGoods.find(s => s.id === skuId);
        dataToExport.push({
          'Tanggal Produksi': day.date,
          'Hari': day.dayName,
          'Dari Jadwal Mingguan': parseSafeDate(day.parentStartDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}),
          'Product/SKU': sku?.name || skuId,
          'SKU ID': skuId,
          'Batches': data.batches,
          'Estimasi Packs': data.packs,
          'Target Mingguan (Batch)': data.weeklyTarget,
          'Target Mingguan (Packs)': data.weeklyTarget * (sku?.qtyPerBatch || 1),
          'Total Batch Minggu Ini': data.weeklyTotalBatches,
          'Kekurangan Target (Batch)': Math.max(0, data.weeklyTarget - data.weeklyTotalBatches),
          'Kekurangan Target (Packs)': Math.max(0, data.weeklyTarget - data.weeklyTotalBatches) * (sku?.qtyPerBatch || 1)
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jadwal_Harian");
    XLSX.writeFile(workbook, "Jadwal_Produksi_Harian.xlsx");
  };

  const handleDownloadPDF = () => {
    if (!selectedSchedule) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const startDateObj = parseSafeDate(selectedSchedule.startDate);
    const dateStr = startDateObj.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    doc.setFontSize(22);
    doc.setTextColor(28, 7, 112); 
    doc.text('PPIC PRO - LAPORAN PRODUKSI', 14, 15);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periode: ${dateStr}`, 14, 22);
    
    const head = [['Produk SKU', ...selectedDates.map(d => `${d.dayName}\n${d.formatted}`), detailTab === 'batch' ? 'Total Batch' : 'Total Packs', 'Target', 'Kekurangan', 'Status Target']];
    const body = detailData.map(d => [
      d.name,
      ...(detailTab === 'batch' ? d.dailyBatches : d.dailyPacks.map(p => p.toLocaleString())),
      (detailTab === 'batch' ? d.totalBatches : d.totalPacks.toLocaleString()),
      (detailTab === 'batch' ? d.referenceTarget : d.referenceTarget * d.qtyPerBatch) || '-',
      (detailTab === 'batch' ? d.shortfall : d.shortfall * d.qtyPerBatch) || '-',
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
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Arsip jadwal produksi {mainTab === 'weekly' ? 'mingguan' : 'harian'}</p>
        </div>

        <div className="flex flex-col xl:flex-row items-stretch xl:items-center gap-3 w-full md:w-auto">
          {mainTab === 'daily' && (
            <button 
              onClick={handleDownloadDailyExcel}
              className="px-6 py-3 bg-emerald-500 text-white rounded-[28px] text-xs font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm flex items-center justify-center gap-2"
            >
              <span>📥</span> Download Excel
            </button>
          )}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-[28px] border border-slate-100 shadow-sm w-full md:w-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center px-4 gap-3 border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Filter Tanggal</span>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  value={filterStart} 
                  onChange={(e) => setFilterStart(e.target.value)} 
                  className="text-xs font-bold text-[#1C0770] bg-transparent outline-none" 
                />
                <span className="text-slate-300">→</span>
                <input 
                  type="date" 
                  value={filterEnd} 
                  onChange={(e) => setFilterEnd(e.target.value)} 
                  className="text-xs font-bold text-[#1C0770] bg-transparent outline-none" 
                />
              </div>
            </div>
            {onRefresh && (
              <button 
                onClick={onRefresh} 
                className="px-5 py-2.5 bg-[#1C0770] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95 w-full sm:w-auto flex items-center justify-center gap-2"
              >
                <span>🔄</span> Refresh
              </button>
            )}
            {(filterStart || filterEnd) && (
              <button onClick={handleResetFilter} className="px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 h-[34px]">Reset</button>
            )}
          </div>
        </div>
      </div>

      <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
        <button 
          onClick={() => setMainTab('weekly')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === 'weekly' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Mingguan
        </button>
        <button 
          onClick={() => setMainTab('daily')}
          className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mainTab === 'daily' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          Harian
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mainTab === 'weekly' ? (
          filteredHistory.length === 0 ? (
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
                        <span className="text-2xl font-black text-[#1C0770] font-mono leading-none">
                          {parseSafeDate(item.startDate).getDate()}
                        </span>
                     </div>
                     <div>
                        <h4 className="font-bold text-slate-800 text-lg tracking-tight">
                          Produksi: {parseSafeDate(item.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
                        </h4>
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
          )
        ) : (
          filteredDailyHistory.length === 0 ? (
            <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center flex flex-col items-center">
              <span className="text-5xl block mb-4 opacity-20">📅</span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada riwayat harian ditemukan</p>
            </div>
          ) : (
            filteredDailyHistory.map((day, idx) => (
              <div key={`${day.parentScheduleId}-${idx}`} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-10 py-6 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#1C0770] text-white rounded-xl flex items-center justify-center font-black text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">{day.dayName}, {day.date}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dari Jadwal Mingguan: {parseSafeDate(day.parentStartDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                    </div>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-right">
                      <div className="text-sm font-black text-[#1C0770]">{Object.keys(day.perSku).length}</div>
                      <div className="text-[8px] font-bold text-slate-300 uppercase">SKUs</div>
                    </div>
                  </div>
                </div>
                <div className="p-8">
                  <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Rincian Produksi Per SKU</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(day.perSku).map(([skuId, data]) => {
                      const sku = finishGoods.find(s => s.id === skuId);
                      return (
                        <div key={skuId} className="border border-slate-100 rounded-2xl p-4 flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-bold text-slate-800">{sku?.name || skuId}</span>
                            <span className="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-lg">{skuId}</span>
                          </div>
                          <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                            <div className="text-center">
                              <div className="text-sm font-black text-[#1C0770]">{data.batches}</div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase">Batches</div>
                            </div>
                            <div className="text-center">
                              <div className="text-sm font-black text-emerald-600">{data.packs.toLocaleString()}</div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase">Packs</div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-dashed border-slate-100">
                            <div className="text-center">
                              <div className="text-xs font-black text-slate-600">
                                {data.weeklyTarget || '-'} 
                                {data.weeklyTarget > 0 && <span className="text-[8px] text-slate-400 ml-1">({(data.weeklyTarget * (sku?.qtyPerBatch || 1)).toLocaleString()} P)</span>}
                              </div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase">Target</div>
                            </div>
                            <div className="text-center">
                              <div className={`text-xs font-black ${data.weeklyTarget - data.weeklyTotalBatches > 0 ? 'text-rose-500' : 'text-slate-300'}`}>
                                {Math.max(0, data.weeklyTarget - data.weeklyTotalBatches) || '-'}
                                {data.weeklyTarget - data.weeklyTotalBatches > 0 && <span className="text-[8px] opacity-60 ml-1">({(Math.max(0, data.weeklyTarget - data.weeklyTotalBatches) * (sku?.qtyPerBatch || 1)).toLocaleString()} P)</span>}
                              </div>
                              <div className="text-[8px] font-bold text-slate-400 uppercase">Kurang</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )
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
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Periode: {parseSafeDate(selectedSchedule.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <button 
                  onClick={() => {
                    if (onEdit && selectedSchedule) {
                      onEdit(selectedSchedule);
                      setSelectedSchedule(null);
                    }
                  }} 
                  className="flex-1 px-6 py-4 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-amber-600 shadow-lg"
                >
                  <span>✏️</span> Ubah Jadwal
                </button>
                <button onClick={handleDownloadPDF} className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-700 shadow-lg"><span>📥</span> Download PDF</button>
                <button onClick={() => setSelectedSchedule(null)} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-colors">Close</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-10">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full sm:w-fit overflow-x-auto no-scrollbar">
                <button onClick={() => setDetailTab('batch')} className={`flex-1 sm:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${detailTab === 'batch' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}>Input Batch</button>
                <button onClick={() => setDetailTab('output')} className={`flex-1 sm:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${detailTab === 'output' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}>Hasil Output (Packs)</button>
              </div>

              <div className="border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[1100px]">
                    <thead className="bg-slate-50 text-[9px] uppercase font-black text-slate-400">
                      <tr>
                        <th className="px-8 py-5 border-r border-slate-100 sticky left-0 bg-slate-50 z-10">Product SKU</th>
                        {selectedDates.map(dateObj => (
                          <th key={dateObj.formatted} className="px-4 py-5 text-center border-r border-slate-100">
                            <div className="text-[#1C0770]">{dateObj.dayName}</div>
                            <div className="text-[8px] opacity-60">{dateObj.formatted}</div>
                          </th>
                        ))}
                        <th className="px-8 py-5 text-center font-black text-slate-600 border-r border-slate-100">Total</th>
                        <th className="px-8 py-5 text-center font-black text-slate-600 border-r border-slate-100">Target</th>
                        <th className="px-8 py-5 text-center font-black text-rose-600 border-r border-slate-100">Kurang</th>
                        <th className="px-8 py-5 text-center font-black text-indigo-600">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-sm font-medium">
                        {detailData.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-8 py-20 text-center text-slate-400 italic">
                              Tidak ada produksi tercatat (&gt;0 batch) untuk periode ini.
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
                                  <td key={`${d.id}-day-${i}`} className={`px-4 py-5 text-center border-r border-slate-100 font-black ${displayVal > 0 ? (detailTab === 'batch' ? 'text-[#1C0770]' : 'text-emerald-600') : 'text-slate-200'}`}>
                                    {displayVal > 0 ? displayVal.toLocaleString() : '-'}
                                  </td>
                                );
                              })}
                              <td className={`px-8 py-5 text-center border-r border-slate-100 font-black bg-slate-50/10 ${detailTab === 'batch' ? 'text-slate-900' : 'text-emerald-600'}`}>
                                {(detailTab === 'batch' ? d.totalBatches : d.totalPacks).toLocaleString()}
                              </td>
                              <td className="px-8 py-5 text-center border-r border-slate-100 font-black text-slate-600">
                                {(detailTab === 'batch' ? d.referenceTarget : d.referenceTarget * d.qtyPerBatch).toLocaleString() || '-'}
                              </td>
                              <td className={`px-8 py-5 text-center border-r border-slate-100 font-black ${d.shortfall > 0 ? 'text-rose-600' : 'text-slate-200'}`}>
                                {(detailTab === 'batch' ? d.shortfall : d.shortfall * d.qtyPerBatch).toLocaleString() || '-'}
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
