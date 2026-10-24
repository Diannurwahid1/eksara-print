export type JobStatus = "pending" | "opened" | "processing" | "printed" | "completed" | "failed";
export type PrintOptions = {
  copies: number;
  paperSize: "A4" | "A3" | "Letter";
  color: "bw" | "color";
  sides: "single" | "double";
};
export type StationJob = {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number | null;
  customerName: string;
  source: string;
  note: string;
  createdAt: string;
  expiresAt: string;
  status: JobStatus;
  options: PrintOptions;
};
export type PrinterDevice = { name: string; displayName: string; isDefault: boolean; status?: number; virtual?: boolean };
export type Bootstrap = { mode: "unconfigured" | "api"; apiBase: string | null; shopName: string; printers: PrinterDevice[]; jobs: StationJob[]; connected: boolean; connectionError?: string };
export type StationBridge = {
  bootstrap(): Promise<Bootstrap>;
  refreshJobs(): Promise<StationJob[]>;
  getPrinters(): Promise<PrinterDevice[]>;
  claimTicket(ticket: string): Promise<StationJob>;
  authorizeRelease(jobId: string, printerName: string): Promise<{ message: string }>;
  completePrint(jobId: string, printerName: string): Promise<{ message: string }>;
  virtualSelfTest(): Promise<{ message: string; outputPath: string; sha256: string }>;
  onTicket(callback: (ticket: string) => void): () => void;
  windowControl(action: "minimize" | "maximize" | "close"): void;
};

declare global { interface Window { station: StationBridge } }
