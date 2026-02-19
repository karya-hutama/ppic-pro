
import { RawMaterial, FinishGood, SalesData } from './types';

export const COLORS = {
  primary: '#1C0770', 
  secondary: '#475569', 
  accent: '#F59E0B', 
};

export const SAMPLE_RAW_MATERIALS: RawMaterial[] = [
  { 
    id: 'RM001', 
    name: 'Daging Sapi (Topside)', 
    usageUnit: 'kg', 
    purchaseUnit: 'kg', 
    conversionFactor: 1, 
    stock: 150, 
    minStock: 50, 
    pricePerPurchaseUnit: 125000,
    leadTime: 2 // 2 hari pengiriman
  },
  { 
    id: 'RM005', 
    name: 'Ayam Karkas (Utuh)', 
    usageUnit: 'kg', 
    purchaseUnit: 'kg', 
    conversionFactor: 1, 
    stock: 100, 
    minStock: 20, 
    pricePerPurchaseUnit: 35000,
    leadTime: 1
  },
  { 
    id: 'RM006', 
    name: 'Daging Ayam Cincang', 
    usageUnit: 'kg', 
    purchaseUnit: 'kg', 
    conversionFactor: 1, 
    stock: 0, 
    minStock: 0, 
    pricePerPurchaseUnit: 0,
    isProcessed: true,
    sourceMaterialId: 'RM005',
    processingYield: 0.9,
    leadTime: 0 // Langsung diproses
  },
  { 
    id: 'RM002', 
    name: 'Tepung Tapioka', 
    usageUnit: 'gr', 
    purchaseUnit: 'kg', 
    conversionFactor: 1000, 
    stock: 500000, 
    minStock: 100000, 
    pricePerPurchaseUnit: 15000,
    leadTime: 3
  },
];

export const SAMPLE_FINISH_GOODS: FinishGood[] = [
  { 
    id: 'FG001', 
    name: 'Bakso Halus Pack 500g', 
    qtyPerBatch: 40, 
    stock: 200,
    ingredients: [
      { materialId: 'RM001', quantity: 15 },    
      { materialId: 'RM002', quantity: 5000 },  
      { materialId: 'RM006', quantity: 5 },
    ]
  },
  { 
    id: 'FG002', 
    name: 'Bakso Urat Pack 500g', 
    qtyPerBatch: 35, 
    stock: 150,
    ingredients: [
      { materialId: 'RM001', quantity: 18 },
      { materialId: 'RM002', quantity: 3000 },
    ]
  },
];

// Generate 30 days of mock sales data
const generateSales = (): SalesData[] => {
  const data: SalesData[] = [];
  const skus = ['FG001', 'FG002'];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    skus.forEach(sku => {
      data.push({
        id: `S${i}-${sku}`,
        skuId: sku,
        date: dateStr,
        quantitySold: Math.floor(Math.random() * 50) + 10 // 10-60 sales per day
      });
    });
  }
  return data;
};

export const SAMPLE_SALES_DATA = generateSales();
