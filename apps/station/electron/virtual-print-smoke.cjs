const { app } = require("electron");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { selfTest, renderVirtualPdf } = require("./print-engine.cjs");

app.on("window-all-closed", () => { /* The smoke test opens two hidden windows in sequence. */ });
app.whenReady().then(async () => {
  const root = path.join(app.getPath("userData"), "virtual-print-tests");
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const first = path.join(root, `smoke-source-${randomUUID()}.pdf`);
  const output = path.join(root, `smoke-output-${randomUUID()}.pdf`);
  let exitCode = 0;
  try {
    const source = await selfTest(first);
    fsSync.writeSync(2, `Self-test PDF created: ${source.size} bytes\n`);
    const printed = await renderVirtualPdf(first, { paperSize: "A4" }, output);
    fsSync.writeSync(1, JSON.stringify({ success: true, source: first, output, sourceBytes: source.size,
      printedBytes: printed.size, printedSha256: printed.sha256 }) + "\n");
  } catch (error) {
    fsSync.writeSync(2, `Virtual print smoke test failed: ${error instanceof Error ? error.stack : error}\n`);
    exitCode = 1;
  } finally { setTimeout(() => app.exit(exitCode), 100); }
}).catch((error) => { fsSync.writeSync(2, `${error}\n`); app.exit(1); });
