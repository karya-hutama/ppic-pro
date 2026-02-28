
export interface RawMaterial {
  id: string;
  name: string;
  usageUnit: string;
  purchaseUnit: string;
  conversionFactor: number;
  stock: number;
  minStock: number;
  pricePerPurchaseUnit: number;
  isProcessed?: boolean;
  sourceMaterialId?: string;
  processingYield?: number;
  leadTime?: number;
}

export interface Ingredient {
  materialId: string;
  quantity: number;
}

export interface FinishGood {
  id: string;
  name: string;
  qtyPerBatch: number;
  stock: number;
  ingredients?: Ingredient[];
  hpp?: number;
  isProductionReady?: boolean;
  maxCapacity?: number;
}

export interface SalesData {
  id: string;
  skuId: string;
  date: string;
  quantitySold: number;
}

export interface SavedSchedule {
  id: string;
  startDate: string;
  createdAt: string;
  data: Record<string, number[]>;
  targets?: Record<string, number>;
  totalBatches: number;
}

export interface SavedRMRequirement {
  id: string;
  startDate: string;
  createdAt: string;
  globalData: Record<string, number>;
  perSkuData: Record<string, Record<string, number>>;
}

export interface DeliveryBatch {
  id: string;
  date: string;
  quantity: number;
  receivedBy: string;
}

export interface RequestOrderItem {
  materialId: string;
  materialName: string;
  quantity: number;
  receivedQuantity: number;
  unit: string;
  status: 'Pending' | 'Approved' | 'Ordered' | 'Partial' | 'Received';
  deliveries?: DeliveryBatch[];
  actualOrderQty?: number;
  actualOrderDate?: string;
  estimatedArrival?: string;
}

export interface RequestOrder {
  id: string;
  date: string;
  createdAt: string;
  deadline?: string;
  items: RequestOrderItem[];
  status: 'Draft' | 'Sent' | 'Completed';
}
