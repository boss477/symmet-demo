import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Build BOQ rows from placed furniture + catalog lookup.
 * Returns array of { productCode, name, category, dims, qty, unitPrice, total, imageUrl }.
 * Groups by productCode so duplicates collapse into qty > 1.
 */
export function buildBoqRows(furniture, lookupRow, rooms) {
  var map = new Map();

  (furniture || []).forEach(function (f) {
    var row = lookupRow ? lookupRow(f.catalogId) : null;
    if (!row) return;

    var code = row.product_code || f.catalogId || "";
    var room = (rooms || []).find(function (r) { return r.id === f.roomId || r.client_id === f.roomId; });
    var roomName = room ? (room.name || room.type || "") : "";

    if (map.has(code)) {
      var existing = map.get(code);
      existing.qty += 1;
      existing.total = existing.unitPrice != null ? existing.unitPrice * existing.qty : null;
      if (roomName && !existing.rooms.includes(roomName)) existing.rooms.push(roomName);
    } else {
      var price = row.price != null ? Number(row.price) : null;
      var w = row.width_mm, d = row.depth_mm, h = row.height_mm;
      var dims = [w, d, h].filter(function (v) { return v != null; }).join(" × ");
      if (dims) dims += " mm";

      map.set(code, {
        productCode: code,
        name: row.product_name || row.name || code,
        category: row.category || "",
        dims: dims || "—",
        qty: 1,
        unitPrice: price,
        total: price,
        imageUrl: row.image_url || "",
        rooms: roomName ? [roomName] : [],
      });
    }
  });

  return Array.from(map.values());
}

function formatInr(v) {
  if (v == null) return "—";
  return "₹ " + Number(v).toLocaleString("en-IN");
}

/**
 * Download BOQ as PDF.
 * @param {Array} rows  from buildBoqRows()
 * @param {string} [projectName]
 */
export function downloadBoqPdf(rows, projectName) {
  var doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  var title = "Bill of Quantities" + (projectName ? " — " + projectName : "");
  doc.setFontSize(14);
  doc.text(title, 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Generated: " + new Date().toLocaleDateString("en-IN"), 14, 20);
  doc.setTextColor(0);

  var grandTotal = rows.reduce(function (s, r) { return r.total != null ? s + r.total : s; }, 0);
  var hasPrice = rows.some(function (r) { return r.unitPrice != null; });

  var head = [["#", "SKU ID", "Product Name", "Category", "Dimensions", "Rooms", "Qty"]];
  if (hasPrice) head[0].push("Unit Price", "Total");

  var body = rows.map(function (r, i) {
    var row = [
      i + 1,
      r.productCode,
      r.name,
      r.category,
      r.dims,
      r.rooms.join(", ") || "—",
      r.qty,
    ];
    if (hasPrice) {
      row.push(formatInr(r.unitPrice), formatInr(r.total));
    }
    return row;
  });

  autoTable(doc, {
    startY: 25,
    head: head,
    body: body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 8 }, 6: { halign: "center" } },
    didDrawPage: function (data) {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        "Page " + doc.internal.getCurrentPageInfo().pageNumber,
        doc.internal.pageSize.getWidth() - 20,
        doc.internal.pageSize.getHeight() - 8
      );
      doc.setTextColor(0);
    },
  });

  if (hasPrice && grandTotal > 0) {
    var finalY = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(10);
    doc.setFont(undefined, "bold");
    doc.text("Grand Total: " + formatInr(grandTotal), 14, finalY);
    doc.setFont(undefined, "normal");
  }

  var filename = (projectName || "BOQ").replace(/[^a-z0-9_\-]/gi, "_") + "_BOQ.pdf";
  doc.save(filename);
}

/**
 * Download BOQ as CSV.
 */
export function downloadBoqCsv(rows, projectName) {
  var hasPrice = rows.some(function (r) { return r.unitPrice != null; });
  var headers = ["#", "SKU ID", "Product Name", "Category", "Dimensions (mm)", "Rooms", "Qty"];
  if (hasPrice) headers.push("Unit Price (INR)", "Total (INR)");

  var lines = [headers.join(",")];
  rows.forEach(function (r, i) {
    var cells = [
      i + 1,
      '"' + r.productCode + '"',
      '"' + (r.name || "").replace(/"/g, '""') + '"',
      '"' + (r.category || "").replace(/"/g, '""') + '"',
      '"' + r.dims + '"',
      '"' + r.rooms.join("; ") + '"',
      r.qty,
    ];
    if (hasPrice) {
      cells.push(r.unitPrice != null ? r.unitPrice : "", r.total != null ? r.total : "");
    }
    lines.push(cells.join(","));
  });

  var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = (projectName || "BOQ").replace(/[^a-z0-9_\-]/gi, "_") + "_BOQ.csv";
  a.click();
  URL.revokeObjectURL(url);
}
