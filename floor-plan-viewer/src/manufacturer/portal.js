import { listSkus, EDITABLE_SKU_COLUMNS } from "../services/skuAdmin.js";

var IDENTITY = "Product Code";
// Columns shown in the read-only list (identity first, then the editable set).
var SHOWN_COLUMNS = [IDENTITY].concat(EDITABLE_SKU_COLUMNS);

function el(tag, props, children) {
  var node = document.createElement(tag);
  if (props) Object.keys(props).forEach(function (k) { node[k] = props[k]; });
  (children || []).forEach(function (c) {
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function cell(label, value) {
  return el("div", { className: "sku-cell" }, [
    el("span", { className: "sku-cell__label" }, [label]),
    el("span", { className: "sku-cell__value" }, [value == null || value === "" ? "—" : String(value)]),
  ]);
}

function readonlyRow(row) {
  var cells = SHOWN_COLUMNS.map(function (col) { return cell(col, row[col]); });
  return el("div", { className: "sku-row" }, cells);
}

export async function mountPortal(rootId) {
  var root = document.getElementById(rootId);
  root.textContent = "Loading SKUs…";
  root.textContent = "";
  root.appendChild(el("p", { className: "sku-note" }, [
    "View-only. Editing is disabled until manufacturer accounts are set up.",
  ]));
  var rows;
  try { rows = await listSkus(); }
  catch (err) { root.appendChild(el("p", null, ["Failed to load: " + (err.message || err)])); return; }
  root.appendChild(el("p", null, [rows.length + " SKUs"]));
  rows.forEach(function (r) { root.appendChild(readonlyRow(r)); });
}
