import { pickPageFromPdf } from "./pdfImagePicker.js";
import { cadFileToDataUrl } from "./cadImagePicker.js";
import { dwgFileToDataUrl } from "./dwgImagePicker.js";

/**
 * @param {HTMLInputElement} input
 * @param {HTMLImageElement} planImg
 * @param {() => void} onLoaded
 * @param {(file: File) => void} [onFileChosen]
 */
export function bindPlanFileInput(input, planImg, onLoaded, onFileChosen) {
  input.addEventListener("change", async function () {
    var f = input.files && input.files[0];
    if (!f) return;
    if (onFileChosen) onFileChosen(f);

    if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
      try {
        const dataUrl = await pickPageFromPdf(f);
        planImg.src = dataUrl;
        planImg.onload = onLoaded;
      } catch {
        // user cancelled picker — do nothing
      }
      return;
    }

    if (f.name.toLowerCase().endsWith(".dxf")) {
      try {
        planImg.src = await cadFileToDataUrl(f);
        planImg.onload = onLoaded;
      } catch (err) {
        alert("Could not render DXF: " + err.message);
      }
      return;
    }

    if (f.name.toLowerCase().endsWith(".dwg")) {
      try {
        planImg.src = await dwgFileToDataUrl(f);
        planImg.onload = onLoaded;
      } catch (err) {
        alert("Could not render DWG: " + err.message);
      }
      return;
    }

    planImg.src = URL.createObjectURL(f);
    planImg.onload = onLoaded;
  });
}
