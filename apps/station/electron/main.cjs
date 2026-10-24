const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const { randomUUID } = require("node:crypto");
const { renderVirtualPdf, selfTest, supportedExtensions } = require("./print-engine.cjs");

const devUrl = process.env.EKSARA_STATION_DEV_URL;
const rawApiBase = process.env.EKSARA_API_BASE_URL || (process.env.EKSARA_STATION_DEV_URL ? "http://127.0.0.1:4000" : "");
const apiBase = /^https:\/\//.test(rawApiBase) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(rawApiBase)
  ? rawApiBase.replace(/\/$/, "") : "";
const deviceToken = process.env.EKSARA_STATION_DEVICE_TOKEN || "";
const apiMode = Boolean(apiBase && deviceToken);
const virtualPrinter = { name: "eksara-virtual-pdf", displayName: "Eksara Virtual PDF (test)", isDefault: false, virtual: true };
let mainWindow;
let pendingTicket = null;
const releasedFiles = new Map();
const leaseRoot = () => path.resolve(app.getPath("userData"), "ephemeral-print-files");
async function cleanupOldLeases() {
  const root = leaseRoot();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("lease-")) continue;
    const target = path.resolve(root, entry.name);
    if (path.dirname(target) === root) await fs.rm(target, { recursive: true, force: true });
  }
}

function parseTicket(value) {
  if (typeof value !== "string" || value.length > 700) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "eksara-station:" || url.hostname !== "claim") return null;
    const ticket = url.searchParams.get("ticket");
    return ticket && /^[a-zA-Z0-9_-]{16,512}$/.test(ticket) ? ticket : null;
  } catch { return null; }
}

function acceptDeepLink(value) {
  const ticket = parseTicket(value);
  if (!ticket) return;
  pendingTicket = ticket;
  if (mainWindow) {
    mainWindow.show(); mainWindow.focus();
    mainWindow.webContents.send("station:ticket", ticket);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1484, height: 1060, minWidth: 1050, minHeight: 720,
    backgroundColor: "#edf6ff", frame: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.setZoomFactor(0.8);
    if (pendingTicket) mainWindow.webContents.send("station:ticket", pendingTicket);
  });
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

function validSender(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Unauthorized window");
}

async function requestApi(endpoint, init = {}) {
  if (!apiMode) throw new Error("Station API is not configured. Set the API URL and paired device credential.");
  const response = await fetch(`${apiBase}${endpoint}`, {
    ...init,
    headers: { Authorization: `Bearer ${deviceToken}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Eksara API returned ${response.status}`);
  return response.json();
}

function normalizeJob(value) {
  const options = value.options || {};
  return {
    id: String(value.id), fileName: String(value.fileName || "Document"),
    fileSize: Number(value.fileSize || 0), pageCount: Number.isInteger(value.pageCount) ? value.pageCount : null,
    customerName: String(value.customerName || "Customer"), source: String(value.source || "Shared Link"),
    note: String(value.note || ""), createdAt: String(value.createdAt || ""),
    expiresAt: String(value.expiresAt || ""), status: String(value.status || "pending"),
    options: { copies: Number(options.copies || 1), paperSize: options.paperSize || "A4", color: options.color || "bw", sides: options.sides || "single" }
  };
}

async function listJobs() {
  if (!apiMode) return [];
  const data = await requestApi("/v1/station/jobs");
  return (Array.isArray(data) ? data : data.items || []).map(normalizeJob);
}

async function listPrinters() {
  if (!mainWindow) return [virtualPrinter];
  const list = await mainWindow.webContents.getPrintersAsync();
  return [virtualPrinter, ...list.map(({ name, displayName, isDefault, status }) => ({ name, displayName, isDefault, status }))];
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", (_event, commandLine) => {
    const deepLink = commandLine.find((part) => part.startsWith("eksara-station://"));
    if (deepLink) acceptDeepLink(deepLink);
    else if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
  app.on("open-url", (event, url) => { event.preventDefault(); acceptDeepLink(url); });
  app.whenReady().then(async () => {
    await cleanupOldLeases();
    if (process.defaultApp) app.setAsDefaultProtocolClient("eksara-station", process.execPath, [path.resolve(process.argv[1])]);
    else app.setAsDefaultProtocolClient("eksara-station");
    ipcMain.handle("station:bootstrap", async (event) => {
      validSender(event);
      let jobs = []; let connectionError;
      if (apiMode) {
        try { jobs = await listJobs(); }
        catch (error) { connectionError = error instanceof Error ? error.message : "Eksara API unavailable"; }
      }
      return { mode: apiMode ? "api" : "unconfigured", apiBase: apiBase || null,
        shopName: process.env.EKSARA_SHOP_NAME || "Eksara Station", printers: await listPrinters(), jobs,
        connected: apiMode && !connectionError, connectionError };
    });
    ipcMain.handle("station:refresh-jobs", async (event) => { validSender(event); return listJobs(); });
    ipcMain.handle("station:printers", async (event) => { validSender(event); return listPrinters(); });
    ipcMain.handle("station:claim-ticket", async (event, ticket) => {
      validSender(event);
      if (typeof ticket !== "string" || !/^[a-zA-Z0-9_-]{16,512}$/.test(ticket)) throw new Error("Invalid handoff ticket");
      if (!apiMode) throw new Error("Configure the Eksara API URL and Station device token to claim a real handoff.");
      const claimed = await requestApi("/v1/station/handoffs/claim", { method: "POST", body: JSON.stringify({ handoffTicket: ticket }) });
      pendingTicket = null;
      return normalizeJob(await requestApi(`/v1/station/jobs/${encodeURIComponent(claimed.jobId)}`));
    });
    ipcMain.handle("station:authorize-release", async (event, jobId, printerName) => {
      validSender(event);
      if (typeof jobId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) throw new Error("Invalid job ID");
      if (typeof printerName !== "string" || printerName.length > 250) throw new Error("Invalid printer");
      const printers = await listPrinters();
      if (!printers.some((printer) => printer.name === printerName)) throw new Error("Select an available printer");
      if (!apiMode) throw new Error("Connect Station to the Eksara API before releasing a print request.");
      const job = normalizeJob(await requestApi(`/v1/station/jobs/${encodeURIComponent(jobId)}`));
      const extension = path.extname(job.fileName).toLowerCase();
      if (!supportedExtensions.has(extension)) throw new Error("DOCX/PPTX printing is coming soon. Upload a PDF or image for this Station version.");
      const release = await requestApi(`/v1/station/jobs/${encodeURIComponent(jobId)}/authorize-release`, { method: "POST", body: JSON.stringify({ printerName }) });
      const url = new URL(release.downloadUrl);
      const expectedDownloadPrefix = `${apiBase}/v1/station/downloads/`;
      if (!url.href.startsWith(expectedDownloadPrefix)) throw new Error("Invalid private download URL");
      const download = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!download.ok) throw new Error("Authorized document download failed");
      const bytes = Buffer.from(await download.arrayBuffer());
      if (!bytes.length || bytes.length > 52428800 || bytes.length !== job.fileSize) throw new Error("Downloaded document size mismatch");
      const directory = await fs.mkdtemp(path.join(leaseRoot(), "lease-"));
      const filePath = path.join(directory, `document${extension}`);
      await fs.writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
      if (printerName === virtualPrinter.name) {
        const outputPath = path.join(directory, "virtual-output.pdf");
        const proof = await renderVirtualPdf(filePath, job.options, outputPath);
        releasedFiles.set(jobId, { directory, filePath, printerName, virtualOutputSha256: proof.sha256 });
        return { message: `Virtual PDF generated and verified (${proof.size} bytes, SHA-256 ${proof.sha256.slice(0, 16)}…). Confirm to delete both files and record the one-time completion.`, virtualReady: true };
      }
      releasedFiles.set(jobId, { directory, filePath, printerName });
      const openError = await shell.openPath(filePath);
      if (openError) throw new Error(`Document could not be opened: ${openError}`);
      return { message: "Document opened in your desktop viewer. Print it, close the viewer, then confirm completion in Station." };
    });
    ipcMain.handle("station:complete-print", async (event, jobId, printerName) => {
      validSender(event);
      if (typeof jobId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) throw new Error("Invalid job ID");
      if (typeof printerName !== "string" || printerName.length > 250) throw new Error("Invalid printer");
      if (!apiMode) throw new Error("Station API is not connected");
      const lease = releasedFiles.get(jobId);
      if (!lease || lease.printerName !== printerName) throw new Error("No matching local print release is open");
      if (path.dirname(lease.directory) !== leaseRoot() || !path.basename(lease.directory).startsWith("lease-")) throw new Error("Unsafe temporary path");
      await fs.rm(lease.directory, { recursive: true, force: true });
      const receipt = await requestApi(`/v1/station/jobs/${encodeURIComponent(jobId)}/complete`, { method: "POST", body: JSON.stringify({ printerName, virtualOutputSha256: lease.virtualOutputSha256 }) });
      releasedFiles.delete(jobId);
      return { message: `${lease.virtualOutputSha256 ? "Virtual print verified" : "Operator print recorded"}. Local copy removed; storage deletion evidence: ${receipt.deletionEvidenceHash}` };
    });
    ipcMain.handle("station:virtual-self-test", async (event) => {
      validSender(event);
      const root = path.resolve(app.getPath("userData"), "virtual-print-tests");
      await fs.mkdir(root, { recursive: true, mode: 0o700 });
      const outputPath = path.join(root, `eksara-self-test-${randomUUID()}.pdf`);
      const proof = await selfTest(outputPath);
      return { message: `Virtual print successful: ${outputPath} (${proof.size} bytes, SHA-256 ${proof.sha256.slice(0, 16)}…)`, outputPath, sha256: proof.sha256 };
    });
    ipcMain.on("station:window", (event, action) => {
      validSender(event);
      if (action === "minimize") mainWindow.minimize();
      if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
      if (action === "close") mainWindow.close();
    });
    createWindow();
    const initialDeepLink = process.argv.find((part) => part.startsWith("eksara-station://"));
    if (initialDeepLink) acceptDeepLink(initialDeepLink);
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("will-quit", () => {
    for (const lease of releasedFiles.values()) {
      if (path.dirname(lease.directory) === leaseRoot() && path.basename(lease.directory).startsWith("lease-")) {
        try { fsSync.rmSync(lease.directory, { recursive: true, force: true }); } catch { /* Retry cleanup on next launch. */ }
      }
    }
  });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}
