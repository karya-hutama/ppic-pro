
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { RawMaterial, FinishGood, Ingredient } from '../types';
import * as XLSX from 'xlsx';

// Komponen SearchableSelect Kustom
interface SearchableSelectProps {
  options: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.name.toLowerCase().includes(search.toLowerCase()) || 
    opt.id.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.id === value);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      {label && <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{label}</label>}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex justify-between items-center cursor-pointer hover:bg-slate-100/50 transition-all font-medium text-sm"
      >
        <span className={selectedOption ? 'text-slate-800' : 'text-slate-400'}>
          {selectedOption ? selectedOption.name : placeholder}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      </div>

      {isOpen && (
        <div className="absolute z-[70] mt-2 w-full bg-white border border-slate-100 rounded-2xl shadow-2xl p-2 animate-in fade-in zoom-in-95 duration-200">
          <input 
            autoFocus
            type="text"
            placeholder="Ketik untuk mencari..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 mb-2 bg-slate-50 border-none rounded-xl text-xs outline-none focus:ring-2 ring-[#1C0770]/10 font-medium"
          />
          <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map(opt => (
                <div 
                  key={opt.id}
                  onClick={() => {
                    onChange(opt.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${value === opt.id ? 'bg-[#1C0770] text-white' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  {opt.name} <span className={`text-[10px] ml-1 opacity-50 ${value === opt.id ? 'text-white' : 'text-slate-400'}`}>({opt.id})</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-3 text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest">Tidak ada hasil</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface MasterDataProps {
  rawMaterials: RawMaterial[];
  finishGoods: FinishGood[];
  onUpdateRM: (newRM: RawMaterial[]) => void;
  onUpdateFG: (newFG: FinishGood[]) => void;
}

const MasterData: React.FC<MasterDataProps> = ({ 
  rawMaterials: propsRawMaterials, 
  finishGoods: propsFinishGoods, 
  onUpdateRM, 
  onUpdateFG 
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'RM' | 'FG'>('RM');
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>(propsRawMaterials);
  const [finishGoods, setFinishGoods] = useState<FinishGood[]>(propsFinishGoods);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showBOMModal, setShowBOMModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [manualHPP, setManualHPP] = useState<number>(0);
  const [isProductionReady, setIsProductionReady] = useState<boolean>(true);
  const [tempIngredients, setTempIngredients] = useState<Ingredient[]>([]);
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<any>(null);
  const [isProcessed, setIsProcessed] = useState(false);
  const [sourceMaterialId, setSourceMaterialId] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRawMaterials(propsRawMaterials);
  }, [propsRawMaterials]);

  useEffect(() => {
    setFinishGoods(propsFinishGoods);
  }, [propsFinishGoods]);

  const notify = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3000);
  };

  const calculateBOMReference = (sku: Partial<FinishGood> & { ingredients?: Ingredient[] }) => {
    if (!sku.ingredients || sku.ingredients.length === 0) return 0;
    
    let totalBatchCost = 0;
    sku.ingredients.forEach(ing => {
      const rm = rawMaterials.find(m => m.id === ing.materialId);
      if (!rm) return;

      let unitCost = 0;
      if (rm.isProcessed && rm.sourceMaterialId) {
        const sourceRm = rawMaterials.find(m => m.id === rm.sourceMaterialId);
        if (sourceRm) {
          const sourceUnitCost = sourceRm.pricePerPurchaseUnit / (sourceRm.conversionFactor || 1);
          unitCost = sourceUnitCost / (rm.processingYield || 1);
        }
      } else {
        unitCost = rm.pricePerPurchaseUnit / (rm.conversionFactor || 1);
      }
      totalBatchCost += unitCost * (ing.quantity || 0);
    });

    return totalBatchCost / (sku.qtyPerBatch || 1);
  };

  const filteredRawMaterials = rawMaterials.filter(rm => 
    rm.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    rm.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFinishGoods = finishGoods.filter(fg => 
    fg.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    fg.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const currentList = activeSubTab === 'RM' ? filteredRawMaterials : filteredFinishGoods;
    if (selectedIds.length === currentList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(currentList.map(item => item.id));
    }
  };

  const handleBulkDelete = () => {
    if (activeSubTab === 'RM') {
      const updated = rawMaterials.filter(rm => !selectedIds.includes(rm.id));
      setRawMaterials(updated);
      onUpdateRM(updated);
    } else {
      const updated = finishGoods.filter(fg => !selectedIds.includes(fg.id));
      setFinishGoods(updated);
      onUpdateFG(updated);
    }
    setSelectedIds([]);
    notify(`Berhasil menghapus ${selectedIds.length} data.`);
  };

  const handleDownloadTemplate = () => {
    let data = [];
    let fileName = "";
    
    if (activeSubTab === 'RM') {
      data = [{
        id: "RM101",
        name: "Daging Sapi",
        usageUnit: "kg",
        purchaseUnit: "kg",
        conversionFactor: 1,
        stock: 100,
        minStock: 20,
        leadTime: 2,
        pricePerPurchaseUnit: 125000
      }];
      fileName = "template_raw_materials.xlsx";
    } else {
      data = [{
        id: "FG101",
        name: "Bakso Halus Pack 500g",
        qtyPerBatch: 40,
        stock: 200,
        hpp: 28500,
        isProductionReady: true,
        ingredients: '[{"materialId":"RM001","quantity":15}]'
      }];
      fileName = "template_finish_goods.xlsx";
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, fileName);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const bstr = event.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      if (activeSubTab === 'RM') {
        const newRms: RawMaterial[] = data.map((row: any) => ({
          id: String(row.id || row.ID || `RM-${Math.floor(Math.random() * 1000)}`),
          name: String(row.name || row.Name || row.Nama || ""),
          usageUnit: String(row.usageUnit || row.Unit || ""),
          purchaseUnit: String(row.purchaseUnit || ""),
          conversionFactor: Number(row.conversionFactor || 1),
          stock: Number(row.stock || row.Stok || 0),
          minStock: Number(row.minStock || 0),
          leadTime: Number(row.leadTime || 0),
          pricePerPurchaseUnit: Number(row.pricePerPurchaseUnit || row.price || row.Harga || 0)
        }));
        const updated = [...newRms, ...rawMaterials];
        setRawMaterials(updated);
        onUpdateRM(updated);
      } else {
        const newFgs: FinishGood[] = data.map((row: any) => {
          let parsedIngredients = [];
          const rawIngredients = row.ingredients || row.Ingredients || row.Resep || row.BOM || "[]";
          try {
            parsedIngredients = typeof rawIngredients === 'string' ? JSON.parse(rawIngredients) : rawIngredients;
          } catch(e) {
            console.error("Format ingredients Excel tidak valid", e);
          }

          const sku: FinishGood = {
            id: String(row.id || row.ID || row.sku || `FG-${Math.floor(Math.random() * 1000)}`),
            name: String(row.name || row.Name || row.Nama || ""),
            qtyPerBatch: Number(row.qtyPerBatch || row.Yield || row.yield || 1),
            stock: Number(row.stock || row.Stok || row.stok || 0),
            ingredients: parsedIngredients,
            hpp: Number(row.hpp || row.HPP || row.Hpp || row["Harga Pokok"] || row["harga pokok"] || 0),
            isProductionReady: row.isProductionReady !== undefined ? !!row.isProductionReady : true
          };
          return sku;
        });
        const updated = [...newFgs, ...finishGoods];
        setFinishGoods(updated);
        onUpdateFG(updated);
      }
      notify(`Berhasil import ${data.length} data Excel.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handleEditClick = (item: any) => {
    setEditingItem(item);
    setIsProcessed(item.isProcessed || false);
    setSourceMaterialId(item.sourceMaterialId || '');
    if (activeSubTab === 'FG') {
      setManualHPP(item.hpp || 0);
      setIsProductionReady(item.isProductionReady !== undefined ? item.isProductionReady : true);
    }
    setShowModal(true);
  };

  const handleOpenBOM = (fg: FinishGood) => {
    setEditingItem(fg);
    setTempIngredients(fg.ingredients || []);
    setShowBOMModal(true);
  };

  const handleAddIngredient = () => {
    setTempIngredients([...tempIngredients, { materialId: '', quantity: 0 }]);
  };

  const handleRemoveIngredient = (index: number) => {
    setTempIngredients(tempIngredients.filter((_, i) => i !== index));
  };

  const handleIngredientChange = (index: number, field: keyof Ingredient, value: any) => {
    const updated = [...tempIngredients];
    updated[index] = { ...updated[index], [field]: field === 'quantity' ? Number(value) : value };
    setTempIngredients(updated);
  };

  const handleSaveBOM = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const validIngredients = tempIngredients.filter(ing => ing.materialId !== '');
    
    const updated = finishGoods.map(fg => 
      fg.id === editingItem.id ? { ...fg, ingredients: validIngredients, hpp: fg.hpp } : fg
    );
    setFinishGoods(updated);
    onUpdateFG(updated);
    setShowBOMModal(false);
    setEditingItem(null);
    notify(`BOM untuk ${editingItem.name} diperbarui!`);
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (activeSubTab === 'RM') {
      const newRM: RawMaterial = {
        id: editingItem?.id || `RM-${Math.floor(Math.random() * 10000)}`,
        name: formData.get('name') as string,
        usageUnit: formData.get('usageUnit') as string,
        purchaseUnit: formData.get('purchaseUnit') as string,
        conversionFactor: Number(formData.get('conversionFactor')),
        pricePerPurchaseUnit: Number(formData.get('price')),
        stock: Number(formData.get('stock')),
        minStock: Number(formData.get('minStock')),
        leadTime: Number(formData.get('leadTime')),
        isProcessed: isProcessed,
        sourceMaterialId: isProcessed ? sourceMaterialId : undefined,
        processingYield: isProcessed ? (Number(formData.get('yield')) / 100) : undefined
      };
      let updated;
      if (editingItem) {
        updated = rawMaterials.map(item => item.id === editingItem.id ? newRM : item);
      } else {
        updated = [newRM, ...rawMaterials];
      }
      setRawMaterials(updated);
      onUpdateRM(updated);
    } else {
      const newFG: FinishGood = {
        id: editingItem?.id || `FG-${Math.floor(Math.random() * 10000)}`,
        name: formData.get('name') as string,
        qtyPerBatch: Number(formData.get('qty')),
        stock: Number(formData.get('stock')),
        hpp: Number(manualHPP),
        isProductionReady: isProductionReady,
        ingredients: editingItem?.ingredients || []
      };
      
      let updated;
      if (editingItem) {
        updated = finishGoods.map(item => item.id === editingItem.id ? newFG : item);
      } else {
        updated = [newFG, ...finishGoods];
      }
      setFinishGoods(updated);
      onUpdateFG(updated);
    }
    setShowModal(false);
    setEditingItem(null);
    setIsProcessed(false);
    setSourceMaterialId('');
    notify(`Berhasil! Data telah disimpan.`);
  };

  const handleDelete = () => {
    if (activeSubTab === 'RM') {
      const updated = rawMaterials.filter(item => item.id !== showDeleteConfirm.id);
      setRawMaterials(updated);
      onUpdateRM(updated);
    } else {
      const updated = finishGoods.filter(item => item.id !== showDeleteConfirm.id);
      setFinishGoods(updated);
      onUpdateFG(updated);
    }
    setShowDeleteConfirm(null);
    notify("Data telah berhasil dihapus.");
  };

  const liveTotalBOMRef = useMemo(() => {
    if (!editingItem || activeSubTab !== 'FG') return 0;
    return calculateBOMReference({ ...editingItem, ingredients: tempIngredients });
  }, [tempIngredients, editingItem, rawMaterials, activeSubTab]);

  return (
    <div className="py-6 md:p-8 animate-in fade-in duration-500 space-y-8">
      {showNotification && (
        <div className="fixed top-8 right-8 z-[60] bg-[#1C0770] text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-right-4 max-w-[calc(100%-2rem)]">
          <span className="text-xl">✅</span>
          <span className="font-bold text-sm">{showNotification}</span>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[32px] p-8 max-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center text-xl mb-4 mx-auto">⚠️</div>
            <h3 className="text-xl font-bold text-center text-slate-900 mb-2 tracking-tight">Peringatan Hapus</h3>
            <p className="text-slate-500 text-center mb-8 text-sm">Hapus <b>{showDeleteConfirm.name}</b>?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 text-slate-600 font-semibold hover:bg-slate-50 rounded-xl transition">Batal</button>
              <button onClick={handleDelete} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-[40px] p-6 md:p-10 max-w-2xl w-full shadow-2xl my-auto animate-in zoom-in-95 duration-200 max-h-[95vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-xl md:text-2xl font-bold mb-6 md:mb-8 text-slate-900 tracking-tight">
              {editingItem ? 'Edit' : 'Tambah'} {activeSubTab === 'RM' ? 'Raw Material' : 'Finish Good'}
            </h2>
            <form onSubmit={handleSave} className="space-y-4 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Nama Barang</label>
                  <input required name="name" defaultValue={editingItem?.name} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                </div>
                {activeSubTab === 'RM' ? (
                  <>
                    <div className="md:col-span-2 bg-slate-50 p-4 md:p-6 rounded-3xl border border-slate-100 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                         <div>
                            <h4 className="text-sm font-bold text-slate-800">Penggilingan / Proses</h4>
                            <p className="text-[10px] text-slate-400 font-medium">Material hasil giling?</p>
                         </div>
                         <button type="button" onClick={() => setIsProcessed(!isProcessed)} className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${isProcessed ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isProcessed ? 'left-7' : 'left-1'}`}></div>
                         </button>
                      </div>
                      {isProcessed && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                          <SearchableSelect 
                            options={rawMaterials.filter(m => m.id !== editingItem?.id)}
                            value={sourceMaterialId}
                            onChange={(val) => setSourceMaterialId(val)}
                            placeholder="Cari material sumber..."
                            label="Material Sumber"
                          />
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Yield Giling (%)</label>
                            <input type="number" name="yield" defaultValue={(editingItem?.processingYield || 0.9) * 100} className="w-full px-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm outline-none focus:ring-2 ring-[#1C0770]/5 transition font-bold" />
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Satuan Pakai</label>
                      <input required name="usageUnit" defaultValue={editingItem?.usageUnit} placeholder="gr, kg" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Lead Time (Hari)</label>
                      <input type="number" required name="leadTime" defaultValue={editingItem?.leadTime || 0} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Satuan Beli</label>
                      <input required name="purchaseUnit" defaultValue={editingItem?.purchaseUnit} placeholder="kg, karung" className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Faktor Konversi</label>
                      <input type="number" required name="conversionFactor" defaultValue={editingItem?.conversionFactor || 1} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                    </div>
                    {!isProcessed && (
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Harga / Satuan Beli</label>
                        <input type="number" name="price" defaultValue={editingItem?.pricePerPurchaseUnit} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2 bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100/50 space-y-4">
                      <div className="flex items-center justify-between">
                         <div>
                            <h4 className="text-sm font-bold text-slate-800 tracking-tight">Status Ready Produksi</h4>
                            <p className="text-[10px] text-slate-500 font-medium">Aktifkan untuk menampilkan di perencanaan produksi.</p>
                         </div>
                         <button type="button" onClick={() => setIsProductionReady(!isProductionReady)} className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${isProductionReady ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${isProductionReady ? 'left-7' : 'left-1'}`}></div>
                         </button>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Yield (Pack / Adonan)</label>
                      <input type="number" required name="qty" defaultValue={editingItem?.qtyPerBatch} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                    </div>
                    <div className="md:col-span-2 bg-[#1C0770]/5 p-6 rounded-3xl border border-[#1C0770]/10">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-[#1C0770] mb-3">Harga Pokok Produksi (HPP) Manual / Pack</label>
                      <div className="relative">
                        <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-lg">Rp</span>
                        <input 
                          required 
                          type="number" 
                          name="hpp" 
                          value={manualHPP} 
                          onChange={(e) => setManualHPP(Number(e.target.value))}
                          className="w-full pl-14 pr-5 py-4 bg-white border-2 border-slate-100 rounded-2xl focus:border-[#1C0770] outline-none transition font-black text-xl text-[#1C0770]" 
                        />
                      </div>
                      <p className="mt-3 text-[10px] text-slate-500 font-medium italic">*Nilai ini yang akan disimpan ke Database.</p>
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Stok Saat Ini</label>
                  <input type="number" required name="stock" defaultValue={editingItem?.stock} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Stok Minimum</label>
                  <input type="number" required name="minStock" defaultValue={editingItem?.minStock} className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 ring-[#1C0770]/10 outline-none transition font-medium" />
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-3 pt-4 sticky bottom-0 bg-white">
                <button type="submit" className="w-full py-4 bg-[#1C0770] text-white rounded-2xl font-bold shadow-xl shadow-[#1C0770]/20 hover:scale-[1.02] transition order-1 md:order-2">Simpan</button>
                <button type="button" onClick={() => { setShowModal(false); setEditingItem(null); setIsProcessed(false); setSourceMaterialId(''); }} className="w-full py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition order-2 md:order-1">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBOMModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-[40px] p-6 md:p-10 max-w-4xl w-full shadow-2xl my-auto animate-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col">
            <h2 className="text-xl md:text-2xl font-bold mb-2 text-slate-900 tracking-tight leading-tight">Setting BOM <b>{editingItem?.name}</b></h2>
            <p className="text-slate-500 mb-6 text-xs md:text-sm">Tentukan komposisi bahan baku untuk 1 adonan.</p>
            
            <form onSubmit={handleSaveBOM} className="space-y-6 flex-1 flex flex-col min-h-0">
              <div className="bg-slate-50 p-4 md:p-6 rounded-3xl border border-slate-100 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                 {tempIngredients.map((ing, i) => {
                    const currentRm = rawMaterials.find(m => m.id === ing.materialId);
                    let itemCost = 0;
                    if (currentRm) {
                      let unitCost = 0;
                      if (currentRm.isProcessed && currentRm.sourceMaterialId) {
                        const sourceRm = rawMaterials.find(m => m.id === currentRm.sourceMaterialId);
                        if (sourceRm) {
                          const sourceUnitCost = sourceRm.pricePerPurchaseUnit / (sourceRm.conversionFactor || 1);
                          unitCost = sourceUnitCost / (currentRm.processingYield || 1);
                        }
                      } else {
                        unitCost = currentRm.pricePerPurchaseUnit / (currentRm.conversionFactor || 1);
                      }
                      itemCost = unitCost * (ing.quantity || 0);
                    }

                    return (
                      <div key={`${ing.materialId}-${i}`} className="flex flex-col md:flex-row gap-6 items-start md:items-center bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-2 relative z-[50]">
                         <div className="flex-[4] w-full relative">
                            <SearchableSelect 
                              options={rawMaterials}
                              value={ing.materialId}
                              onChange={(val) => handleIngredientChange(i, 'materialId', val)}
                              placeholder="Pilih Bahan Baku..."
                              label="Material"
                            />
                         </div>
                         <div className="flex-[3] w-full flex items-center gap-6">
                            <div className="flex-1 min-w-[140px]">
                              <label className="block text-[8px] font-black uppercase text-slate-300 mb-1">Jumlah Pemakaian</label>
                              <div className="flex items-center gap-2">
                                <input 
                                  type="number" 
                                  required 
                                  value={ing.quantity || ''} 
                                  onChange={(e) => handleIngredientChange(i, 'quantity', e.target.value)} 
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-right font-black text-[#1C0770] text-base focus:ring-2 ring-[#1C0770]/10 outline-none" 
                                />
                                <span className="text-[10px] font-bold text-slate-400 min-w-[32px]">{currentRm?.usageUnit || '-'}</span>
                              </div>
                            </div>
                            <div className="text-right min-w-[100px]">
                               <div className="text-[8px] font-black uppercase text-slate-300">Biaya</div>
                               <div className="text-[12px] font-black text-emerald-600">Rp {itemCost.toLocaleString('id-ID')}</div>
                            </div>
                            <button type="button" onClick={() => handleRemoveIngredient(i)} className="w-11 h-11 flex items-center justify-center text-rose-400 hover:bg-rose-50 rounded-xl transition-colors shrink-0">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                             </button>
                         </div>
                      </div>
                    );
                 })}
                 <button type="button" onClick={handleAddIngredient} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:border-[#1C0770] hover:text-[#1C0770] hover:bg-[#1C0770]/5 transition-all">
                   + Tambah Item Bahan Baku
                 </button>
              </div>

              <div className="bg-slate-100 p-6 rounded-[32px] text-slate-800 flex justify-between items-center border border-slate-200 shadow-inner">
                 <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Estimasi Referensi BoM</h4>
                    <p className="text-xs text-slate-500 font-medium italic">Hitungan otomatis bahan baku saat ini.</p>
                 </div>
                 <div className="flex items-center gap-6">
                    <div className="text-right">
                       <div className="text-2xl font-black text-[#1C0770]">Rp {liveTotalBOMRef.toLocaleString('id-ID')}</div>
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">HPP per pack</p>
                    </div>
                    <button 
                      type="button"
                      onClick={() => {
                        setManualHPP(Math.round(liveTotalBOMRef));
                        notify("HPP disesuaikan dengan hitungan BoM!");
                      }}
                      className="px-4 py-2 bg-[#1C0770] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-all"
                    >
                      Pakai Nilai Ini
                    </button>
                 </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-4">
                <button type="submit" className="w-full py-4 bg-[#1C0770] text-white rounded-2xl font-bold shadow-xl shadow-[#1C0770]/20 transition hover:scale-[1.02] active:scale-95 order-1 md:order-2">Simpan BoM</button>
                <button type="button" onClick={() => setShowBOMModal(false)} className="w-full py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition order-2 md:order-1">Batal</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-10 gap-6">
        <div>
           <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Master Data</h1>
           <p className="text-slate-500 mt-1 text-sm">Kelola data material dan spesifikasi produk</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button onClick={() => handleDownloadTemplate()} className="flex-1 md:flex-none px-5 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-2">
             <span>📥</span> Template
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none px-5 py-3.5 bg-white border border-slate-200 text-slate-600 rounded-2xl font-bold text-xs hover:bg-slate-50 transition flex items-center justify-center gap-2">
             <span>📤</span> Import
          </button>
          <button onClick={() => { setEditingItem(null); setIsProcessed(false); setManualHPP(0); setIsProductionReady(true); setShowModal(true); }} className="flex-1 md:flex-none px-6 py-4 bg-[#1C0770] text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 hover:scale-[1.02] transition">
            + Tambah {activeSubTab === 'RM' ? 'Material' : 'SKU Produk'}
          </button>
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
          placeholder={`Cari ${activeSubTab === 'RM' ? 'nama material atau ID...' : 'nama produk atau SKU...'}`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-14 pr-8 py-5 bg-white border border-slate-100 rounded-[32px] text-sm font-medium focus:ring-4 ring-[#1C0770]/5 outline-none shadow-sm transition-all"
        />
      </div>

      <div className="bg-white rounded-[24px] md:rounded-[32px] shadow-sm border border-slate-100 overflow-hidden relative">
        <div className="flex border-b border-slate-50 bg-slate-50/30 overflow-x-auto no-scrollbar">
          <button onClick={() => { setActiveSubTab('RM'); setSelectedIds([]); }} className={`py-4 md:py-6 px-6 md:px-10 font-bold text-xs md:text-sm transition-all relative shrink-0 ${activeSubTab === 'RM' ? 'text-[#1C0770]' : 'text-slate-400'}`}>
            Raw Materials
            {activeSubTab === 'RM' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1C0770]"></div>}
          </button>
          <button onClick={() => { setActiveSubTab('FG'); setSelectedIds([]); }} className={`py-4 md:py-6 px-6 md:px-10 font-bold text-xs md:text-sm transition-all relative shrink-0 ${activeSubTab === 'FG' ? 'text-[#1C0770]' : 'text-slate-400'}`}>
            Finished Goods (SKUs)
            {activeSubTab === 'FG' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1C0770]"></div>}
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="absolute top-16 md:top-20 left-0 right-0 bg-indigo-50 border-y border-indigo-100 px-6 py-3 flex justify-between items-center z-10 animate-in slide-in-from-top-4">
             <div className="text-xs font-bold text-[#1C0770]">{selectedIds.length} item dipilih</div>
             <button onClick={handleBulkDelete} className="px-4 py-2 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition">Hapus Masal</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-5 w-10">
                   <input type="checkbox" checked={selectedIds.length > 0 && selectedIds.length === (activeSubTab === 'RM' ? filteredRawMaterials.length : filteredFinishGoods.length)} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-300 text-[#1C0770] focus:ring-[#1C0770]" />
                </th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400">ID</th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400">{activeSubTab === 'RM' ? 'Material Name' : 'Product Name'}</th>
                {activeSubTab === 'RM' && <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-center">Lead Time</th>}
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-center">Stock</th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-center">{activeSubTab === 'RM' ? 'Status Proses' : 'Status BoM'}</th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-center">Ready Prod</th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-center">{activeSubTab === 'FG' && 'HPP / Pack'}</th>
                <th className="px-4 md:px-6 py-5 text-[10px] uppercase tracking-widest font-bold text-slate-400 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(activeSubTab === 'RM' ? filteredRawMaterials : filteredFinishGoods).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-4xl mb-4 opacity-20">🔍</span>
                      <p className="text-slate-400 text-sm font-medium">Tidak menemukan data dengan kata kunci "{searchTerm}"</p>
                    </div>
                  </td>
                </tr>
              ) : (
                (activeSubTab === 'RM' ? filteredRawMaterials : filteredFinishGoods).map(item => {
                  const displayHpp = (item as FinishGood).hpp || 0;
                  const hasIngredients = (item as FinishGood).ingredients && (item as FinishGood).ingredients!.length > 0;
                  const prodReady = (item as FinishGood).isProductionReady !== undefined ? (item as FinishGood).isProductionReady : true;

                  return (
                    <tr key={item.id} className={`hover:bg-slate-50/40 transition-colors ${selectedIds.includes(item.id) ? 'bg-indigo-50/30' : ''}`}>
                      <td className="px-6 py-5">
                        <input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="w-4 h-4 rounded border-slate-300 text-[#1C0770] focus:ring-[#1C0770]" />
                      </td>
                      <td className="px-4 md:px-6 py-5 text-sm font-mono text-slate-400">{item.id}</td>
                      <td className="px-4 md:px-6 py-5">
                        <div className="text-sm font-bold text-slate-800">{item.name}</div>
                        {activeSubTab === 'RM' && (item as RawMaterial).usageUnit && <div className="text-[10px] text-slate-400 font-medium">BOM Unit: {(item as RawMaterial).usageUnit}</div>}
                        {activeSubTab === 'FG' && <div className="text-[10px] text-slate-400 font-medium">Yield: {(item as FinishGood).qtyPerBatch} Pack/Adonan</div>}
                      </td>
                      {activeSubTab === 'RM' && (
                        <td className="px-4 md:px-6 py-5 text-center">
                          <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-black uppercase inline-block border border-amber-100">Waktu Tunggu: {(item as RawMaterial).leadTime} Hari</div>
                        </td>
                      )}
                      <td className={`px-4 md:px-6 py-5 text-sm font-bold text-center ${item.stock < (item as any).minStock ? 'text-rose-600' : 'text-slate-700'}`}>
                        {item.stock.toLocaleString()} {activeSubTab === 'RM' ? (item as RawMaterial).usageUnit : 'Packs'}
                      </td>
                      <td className="px-4 md:px-6 py-5 text-center">
                        {activeSubTab === 'RM' ? (
                          (item as RawMaterial).isProcessed ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-bold border border-blue-100">GILING ({ ((item as RawMaterial).processingYield || 0) * 100 }%)</div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold border border-emerald-100">PURCHASE</div>
                          )
                        ) : (
                          hasIngredients ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100">BoM Ready</div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-100">No BoM</div>
                          )
                        )}
                      </td>
                      <td className="px-4 md:px-6 py-5 text-center">
                        {activeSubTab === 'FG' ? (
                          prodReady ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-widest">Active</span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-black bg-slate-50 text-slate-400 border border-slate-100 uppercase tracking-widest">Paused</span>
                          )
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      {activeSubTab === 'FG' && (
                        <td className="px-4 md:px-6 py-5 text-center">
                          <div className="text-sm font-black text-emerald-600">
                            Rp {displayHpp.toLocaleString('id-ID')}
                          </div>
                        </td>
                      )}
                      <td className="px-4 md:px-6 py-5 text-right">
                        <div className="flex justify-end gap-2">
                          {activeSubTab === 'FG' && (
                            <button onClick={() => handleOpenBOM(item as FinishGood)} className="px-3 py-1 bg-[#1C0770]/5 text-[#1C0770] rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#1C0770]/10 transition-all">BOM</button>
                          )}
                          <button onClick={() => handleEditClick(item)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#1C0770] hover:bg-[#1C0770]/5 transition-all">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MasterData;
