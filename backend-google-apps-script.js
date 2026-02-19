
/**
 * GOOGLE APPS SCRIPT - PPIC PRO BACKEND (REPAIR VERSION)
 */

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // Jalankan pemeriksaan header otomatis setiap kali data diakses
  checkAndFixHeaders(ss);
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    rawMaterials: getSheetData(ss, "rawMaterials"),
    finishGoods: getSheetData(ss, "finishGoods"),
    salesData: getSheetData(ss, "salesData"),
    productionHistory: getSheetData(ss, "productionHistory"),
    rmHistory: getSheetData(ss, "rmHistory"),
    requestOrders: getSheetData(ss, "requestOrders")
  })).setMimeType(ContentService.MimeType.JSON);
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
  
  if (action === "saveSchedule") {
    const sheet = getOrCreateSheet(ss, "productionHistory");
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 6).getValues()[0];
    
    // Pastikan kolom targets dan data ada di posisi yang benar
    const idIdx = headers.indexOf("id");
    const dataIdx = headers.indexOf("data");
    const startIdx = headers.indexOf("startDate");
    const createIdx = headers.indexOf("createdAt");
    const totalIdx = headers.indexOf("totalBatches");
    const targetIdx = headers.indexOf("targets");

    const rowData = new Array(Math.max(headers.length, 6)).fill("");
    if (idIdx !== -1) rowData[idIdx] = Utilities.getUuid();
    if (dataIdx !== -1) rowData[dataIdx] = JSON.stringify(data.data);
    if (startIdx !== -1) rowData[startIdx] = data.startDate;
    if (createIdx !== -1) rowData[createIdx] = data.createdAt;
    if (totalIdx !== -1) rowData[totalIdx] = data.totalBatches;
    if (targetIdx !== -1) rowData[targetIdx] = JSON.stringify(data.targets || {});
    
    sheet.appendRow(rowData);
  }
  
  // Action lainnya...
  if (action === "syncMasterRM") {
    const sheet = getOrCreateSheet(ss, "rawMaterials");
    sheet.clear();
    sheet.appendRow(["id", "name", "usageUnit", "purchaseUnit", "conversionFactor", "stock", "minStock", "pricePerPurchaseUnit", "leadTime", "isProcessed", "sourceMaterialId", "processingYield"]);
    data.data.forEach(rm => sheet.appendRow([rm.id, rm.name, rm.usageUnit, rm.purchaseUnit, rm.conversionFactor, rm.stock, rm.minStock, rm.pricePerPurchaseUnit, rm.leadTime, rm.isProcessed, rm.sourceMaterialId, rm.processingYield]));
  }
  if (action === "syncMasterFG") {
    const sheet = getOrCreateSheet(ss, "finishGoods");
    sheet.clear();
    sheet.appendRow(["id", "name", "qtyPerBatch", "stock", "hpp", "isProductionReady", "ingredients"]);
    data.data.forEach(fg => sheet.appendRow([fg.id, fg.name, fg.qtyPerBatch, fg.stock, fg.hpp || 0, fg.isProductionReady || false, JSON.stringify(fg.ingredients || [])]));
  }
  if (action === "syncSales") {
    const sheet = getOrCreateSheet(ss, "salesData");
    sheet.clear();
    sheet.appendRow(["id", "skuId", "date", "quantitySold"]);
    data.data.forEach(s => sheet.appendRow([s.id, s.skuId, s.date, s.quantitySold]));
  }
  if (action === "saveRMRequirement") {
    const sheet = getOrCreateSheet(ss, "rmHistory");
    sheet.appendRow([Utilities.getUuid(), data.startDate, data.createdAt, JSON.stringify(data.globalData), JSON.stringify(data.perSkuData)]);
  }
  if (action === "createRO") {
    const sheet = getOrCreateSheet(ss, "requestOrders");
    sheet.appendRow([data.id, data.date, JSON.stringify(data.items), data.status, data.deadline, data.createdAt]);
  }
  if (action === "updateRO") {
    const sheet = getOrCreateSheet(ss, "requestOrders");
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
  const range = sheet.getDataRange();
  const vals = range.getValues();
  if (vals.length < 2) return [];
  const headers = vals.shift();
  
  return vals.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (!h) return; // Lewati kolom tanpa nama header
      let val = row[i];
      let headerKey = h.toString().trim();
      
      // Fallback pemetaan kunci
      if (headerKey === "JSONData") headerKey = "data";
      if (headerKey === "JSONTargets") headerKey = "targets";
      
      const isJsonField = ["ingredients", "data", "items", "globalData", "perSkuData", "targets"].includes(headerKey);
      
      if (isJsonField && typeof val === 'string' && val !== "") {
        try { val = JSON.parse(val); } catch(e) { val = {}; }
      }
      if (val instanceof Date) {
        val = Utilities.formatDate(val, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      }
      obj[headerKey] = val;
    });
    return obj;
  });
}

function checkAndFixHeaders(ss) {
  const config = {
    "rawMaterials": ["id", "name", "usageUnit", "purchaseUnit", "conversionFactor", "stock", "minStock", "pricePerPurchaseUnit", "leadTime", "isProcessed", "sourceMaterialId", "processingYield"],
    "finishGoods": ["id", "name", "qtyPerBatch", "stock", "hpp", "isProductionReady", "ingredients"],
    "salesData": ["id", "skuId", "date", "quantitySold"],
    "productionHistory": ["id", "data", "startDate", "createdAt", "totalBatches", "targets"],
    "rmHistory": ["id", "startDate", "createdAt", "globalData", "perSkuData"],
    "requestOrders": ["id", "date", "items", "status", "deadline", "createdAt"]
  };

  for (let sheetName in config) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(config[sheetName]);
    } else {
      const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || config[sheetName].length).getValues()[0];
      const isHeaderBroken = currentHeaders.some((h, i) => !h || h !== config[sheetName][i]);
      
      if (isHeaderBroken) {
        // Jika header rusak (seperti di screenshot user), sisipkan baris baru di paling atas atau timpa baris 1
        sheet.getRange(1, 1, 1, config[sheetName].length).setValues([config[sheetName]]);
      }
    }
  }
}

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    // Header akan dibuat di checkAndFixHeaders
  }
  return sheet;
}
