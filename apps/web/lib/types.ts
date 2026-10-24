export type OrderStatus = "ready" | "shared" | "opened" | "processing" | "printed" | "expired" | "revoked";
export type PrintOptions = {
  paperSize: "A4" | "A3" | "Letter";
  color: "bw" | "color";
  copies: number;
  sides: "single" | "double";
  finishing: "none" | "staple" | "bind";
};
export type Order = {
  id: string;
  token: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  note: string;
  options: PrintOptions;
  pin?: string;
  createdAt: string;
  expiresAt: string;
  status: OrderStatus;
  chainTxHash?: string;
  deletionEvidenceHash?: string;
  attestationTxHash?: string;
  deletedAt?: string;
  printMode?: "operator_attested" | "virtual_pdf_test";
  virtualOutputHash?: string;
};
export type User = { name: string; email: string; picture?: string; walletAddress?: string | null };
