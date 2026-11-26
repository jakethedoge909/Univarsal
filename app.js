// Universal File Simulator – Simulate output first, fallback to Code + Coding Helper

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const browseBtn = $("#browseBtn");
const fileList = $("#fileList");
const previewPanel = $("#previewPanel");
const previewContent = $("#previewContent");
const fileMeta = $("#fileMeta");
const toolbar = $("#toolbar");
const clearBtn = $("#clearBtn");
const installBtn = $("#installBtn");

let currentFiles = [];
let activeFile = null;
let currentMode = "auto";
let deferredPrompt = null;
let jszipLoaded = false;

// ---------- Load JSZip on demand ----------
async function ensureJSZip() {
  if (jszipLoaded || window.JSZip) {
    jszipLoaded = true;
    return window.JSZip;
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
    s.onload = () => {
      jszipLoaded = true;
      resolve(window.JSZip);
    };
    s.onerror = () => reject(new Error("Failed to load JSZip"));
    document.head.appendChild(s);
  });
}

// ---------- Install prompt ----------
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  if (outcome === "accepted") installBtn.hidden = true;
  deferredPrompt = null;
});

// ---------- Drag & drop + file input ----------
["dragenter", "dragover", "dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

["dragenter", "dragover"].forEach((evt) => {
  dropZone.addEventListener(evt, () => dropZone.classList.add("dragover"));
});

["dragleave", "drop"].forEach((evt) => {
  dropZone.addEventListener(evt, () => dropZone.classList.remove("dragover"));
});

dropZone.addEventListener("drop", (e) => {
  const files = [...e.dataTransfer.files];
  if (files.length) handleFiles(files);
});

browseBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const files = [...fileInput.files];
  if (files.length) handleFiles(files);
  fileInput.value = "";
});

clearBtn.addEventListener("click", () => {
  currentFiles = [];
  activeFile = null;
  fileList.classList.add("hidden");
  previewPanel.classList.add("hidden");
  dropZone.classList.remove("hidden");
  fileList.innerHTML = "";
  previewContent.innerHTML = "";
  fileMeta.innerHTML = "";
});

// ---------- Core handlers ----------
function handleFiles(files) {
  currentFiles = files;
  dropZone.classList.add("hidden");
  renderFileList();
  selectFile(0);
}

function renderFileList() {
  if (currentFiles.length <= 1) {
    fileList.classList.add("hidden");
    return;
  }
  fileList.classList.remove("hidden");
  fileList.innerHTML = currentFiles
    .map(
      (f, i) => `
    <div class="file-card ${i === 0 ? "active" : ""}" data-idx="${i}">
      <div class="icon">${iconFor(f)}</div>
      <div class="info">
        <div class="name">${escapeHtml(f.name)}</div>
        <div class="size">${formatSize(f.size)} · ${f.type || detectType(f.name) || "unknown"}</div>
      </div>
    </div>`
    )
    .join("");

  fileList.querySelectorAll(".file-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = +card.dataset.idx;
      selectFile(idx);
      fileList.querySelectorAll(".file-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
    });
  });
}

async function selectFile(idx) {
  activeFile = currentFiles[idx];
  previewPanel.classList.remove("hidden");
  currentMode = "auto";
  buildToolbar();
  await renderPreview();
}

// ---------- Dynamic toolbar ----------
function buildToolbar() {
  const name = (activeFile?.name || "").toLowerCase();
  const type = activeFile?.type || "";

  // Always start with Simulate attempt
  const modes = ["simulate", "code", "hex", "info"];

  if (isArchive(name, type)) modes.splice(2, 0, "contents");
  if (isExe(name)) modes.splice(2, 0, "pe");
  if (isHtml(name, type) || isJs(name, type)) modes.splice(1, 0, "preview");

  toolbar.innerHTML = modes
    .map(
      (m) =>
        `<button class="tool-btn ${m === currentMode ? "active" : ""}" data-mode="${m}">${labelForMode(m)}</button>`
    )
    .join("");
}

function labelForMode(m) {
  const map = {
    auto: "Auto",
    simulate: "▶ Simulate",
    code: "Code + Helper",
    preview: "Live Preview",
    text: "Text",
    hex: "Hex",
    json: "JSON",
    info: "Info",
    contents: "Contents",
    pe: "PE Info"
  };
  return map[m] || m;
}

toolbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tool-btn");
  if (!btn) return;
  currentMode = btn.dataset.mode;
  buildToolbar();
  renderPreview();
});

// ---------- Rendering ----------
async function renderPreview() {
  if (!activeFile) return;

  // Meta
  fileMeta.innerHTML = `
    <div>
      <div class="label">Name</div>
      <div class="value">${escapeHtml(activeFile.name)}</div>
    </div>
    <div>
      <div class="label">Size</div>
      <div class="value">${formatSize(activeFile.size)}</div>
    </div>
    <div>
      <div class="label">Type</div>
      <div class="value">${activeFile.type || detectType(activeFile.name) || "unknown"}</div>
    </div>
    <div>
      <div class="label">Last Modified</div>
      <div class="value">${new Date(activeFile.lastModified).toLocaleString()}</div>
    </div>
  `;

  previewContent.innerHTML = `<div style="color:var(--text-muted);padding:2rem;text-align:center">Loading…</div>`;

  let mode = currentMode;
  if (mode === "auto") mode = "simulate";

  try {
    if (mode === "simulate") {
      await renderSimulate(activeFile);
    } else if (mode === "preview") {
      await renderLivePreview(activeFile);
    } else if (mode === "code") {
      await renderCodeAndHelper(activeFile);
    } else if (mode === "contents") {
      await renderArchiveContents(activeFile);
    } else if (mode === "pe") {
      await renderPEInfo(activeFile);
    } else if (mode === "hex") {
      const buffer = await activeFile.arrayBuffer();
      previewContent.innerHTML = `<div class="hex">${hexDump(buffer)}</div>`;
    } else if (mode === "info") {
      const info = await gatherInfo(activeFile);
      previewContent.innerHTML = `
        <div class="info-grid">
          ${Object.entries(info)
            .map(
              ([k, v]) => `
            <div class="info-card">
              <h3>${escapeHtml(k)}</h3>
              <div>${escapeHtml(String(v))}</div>
            </div>`
            )
            .join("")}
        </div>`;
    } else {
      await renderCodeAndHelper(activeFile);
    }
  } catch (err) {
    previewContent.innerHTML = `<div style="color:var(--danger);padding:1rem">Error: ${escapeHtml(err.message)}</div>`;
  }
}

// =====================================================
//  SIMULATE – try to show the *output*, not the code
// =====================================================
async function renderSimulate(file) {
  const name = file.name.toLowerCase();
  const type = file.type || "";

  // 1. HTML → live visual output
  if (isHtml(name, type)) {
    await renderLivePreview(file);
    return;
  }

  // 2. Pure JS that looks like a simple script → try safe evaluation in sandbox
  if (isJs(name, type) && !name.endsWith(".ts") && !name.endsWith(".tsx")) {
    await renderJsSimulate(file);
    return;
  }

  // 3. Archives that may contain a web mod menu (index.html inside)
  if (isArchive(name, type)) {
    try {
      const JSZip = await ensureJSZip();
      const zip = await JSZip.loadAsync(file);
      // Look for common entry points
      const candidates = ["index.html", "menu.html", "mod.html", "ui.html", "main.html", "index.htm"];
      let found = null;
      for (const c of candidates) {
        if (zip.file(c)) {
          found = c;
          break;
        }
        // also search deeper
        const keys = Object.keys(zip.files);
        const match = keys.find(k => k.toLowerCase().endsWith("/" + c) || k.toLowerCase() === c);
        if (match) {
          found = match;
          break;
        }
      }
      if (found) {
        const html = await zip.file(found).async("string");
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        previewContent.innerHTML = `
          <div class="sim-header">
            <span class="sim-badge success">Simulated Output</span>
            <span>Found web UI inside archive: <code>${escapeHtml(found)}</code></span>
          </div>
          <iframe src="${url}" sandbox="allow-same-origin allow-scripts" title="Simulated Mod Menu" style="height:65vh;border-radius:8px;border:1px solid var(--border)"></iframe>
          <p style="margin-top:0.75rem;font-size:0.85rem;color:var(--text-muted)">
            This is a sandboxed live preview of the HTML found inside the archive.
          </p>`;
        return;
      }
    } catch (e) {
      // fall through
    }
  }

  // 4. Everything else → cannot simulate → show friendly message + Code + Helper
  await renderCannotSimulate(file);
}

async function renderCannotSimulate(file) {
  const name = file.name.toLowerCase();
  let reason = "This file type cannot be executed or visually simulated inside a browser.";
  let tip = "Switch to the <strong>Code + Helper</strong> tab to inspect the source / structure and get coding assistance.";

  if (isExe(name)) {
    reason = "Windows .exe / .dll files require a real Windows environment or a full emulator. Browsers cannot run native PE executables for security reasons.";
  } else if (name.endsWith(".apk")) {
    reason = "Android .apk packages need an Android emulator or device. A browser cannot run native Android apps.";
  } else if (name.endsWith(".jar")) {
    reason = "Java .jar files need a Java Virtual Machine (JVM). Browsers do not include a full JVM.";
  } else if (name.endsWith(".ts") || name.endsWith(".tsx")) {
    reason = "TypeScript must be compiled to JavaScript before it can run. Showing source + helper instead.";
  }

  previewContent.innerHTML = `
    <div class="cannot-sim">
      <div class="sim-icon">🚫</div>
      <h2>Simulation not available</h2>
      <p>${reason}</p>
      <p>${tip}</p>
      <button class="btn primary" id="goToCodeBtn" style="margin-top:1.25rem">Open Code + Coding Helper</button>
    </div>`;

  $("#goToCodeBtn")?.addEventListener("click", () => {
    currentMode = "code";
    buildToolbar();
    renderPreview();
  });
}

// Live HTML preview (visual output)
async function renderLivePreview(file) {
  const text = await file.text();
  const blob = new Blob([text], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  previewContent.innerHTML = `
    <div class="sim-header">
      <span class="sim-badge success">Simulated Output (Live)</span>
      <span>Sandboxed HTML/JS preview – scripts allowed but isolated</span>
    </div>
    <iframe src="${url}" sandbox="allow-same-origin allow-scripts allow-forms allow-modals" title="Live Simulation" style="height:65vh;border-radius:8px;border:1px solid var(--border)"></iframe>
  `;
}

// Try to run simple JS and capture console / output
async function renderJsSimulate(file) {
  const code = await file.text();

  // Very restricted: we only show a mock console and try to detect if it looks like a UI
  const looksLikeUI = /document\.|createElement|innerHTML|appendChild|querySelector|addEventListener/i.test(code);

  if (looksLikeUI) {
    // Wrap it in a minimal HTML page so it can produce visual output
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;background:#111;color:#eee;padding:1rem}</style></head><body>
      <div id="app"></div>
      <script>
        try {
          ${code}
        } catch(e) {
          document.body.innerHTML += '<pre style="color:#f87171">Error: ' + e.message + '</pre>';
        }
      <\/script>
    </body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    previewContent.innerHTML = `
      <div class="sim-header">
        <span class="sim-badge success">Simulated Output</span>
        <span>JS appears to manipulate the DOM – running in sandbox</span>
      </div>
      <iframe src="${url}" sandbox="allow-same-origin allow-scripts" title="JS Simulation" style="height:60vh;border-radius:8px;border:1px solid var(--border)"></iframe>
      <p style="margin-top:0.5rem;font-size:0.85rem;color:var(--text-muted)">If the script expects a full page or external libraries it may not render completely.</p>`;
  } else {
    // Non-UI script → show a simulated console output area
    previewContent.innerHTML = `
      <div class="sim-header">
        <span class="sim-badge warn">Limited Simulation</span>
        <span>This looks like a logic / Node-style script. Full execution is restricted in the browser.</span>
      </div>
      <div class="console-sim">
        <div class="console-title">Simulated Console</div>
        <pre id="simConsole">// Ready to inspect. Use Code + Helper for analysis.
 // Arbitrary Node.js or system APIs cannot run here.</pre>
      </div>
      <button class="btn secondary" id="goToCodeBtn2" style="margin-top:1rem">Open Code + Coding Helper</button>`;
    $("#goToCodeBtn2")?.addEventListener("click", () => {
      currentMode = "code";
      buildToolbar();
      renderPreview();
    });
  }
}

// =====================================================
//  CODE + CODING HELPER
// =====================================================
async function renderCodeAndHelper(file) {
  const name = file.name.toLowerCase();
  let source = "";
  let language = "text";
  let isBinary = false;

  // Try to get text if it looks like source
  if (
    isJs(name, file.type) ||
    isHtml(name, file.type) ||
    /\.(ts|tsx|jsx|css|json|xml|txt|md|py|java|c|cpp|h|cs|php|rb|go|rs|kt|swift|lua|sql|yml|yaml)$/i.test(name) ||
    (file.type && file.type.startsWith("text/"))
  ) {
    try {
      source = await file.text();
      language = detectLanguage(name, file.type);
    } catch {
      isBinary = true;
    }
  } else {
    isBinary = true;
  }

  if (isBinary) {
    // For binaries show extracted strings + helper notes
    const buffer = await file.arrayBuffer();
    const strings = extractStrings(new Uint8Array(buffer));
    const peExtra = isExe(name) ? await getPESummary(file) : null;

    previewContent.innerHTML = `
      <div class="code-helper-layout">
        <div class="code-pane">
          <div class="pane-header">Extracted Strings / Readable Data</div>
          <pre class="code-block">${escapeHtml(strings.slice(0, 8000) || "(no readable strings found)")}</pre>
        </div>
        <div class="helper-pane">
          <div class="pane-header">Coding Helper</div>
          <div class="helper-content">
            ${peExtra || ""}
            <h4>File type</h4>
            <p>${escapeHtml(detectType(name) || file.type || "Binary")}</p>
            <h4>What you can do</h4>
            <ul>
              <li>Use the <strong>Hex</strong> tab for full binary view</li>
              <li>Use <strong>PE Info</strong> (if .exe/.dll) for structure</li>
              <li>Use <strong>Contents</strong> (if archive) to browse files</li>
            </ul>
            <h4>Tips</h4>
            <p>Many mod menus ship as .apk / .jar / .exe. The real UI is usually inside resources or a webview. Check the Contents or extracted strings for HTML/JS/CSS assets.</p>
          </div>
        </div>
      </div>`;
    return;
  }

  // Source code + helper analysis
  const analysis = analyzeCode(source, language, name);

  previewContent.innerHTML = `
    <div class="code-helper-layout">
      <div class="code-pane">
        <div class="pane-header">${escapeHtml(language.toUpperCase())} Source</div>
        <pre class="code-block">${escapeHtml(source)}</pre>
      </div>
      <div class="helper-pane">
        <div class="pane-header">Coding Helper</div>
        <div class="helper-content">
          ${analysis}
        </div>
      </div>
    </div>`;
}

function analyzeCode(source, language, filename) {
  const lines = source.split("\n");
  const lineCount = lines.length;
  const sizeKb = (source.length / 1024).toFixed(1);

  // Simple heuristics
  const functions = (source.match(/function\s+\w+|=>\s*{|\w+\s*=\s*\([^)]*\)\s*=>/g) || []).length;
  const classes = (source.match(/class\s+\w+/g) || []).length;
  const imports = (source.match(/import\s+.+from|require\s*\(/g) || []).length;
  const hasDOM = /document\.|querySelector|getElementById|createElement|innerHTML/i.test(source);
  const hasCanvas = /getContext\s*\(\s*['"]2d['"]|WebGL|canvas/i.test(source);
  const hasFetch = /fetch\s*\(|XMLHttpRequest|axios/i.test(source);
  const uiKeywords = (source.match(/menu|button|toggle|checkbox|slider|overlay|panel|modal|gui|hud/gi) || []).length;

  let html = `
    <h4>Overview</h4>
    <p>${lineCount} lines · ${sizeKb} KB · ${escapeHtml(language)}</p>
    <h4>Detected patterns</h4>
    <ul>
      <li>Functions / arrows: <strong>${functions}</strong></li>
      <li>Classes: <strong>${classes}</strong></li>
      <li>Imports / requires: <strong>${imports}</strong></li>
      ${hasDOM ? "<li>✅ DOM / UI manipulation</li>" : ""}
      ${hasCanvas ? "<li>✅ Canvas / graphics</li>" : ""}
      ${hasFetch ? "<li>✅ Network requests</li>" : ""}
      ${uiKeywords > 3 ? `<li>✅ Likely UI / mod-menu style code (${uiKeywords} UI-related words)</li>` : ""}
    </ul>`;

  // Quick tips based on type
  if (language === "javascript" || language === "typescript") {
    html += `
      <h4>Helper tips</h4>
      <ul>
        <li>If this is a mod menu, look for event listeners on buttons and for <code>innerHTML</code> or framework render calls.</li>
        <li>Search for strings that look like menu labels (they often appear in arrays or objects).</li>
        <li>TypeScript files need compilation (<code>tsc</code>) before they can run in a browser.</li>
      </ul>`;
  } else if (language === "html") {
    html += `
      <h4>Helper tips</h4>
      <ul>
        <li>Use the <strong>▶ Simulate</strong> or <strong>Live Preview</strong> tab to see the visual result.</li>
        <li>Check linked CSS/JS files if this is part of a larger mod.</li>
      </ul>`;
  } else {
    html += `
      <h4>Helper tips</h4>
      <p>This appears to be ${escapeHtml(language)} source. Use the Simulate tab first – if it cannot run, this helper view is the best place to inspect logic.</p>`;
  }

  // Extract possible menu labels (quoted strings that look like UI)
  const labels = [...source.matchAll(/["'`]([^"'`]{3,40})["'`]/g)]
    .map(m => m[1])
    .filter(s => /menu|hack|god|fly|speed|aim|esp|wall|silent|mod|cheat|toggle|enable|disable/i.test(s) || s.length < 25)
    .slice(0, 12);

  if (labels.length) {
    html += `
      <h4>Possible UI / menu strings</h4>
      <div class="tag-list">${labels.map(l => `<span class="tag">${escapeHtml(l)}</span>`).join("")}</div>`;
  }

  return html;
}

function extractStrings(bytes, minLen = 5) {
  let result = "";
  let current = "";
  for (let i = 0; i < Math.min(bytes.length, 2_000_000); i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= minLen) result += current + "\n";
      current = "";
    }
  }
  if (current.length >= minLen) result += current;
  return result;
}

async function getPESummary(file) {
  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) return "";
    const peOffset = view.getUint32(0x3c, true);
    const machine = view.getUint16(peOffset + 4, true);
    const machines = { 0x14c: "x86", 0x8664: "x64", 0xaa64: "ARM64" };
    return `<h4>PE Quick Info</h4><p>Machine: ${machines[machine] || "0x" + machine.toString(16)}</p>`;
  } catch {
    return "";
  }
}

// ---------- Archive contents ----------
async function renderArchiveContents(file) {
  try {
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(file);
    const entries = [];
    zip.forEach((relativePath, entry) => {
      entries.push({
        name: relativePath,
        dir: entry.dir,
        size: entry._data?.uncompressedSize ?? 0
      });
    });
    entries.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const rows = entries
      .map(
        (e) => `
      <tr>
        <td style="padding:0.35rem 0.6rem">${e.dir ? "📁" : "📄"}</td>
        <td style="padding:0.35rem 0.6rem;word-break:break-all">${escapeHtml(e.name)}</td>
        <td style="padding:0.35rem 0.6rem;text-align:right;color:var(--text-muted)">${e.dir ? "—" : formatSize(e.size)}</td>
      </tr>`
      )
      .join("");

    previewContent.innerHTML = `
      <div style="margin-bottom:0.75rem;font-size:0.9rem">
        <strong>${entries.length}</strong> entries
        ${file.name.toLowerCase().endsWith(".apk") ? " · Android Package" : ""}
        ${file.name.toLowerCase().endsWith(".jar") ? " · Java Archive" : ""}
      </div>
      <div style="overflow:auto;max-height:60vh">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead>
            <tr style="border-bottom:1px solid var(--border);color:var(--text-muted)">
              <th style="padding:0.4rem 0.6rem"></th>
              <th style="padding:0.4rem 0.6rem;text-align:left">Name</th>
              <th style="padding:0.4rem 0.6rem;text-align:right">Size</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    previewContent.innerHTML = `<div style="color:var(--danger)">Could not read archive: ${escapeHtml(err.message)}</div>`;
  }
}

// ---------- PE Info ----------
async function renderPEInfo(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const info = {};

  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    previewContent.innerHTML = `<div style="color:var(--danger)">Not a valid PE/MZ executable</div>`;
    return;
  }
  info["DOS Signature"] = "MZ";
  const peOffset = view.getUint32(0x3c, true);
  info["PE Header Offset"] = "0x" + peOffset.toString(16);

  const machine = view.getUint16(peOffset + 4, true);
  const machines = { 0x14c: "i386 (x86)", 0x8664: "x86-64", 0xaa64: "ARM64", 0x1c0: "ARM" };
  info["Machine"] = machines[machine] || `0x${machine.toString(16)}`;
  info["Number of Sections"] = view.getUint16(peOffset + 6, true);
  const timestamp = view.getUint32(peOffset + 8, true);
  info["Timestamp"] = timestamp ? new Date(timestamp * 1000).toISOString() : "0";

  const magic = view.getUint16(peOffset + 24, true);
  info["Format"] = magic === 0x10b ? "PE32" : magic === 0x20b ? "PE32+" : "unknown";
  if (magic === 0x10b || magic === 0x20b) {
    info["Entry Point RVA"] = "0x" + view.getUint32(peOffset + 40, true).toString(16);
  }

  previewContent.innerHTML = `
    <div class="info-grid" style="margin-bottom:1.5rem">
      ${Object.entries(info)
        .map(([k, v]) => `
        <div class="info-card">
          <h3>${escapeHtml(k)}</h3>
          <div>${escapeHtml(String(v))}</div>
        </div>`).join("")}
    </div>
    <h3 style="margin-bottom:0.5rem;font-size:0.95rem">Header Hex (first 512 bytes)</h3>
    <div class="hex">${hexDump(buffer.slice(0, 512))}</div>`;
}

// ---------- Detection helpers ----------
function isArchive(name, type) {
  return (
    /\.(zip|jar|apk|war|ear|aar|nupkg|docx|xlsx|pptx)$/i.test(name) ||
    type === "application/zip" ||
    type === "application/java-archive" ||
    type === "application/vnd.android.package-archive"
  );
}

function isHtml(name, type) {
  return type === "text/html" || /\.(html?|xhtml)$/i.test(name);
}

function isJs(name, type) {
  return (
    type.includes("javascript") ||
    type.includes("typescript") ||
    /\.(js|mjs|cjs|ts|tsx|jsx)$/i.test(name)
  );
}

function isExe(name) {
  return /\.(exe|dll|sys|scr|ocx)$/i.test(name);
}

function detectLanguage(name, type) {
  if (/\.tsx?$/.test(name)) return "typescript";
  if (/\.jsx?$|\.mjs$|\.cjs$/.test(name)) return "javascript";
  if (/\.html?$/.test(name)) return "html";
  if (/\.css$/.test(name)) return "css";
  if (/\.json$/.test(name)) return "json";
  if (/\.py$/.test(name)) return "python";
  if (/\.java$/.test(name)) return "java";
  return "text";
}

function detectType(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  const map = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
    mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
    json: "application/json", txt: "text/plain", html: "text/html", htm: "text/html",
    js: "text/javascript", mjs: "text/javascript", ts: "text/typescript",
    css: "text/css", md: "text/markdown",
    jar: "application/java-archive",
    apk: "application/vnd.android.package-archive",
    zip: "application/zip",
    exe: "application/vnd.microsoft.portable-executable",
    dll: "application/vnd.microsoft.portable-executable"
  };
  return map[ext] || "";
}

function iconFor(file) {
  const name = file.name.toLowerCase();
  if (isExe(name)) return "⚙️";
  if (name.endsWith(".jar")) return "☕";
  if (name.endsWith(".apk")) return "🤖";
  if (isArchive(name, file.type)) return "📦";
  if (isHtml(name, file.type)) return "🌐";
  if (/\.(js|mjs|cjs)$/i.test(name)) return "📜";
  if (/\.(ts|tsx)$/i.test(name)) return "💙";
  return "📁";
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hexDump(buffer, bytesPerLine = 16) {
  const bytes = new Uint8Array(buffer);
  const lines = [];
  const max = Math.min(bytes.length, 128 * 1024);

  for (let i = 0; i < max; i += bytesPerLine) {
    const slice = bytes.slice(i, i + bytesPerLine);
    const offset = i.toString(16).padStart(8, "0");
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(bytesPerLine * 3 - 1, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`<span class="offset">${offset}</span>${hex}<span class="ascii">${escapeHtml(ascii)}</span>`);
  }
  if (bytes.length > max) {
    lines.push(`\n… (${formatSize(bytes.length - max)} more not shown)`);
  }
  return lines.join("\n");
}

async function gatherInfo(file) {
  const info = {
    "File name": file.name,
    Size: formatSize(file.size),
    "MIME type": file.type || detectType(file.name) || "n/a",
    "Last modified": new Date(file.lastModified).toISOString(),
    Extension: file.name.includes(".") ? "." + file.name.split(".").pop() : "none"
  };
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    info["SHA-256"] = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    info["SHA-256"] = "not available";
  }
  return info;
}

// ---------- Service Worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(console.error);
  });
}

dropZone.addEventListener("click", (e) => {
  if (e.target === dropZone || e.target.closest(".drop-content")) {
    fileInput.click();
  }
});
