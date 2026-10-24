const { BrowserWindow, ipcMain } = require("electron");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const supportedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const sources = new Map();
ipcMain.handle("station-print:source", (event) => {
  const source = sources.get(event.sender.id);
  if (!source) throw new Error("Unauthorized print source");
  sources.delete(event.sender.id);
  return source;
});

function validatePdf(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 800 || bytes.subarray(0, 5).toString() !== "%PDF-")
    throw new Error("Virtual printer did not produce a valid PDF");
  return { size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function renderVirtualPdf(filePath, options, outputPath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!supportedExtensions.has(extension)) throw new Error("DOCX/PPTX printing is coming soon. Convert to PDF before creating a print request.");
  const window = new BrowserWindow({ show: false, width: 900, height: 1200,
    webPreferences: { preload: path.join(__dirname, "print-preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  try {
    const bytes = await fs.readFile(filePath);
    if (!bytes.length || bytes.length > 50 * 1024 * 1024) throw new Error("Print document is empty or too large");
    sources.set(window.webContents.id, { bytes: new Uint8Array(bytes), extension });
    if (process.env.EKSARA_STATION_DEV_URL) await window.loadURL(`${process.env.EKSARA_STATION_DEV_URL.replace(/\/$/, "")}/print.html`);
    else await window.loadFile("../dist/print.html");
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      const state = await window.webContents.executeJavaScript("window.__eksaraPrintState");
      if (state?.status === "failed") throw new Error(`Document render failed: ${state.error}`);
      if (state?.status === "ready") { ready = true; break; }
      await delay(200);
    }
    if (!ready) throw new Error("Document rendering timed out before virtual printing");
    const pdf = await window.webContents.printToPDF({ pageSize: options.paperSize || "A4", printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const verified = validatePdf(pdf);
    await fs.writeFile(outputPath, pdf, { flag: "wx", mode: 0o600 });
    const saved = await fs.readFile(outputPath);
    const checked = validatePdf(saved);
    if (checked.sha256 !== verified.sha256 || checked.size !== verified.size) throw new Error("Virtual print output could not be verified on disk");
    return checked;
  } finally { sources.delete(window.webContents.id); window.destroy(); }
}

async function selfTest(outputPath) {
  const window = new BrowserWindow({ show: false, width: 900, height: 1200,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  try {
    const date = new Date().toISOString();
    await window.loadURL(`data:text/html,${encodeURIComponent(`<!doctype html><html><body style="font:18px Arial;padding:48px"><h1>Eksara Station</h1><p>Virtual print self-test</p><p>${date}</p></body></html>`)}`);
    const pdf = await window.webContents.printToPDF({ pageSize: "A4", printBackground: true });
    const verified = validatePdf(pdf);
    await fs.writeFile(outputPath, pdf, { flag: "wx", mode: 0o600 });
    const saved = validatePdf(await fs.readFile(outputPath));
    if (saved.sha256 !== verified.sha256) throw new Error("Virtual print self-test output changed on disk");
    return saved;
  } finally { window.destroy(); }
}

module.exports = { renderVirtualPdf, selfTest, supportedExtensions };
