
import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SavedRMRequirement, RawMaterial, FinishGood, SavedSchedule } from '../types';

const parseSafeDate = (dateInput: any): Date => {
  if (!dateInput) return new Date();
  
  // If it's already a Date object, normalize to local midnight
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate(), 0, 0, 0, 0);
  }

  if (typeof dateInput === 'string') {
    // 1. Handle ISO strings or strings with 'T'
    // We want the calendar date part without timezone shifts
    if (dateInput.includes('T')) {
      const datePart = dateInput.split('T')[0];
      const parts = datePart.split(/[-/]/);
      if (parts.length === 3) {
        let y, m, d;
        if (parts[0].length === 4) {
          y = parseInt(parts[0]); m = parseInt(parts[1]); d = parseInt(parts[2]);
        } else {
          d = parseInt(parts[0]); m = parseInt(parts[1]); y = parseInt(parts[2]);
        }
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
          return new Date(y, m - 1, d, 0, 0, 0, 0);
        }
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
  productionHistory: SavedSchedule[];
}

const RMHistory: React.FC<RMHistoryProps> = ({ history = [], rawMaterials = [], finishGoods = [], productionHistory = [] }) => {
  const [mainTab, setMainTab] = useState<'weekly' | 'daily'>('weekly');
  const [selectedReq, setSelectedReq] = useState<SavedRMRequirement | null>(null);
  const [viewMode, setViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [filterStart, setFilterStart] = useState<string>('');
  const [filterEnd, setFilterEnd] = useState<string>('');

  const getDailyData = useCallback((req: SavedRMRequirement): Array<{
    date: string;
    global: Record<string, number>;
    perSku: Record<string, Record<string, number>>;
  }> => {
    if (req.dailyData && req.dailyData.length > 0) return req.dailyData;

    const reqDateStr = formatDateToISO(req.startDate);
    const matchingSchedule = productionHistory.find(s => formatDateToISO(s.startDate) === reqDateStr);
    
    if (!matchingSchedule) return [];

    let scheduleData: Record<string, number[]> = {};
    try {
      scheduleData = typeof matchingSchedule.data === 'string' ? JSON.parse(matchingSchedule.data) : matchingSchedule.data;
    } catch (e) {
      scheduleData = (matchingSchedule.data as any) || {};
    }

    const startDateObj = parseSafeDate(req.startDate);
    const daily: Array<{
      date: string;
      global: Record<string, number>;
      perSku: Record<string, Record<string, number>>;
    }> = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate() + i);
      daily.push({
        date: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
        global: {},
        perSku: {}
      });
    }

    finishGoods.forEach(fg => {
      const skuSchedule = scheduleData[fg.id] || new Array(7).fill(0);
      skuSchedule.forEach((batches, dayIdx) => {
        if (batches > 0 && daily[dayIdx]) {
          if (!daily[dayIdx].perSku[fg.id]) daily[dayIdx].perSku[fg.id] = {};
          
          (fg.ingredients || []).forEach(ing => {
            const amountNeeded = batches * Number(ing.quantity || 0);
            const material = rawMaterials.find(m => m.id === ing.materialId);
            
            if (material?.isProcessed && material.sourceMaterialId && material.sourceMaterialId !== material.id) {
              const yieldFactor = material.processingYield || 1;
              const convertedSourceAmount = amountNeeded / yieldFactor;
              daily[dayIdx].global[material.sourceMaterialId] = (daily[dayIdx].global[material.sourceMaterialId] || 0) + convertedSourceAmount;
              daily[dayIdx].perSku[fg.id][ing.materialId] = amountNeeded;
            } else {
              daily[dayIdx].global[ing.materialId] = (daily[dayIdx].global[ing.materialId] || 0) + amountNeeded;
              daily[dayIdx].perSku[fg.id][ing.materialId] = amountNeeded;
            }
          });
        }
      });
    });

    return daily;
  }, [productionHistory, finishGoods, rawMaterials]);

  const allDailyData = useMemo(() => {
    const dailyList: {
      parentReqId: string;
      parentCreatedAt: string;
      parentStartDate: string;
      date: string;
      rawDate: string;
      global: Record<string, number>;
      perSku: Record<string, Record<string, number>>;
    }[] = [];

    history.forEach(req => {
      const dailyData = getDailyData(req);
      if (dailyData) {
        const startDateObj = parseSafeDate(req.startDate);
        dailyData.forEach((day, idx) => {
          if (Object.keys(day.global).length > 0) {
            const currentDayDate = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate() + idx);
            dailyList.push({
              parentReqId: req.id,
              parentCreatedAt: req.createdAt,
              parentStartDate: req.startDate,
              date: day.date,
              rawDate: formatDateToISO(currentDayDate),
              global: day.global,
              perSku: day.perSku
            });
          }
        });
      }
    });

    return dailyList.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
  }, [history, getDailyData]);

  const filteredWeeklyHistory = useMemo(() => {
    let data = [...(history || [])].sort((a, b) => {
      const dateA = formatDateToISO(a.startDate);
      const dateB = formatDateToISO(b.startDate);
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (filterStart) {
      data = data.filter(h => formatDateToISO(h.startDate) >= filterStart);
    }
    if (filterEnd) {
      data = data.filter(h => formatDateToISO(h.startDate) <= filterEnd);
    }
    return data;
  }, [history, filterStart, filterEnd]);

  const filteredDailyData = useMemo(() => {
    let data = allDailyData;
    if (filterStart) {
      data = data.filter(d => d.rawDate >= filterStart);
    }
    if (filterEnd) {
      data = data.filter(d => d.rawDate <= filterEnd);
    }
    return data;
  }, [allDailyData, filterStart, filterEnd]);

  const getBatchInfo = (req: SavedRMRequirement) => {
    // Priority 1: Use stored values if they exist
    if (req.totalBatches !== undefined && req.totalBatches > 0) {
      return {
        total: req.totalBatches,
        perSku: req.perSkuBatches || {}
      };
    }

    // Priority 2: Fallback to productionHistory matching by date
    const reqDateStr = formatDateToISO(req.startDate);
    const matchingSchedule = productionHistory.find(s => formatDateToISO(s.startDate) === reqDateStr);
    
    if (matchingSchedule) {
      let data: Record<string, number[]> = {};
      try {
        data = typeof matchingSchedule.data === 'string' ? JSON.parse(matchingSchedule.data) : matchingSchedule.data;
      } catch (e) {
        console.error("Error parsing schedule data for batch count", e);
        data = (matchingSchedule.data as any) || {};
      }

      let total = 0;
      const perSku: Record<string, number> = {};

      Object.entries(data).forEach(([skuId, batches]) => {
        if (Array.isArray(batches)) {
          const skuTotal = batches.reduce((sum, b) => sum + (Number(b) || 0), 0);
          total += skuTotal;
          perSku[skuId] = skuTotal;
        }
      });

      return { total: total || matchingSchedule.totalBatches || 0, perSku };
    }

    return { total: 0, perSku: {} };
  };

  const handleDownloadExcel = () => {
    const dataToExport: any[] = [];

    history.forEach(item => {
      const batchInfo = getBatchInfo(item);
      Object.entries(item.globalData || {}).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        dataToExport.push({
          'No Request Order': item.id,
          'Tanggal Request Order': new Date(item.createdAt).toLocaleDateString('id-ID'),
          'Total Batches': batchInfo.total,
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

  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    filteredWeeklyHistory.forEach((item, idx) => {
      if (idx > 0) doc.addPage();
      
      const batchInfo = getBatchInfo(item);
      const dateStr = parseSafeDate(item.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      
      // Header
      doc.setFillColor(28, 7, 112); // #1C0770
      doc.roundedRect(14, 10, 12, 12, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}`, 20, 18, { align: 'center' });
      
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(dateStr.toUpperCase(), 30, 16);
      
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text(`DARI PRODUKSI: ${parseSafeDate(item.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}).toUpperCase()}`, 30, 21);
      
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${Object.keys(item.globalData || {}).length}`, 260, 16, { align: 'center' });
      doc.text(`${batchInfo.total}`, 280, 16, { align: 'center' });
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text('ITEMS', 260, 21, { align: 'center' });
      doc.text('BATCHES', 280, 21, { align: 'center' });

      // Columns
      const colWidth = 135;
      const leftColX = 14;
      const rightColX = 155;
      let currentY = 35;

      // Left Column: RINGKASAN MATERIAL
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN MATERIAL', leftColX, currentY);
      currentY += 5;

      Object.entries(item.globalData || {}).forEach(([id, amount]) => {
        const rm = rawMaterials.find(m => m.id === id);
        if (currentY > 180) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(leftColX, currentY, colWidth, 10, 2, 2, 'F');
        
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(rm?.name || id, leftColX + 5, currentY + 6.5);
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(rm?.usageUnit || '', leftColX + colWidth - 5, currentY + 6.5, { align: 'right' });
        
        const unitWidth = doc.getTextWidth(rm?.usageUnit || '');
        doc.setTextColor(28, 7, 112);
        doc.setFontSize(9);
        doc.text(`${Math.ceil(amount).toLocaleString()}`, leftColX + colWidth - 6 - unitWidth, currentY + 6.5, { align: 'right' });
        
        currentY += 12;
      });

      // Right Column: RINCIAN PER SKU
      currentY = 35;
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('RINCIAN PER SKU', rightColX, currentY);
      currentY += 5;

      Object.entries(item.perSkuData || {}).forEach(([skuId, needs]) => {
        const sku = finishGoods.find(s => s.id === skuId);
        const needsEntries = Object.entries(needs || {});
        const cardHeight = 12 + (Math.ceil(needsEntries.length / 2) * 8);
        
        if (currentY + cardHeight > 190) {
          doc.addPage();
          currentY = 20;
        }

        doc.setDrawColor(240, 240, 240);
        doc.roundedRect(rightColX, currentY, colWidth, cardHeight, 3, 3, 'D');
        
        doc.setTextColor(28, 7, 112);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(sku?.name || skuId, rightColX + 5, currentY + 7);
        
        doc.setFillColor(240, 245, 255);
        doc.roundedRect(rightColX + colWidth - 25, currentY + 2.5, 20, 5, 1, 1, 'F');
        doc.setTextColor(100, 120, 255);
        doc.setFontSize(6);
        doc.text(skuId, rightColX + colWidth - 15, currentY + 6, { align: 'center' });
        
        let itemY = currentY + 14;
        let itemX = rightColX + 5;
        needsEntries.forEach(([rmId, amount], idx) => {
          const rm = rawMaterials.find(m => m.id === rmId);
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'normal');
          doc.text(rm?.name || rmId, itemX, itemY);
          
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'bold');
          doc.text(`${Math.ceil(amount).toLocaleString()} ${rm?.usageUnit || ''}`, itemX + (colWidth/2) - 5, itemY, { align: 'right' });
          
          if (idx % 2 === 0) {
            itemX = rightColX + (colWidth / 2) + 5;
          } else {
            itemX = rightColX + 5;
            itemY += 8;
          }
        });
        
        currentY += cardHeight + 6;
      });
    });

    doc.save("Riwayat_RM_Mingguan.pdf");
  };

  const handleDownloadDailyExcel = () => {
    const dataToExport: any[] = [];

    filteredDailyData.forEach(day => {
      // Global Summary
      Object.entries(day.global).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        dataToExport.push({
          'Tanggal Produksi': day.date,
          'Dari Request Order': day.parentReqId,
          'Category': 'GLOBAL SUMMARY',
          'Product/SKU': '-',
          'Material Name': rm?.name || rmId,
          'Quantity': amount,
          'Unit': rm?.usageUnit || '-'
        });
      });

      // Per SKU Breakdown
      Object.entries(day.perSku).forEach(([skuId, needs]) => {
        const sku = finishGoods.find(s => s.id === skuId);
        Object.entries(needs).forEach(([rmId, amount]) => {
          const rm = rawMaterials.find(m => m.id === rmId);
          dataToExport.push({
            'Tanggal Produksi': day.date,
            'Dari Request Order': day.parentReqId,
            'Category': 'PER SKU BREAKDOWN',
            'Product/SKU': sku?.name || skuId,
            'Material Name': rm?.name || rmId,
            'Quantity': amount,
            'Unit': rm?.usageUnit || '-'
          });
        });
      });
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RM_History_Daily");
    XLSX.writeFile(workbook, "RM_History_Daily.xlsx");
  };

  const handleDownloadDailyPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    filteredDailyData.forEach((day, idx) => {
      if (idx > 0) doc.addPage();
      
      // Header
      doc.setFillColor(28, 7, 112); // #1C0770
      doc.roundedRect(14, 10, 12, 12, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${idx + 1}`, 20, 18, { align: 'center' });
      
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(day.date.toUpperCase(), 30, 16);
      
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const parentDate = parseSafeDate(day.parentStartDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'});
      doc.text(`DARI PRODUKSI: ${parentDate.toUpperCase()}`, 30, 21);
      
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`${Object.keys(day.global).length}`, 260, 16, { align: 'center' });
      doc.text(`${Object.keys(day.perSku).length}`, 280, 16, { align: 'center' });
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text('ITEMS', 260, 21, { align: 'center' });
      doc.text('SKUS', 280, 21, { align: 'center' });

      // Columns
      const colWidth = 135;
      const leftColX = 14;
      const rightColX = 155;
      let currentY = 35;

      // Left Column: RINGKASAN MATERIAL
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('RINGKASAN MATERIAL', leftColX, currentY);
      currentY += 5;

      Object.entries(day.global).forEach(([id, amount]) => {
        const rm = rawMaterials.find(m => m.id === id);
        if (currentY > 180) {
          doc.addPage();
          currentY = 20;
        }
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(leftColX, currentY, colWidth, 10, 2, 2, 'F');
        
        doc.setTextColor(50, 50, 50);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(rm?.name || id, leftColX + 5, currentY + 6.5);
        
        doc.setTextColor(180, 180, 180);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.text(rm?.usageUnit || '', leftColX + colWidth - 5, currentY + 6.5, { align: 'right' });
        
        const unitWidth = doc.getTextWidth(rm?.usageUnit || '');
        doc.setTextColor(28, 7, 112);
        doc.setFontSize(9);
        doc.text(`${Math.ceil(amount as number).toLocaleString()}`, leftColX + colWidth - 6 - unitWidth, currentY + 6.5, { align: 'right' });
        
        currentY += 12;
      });

      // Right Column: RINCIAN PER SKU
      currentY = 35;
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('RINCIAN PER SKU', rightColX, currentY);
      currentY += 5;

      Object.entries(day.perSku).forEach(([skuId, needs]) => {
        const sku = finishGoods.find(s => s.id === skuId);
        const needsEntries = Object.entries(needs as object);
        const cardHeight = 12 + (Math.ceil(needsEntries.length / 2) * 8);
        
        if (currentY + cardHeight > 190) {
          doc.addPage();
          currentY = 20;
        }

        doc.setDrawColor(240, 240, 240);
        doc.roundedRect(rightColX, currentY, colWidth, cardHeight, 3, 3, 'D');
        
        doc.setTextColor(28, 7, 112);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(sku?.name || skuId, rightColX + 5, currentY + 7);
        
        doc.setFillColor(240, 245, 255);
        doc.roundedRect(rightColX + colWidth - 25, currentY + 2.5, 20, 5, 1, 1, 'F');
        doc.setTextColor(100, 120, 255);
        doc.setFontSize(6);
        doc.text(skuId, rightColX + colWidth - 15, currentY + 6, { align: 'center' });
        
        let itemY = currentY + 14;
        let itemX = rightColX + 5;
        needsEntries.forEach(([rmId, amount], idx) => {
          const rm = rawMaterials.find(m => m.id === rmId);
          doc.setTextColor(150, 150, 150);
          doc.setFontSize(6);
          doc.setFont('helvetica', 'normal');
          doc.text(rm?.name || rmId, itemX, itemY);
          
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'bold');
          doc.text(`${Math.ceil(amount).toLocaleString()} ${rm?.usageUnit || ''}`, itemX + (colWidth/2) - 5, itemY, { align: 'right' });
          
          if (idx % 2 === 0) {
            itemX = rightColX + (colWidth / 2) + 5;
          } else {
            itemX = rightColX + 5;
            itemY += 8;
          }
        });
        
        currentY += cardHeight + 6;
      });
    });

    doc.save("Riwayat_RM_Harian.pdf");
  };

  const handleDownloadSingleExcel = (req: SavedRMRequirement) => {
    const dataToExport: any[] = [];
    
    // Global Summary
    const batchInfo = getBatchInfo(req);
    Object.entries(req.globalData || {}).forEach(([rmId, amount]) => {
      const rm = rawMaterials.find(m => m.id === rmId);
      dataToExport.push({
        'Category': 'GLOBAL SUMMARY',
        'Product/SKU': '-',
        'Total Batches': batchInfo.total,
        'Material Name': rm?.name || rmId,
        'Quantity': amount,
        'Unit': rm?.usageUnit || '-'
      });
    });

    // Per SKU Breakdown
    Object.entries(req.perSkuData || {}).forEach(([skuId, needs]) => {
      const sku = finishGoods.find(s => s.id === skuId);
      const skuBatches = batchInfo.perSku[skuId] || 0;
      Object.entries(needs || {}).forEach(([rmId, amount]) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        dataToExport.push({
          'Category': 'PER SKU BREAKDOWN',
          'Product/SKU': sku?.name || skuId,
          'Batches': skuBatches,
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

  const handleDownloadSinglePDF = (req: SavedRMRequirement) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const batchInfo = getBatchInfo(req);
    const dateStr = parseSafeDate(req.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    // Header
    doc.setFillColor(28, 7, 112); // #1C0770
    doc.roundedRect(14, 10, 12, 12, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`1`, 20, 18, { align: 'center' });
    
    doc.setTextColor(28, 7, 112);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(dateStr.toUpperCase(), 30, 16);
    
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(`DARI PRODUKSI: ${parseSafeDate(req.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}).toUpperCase()}`, 30, 21);
    
    doc.setTextColor(28, 7, 112);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${Object.keys(req.globalData || {}).length}`, 260, 16, { align: 'center' });
    doc.text(`${batchInfo.total}`, 280, 16, { align: 'center' });
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.text('ITEMS', 260, 21, { align: 'center' });
    doc.text('BATCHES', 280, 21, { align: 'center' });

    // Columns
    const colWidth = 135;
    const leftColX = 14;
    const rightColX = 155;
    let currentY = 35;

    // Left Column: RINGKASAN MATERIAL
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('RINGKASAN MATERIAL', leftColX, currentY);
    currentY += 5;

    Object.entries(req.globalData || {}).forEach(([id, amount]) => {
      const rm = rawMaterials.find(m => m.id === id);
      if (currentY > 180) {
        doc.addPage();
        currentY = 20;
      }
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(leftColX, currentY, colWidth, 10, 2, 2, 'F');
      
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(rm?.name || id, leftColX + 5, currentY + 6.5);
      
      doc.setTextColor(180, 180, 180);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text(rm?.usageUnit || '', leftColX + colWidth - 5, currentY + 6.5, { align: 'right' });
      
      const unitWidth = doc.getTextWidth(rm?.usageUnit || '');
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(9);
      doc.text(`${Math.ceil(amount).toLocaleString()}`, leftColX + colWidth - 6 - unitWidth, currentY + 6.5, { align: 'right' });
      
      currentY += 12;
    });

    // Right Column: RINCIAN PER SKU
    currentY = 35;
    doc.setTextColor(180, 180, 180);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('RINCIAN PER SKU', rightColX, currentY);
    currentY += 5;

    Object.entries(req.perSkuData || {}).forEach(([skuId, needs]) => {
      const sku = finishGoods.find(s => s.id === skuId);
      const needsEntries = Object.entries(needs || {});
      const cardHeight = 12 + (Math.ceil(needsEntries.length / 2) * 8);
      
      if (currentY + cardHeight > 190) {
        doc.addPage();
        currentY = 20;
      }

      doc.setDrawColor(240, 240, 240);
      doc.roundedRect(rightColX, currentY, colWidth, cardHeight, 3, 3, 'D');
      
      doc.setTextColor(28, 7, 112);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(sku?.name || skuId, rightColX + 5, currentY + 7);
      
      doc.setFillColor(240, 245, 255);
      doc.roundedRect(rightColX + colWidth - 25, currentY + 2.5, 20, 5, 1, 1, 'F');
      doc.setTextColor(100, 120, 255);
      doc.setFontSize(6);
      doc.text(skuId, rightColX + colWidth - 15, currentY + 6, { align: 'center' });
      
      let itemY = currentY + 14;
      let itemX = rightColX + 5;
      needsEntries.forEach(([rmId, amount], idx) => {
        const rm = rawMaterials.find(m => m.id === rmId);
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(rm?.name || rmId, itemX, itemY);
        
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(`${Math.ceil(amount).toLocaleString()} ${rm?.usageUnit || ''}`, itemX + (colWidth/2) - 5, itemY, { align: 'right' });
        
        if (idx % 2 === 0) {
          itemX = rightColX + (colWidth / 2) + 5;
        } else {
          itemX = rightColX + 5;
          itemY += 8;
        }
      });
      
      currentY += cardHeight + 6;
    });

    doc.save(`Kebutuhan_RM_${req.id}.pdf`);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">History Raw Material Needs</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Arsip perhitungan logistik {mainTab === 'weekly' ? 'mingguan' : 'harian'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={mainTab === 'weekly' ? handleDownloadExcel : handleDownloadDailyExcel}
            className="px-6 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-sm flex items-center gap-2"
          >
            <span>📥</span> Excel
          </button>
          <button 
            onClick={mainTab === 'weekly' ? handleDownloadPDF : handleDownloadDailyPDF}
            className="px-6 py-3 bg-rose-500 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-rose-600 transition-all shadow-sm flex items-center gap-2"
          >
            <span>📄</span> PDF
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 px-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dari:</span>
            <input 
              type="date" 
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
            />
          </div>
          <div className="w-px h-6 bg-slate-200"></div>
          <div className="flex items-center gap-2 px-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sampai:</span>
            <input 
              type="date" 
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              className="text-xs font-bold text-slate-700 bg-transparent border-none focus:ring-0 p-0 cursor-pointer"
            />
          </div>
          {(filterStart || filterEnd) && (
            <button 
              onClick={() => { setFilterStart(''); setFilterEnd(''); }}
              className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {mainTab === 'weekly' ? (
          filteredWeeklyHistory.length === 0 ? (
            <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center">
              <span className="text-5xl block mb-4 opacity-20">📊</span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada riwayat kebutuhan ditemukan</p>
            </div>
          ) : (
            filteredWeeklyHistory.map(item => (
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
                        <div className="text-2xl font-black text-slate-900 leading-none">{getBatchInfo(item).total}</div>
                        <div className="text-[10px] font-black text-slate-300 uppercase mt-1">Total Batches</div>
                     </div>
                     <div className="text-right">
                        <div className="text-2xl font-black text-slate-900 leading-none">{Object.keys(item.globalData || {}).length}</div>
                        <div className="text-[10px] font-black text-slate-300 uppercase mt-1">Total Material</div>
                     </div>
                     <button onClick={() => setSelectedReq(item)} className="px-6 py-3 bg-slate-50 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-[#1C0770] group-hover:text-white transition-all shadow-sm">View Details</button>
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          filteredDailyData.length === 0 ? (
            <div className="bg-white p-20 rounded-[40px] border border-dashed border-slate-200 text-center">
              <span className="text-5xl block mb-4 opacity-20">📊</span>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Belum ada riwayat kebutuhan harian ditemukan</p>
            </div>
          ) : (
            filteredDailyData.map((day, idx) => (
              <div key={`${day.parentReqId}-${idx}`} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-10 py-6 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#1C0770] text-white rounded-xl flex items-center justify-center font-black text-xs">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">{day.date}</h4>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Dari Produksi: {parseSafeDate(day.parentStartDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
                    </div>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-right">
                      <div className="text-sm font-black text-[#1C0770]">{Object.keys(day.global).length}</div>
                      <div className="text-[8px] font-bold text-slate-300 uppercase">Items</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-[#1C0770]">{Object.keys(day.perSku).length}</div>
                      <div className="text-[8px] font-bold text-slate-300 uppercase">SKUs</div>
                    </div>
                  </div>
                </div>
                <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Ringkasan Material</h5>
                    <div className="space-y-2">
                      {Object.entries(day.global).map(([id, amount]) => {
                        const rm = rawMaterials.find(m => m.id === id);
                        return (
                          <div key={id} className="flex justify-between items-center bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100/50">
                            <span className="text-xs font-bold text-slate-600">{rm?.name || id}</span>
                            <span className="text-xs font-black text-[#1C0770]">{Math.ceil(amount).toLocaleString()} <span className="text-[10px] text-slate-300 ml-1">{rm?.usageUnit}</span></span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Rincian Per SKU</h5>
                    <div className="grid grid-cols-1 gap-4">
                      {Object.entries(day.perSku).map(([skuId, needs]) => {
                        const sku = finishGoods.find(s => s.id === skuId);
                        return (
                          <div key={skuId} className="border border-slate-100 rounded-2xl p-4">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-[10px] font-black text-slate-800 uppercase">{sku?.name}</span>
                              <span className="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-lg">{skuId}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {Object.entries(needs).map(([rmId, amount]) => {
                                const rm = rawMaterials.find(m => m.id === rmId);
                                return (
                                  <div key={rmId} className="flex justify-between items-center">
                                    <span className="text-[9px] font-medium text-slate-400 truncate pr-2">{rm?.name}</span>
                                    <span className="text-[9px] font-black text-slate-700 whitespace-nowrap">{Math.ceil(amount).toLocaleString()} {rm?.usageUnit}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )
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
                      <div className="flex items-center gap-3 mt-1">
                         <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                           Periode Produksi: {parseSafeDate(selectedReq.startDate).toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}
                         </p>
                         {getDailyData(selectedReq).length > 0 && (
                           <>
                             <div className="h-4 w-px bg-slate-200"></div>
                             <div className="flex bg-slate-100 p-1 rounded-xl">
                               <button 
                                 onClick={() => setViewMode('weekly')}
                                 className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'weekly' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}
                               >
                                 Mingguan
                               </button>
                               <button 
                                 onClick={() => setViewMode('daily')}
                                 className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'daily' ? 'bg-white text-[#1C0770] shadow-sm' : 'text-slate-400'}`}
                                >
                                 Harian
                               </button>
                             </div>
                           </>
                         )}
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button 
                     onClick={() => handleDownloadSingleExcel(selectedReq)}
                     className="px-6 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-emerald-600 flex items-center gap-2 shadow-lg shadow-emerald-100 transition-all"
                   >
                     <span>📥</span> Excel
                   </button>
                   <button 
                     onClick={() => handleDownloadSinglePDF(selectedReq)}
                     className="px-6 py-4 bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-600 flex items-center gap-2 shadow-lg shadow-rose-100 transition-all"
                   >
                     <span>📄</span> PDF
                   </button>
                   <button onClick={() => { setSelectedReq(null); setViewMode('weekly'); }} className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200">Close</button>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar p-10 space-y-12">
                {viewMode === 'weekly' ? (
                  <div className="space-y-12 animate-in fade-in duration-300">
                    <section>
                       <h4 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                          <div className="h-px bg-slate-100 flex-1"></div>
                          GLOBAL SUMMARY ({getBatchInfo(selectedReq).total} BATCHES)
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
                                      <div>
                                         <div className="font-black text-slate-800 text-xs tracking-tight">{sku?.name}</div>
                                         <div className="text-[9px] font-bold text-indigo-400 uppercase mt-0.5">{getBatchInfo(selectedReq).perSku[skuId] || 0} Batches</div>
                                      </div>
                                      <div className="text-[9px] font-black text-slate-300 uppercase">{skuId}</div>
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
                ) : (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    {getDailyData(selectedReq).map((day: { date: string; global: Record<string, number>; perSku: Record<string, Record<string, number>> }, idx: number) => {
                      const hasData = Object.keys(day.global).length > 0;
                      if (!hasData) return null;

                      return (
                        <div key={idx} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                          <div className="px-10 py-6 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-[#1C0770] text-white rounded-xl flex items-center justify-center font-black text-xs">
                                {idx + 1}
                              </div>
                              <div>
                                <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">{day.date}</h4>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Kebutuhan Produksi Harian (Arsip)</p>
                              </div>
                            </div>
                            <div className="flex gap-8">
                              <div className="text-right">
                                <div className="text-sm font-black text-[#1C0770]">{Object.keys(day.global).length}</div>
                                <div className="text-[8px] font-bold text-slate-300 uppercase">Items</div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-black text-[#1C0770]">{Object.keys(day.perSku).length}</div>
                                <div className="text-[8px] font-bold text-slate-300 uppercase">SKUs</div>
                              </div>
                            </div>
                          </div>
                          <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div>
                              <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Ringkasan Material</h5>
                              <div className="space-y-2">
                                {Object.entries(day.global).map(([id, amount]) => {
                                  const rm = rawMaterials.find(m => m.id === id);
                                  return (
                                    <div key={id} className="flex justify-between items-center bg-slate-50 px-5 py-3 rounded-2xl border border-slate-100/50">
                                      <span className="text-xs font-bold text-slate-600">{rm?.name || id}</span>
                                      <span className="text-xs font-black text-[#1C0770]">{Math.ceil(amount).toLocaleString()} <span className="text-[10px] text-slate-300 ml-1">{rm?.usageUnit}</span></span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <h5 className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-4">Rincian Per SKU</h5>
                              <div className="grid grid-cols-1 gap-4">
                                {Object.entries(day.perSku).map(([skuId, needs]) => {
                                  const sku = finishGoods.find(s => s.id === skuId);
                                  return (
                                    <div key={skuId} className="border border-slate-100 rounded-2xl p-4">
                                      <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-black text-slate-800 uppercase">{sku?.name}</span>
                                        <span className="text-[9px] font-bold text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded-lg">{skuId}</span>
                                      </div>
                                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        {Object.entries(needs).map(([rmId, amount]) => {
                                          const rm = rawMaterials.find(m => m.id === rmId);
                                          return (
                                            <div key={rmId} className="flex justify-between text-[9px]">
                                              <span className="text-slate-400">{rm?.name}</span>
                                              <span className="font-bold text-slate-700">{amount.toLocaleString()} {rm?.usageUnit}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RMHistory;
