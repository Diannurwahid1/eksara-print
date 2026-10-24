import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowRight, Box, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList,
  Cloud, Copy, File, FileText, Home, Layers3, Link2, LockKeyhole, Minus, Package,
  Printer, RefreshCw, Search, Settings, ShieldCheck, ShoppingCart, Users, Wallet, X
} from "lucide-react";
import type { Bootstrap, PrinterDevice, StationJob } from "./types";

const operations = [
  { label: "Dashboard", icon: Home }, { label: "Queue", icon: Printer },
  { label: "Incoming Requests", icon: ClipboardList }, { label: "Print Jobs", icon: Printer },
  { label: "Printers", icon: Printer }
];
const management = [
  { label: "Customers", icon: Users }, { label: "Reports", icon: ShieldCheck },
  { label: "Daily Sales", icon: CircleDollarSign }, { label: "Revenue", icon: Wallet },
  { label: "Purchasing", icon: ShoppingCart }, { label: "Inventory", icon: Box }
];
const system = [
  { label: "Activity Log", icon: ClipboardList }, { label: "Team", icon: Users },
  { label: "Settings", icon: Settings }
];

const emptyBootstrap: Bootstrap = { mode: "unconfigured", apiBase: null, shopName: "Eksara Station", printers: [], jobs: [], connected: false };
const formatSize = (value: number) => `${(value / 1048576).toFixed(1)} MB`;
const formatDate = (value: string) => value ? new Date(value).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const formatTime = (value: string) => value ? new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—";
const niceStatus = (value: StationJob["status"]) => value.charAt(0).toUpperCase() + value.slice(1);
const supported = (fileName: string) => /\.(pdf|png|jpe?g)$/i.test(fileName);

function NavGroup({ title, items, active, count, onSelect }: {
  title: string; items: typeof operations; active: string; count: number; onSelect: (label: string) => void;
}) {
  return <div className="nav-group"><div className="nav-caption">{title}</div>{items.map(({ label, icon: Icon }) =>
    <button key={label} className={`nav-item ${active === label ? "active" : ""}`} onClick={() => onSelect(label)}>
      <Icon size={19}/><span>{label}</span>{label === "Queue" && count > 0 && <em>{count}</em>}
    </button>)}</div>;
}

function Metric({ icon: Icon, tone, label, value, sub, onClick }: {
  icon: typeof FileText; tone: string; label: string; value: string; sub: string; onClick?: () => void;
}) {
  return <button className="metric-card" onClick={onClick} disabled={!onClick}>
    <span className={`metric-icon ${tone}`}><Icon size={27}/></span>
    <span className="metric-body"><small>{label}</small><strong>{value}</strong><em>{sub}</em></span>
  </button>;
}

function DetailLine({ label, icon: Icon, children }: { label: string; icon: typeof FileText; children: React.ReactNode }) {
  return <div className="detail-line"><span className="detail-label">{label}</span>
    <span className="detail-icon"><Icon size={16}/></span><div className="detail-value">{children}</div></div>;
}

function FileBadge({ name }: { name: string }) {
  return <span className={`file-badge ${/\.pdf$/i.test(name) ? "pdf" : "image"}`}>
    {/\.pdf$/i.test(name) ? "PDF" : <File size={16}/>}</span>;
}

function Preview() {
  return <section className="panel preview-panel"><div className="panel-title">
    <span className="panel-icon"><FileText size={17}/></span><h3>Document Preview</h3></div>
    <div className="preview-stage"><div className="preview-unavailable"><LockKeyhole size={38}/>
      <strong>Secure preview coming soon</strong><p>File content is released only after one-time authorization. No document image is fabricated here.</p>
    </div></div></section>;
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [jobs, setJobs] = useState<StationJob[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState("Queue");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [printerName, setPrinterName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [localReleaseId, setLocalReleaseId] = useState("");
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = window.station ? await window.station.bootstrap() : emptyBootstrap;
        setBootstrap(data); setJobs(data.jobs); setSelectedId(data.jobs[0]?.id || "");
        setPrinterName(data.printers.find((printer) => printer.isDefault)?.name || data.printers[0]?.name || "");
        if (data.connectionError) setError(data.connectionError);
      } catch (reason) { setBootstrap(emptyBootstrap); setError(reason instanceof Error ? reason.message : "Could not open Station"); }
    };
    void load();
    if (!window.station) return;
    return window.station.onTicket(async (ticket) => {
      setActive("Queue");
      try {
        const job = await window.station.claimTicket(ticket);
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        setSelectedId(job.id); setBanner(true); setMessage("A real customer request was claimed by this Station.");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not claim the shared request"); }
    });
  }, []);

  const selected = jobs.find((job) => job.id === selectedId) || jobs[0];
  const printers: PrinterDevice[] = bootstrap?.printers || [];
  const currentPrinter = printers.find((printer) => printer.name === printerName) || printers[0];
  const filteredJobs = useMemo(() => jobs.filter((job) =>
    (filter === "all" || job.status === filter) && `${job.fileName} ${job.customerName}`.toLowerCase().includes(search.toLowerCase())),
  [jobs, filter, search]);
  const activeCount = jobs.filter((job) => ["opened", "processing"].includes(job.status)).length;
  const connected = bootstrap?.mode === "api" && bootstrap.connected;
  const virtualSelected = printerName === "eksara-virtual-pdf";

  async function refresh() {
    if (!window.station || bootstrap?.mode !== "api") { setError("Configure the Eksara API and Station device token first."); return; }
    try {
      const updated = await window.station.refreshJobs();
      setJobs(updated); setSelectedId((current) => updated.some((job) => job.id === current) ? current : updated[0]?.id || "");
      setMessage("Queue updated from the Eksara API."); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh the queue"); }
  }

  async function authorize() {
    if (!selected || !printerName || !window.station || !connected) { setError("Connect Station to the API and select a printer."); return; }
    if (!supported(selected.fileName)) { setError("DOCX/PPTX printing is coming soon. Upload PDF, JPG, or PNG."); return; }
    if (virtualSelected && !window.confirm("Virtual PDF test consumes this one-time print authorization and deletes the document after confirmation. No paper will be printed. Continue?")) return;
    setWorking(true); setError("");
    try {
      const response = await window.station.authorizeRelease(selected.id, printerName);
      setLocalReleaseId(selected.id);
      setMessage(response.message); setJobs(await window.station.refreshJobs());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authorization or print preparation failed"); }
    finally { setWorking(false); }
  }

  async function finish() {
    if (!selected || !printerName || !window.station) return;
    const prompt = virtualSelected
      ? "The virtual PDF was generated and verified. Delete the local output and original file, then record this as a virtual test?"
      : "Confirm the document was printed and the desktop viewer is closed. Eksara will delete the local file and attest storage deletion.";
    if (!window.confirm(prompt)) return;
    setWorking(true); setError("");
    try {
      const response = await window.station.completePrint(selected.id, printerName);
      setLocalReleaseId(""); setMessage(response.message); setJobs(await window.station.refreshJobs());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not finish this print job"); }
    finally { setWorking(false); }
  }

  async function runSelfTest() {
    if (!window.station) { setError("Open the Electron app to run the virtual print self-test."); return; }
    setWorking(true); setError("");
    try { setMessage((await window.station.virtualSelfTest()).message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Virtual print self-test failed"); }
    finally { setWorking(false); }
  }

  if (!bootstrap) return <div className="station-loading">Opening Eksara Station…</div>;

  return <div className="station-window">
    <header className="topbar"><div className="station-brand"><img src="./eksara-mark.png" alt=""/><strong>Eksara Station</strong></div>
      <div className="top-divider"/><button className="shop-switch" onClick={() => setActive("Settings")}>
        <strong>{bootstrap.shopName} <ChevronDown size={14}/></strong><span>Print Shop Management</span></button>
      <span className="online-caption"><i/>{connected ? "API connected" : "API not connected"}</span><div className="top-spacer"/>
      <div className="top-device"><span className="device-icon"><Printer size={22}/></span><div>
        <strong>{currentPrinter?.displayName || "No printer"}</strong><small>{currentPrinter?.virtual ? "Virtual test available" : currentPrinter ? "Detected on this computer" : "Unavailable"}</small>
      </div></div><div className="top-divider"/><div className="top-device"><Cloud size={24}/><div>
        <strong>Eksara API</strong><small>{connected ? "Connected" : "Needs configuration"}</small></div></div>
      <div className="top-divider"/><button className="top-icon" aria-label="Settings" onClick={() => setActive("Settings")}><Settings size={21}/></button>
      <div className="top-divider"/><div className="window-controls"><button aria-label="Minimize" onClick={() => window.station?.windowControl("minimize")}><Minus size={17}/></button>
        <button aria-label="Maximize" onClick={() => window.station?.windowControl("maximize")}><span className="maximize-glyph"/></button>
        <button aria-label="Close" onClick={() => window.station?.windowControl("close")}><X size={18}/></button></div></header>
    <div className="station-body"><aside className="sidebar">
      <NavGroup title="Operations" items={operations} active={active} count={activeCount} onSelect={setActive}/>
      <NavGroup title="Management" items={management} active={active} count={0} onSelect={setActive}/>
      <NavGroup title="System" items={system} active={active} count={0} onSelect={setActive}/>
      <div className="sidebar-bottom"><div className="sidebar-brand"><img src="./eksara-mark.png" alt=""/><div><strong>Eksara</strong><span>Station</span></div>
        <small>v1.0.0</small><em>Print Shop Management</em></div></div></aside>
      <main className="workspace"><div className="workspace-inner"><div className="welcome"><div>
        <h1>{active === "Queue" || active === "Dashboard" ? "Print shop workspace" : active}</h1>
        <p>{active === "Queue" || active === "Dashboard" ? connected ? "Jobs received from the Eksara API." : "Connect this Station to receive customer print requests." : "Eksara Station"}</p>
      </div><div className="today"><div><strong>{formatDate(new Date().toISOString())}</strong><small>{formatTime(new Date().toISOString())}</small></div></div></div>
      {active === "Queue" || active === "Dashboard" ? <>
        <div className="metrics">
          <Metric icon={FileText} tone="blue" label="Today's Orders" value={connected ? String(jobs.filter((job) => job.createdAt && new Date(job.createdAt).toDateString() === new Date().toDateString()).length) : "—"} sub={connected ? "From Eksara API" : "API not connected"}/>
          <Metric icon={CircleDollarSign} tone="green" label="Today's Revenue" value="Coming soon" sub="Sales API pending"/>
          <Metric icon={ShoppingCart} tone="orange" label="Pending Purchases" value="Coming soon" sub="Purchasing API pending"/>
          <Metric icon={Layers3} tone="purple" label="Paper Stock Status" value="Coming soon" sub="Inventory API pending" onClick={() => setActive("Inventory")}/>
        </div>
        {banner && <div className="handoff-banner"><span className="banner-icon"><Link2 size={25}/></span><div>
          <strong>New shared request opened</strong><p>The customer link was verified and the real job arrived from the API.</p></div>
          <button aria-label="Dismiss notification" onClick={() => setBanner(false)}><X size={15}/></button></div>}
        <div className="work-grid"><section className="panel request-panel"><div className="panel-title">
          <span className="panel-icon"><Settings size={17}/></span><h3>Request Details</h3>
          {selected?.status === "opened" && <span className="ready-pill"><CheckCircle2 size={15}/> Ready for authorization</span>}</div>
          {selected ? <div className="request-details">
            <DetailLine label="Customer" icon={Users}><strong>{selected.customerName}</strong></DetailLine>
            <DetailLine label="Document" icon={FileText}><span className="inline-file"><FileBadge name={selected.fileName}/><span>
              <strong>{selected.fileName}</strong><small>{formatSize(selected.fileSize)} · {selected.pageCount == null ? "Page count unavailable" : `${selected.pageCount} pages`}</small>
            </span></span></DetailLine>
            <DetailLine label="Source" icon={Link2}><strong>{selected.source}</strong></DetailLine>
            <DetailLine label="PIN Code" icon={LockKeyhole}><span className="pin-private"><LockKeyhole size={15}/> Verified during link handoff</span></DetailLine>
            <DetailLine label="Authorization" icon={ShieldCheck}><span className="valid-pill"><CheckCircle2 size={14}/> {niceStatus(selected.status)}</span></DetailLine>
            <div className="request-separator"/>
            <DetailLine label="Copies" icon={Copy}><strong>{selected.options.copies}</strong><small>Requested by customer</small></DetailLine>
            <DetailLine label="Paper Size" icon={File}><strong>{selected.options.paperSize}</strong></DetailLine>
            <DetailLine label="Print Type" icon={CircleDollarSign}><strong>{selected.options.color === "bw" ? "Black & White" : "Color"}</strong></DetailLine>
            <DetailLine label="Print Sides" icon={Copy}><strong>{selected.options.sides === "single" ? "Single-sided" : "Double-sided"}</strong></DetailLine>
            <DetailLine label="Customer Note" icon={ClipboardList}><div className="customer-note">{selected.note || "No note provided."}</div></DetailLine>
          </div> : <p className="panel-empty">{connected ? "No print request has been received." : "Connect to the API to see real requests."}</p>}
        </section><Preview/><section className="panel control-panel"><div className="panel-title">
          <span className="panel-icon"><Printer size={18}/></span><h3>Print Controls</h3></div>
          <label>Select Printer</label><div className="select-with-icon"><Printer size={18}/><select value={printerName} onChange={(event) => setPrinterName(event.target.value)}>
            {printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.displayName}</option>)}
          </select></div>
          <label>Copies</label><div className="locked-field"><span>{selected?.options.copies ?? "—"} <LockKeyhole size={13}/></span><small>Locked to customer&apos;s request</small></div>
          <label>Paper Size</label><div className="read-field"><File size={17}/>{selected?.options.paperSize || "—"}</div>
          <label>Print Type</label><div className="read-field"><CircleDollarSign size={17}/>{selected ? selected.options.color === "color" ? "Color" : "Black & White" : "—"}</div>
          <label>Print Sides</label><div className="read-field"><Copy size={17}/>{selected ? selected.options.sides === "double" ? "Double-sided" : "Single-sided" : "—"}</div>
          <div className="authorization-note"><LockKeyhole size={22}/><span><strong>One-time print authorization</strong>
            <small>{virtualSelected ? "Virtual PDF test creates a verified PDF. It consumes the grant but does not print paper." : "The authorized file opens in the desktop viewer. Confirm only after printing."}</small></span></div>
          <button className="print-button" onClick={authorize} disabled={!connected || !selected || selected.status !== "opened" || !printerName || !supported(selected.fileName) || working}>
            <Printer size={18}/>{working ? "Processing…" : virtualSelected ? "Authorize & Virtual Print" : "Authorize & Open Document"}</button>
          {selected?.status === "opened" && !supported(selected.fileName) && <p className="panel-empty">DOCX/PPTX print support: coming soon.</p>}
          {selected?.status === "processing" && localReleaseId === selected.id && <button className="print-button" onClick={finish} disabled={working}>
            <CheckCircle2 size={18}/>{virtualSelected ? "Complete virtual test & delete" : "Confirm printed & delete"}</button>}
        </section></div>
        <div className="bottom-grid"><section className="panel queue-panel"><div className="panel-title"><span className="panel-icon"><Layers3 size={18}/></span>
          <div><h3>Print Queue ({jobs.length})</h3><small>Jobs received from Eksara API</small></div>
          <div className="queue-tools"><select aria-label="Filter by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All Status</option><option value="opened">Opened</option><option value="processing">Processing</option><option value="printed">Printed</option>
          </select><div className="queue-search"><Search size={16}/><input aria-label="Search documents or customers" placeholder="Search documents or customers..." value={search} onChange={(event) => setSearch(event.target.value)}/></div>
            <button aria-label="Refresh queue" onClick={refresh}><RefreshCw size={15}/></button></div></div>
          <div className="table-wrap"><table><thead><tr><th>#</th><th>Document</th><th>Customer</th><th>Pages</th><th>Copies</th><th>Status</th><th>Received At</th><th>Actions</th></tr></thead>
            <tbody>{filteredJobs.map((job, index) => <tr key={job.id} className={selectedId === job.id ? "selected" : ""} onClick={() => setSelectedId(job.id)}>
              <td>{index + 1}</td><td><span className="table-document"><FileBadge name={job.fileName}/>{job.fileName}</span></td>
              <td><Users size={13}/> {job.customerName}</td><td>{job.pageCount ?? "—"}</td><td>{job.options.copies}</td>
              <td><span className={`status-badge ${job.status}`}>{niceStatus(job.status)}</span></td><td>{formatDate(job.createdAt)}<small>{formatTime(job.createdAt)}</small></td>
              <td><button className="row-action" onClick={(event) => { event.stopPropagation(); setSelectedId(job.id); }}>View Details</button></td>
            </tr>)}</tbody></table>{!filteredJobs.length && <p className="table-empty">{connected ? "No requests match your search." : "Connect Station to the API to load the queue."}</p>}</div>
        </section><section className="panel insights-panel"><div className="panel-title"><span className="panel-icon"><Package size={17}/></span><h3>Quick Insights</h3></div>
          <div className="coming-soon"><Package size={26}/><strong>Coming soon</strong><p>Sales, stock, and purchasing will appear when the print shop management API is ready.</p></div>
        </section></div></> : <section className="panel auxiliary-panel"><span className="panel-icon large">{active === "Printers" ? <Printer/> : active === "Settings" ? <Settings/> : <Package/>}</span>
          <h2>{active}</h2>{active === "Printers" ? <><p>Printers detected on this computer. The virtual PDF printer can run a self-test without customer data or API credentials.</p>
            <div className="aux-list">{printers.map((printer) => <div key={printer.name}><Printer size={18}/><strong>{printer.displayName}</strong><span>{printer.virtual ? "Virtual test" : printer.isDefault ? "Default" : "Detected"}</span></div>)}</div>
            <button className="btn-secondary" onClick={runSelfTest} disabled={working}>Run virtual print self-test</button>
            <button className="btn-secondary" onClick={async () => { if (!window.station) return; const updated = await window.station.getPrinters(); setBootstrap((current) => current ? { ...current, printers: updated } : current); setMessage("Printer list refreshed."); }}>Refresh printers</button>
          </> : active === "Settings" ? <><p>Station connection settings are configured in the main process; device credentials never reach the renderer.</p>
            <div className="aux-list"><div><Cloud size={18}/><strong>API</strong><span>{bootstrap.apiBase || "Not configured"}</span></div>
              <div><Printer size={18}/><strong>Printers</strong><span>{printers.length} available, including virtual test</span></div></div>
          </> : <><p>Coming soon. This module needs a real print shop management API before showing data.</p>
            <button className="btn-secondary" onClick={() => setActive("Queue")}>Open Queue <ArrowRight size={16}/></button></>}</section>}
      </div></main></div><footer className="statusbar"><span><i/>{connected ? "Connected to Eksara API" : "API connection required"}</span>
      <span><RefreshCw size={13}/> {jobs.length} real jobs · {activeCount} active</span>
      <span><Printer size={14}/> {currentPrinter?.displayName || "No printer detected"}</span>
      <span><CheckCircle2 size={14}/> {connected ? "Ready for handoff" : "Virtual self-test available"}</span></footer>
    {(message || error) && <div className={`toast ${error ? "error" : ""}`} role="status">{error ? <AlertCircle size={18}/> : <CheckCircle2 size={18}/>}
      <span>{error || message}</span><button aria-label="Dismiss message" onClick={() => { setMessage(""); setError(""); }}><X size={15}/></button></div>}
  </div>;
}
