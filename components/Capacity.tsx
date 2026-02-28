import React, { useState, useEffect } from 'react';
import { FinishGood } from '../types';

interface CapacityProps {
  finishGoods: FinishGood[];
  onUpdateFG: (newFG: FinishGood[]) => void;
}

const CapacityInput: React.FC<{ fg: FinishGood; onUpdate: (id: string, val: number | undefined) => void }> = ({ fg, onUpdate }) => {
  const [val, setVal] = useState(fg.maxCapacity === undefined ? '' : fg.maxCapacity.toString());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setVal(fg.maxCapacity === undefined ? '' : fg.maxCapacity.toString());
    }
  }, [fg.maxCapacity, isFocused]);

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseInt(val);
    const newVal = isNaN(parsed) ? undefined : parsed;
    if (newVal !== fg.maxCapacity) {
      onUpdate(fg.id, newVal);
    }
  };

  return (
    <input 
      type="number" 
      value={val} 
      onChange={(e) => setVal(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      placeholder="Tidak Terbatas"
      className="w-full max-w-[150px] px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 ring-indigo-500/20 text-right"
    />
  );
};

const Capacity: React.FC<CapacityProps> = ({ finishGoods, onUpdateFG }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFG = finishGoods.filter(fg => 
    fg.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    fg.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCapacityUpdate = (id: string, newCapacity: number | undefined) => {
    const updatedFG = finishGoods.map(fg => {
      if (fg.id === id) {
        return { ...fg, maxCapacity: newCapacity };
      }
      return fg;
    });
    onUpdateFG(updatedFG);
  };

  return (
    <div className="py-6 md:p-8 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight">Kapasitas Maksimal SKU</h1>
          <p className="text-slate-500 mt-1 text-xs md:text-sm font-medium">Atur kapasitas maksimal penyimpanan untuk setiap SKU</p>
        </div>
      </div>

      <div className="relative group max-w-2xl">
        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-slate-400 group-focus-within:text-[#1C0770] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
        </div>
        <input 
          type="text"
          placeholder="Cari nama produk atau SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-14 pr-8 py-5 bg-white border border-slate-100 rounded-[32px] text-sm font-medium focus:ring-4 ring-[#1C0770]/5 outline-none shadow-sm transition-all"
        />
      </div>

      <div className="bg-white rounded-[24px] md:rounded-[32px] shadow-sm border border-slate-100 overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">SKU ID</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Nama Produk</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400">Stok Saat Ini</th>
                <th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right w-64">Kapasitas Maksimal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredFG.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm font-medium">Tidak ada data ditemukan.</td>
                </tr>
              ) : (
                filteredFG.map(fg => (
                  <tr key={fg.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-6 py-5">
                      <div className="text-xs font-bold text-slate-500">{fg.id}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-bold text-slate-800">{fg.name}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm font-bold text-[#1C0770]">{(fg.stock || 0).toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <CapacityInput fg={fg} onUpdate={handleCapacityUpdate} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Capacity;
