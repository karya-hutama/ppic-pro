
/**
 * GOOGLE APPS SCRIPT - PPIC PRO BACKEND (OPTIMIZED VERSION)
 */

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // OPTIMASI: checkAndFixHeaders hanya dijalankan manual/setup, tidak setiap kali doGet
  // checkAndFixHeaders(ss); 
  
  const results = {
    success: true,
    rawMaterials: getSheetData(ss, "rawMaterials"),
    finishGoods: getSheetData(ss, "finishGoods"),
    salesData: getSheetData(ss, "salesData"),
    productionHistory: getSheetData(ss, "productionHistory"),
    rmHistory: getSheetData(ss, "rmHistory"),
    requestOrders: getSheetData(ss, "requestOrders")
  };

  return ContentService.createTextOutput(JSON.stringify(results))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: "Invalid JSON"})).setMimeType(ContentService.MimeType.JSON);
  }
  
  const action = data.action;
  
  // Optimasi: Cache sheet references
  if (action === "saveSchedule") {
    const sheet = ss.getSheetByName("productionHistory");
    sheet.appendRow([
      data.id || Utilities.getUuid(), 
      JSON.stringify(data.data), 
      data.startDate, 
      data.createdAt, 
      data.totalBatches, 
      JSON.stringify(data.targets || {})
    ]);
  }

  if (action === "updateSchedule") {
    const sheet = ss.getSheetByName("productionHistory");
    const vals = sheet.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === data.id) {
        sheet.getRange(i + 1, 2).setValue(JSON.stringify(data.data));
        sheet.getRange(i + 1, 3).setValue(data.startDate);
        sheet.getRange(i + 1, 4).setValue(data.createdAt);
        sheet.getRange(i + 1, 5).setValue(data.totalBatches);
        sheet.getRange(i + 1, 6).setValue(JSON.stringify(data.targets || {}));
        break;
      }
    }
  }
  
  if (action === "syncMasterRM") {
    const sheet = ss.getSheetByName("rawMaterials");
    sheet.clear();
    sheet.appendRow(["id", "name", "usageUnit", "purchaseUnit", "conversionFactor", "stock", "minStock", "pricePerPurchaseUnit", "leadTime", "isProcessed", "sourceMaterialId", "processingYield"]);
    const rows = data.data.map(rm => [rm.id, rm.name, rm.usageUnit, rm.purchaseUnit, rm.conversionFactor, rm.stock, rm.minStock, rm.pricePerPurchaseUnit, rm.leadTime, rm.isProcessed, rm.sourceMaterialId, rm.processingYield]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  if (action === "syncMasterFG") {
    const sheet = ss.getSheetByName("finishGoods");
    sheet.clear();
    sheet.appendRow(["id", "name", "qtyPerBatch", "stock", "hpp", "isProductionReady", "ingredients"]);
    const rows = data.data.map(fg => [fg.id, fg.name, fg.qtyPerBatch, fg.stock, fg.hpp || 0, fg.isProductionReady || false, JSON.stringify(fg.ingredients || [])]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  if (action === "syncSales") {
    const sheet = ss.getSheetByName("salesData");
    sheet.clear();
    sheet.appendRow(["id", "skuId", "date", "quantitySold"]);
    const rows = data.data.map(s => [s.id, s.skuId, s.date, s.quantitySold]);
    if (rows.length > 0) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  if (action === "saveRMRequirement") {
    const sheet = ss.getSheetByName("rmHistory");
    sheet.appendRow([Utilities.getUuid(), data.startDate, data.createdAt, JSON.stringify(data.globalData), JSON.stringify(data.perSkuData)]);
  }

  if (action === "createRO") {
    const sheet = ss.getSheetByName("requestOrders");
    sheet.appendRow([data.id, data.date, JSON.stringify(data.items), data.status, data.deadline, data.createdAt]);
  }

  if (action === "updateRO") {
    const sheet = ss.getSheetByName("requestOrders");
    const vals = sheet.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === data.id) {
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(data.items));
        sheet.getRange(i + 1, 4).setValue(data.status);
        sheet.getRange(i + 1, 5).setValue(data.deadline);
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  const vals = sheet.getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals.shift();
  
  return vals.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return;
      let val = row[i];
      let key = h.toString().trim();
      if (["ingredients", "data", "items", "globalData", "perSkuData", "targets"].includes(key) && typeof val === 'string' && val !== "") {
        try { val = JSON.parse(val); } catch(e) { val = {}; }
      }
      if (val instanceof Date) val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      obj[key] = val;
    });
    return obj;
  });
}

// Fungsi ini hanya dijalankan sekali saja saat setup awal
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = {
    "rawMaterials": ["id", "name", "usageUnit", "purchaseUnit", "conversionFactor", "stock", "minStock", "pricePerPurchaseUnit", "leadTime", "isProcessed", "sourceMaterialId", "processingYield"],
    "finishGoods": ["id", "name", "qtyPerBatch", "stock", "hpp", "isProductionReady", "ingredients"],
    "salesData": ["id", "skuId", "date", "quantitySold"],
    "productionHistory": ["id", "data", "startDate", "createdAt", "totalBatches", "targets"],
    "rmHistory": ["id", "startDate", "createdAt", "globalData", "perSkuData"],
    "requestOrders": ["id", "date", "items", "status", "deadline", "createdAt"]
  };
  for (let name in config) {
    let sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    sheet.getRange(1, 1, 1, config[name].length).setValues([config[name]]);
  }
}
