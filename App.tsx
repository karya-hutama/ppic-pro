
import React, { useState, useEffect, useCallback } from 'react';
import { SPREADSHEET_CONFIG } from './spreadsheetConfig';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MasterData from './components/MasterData';
import ProductionPlanning from './components/ProductionPlanning';
import Purchasing from './components/Purchasing';
import SalesAnalysis from './components/SalesAnalysis';
import ScheduledProduction from './components/ScheduledProduction';
import ProductionHistory from './components/ProductionHistory';
import RMHistory from './components/RMHistory';
import InventoryROP from './components/InventoryROP';
import TrafficControl from './components/TrafficControl';
import { RawMaterial, FinishGood, SalesData, SavedSchedule, SavedRMRequirement, RequestOrder, RequestOrderItem } from './types';
import { SAMPLE_RAW_MATERIALS, SAMPLE_FINISH_GOODS, SAMPLE_SALES_DATA } from './constants';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(SAMPLE_RAW_MATERIALS);
  const [finishGoods, setFinishGoods] = useState<FinishGood[]>(SAMPLE_FINISH_GOODS);
  const [salesData, setSalesData] = useState<SalesData[]>(SAMPLE_SALES_DATA);
  const [productionHistory, setProductionHistory] = useState<SavedSchedule[]>([]);
  const [rmHistory, setRmHistory] = useState<SavedRMRequirement[]>([]);
  const [requestOrders, setRequestOrders] = useState<RequestOrder[]>([]);
  
  const [processedPlanningData, setProcessedPlanningData] = useState<Record<string, number> | null>(null);
  const [peakDayRecommendations, setPeakDayRecommendations] = useState<Record<string, number>>({});
  const [syncedROPRequirements, setSyncedROPRequirements] = useState<any[]>([]);
  const [transferredAnalysis, setTransferredAnalysis] = useState<any[] | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<SavedSchedule | null>(null);
  
  const [showSuccessToast, setShowSuccessToast] = useState<{show: boolean, msg: string, type?: 'success' | 'error'}>({show: false, msg: ''});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'disconnected'>('disconnected');

  const isConfigValid = SPREADSHEET_CONFIG.webAppUrl && !SPREADSHEET_CONFIG.webAppUrl.includes("ISI_URL");

  const fetchData = useCallback(async (silent = false) => {
    if (!isConfigValid) return;
    if (!silent) setIsSyncing(true);
    try {
      const response = await fetch(SPREADSHEET_CONFIG.webAppUrl, {
        method: 'GET',
        cache: 'no-store'
      });
      const result = await response.json();
      if (result.success) {
        setRawMaterials(result.rawMaterials || []);
        setFinishGoods(result.finishGoods || []);
        setSalesData(result.salesData || []);
        setProductionHistory(result.productionHistory || []);
        setRmHistory(result.rmHistory || []);
        setRequestOrders(result.requestOrders || []);
        setDbStatus('connected');
      }
    } catch (error: any) {
      setDbStatus('error');
    } finally {
      setIsSyncing(false);
    }
  }, [isConfigValid]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), SPREADSHEET_CONFIG.pollInterval);
    return () => clearInterval(interval);
  }, [fetchData]);

  const triggerToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setShowSuccessToast({show: true, msg, type});
    setTimeout(() => setShowSuccessToast({show: false, msg: '', type: 'success'}), 2000);
  };

  const postData = async (action: string, payload: any) => {
    if (!isConfigValid) {
      triggerToast('Local Mode: Data Saved');
      return true;
    };
    
    // Background sync
    setIsSyncing(true);
    try {
      fetch(SPREADSHEET_CONFIG.webAppUrl, {
        method: 'POST',
        mode: 'no-cors', 
        body: JSON.stringify({ action, ...payload }),
      }).then(() => {
        setIsSyncing(false);
        // Silent refresh after post
        setTimeout(() => fetchData(true), 1000);
      });
      return true;
    } catch (e: any) {
      setIsSyncing(false);
      triggerToast('Sync Delayed', 'error');
      return false;
    }
  };

  const handleUpdateRM = (newRM: RawMaterial[]) => {
    setRawMaterials(newRM); // Optimistic Update
    postData('syncMasterRM', { data: newRM });
    triggerToast('Material Diperbarui');
  };

  const handleUpdateFG = (newFG: FinishGood[]) => {
    setFinishGoods(newFG); // Optimistic Update
    postData('syncMasterFG', { data: newFG });
    triggerToast('SKU Diperbarui');
  };

  const handleUpdateSales = (newSales: SalesData[]) => {
    setSalesData(newSales);
    postData('syncSales', { data: newSales });
  };

  const handleSaveSchedule = async (scheduleData: Record<string, number[]>, startDate: string, targets?: Record<string, number>, existingId?: string) => {
    const totalBatches = Object.values(scheduleData).reduce((acc, days) => acc + days.reduce((a, b) => a + b, 0), 0);
    const newEntry: SavedSchedule = {
      id: existingId || `SCH-${Date.now()}`,
      startDate,
      createdAt: new Date().toISOString(),
      data: scheduleData,
      targets: targets || processedPlanningData || {},
      totalBatches
    };
    
    if (existingId) {
      setProductionHistory(prev => prev.map(h => h.id === existingId ? newEntry : h));
      postData('updateSchedule', newEntry);
      triggerToast('Jadwal Diperbarui');
    } else {
      setProductionHistory(prev => [newEntry, ...prev]); // Optimistic
      postData('saveSchedule', newEntry);
      triggerToast('Jadwal Disimpan');
    }
    setEditingSchedule(null);
  };

  const handleSaveRMHistory = async (global: Record<string, number>, perSku: Record<string, Record<string, number>>, startDate: string) => {
    const newEntry: SavedRMRequirement = {
      id: `RMH-${Date.now()}`,
      startDate,
      createdAt: new Date().toISOString(),
      globalData: global,
      perSkuData: perSku
    };
    setRmHistory([newEntry, ...rmHistory]); // Optimistic
    postData('saveRMRequirement', newEntry);
    triggerToast('Kebutuhan RM Diarsipkan');
  };

  const handleCreateRO = async (reorderItems: any[]) => {
    const items: RequestOrderItem[] = reorderItems.map(item => {
      const shortageInUsageUnit = Number(item.ropThreshold || 0) - Number(item.currentStock || 0);
      const factor = Number(item.conversionFactor) || 1;
      const finalQuantity = Math.max(0, Math.ceil(shortageInUsageUnit / factor));

      return {
        materialId: item.id,
        materialName: item.name,
        quantity: finalQuantity,
        receivedQuantity: 0,
        unit: item.purchaseUnit || '',
        status: 'Pending',
        deliveries: []
      };
    });
    
    if (items.length === 0) return;

    const newRO: RequestOrder = {
      id: `RO-${Date.now().toString().slice(-6)}`,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      deadline: new Date(Date.now() + 3*24*60*60*1000).toISOString().split('T')[0],
      items: items,
      status: 'Draft'
    };

    setRequestOrders([newRO, ...requestOrders]); // Optimistic
    postData('createRO', newRO);
    setActiveTab('purchasing');
    triggerToast('Request Order Dibuat');
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard productionHistory={productionHistory} requestOrders={requestOrders} rawMaterials={rawMaterials} finishGoods={finishGoods} salesData={salesData} onRefresh={() => fetchData(false)} />;
      case 'master':
        return <MasterData rawMaterials={rawMaterials} finishGoods={finishGoods} onUpdateRM={handleUpdateRM} onUpdateFG={handleUpdateFG} />;
      case 'production':
        return <ProductionPlanning 
          finishGoods={finishGoods} 
          salesData={salesData} 
          transferredAnalysis={transferredAnalysis} 
          onProcess={(data, recs) => { 
            setEditingSchedule(null); // Clear editing state when starting new plan
            setProcessedPlanningData(data); 
            if(recs) setPeakDayRecommendations(recs); 
            setActiveTab('schedule'); 
          }} 
        />;
      case 'schedule':
        return <ScheduledProduction 
          finishGoods={finishGoods} 
          rawMaterials={rawMaterials} 
          initialPlannedBatches={editingSchedule ? editingSchedule.targets : processedPlanningData} 
          initialSchedule={editingSchedule ? editingSchedule.data : undefined}
          initialStartDate={editingSchedule ? editingSchedule.startDate : undefined}
          existingId={editingSchedule ? editingSchedule.id : undefined}
          peakDayRecommendations={peakDayRecommendations} 
          transferredAnalysis={transferredAnalysis} 
          onSave={handleSaveSchedule} 
          onSaveRMHistory={handleSaveRMHistory} 
          onSyncToROP={(reqs) => { setSyncedROPRequirements(reqs); setActiveTab('rop'); }} 
        />;
      case 'rop':
        return <InventoryROP syncedRequirements={syncedROPRequirements} onCreateRO={handleCreateRO} />;
      case 'history':
        return <ProductionHistory 
          history={productionHistory} 
          finishGoods={finishGoods} 
          onEdit={(schedule) => {
            setEditingSchedule(schedule);
            setActiveTab('schedule');
          }}
        />;
      case 'rmHistory':
        return <RMHistory history={rmHistory} rawMaterials={rawMaterials} finishGoods={finishGoods} />;
      case 'purchasing':
        return <Purchasing history={requestOrders} onUpdateRO={(ro) => {
          setRequestOrders(requestOrders.map(r => r.id === ro.id ? ro : r)); // Optimistic
          postData('updateRO', ro);
        }} />;
      case 'sales':
        return <SalesAnalysis salesData={salesData} finishGoods={finishGoods} onUpdateSales={handleUpdateSales} onSendAnalysis={(results) => { setTransferredAnalysis(results); setActiveTab('production'); triggerToast('Analisa Berhasil'); }} />;
      case 'traffic':
        return <TrafficControl history={requestOrders} rawMaterials={rawMaterials} finishGoods={finishGoods} onUpdateRO={(ro) => {
          setRequestOrders(requestOrders.map(r => r.id === ro.id ? ro : r)); // Optimistic
          postData('updateRO', ro);
        }} />;
      default:
        return <Dashboard productionHistory={productionHistory} requestOrders={requestOrders} rawMaterials={rawMaterials} finishGoods={finishGoods} salesData={salesData} onRefresh={() => fetchData(false)} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {!isConfigValid && (
        <div className="fixed bottom-0 left-0 right-0 z-[200] bg-[#1C0770] text-white py-2 px-4 text-center text-[9px] font-black uppercase tracking-[0.2em]">
          🚀 DEMO MODE: APLIKASI BERJALAN DALAM MODE STANDALONE (LOCAL)
        </div>
      )}
      {isSyncing && (
        <div className="fixed top-6 right-6 z-[120] flex items-center gap-3 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-100 shadow-2xl animate-pulse">
           <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></div>
           <span className="text-[10px] font-black uppercase text-[#1C0770] tracking-[0.2em]">Syncing...</span>
        </div>
      )}
      {showSuccessToast.show && (
        <div className="fixed bottom-8 right-8 z-[150] animate-in slide-in-from-bottom-4">
          <div className={`${showSuccessToast.type === 'error' ? 'bg-rose-600' : 'bg-[#1C0770]'} text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10`}>
            <span>{showSuccessToast.type === 'error' ? '✕' : '✓'}</span>
            <h3 className="text-xs font-bold">{showSuccessToast.msg}</h3>
          </div>
        </div>
      )}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          if (tab !== 'schedule') setEditingSchedule(null);
          setActiveTab(tab);
        }} 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />
      <main className="flex-1 lg:ml-64 min-h-screen relative overflow-x-hidden">
        <div className="lg:hidden fixed top-6 left-6 z-30">
          <button onClick={() => setIsSidebarOpen(true)} className="p-4 bg-[#1C0770] text-white rounded-2xl shadow-xl">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>
        </div>
        <div className="max-w-[1400px] mx-auto pb-12 px-4 md:px-8 pt-24 lg:pt-12">
          <div className="mb-4 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Database: {dbStatus === 'connected' ? 'ONLINE (Cloud Sheets)' : 'OFFLINE (Demo Mode)'}
              </span>
          </div>
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;
