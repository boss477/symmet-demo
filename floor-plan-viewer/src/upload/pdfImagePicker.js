const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

let _pdfjsLib = null;

async function loadPdfJs() {
  if (_pdfjsLib) return _pdfjsLib;
  const mod = await import(/* @vite-ignore */ PDFJS_CDN);
  mod.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  _pdfjsLib = mod;
  return mod;
}

/**
 * Render all pages of a PDF file to an array of data-URLs.
 * @param {File} file
 * @returns {Promise<string[]>}
 */
async function renderPdfPages(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL("image/png"));
  }
  return pages;
}

/**
 * Show a modal with PDF page thumbnails; resolves with the chosen data-URL.
 * @param {string[]} pageUrls
 * @returns {Promise<string>}
 */
function showPickerModal(pageUrls) {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.className = "pdf-picker-overlay";

    const card = document.createElement("div");
    card.className = "pdf-picker-card";

    const header = document.createElement("div");
    header.className = "pdf-picker-header";
    header.innerHTML = `
      <span class="pdf-picker-title">Choose a page from your PDF</span>
      <button class="pdf-picker-close" aria-label="Cancel">✕</button>
    `;
    header.querySelector(".pdf-picker-close").onclick = () => {
      overlay.remove();
      reject(new Error("cancelled"));
    };

    const grid = document.createElement("div");
    grid.className = "pdf-picker-grid";

    pageUrls.forEach((url, i) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "pdf-picker-item";

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Page ${i + 1}`;

      const label = document.createElement("span");
      label.className = "pdf-picker-item__label";
      label.textContent = `Page ${i + 1}`;

      item.appendChild(img);
      item.appendChild(label);
      item.onclick = () => {
        overlay.remove();
        resolve(url);
      };
      grid.appendChild(item);
    });

    card.appendChild(header);
    card.appendChild(grid);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}

/**
 * Entry point: given a PDF File, show the picker and resolve with the chosen
 * page rendered as a data-URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function pickPageFromPdf(file) {
  const pages = await renderPdfPages(file);
  if (pages.length === 1) return pages[0];
  return showPickerModal(pages);
}
