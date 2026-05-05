// ============================================================
// 配置文件 — 部署 Apps Script 后，把 URL 填入下方
// ============================================================
const CONFIG = {
  // 1. 打开 Google Sheets → Extensions → Apps Script
  // 2. 粘贴 code.gs 内容 → Deploy → New deployment
  // 3. Type: Web App, Execute as: Me, Who has access: Anyone
  // 4. 复制 URL 填到下面
  API_URL: "https://script.google.com/macros/s/AKfycbz3HRdGD1et-TMWbhDmkV8wl98lOT4wAnQQ_5JvWklHcLeID2Bt0Zji0O9RfPkVVmvNNw/exec",

  // Google Sheets 产品数据表直链（填入你的 Sheets URL）
  SHEETS_URL: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit",

  // 打包清单系统
  PACKLIST_URL: "https://asia-southeast1-suka-packlist.cloudfunctions.net/skb-bot/picklist",

  COLUMNS: ["sellerSku","productName","variation","price","fruitPerKg",
            "weight","staff","wage","output","carton","consumables",
            "tiktokFee","influencer","adFee","returnRate"],

  LABELS: {
    sellerSku:   "Seller SKU",
    productName: "产品名",
    variation:   "Variation",
    price:       "售价 (RM)",
    fruitPerKg:  "水果单价/kg (RM)",
    weight:      "包装重量 (kg)",
    staff:       "产线人数",
    wage:        "时薪 (RM/hr)",
    output:      "每小时产量",
    carton:      "纸箱成本 (RM)",
    consumables: "耗材成本 (RM)",
    tiktokFee:   "TikTok手续费%",
    influencer:  "网红佣金%",
    adFee:       "广告费%",
    returnRate:  "退货率%"
  },

  PCT_FIELDS: ["tiktokFee","influencer","adFee","returnRate"]
};
