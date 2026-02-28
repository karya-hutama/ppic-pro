
import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell
} from 'recharts';
import { RawMaterial, FinishGood, SalesData, SavedSchedule, RequestOrder } from '../types';

interface DashboardProps {
  productionHistory: SavedSchedule[];
  requestOrders: RequestOrder[];
  rawMaterials: RawMaterial[];
  finishGoods: FinishGood[];
  salesData: SalesData[];
  onRefresh?: () => void; // Tambahkan prop onRefresh
}

const Dashboard: React.FC<DashboardProps> = ({ 
  productionHistory = [], 
  requestOrders = [], 
  rawMaterials = [], 
  finishGoods = [], 
  salesData = [],
  onRefresh
}) => {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Helper untuk normalisasi tanggal agar hanya YYYY-MM-DD
  const normalizeDate = (d: string | Date) => {
    if (!d) return "";
    if (d instanceof Date) return d.toISOString().split('T')[0];
    return d.split('T')[0];
  };

  // 1. Sinkronisasi Data Traffic (RM In vs FG Out)
  const trafficData = useMemo(() => {
    const days = [];
    const curr = new Date(startDate);
    const end = new Date(endDate);
    
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];
      
      let rmIn = 0;
      (requestOrders || []).forEach(ro => {
        if (!ro.items) return;
        const items = Array.isArray(ro.items) ? ro.items : [];
        items.forEach(item => {
          (item.deliveries || []).forEach(del => {
            if (normalizeDate(del.date) === dateStr) {
              rmIn += (Number(del.quantity) || 0);
            }
          });
        });
      });

      let fgOut = 0;
      (salesData || []).forEach(s => {
        if (normalizeDate(s.date) === dateStr) {
          fgOut += (Number(s.quantitySold) || 0);
        }
      });

      days.push({
        date: curr.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        rmIn,
        fgOut
      });
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [startDate, endDate, requestOrders, salesData]);

  // 2. Statistik Traffic RO untuk Command Center
  const roTrafficStats = useMemo(() => {
    const activeROs = (requestOrders || []).filter(ro => ro.status === 'Sent');
    const today = new Date().toISOString().split('T')[0];
    
    let itemsDueToday = 0;
    let lateItems = 0;

    activeROs.forEach(ro => {
      if (!ro.items) return;
      const items = Array.isArray(ro.items) ? ro.items : [];
      items.forEach(item => {
        if (item.status !== 'Received') {
          if (item.estimatedArrival === today) itemsDueToday++;
          if (item.estimatedArrival && item.estimatedArrival < today) lateItems++;
        }
      });
    });

    return {
      activeCount: activeROs.length,
      dueToday: itemsDueToday,
      lateCount: lateItems
    };
  }, [requestOrders]);

  // 3. Sinkronisasi Keamanan Stok
  const stockHealth = useMemo(() => {
    const rmTotal = Math.max((rawMaterials || []).length, 1);
    const fgTotal = Math.max((finishGoods || []).length, 1);
    const rmSafe = (rawMaterials || []).filter(m => (m.stock || 0) >= (m.minStock || 0)).length;
    const fgSafe = (finishGoods || []).filter(f => (f.stock || 0) >= 50).length; 
    
    return {
      rm: { 
        percent: Math.round((rmSafe / rmTotal) * 100),
        label: `${rmSafe}/${(rawMaterials || []).length} Bahan Baku Aman`
      },
      fg: {
        percent: Math.round((fgSafe / fgTotal) * 100),
        label: `${fgSafe}/${(finishGoods || []).length} SKU Produk Aman`
      }
    };
  }, [rawMaterials, finishGoods]);

  // 4. Leaderboard SKU Paling Banyak Diproduksi
  const topProduced = useMemo(() => {
    const totals: Record<string, number> = {};
    (productionHistory || []).forEach(sch => {
      if (!sch || !sch.data) return;
      
      let scheduleMap: any = sch.data;
      if (typeof scheduleMap === 'string') {
        try { scheduleMap = JSON.parse(scheduleMap); } catch(e) { scheduleMap = {}; }
      }

      Object.entries(scheduleMap).forEach(([skuId, batches]) => {
        if (Array.isArray(batches)) {
          const sum = batches.reduce((a, b) => a + (Number(b) || 0), 0);
          totals[skuId] = (totals[skuId] || 0) + sum;
        }
      });
    });

    const colors = ['#1C0770', '#4F46E5', '#8B5CF6', '#C084FC'];
    return (finishGoods || [])
      .map((sku, i) => ({
        name: sku.name,
        value: totals[sku.id] || 0,
        color: colors[i % colors.length]
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [productionHistory, finishGoods]);

  const totalProductionCount = useMemo(() => {
    return (productionHistory || []).reduce((acc, curr) => acc + (Number(curr.totalBatches) || 0), 0);
  }, [productionHistory]);

  return (
    <div className="py-6 space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-tight uppercase">Dashboard Command Center</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium italic">Monitoring operasional bakso profesional</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-3 rounded-[28px] border border-slate-100 shadow-sm w-full md:w-auto overflow-x-auto">
           <div className="flex flex-col sm:flex-row items-start sm:items-center px-4 gap-3 border-b sm:border-b-0 sm:border-r border-slate-100 pb-3 sm:pb-0">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Filter Periode</span>
              <div className="flex items-center gap-2">
                 <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-xs font-bold text-[#1C0770] bg-transparent outline-none" />
                 <span className="text-slate-300">→</span>
                 <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-xs font-bold text-[#1C0770] bg-transparent outline-none" />
              </div>
           </div>
           {/* Perbaikan di sini: Menggunakan callback onRefresh daripada reload halaman */}
           <button 
             onClick={() => onRefresh ? onRefresh() : window.location.reload()} 
             className="px-5 py-2.5 bg-[#1C0770] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all active:scale-95 w-full sm:w-auto"
           >
             Refresh
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between">
           <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Aman Bahan Baku</div>
              <div className="text-4xl font-black text-slate-900 mb-2">{stockHealth.rm.percent}%</div>
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">{stockHealth.rm.label}</p>
           </div>
           <div className="w-full bg-slate-100 h-2 rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${stockHealth.rm.percent}%` }}></div>
           </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between">
           <div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Aman Finish Goods</div>
              <div className="text-4xl font-black text-slate-900 mb-2">{stockHealth.fg.percent}%</div>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">{stockHealth.fg.label}</p>
           </div>
           <div className="w-full bg-slate-100 h-2 rounded-full mt-6 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${stockHealth.fg.percent}%` }}></div>
           </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm flex flex-col justify-between relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
              <span className="text-6xl">🚚</span>
           </div>
           <div className="relative z-10">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                 Traffic Request Order
              </div>
              <div className="text-4xl font-black text-slate-900 mb-2">{roTrafficStats.activeCount}</div>
              <div className="space-y-1">
                 <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide">
                    {roTrafficStats.dueToday} Item Sampai Hari Ini
                 </p>
                 {roTrafficStats.lateCount > 0 && (
                   <p className="text-[10px] font-black text-rose-500 uppercase tracking-wide animate-pulse">
                      ⚠️ {roTrafficStats.lateCount} Item Terlambat
                   </p>
                 )}
              </div>
           </div>
           <div className="w-full bg-slate-50 p-2 rounded-xl mt-4 flex justify-around items-center">
              <div className="text-center">
                 <div className="text-[8px] font-black text-slate-300 uppercase">In Transit</div>
                 <div className="text-xs font-black text-slate-600">{roTrafficStats.activeCount}</div>
              </div>
              <div className="h-4 w-[1px] bg-slate-200"></div>
              <div className="text-center">
                 <div className="text-[8px] font-black text-slate-300 uppercase">Today</div>
                 <div className="text-xs font-black text-slate-600">{roTrafficStats.dueToday}</div>
              </div>
           </div>
        </div>

        <div className="bg-[#1C0770] p-8 rounded-[40px] shadow-xl text-white flex flex-col justify-between">
           <div className="flex justify-between items-start">
              <div>
                 <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Akumulasi Produksi</div>
                 <div className="text-3xl font-black">{totalProductionCount.toLocaleString()}</div>
                 <div className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Total Batches</div>
              </div>
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">⚙️</div>
           </div>
           <div className="mt-4">
              <div className="flex justify-between text-[8px] font-black uppercase text-white/40 mb-1">
                 <span>Efficiency</span>
                 <span>92%</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-400 w-[92%]"></div>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm">
           <div className="flex justify-between items-center mb-10">
              <div>
                 <h3 className="text-xl font-black text-slate-800 tracking-tight">Traffic Inventory</h3>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Material Masuk vs Produk Keluar</p>
              </div>
              <div className="flex gap-4">
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#1C0770]"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">Incoming RM</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                    <span className="text-[9px] font-black text-slate-400 uppercase">Outgoing FG</span>
                 </div>
              </div>
           </div>
           <div className="h-[320px] w-full -ml-6">
              <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={trafficData}>
                    <defs>
                       <linearGradient id="colorRM" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1C0770" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#1C0770" stopOpacity={0}/>
                       </linearGradient>
                       <linearGradient id="colorFG" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                       </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94A3B8', fontWeight: 700}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94A3B8', fontWeight: 700}} />
                    <Tooltip 
                      contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}} 
                      labelStyle={{fontWeight: 900, color: '#1C0770', fontSize: '12px'}}
                    />
                    <Area type="monotone" dataKey="rmIn" stroke="#1C0770" strokeWidth={4} fillOpacity={1} fill="url(#colorRM)" animationDuration={1500} />
                    <Area type="monotone" dataKey="fgOut" stroke="#10B981" strokeWidth={4} fillOpacity={1} fill="url(#colorFG)" animationDuration={1500} />
                 </AreaChart>
              </ResponsiveContainer>
           </div>
        </div>

        <div className="bg-white p-10 rounded-[48px] border border-slate-100 shadow-sm flex flex-col">
           <h3 className="text-xl font-black text-slate-800 tracking-tight mb-8">Top Produced SKU</h3>
           <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-2">
              {(topProduced || []).length > 0 ? topProduced.map((sku, i) => (
                <div key={`${sku.name}-${i}`} className="space-y-3">
                   <div className="flex justify-between items-end">
                      <span className="text-xs font-bold text-slate-600 truncate max-w-[150px]">{sku.name}</span>
                      <span className="text-sm font-black text-[#1C0770]">{sku.value.toLocaleString()} <span className="text-[10px] text-slate-400 uppercase ml-1">Batch</span></span>
                   </div>
                   <div className="w-full bg-slate-50 h-3 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${(topProduced && topProduced[0]?.value > 0) ? (sku.value / topProduced[0].value) * 100 : 0}%`, backgroundColor: sku.color }}
                      ></div>
                   </div>
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center h-48 opacity-20 grayscale">
                   <span className="text-5xl mb-4">📊</span>
                   <p className="text-[10px] font-black uppercase tracking-widest text-center">Belum Ada History Produksi</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
