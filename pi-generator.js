/**
 * Shearling / Symmet Proforma Invoice (PI) Engine
 * Implements exact document structure, dynamic percentages & calculations:
 * 1. Freight + unloading (INCLUDED / As per Actual / @ X% of product value)
 * 2. Packaging @ X% of product value
 * 3. Installation @ X% of product value
 * 4. Sub Total + GST 18% + Grand Total
 * 5. Bank details & 9 standard Terms & Conditions
 */

export const COMPANY_DEFAULTS = {
  name: "SHEARLING SKINS PVT LTD",
  brandSubtitle: "Indo Italian Joint Venture",
  address: "PLOT NO 84 SECTOR 8 IMT MANESAR GURGAON(HR) PINCODE-122052",
  gstin: "06AALCS1032L1ZC",
  contactPerson: "Fauzia",
  contactMobile: "+91 9560706640",
  contactEmail: "online@shearling.in",
  bankDetails: {
    beneficiaryName: "SHEARLING SKINS PVT LTD",
    bankName: "DEUTSCHE BANK",
    accountNo: "100041596120019",
    ifscCode: "DEUT0784PBC"
  },
  terms: [
    "Lead time : 4 Weeks.",
    "Payment terms - 60% Advance & PO and 40% before delivery",
    "All orders must be written, signed with deposit of Advance",
    "Customer is expected to Inspect the Goods before Final Delivery.",
    "No cancellations will be accepted on custom orders once they are in Production.",
    "No returns will be accepted.",
    "No material will be accepted for claim if marked or cut.",
    "All prices are valid for 30 days",
    "Unloading Charges extra at actual."
  ]
};

/**
 * Calculate totals based on the 3 pricing conditions
 * @param {Array} items [{ unitPrice, qty, ... }]
 * @param {Object} options { freightType: 'included'|'actual'|'percent', freightPercent: 0, packagingPercent: 0, installationPercent: 0, gstPercent: 18 }
 */
export function calculatePITotals(items, options = {}) {
  const freightType = options.freightType || 'included'; // 'included', 'actual', 'percent'
  const freightPercent = Number(options.freightPercent) || 0;
  const packagingPercent = Number(options.packagingPercent) || 0;
  const installationPercent = Number(options.installationPercent) || 0;
  const gstPercent = options.gstPercent !== undefined ? Number(options.gstPercent) : 18;

  // 1. Total Product Value
  const productTotal = (items || []).reduce((sum, item) => {
    const price = Number(item.unitPrice) || 0;
    const qty = Number(item.qty) || 1;
    return sum + (price * qty);
  }, 0);

  // 2. (1) Freight + unloading calculation
  let freightAmount = 0;
  let freightLabel = "INCLUDED";
  if (freightType === 'actual') {
    freightAmount = 0;
    freightLabel = "AS PER ACTUAL";
  } else if (freightType === 'percent') {
    freightAmount = (productTotal * freightPercent) / 100;
    freightLabel = `${freightPercent}%`;
  }

  // 3. (2) Packaging calculation
  const packagingAmount = (productTotal * packagingPercent) / 100;

  // 4. (3) Installation calculation
  const installationAmount = (productTotal * installationPercent) / 100;

  // 5. Sub Total
  const subTotal = productTotal + freightAmount + packagingAmount + installationAmount;

  // 6. GST
  const gstAmount = (subTotal * gstPercent) / 100;

  // 7. Grand Total
  const grandTotal = subTotal + gstAmount;

  return {
    productTotal,
    freightType,
    freightPercent,
    freightAmount,
    freightLabel,
    packagingPercent,
    packagingAmount,
    installationPercent,
    installationAmount,
    subTotal,
    gstPercent,
    gstAmount,
    grandTotal
  };
}

export function formatINR(val, showSymbol = true) {
  if (val == null || isNaN(val)) return showSymbol ? "Rs. 0.00" : "0.00";
  const num = Number(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return showSymbol ? `Rs. ${num}` : num;
}

/**
 * Converts an image URL to a base64 data URL for jsPDF embedding
 */
export async function getBase64ImageFromUrl(imageUrl) {
  if (!imageUrl) return null;
  try {
    const res = await fetch(imageUrl, { mode: 'cors' });
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not convert image to base64:", imageUrl, err);
    return null;
  }
}

/**
 * Generate and download Shearling Proforma Invoice PDF
 */
export async function downloadShearlingPIPDF(piData) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    throw new Error("jsPDF library not loaded");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const totals = calculatePITotals(piData.items, piData.options);
  const company = { ...COMPANY_DEFAULTS, ...(piData.company || {}) };
  const customer = piData.customer || {};
  const meta = piData.meta || {
    piNumber: "PI#2028",
    revision: "Revision 1",
    date: new Date().toLocaleDateString("en-GB", { day: '2-digit', month: 'long', year: 'numeric' })
  };

  const pageWidth = doc.internal.pageSize.getWidth(); // ~210 mm
  const margin = 8;
  const contentWidth = pageWidth - (margin * 2);

  // Outer document border
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.35);

  let currentY = margin;

  // --- HEADER SECTION ---
  const headerHeight = 28;
  doc.rect(margin, currentY, contentWidth, headerHeight);

  // Top Left: Logo / Brand
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(190, 45, 45); // Shearling red accent
  doc.text("Shearling", margin + 4, currentY + 9);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text("Indo Italian Joint Venture", margin + 4, currentY + 14);

  // Center: Document Title & Company Name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Performa Invoice", margin + 48, currentY + 7);
  doc.setFontSize(9);
  doc.text(company.name, margin + 48, currentY + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text(company.address, margin + 48, currentY + 17);
  doc.text(`GSTIN NO. : ${company.gstin}`, margin + 48, currentY + 22);

  // Right Box: PI No & Date
  const rightBoxWidth = 52;
  const rightBoxX = margin + contentWidth - rightBoxWidth;
  doc.line(rightBoxX, currentY, rightBoxX, currentY + headerHeight);
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(20, 20, 20);
  doc.text(`${meta.piNumber} (${meta.revision || 'Rev 1'})`, rightBoxX + 3, currentY + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Date: ${meta.date}`, rightBoxX + 3, currentY + 14);

  currentY += headerHeight;

  // --- CUSTOMER & CONTACT SECTION ---
  const custHeight = 24;
  doc.rect(margin, currentY, contentWidth, custHeight);
  const custSplitX = margin + (contentWidth * 0.65);
  doc.line(custSplitX, currentY, custSplitX, currentY + custHeight);

  // Customer Details (Left)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text("Customer Details:", margin + 3, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  doc.text(`Name : ${customer.name || '—'}`, margin + 3, currentY + 9.5);
  doc.text(`Contact Person : ${customer.contactPerson || '—'}`, margin + 3, currentY + 13.5);
  doc.text(`Address : ${customer.address || '—'}`, margin + 3, currentY + 17.5, { maxWidth: custSplitX - margin - 6 });
  doc.text(`Mob. NO. : ${customer.mobile || '—'} | Email : ${customer.email || '—'}`, margin + 3, currentY + 21.5);

  // Sales Contact Details (Right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(20, 20, 20);
  doc.text("Sales Contact:", custSplitX + 3, currentY + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(40, 40, 40);
  doc.text(`Contact Person : ${company.contactPerson}`, custSplitX + 3, currentY + 9.5);
  doc.text(`Mobile : ${company.contactMobile}`, custSplitX + 3, currentY + 14);
  doc.text(`Email : ${company.contactEmail}`, custSplitX + 3, currentY + 18.5);

  currentY += custHeight;

  // Pre-fetch item images to base64
  const itemImages = {};
  for (let i = 0; i < (piData.items || []).length; i++) {
    const itm = piData.items[i];
    if (itm.imageUrl) {
      itemImages[i] = await getBase64ImageFromUrl(itm.imageUrl);
    }
  }

  // --- LINE ITEMS TABLE (autoTable) ---
  const tableHead = [[
    "S.No.",
    "Description",
    "Picture",
    "Size",
    "Upholstery\n/Top",
    "Base",
    "Leg polish",
    "Units",
    "Net Price\n(Rs.)",
    "Total (Rs.)",
    "Remark"
  ]];

  const tableBody = (piData.items || []).map((itm, index) => {
    const qty = Number(itm.qty) || 1;
    const price = Number(itm.unitPrice) || 0;
    const total = price * qty;
    return [
      String(index + 1),
      itm.description || itm.name || "—",
      "", // image rendered in didDrawCell
      itm.size || "—",
      itm.upholstery || "FABRIC TO BE\nCONFIRMED",
      itm.base || "—",
      itm.legPolish || "—",
      String(qty),
      formatINR(price, false),
      formatINR(total, false),
      itm.remark || "—"
    ];
  });

  window.jspdf.autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: tableBody,
    theme: "plain",
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [40, 40, 40],
      lineWidth: 0.25,
      textColor: [20, 20, 20],
      valign: 'middle',
      halign: 'center'
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: [10, 10, 10],
      fontStyle: 'bold',
      halign: 'center',
      minCellHeight: 8
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },   // S.No
      1: { cellWidth: 24, halign: 'left', fontStyle: 'bold' }, // Description
      2: { cellWidth: 20, minCellHeight: 18 },  // Picture
      3: { cellWidth: 32, halign: 'left' },    // Size
      4: { cellWidth: 22, halign: 'left' },    // Upholstery/Top
      5: { cellWidth: 14, halign: 'center' },  // Base
      6: { cellWidth: 16, halign: 'center' },  // Leg polish
      7: { cellWidth: 11, halign: 'center' },  // Units
      8: { cellWidth: 18, halign: 'right' },   // Net Price
      9: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }, // Total
      10: { cellWidth: 8, halign: 'center' }   // Remark
    },
    margin: { left: margin, right: margin },
    didDrawCell: function (data) {
      // Draw item thumbnail in Picture column (col index 2)
      if (data.section === 'body' && data.column.index === 2) {
        const base64 = itemImages[data.row.index];
        if (base64) {
          const imgSize = Math.min(data.cell.width - 2, data.cell.height - 2);
          const x = data.cell.x + (data.cell.width - imgSize) / 2;
          const y = data.cell.y + (data.cell.height - imgSize) / 2;
          try {
            doc.addImage(base64, 'JPEG', x, y, imgSize, imgSize);
          } catch (e) {
            try { doc.addImage(base64, 'PNG', x, y, imgSize, imgSize); } catch (e2) {}
          }
        }
      }
    }
  });

  currentY = doc.lastAutoTable.finalY;

  // --- BOTTOM SECTION: BANK DETAILS + TERMS (LEFT) vs COST SUMMARY (RIGHT) ---
  const bottomBoxHeight = 58;
  const splitLeftWidth = contentWidth * 0.58;
  const splitRightWidth = contentWidth - splitLeftWidth;
  const rightColX = margin + splitLeftWidth;

  // Left Outer Box
  doc.rect(margin, currentY, splitLeftWidth, bottomBoxHeight);
  // Right Outer Box
  doc.rect(rightColX, currentY, splitRightWidth, bottomBoxHeight);

  // === LEFT COLUMN CONTENT ===
  // 1. Bank Details Sub-block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20, 20, 20);
  doc.text("BANK DETAILS:", margin + 3, currentY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  const bd = company.bankDetails;
  doc.text(`BENEFICIARY NAME : ${bd.beneficiaryName}`, margin + 3, currentY + 8.5);
  doc.text(`BANK NAME        : ${bd.bankName}`, margin + 3, currentY + 12);
  doc.text(`ACCOUNT NO.      : ${bd.accountNo}`, margin + 3, currentY + 15.5);
  doc.text(`RTGS/NEFT/IFSC   : ${bd.ifscCode}`, margin + 3, currentY + 19);

  doc.line(margin, currentY + 21, rightColX, currentY + 21);

  // 2. Terms & Conditions
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(20, 20, 20);
  doc.text("Terms & Condition :", margin + 3, currentY + 25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.2);
  doc.setTextColor(40, 40, 40);
  let termY = currentY + 28.5;
  (company.terms || []).slice(0, 9).forEach((term, tIdx) => {
    doc.text(`${tIdx + 1}.  ${term}`, margin + 3, termY);
    termY += 3.2;
  });

  // === RIGHT COLUMN: COST SUMMARY BREAKDOWN ===
  const rightPadding = rightColX + 3;
  const valRightX = margin + contentWidth - 3;
  let sumY = currentY + 6;
  const rowStep = 8.2;

  function drawSummaryRow(label, valueStr, isBold = false, hasTopLine = false) {
    if (hasTopLine) {
      doc.line(rightColX, sumY - 4.5, margin + contentWidth, sumY - 4.5);
    }
    doc.setFont("helvetica", isBold ? "bold" : "normal");
    doc.setFontSize(isBold ? 8 : 7.5);
    doc.setTextColor(20, 20, 20);
    doc.text(label, rightPadding, sumY);
    doc.text(valueStr, valRightX, sumY, { halign: 'right' });
    sumY += rowStep;
  }

  drawSummaryRow("Total Amount", formatINR(totals.productTotal), true);
  drawSummaryRow("Freight", totals.freightType === 'percent' ? `${formatINR(totals.freightAmount)} (${totals.freightPercent}%)` : totals.freightLabel);
  drawSummaryRow(`Packaging ${totals.packagingPercent} %`, formatINR(totals.packagingAmount));
  drawSummaryRow(`Installation ${totals.installationPercent} %`, formatINR(totals.installationAmount));
  drawSummaryRow("Sub Total", formatINR(totals.subTotal), true, true);
  drawSummaryRow(`GST ${totals.gstPercent}%`, formatINR(totals.gstAmount));
  drawSummaryRow("Grand Total", formatINR(totals.grandTotal), true, true);

  // Save the PDF
  const cleanPIName = (meta.piNumber || "Proforma_Invoice").replace(/[^a-z0-9_-]/gi, "_");
  doc.save(`${cleanPIName}_Shearling.pdf`);
}
