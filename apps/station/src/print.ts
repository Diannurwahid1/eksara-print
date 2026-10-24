import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

type PrintSource = { bytes: Uint8Array; extension: string };
declare global {
  interface Window {
    printBridge: { load(): Promise<PrintSource> };
    __eksaraPrintState?: { status: "loading" | "ready" | "failed"; pages?: number; error?: string };
  }
}

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
window.__eksaraPrintState = { status: "loading" };
const pages = document.getElementById("pages")!;
const style = document.createElement("style");
style.textContent = `@page{margin:0}html,body{margin:0;background:white} .page{break-after:page;page-break-after:always;display:flex;align-items:center;justify-content:center;width:100%;height:100vh;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}.page img{display:block;max-width:100%;max-height:100%;object-fit:contain}`;
document.head.append(style);

async function render() {
  const source = await window.printBridge.load();
  const bytes = new Uint8Array(source.bytes);
  if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("Print file is empty or too large");
  if (source.extension === ".pdf") {
    const pdfDocument = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    if (pdfDocument.numPages < 1 || pdfDocument.numPages > 100) throw new Error("PDF page count is outside the supported range (1–100)");
    for (let index = 1; index <= pdfDocument.numPages; index++) {
      const page = await pdfDocument.getPage(index);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas renderer unavailable");
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const image = new Image();
      image.src = canvas.toDataURL("image/png");
      await image.decode();
      const container = document.createElement("section");
      container.className = "page"; container.append(image); pages.append(container);
      canvas.width = 0; canvas.height = 0;
    }
    window.__eksaraPrintState = { status: "ready", pages: pdfDocument.numPages };
    return;
  }
  if (![".png", ".jpg", ".jpeg"].includes(source.extension)) throw new Error("Unsupported print format");
  const mime = source.extension === ".png" ? "image/png" : "image/jpeg";
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image(); image.src = blobUrl; await image.decode();
    const container = document.createElement("section");
    container.className = "page"; container.append(image); pages.append(container);
    window.__eksaraPrintState = { status: "ready", pages: 1 };
  } finally { /* Keep the blob URL until printToPDF finishes. */ }
}

void render().catch((error) => { window.__eksaraPrintState = { status: "failed", error: error instanceof Error ? error.message : String(error) }; });
