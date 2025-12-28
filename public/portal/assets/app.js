window.__KIOSKOPS_APP_LOADED__ = true;
/* ============================
   v3.1 Clean-Structure Patch
   Goal: Make ALL links/buttons work with the new folder layout:
   - docs/
   - templates/
   - data/
   Works in both file:// and http://localhost server mode.
   ============================ */

(function(){
  const MAP = {
    // Docs
    "BrandM3dia_Kiosk_Field_Execution_Guide.pdf": "docs/BrandM3dia_Kiosk_Field_Execution_Guide.pdf",
    "BrandM3dia_Kiosk_Field_Execution_Guide.docx": "docs/BrandM3dia_Kiosk_Field_Execution_Guide.docx",
    "BrandM3dia_Kiosk_Scenario_Router.pdf": "docs/BrandM3dia_Kiosk_Scenario_Router.pdf",

    // Templates
    "windows_kiosk_setup.ps1": "templates/windows_kiosk_setup.ps1",
    "android_kiosk_setup_adb.sh": "templates/android_kiosk_setup_adb.sh",

    // Data
    "portal.config.json": "data/portal.config.json"
  };

  function isAbsolute(u){
    return /^https?:\/\//i.test(u) || /^mailto:/i.test(u) || /^tel:/i.test(u) || u.startsWith("#");
  }

  window.resolvePortalPath = function(url){
    try{
      if(!url || typeof url !== "string") return url;
      let u = url.trim();
      if(!u) return u;
      if(isAbsolute(u)) return u;

      // strip leading ./ 
      if(u.startsWith("./")) u = u.slice(2);

      // already structured
      if(/^(docs|templates|data|assets|scripts)\//i.test(u)) return u;

      // map known filenames
      if(MAP[u]) return MAP[u];

      // Heuristic: common doc/template extensions -> route to expected folders if filename matches.
      if(/\.(pdf|docx)$/i.test(u)) return "docs/" + u;
      if(/\.(ps1|bat|sh)$/i.test(u)) return "templates/" + u;

      return u;
    }catch(e){
      return url;
    }
  };

  // Wrap window.open so button handlers that use it get fixed automatically.
  const _open = window.open;
  window.open = function(url, target, features){
    const resolved = window.resolvePortalPath(url);
    return _open.call(window, resolved, target, features);
  };

  // Intercept <a href="..."> clicks to fix paths before navigation.
  document.addEventListener("click", function(ev){
    const a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
    if(!a) return;
    const href = a.getAttribute("href");
    if(!href) return;
    const resolved = window.resolvePortalPath(href);
    if(resolved && resolved !== href){
      ev.preventDefault();
      const tgt = a.getAttribute("target");
      if(tgt === "_blank"){
        window.open(resolved, "_blank");
      }else{
        window.location.href = resolved;
      }
    }
  }, true);

})();


// ===============================
    // Admin Controls (PIN-protected)
    // ===============================
    const ADMIN_PIN_HASH_KEY = "bm3_admin_pin_hash_v2";
    const EDITOR_PIN_HASH_KEY = "bm3_editor_pin_hash_v2";
    const ADMIN_UNLOCK_KEY = "bm3_unlocked_role_v2"; // sessionStorage: "admin" | "editor"
    const ADMIN_SALT = "BM3-KioskOps-Portal";

    const READ_ONLY_KEY = "bm3_portal_readonly_v1"; // localStorage (shared on this machine)

    function toastOrAlert(msg){
      try{
        if(typeof openToast === "function"){ openToast(msg); return; }
      }catch(e){}
      alert(msg);
    }

    function isReadOnly(){
      try{ return (localStorage.getItem(READ_ONLY_KEY) || "1") === "1"; }catch(e){ return true; }
    }

    function setReadOnly(v){
      try{ localStorage.setItem(READ_ONLY_KEY, v ? "1" : "0"); }catch(e){}
      updatePortalModeUI();
    }

    function toggleReadOnly(){
      // Only Admin can change read-only mode
      return requireRole("Change portal mode", "admin", ()=>{
        setReadOnly(!isReadOnly());
        try{ logAudit("PORTAL_MODE_TOGGLE", {readonly: isReadOnly()}); }catch(e){}
      });
    }

    function updatePortalModeUI(){
      const badge = document.getElementById("portalModeBadge");
      const ro = isReadOnly();
      if(badge){
        badge.textContent = ro ? "Mode: Read‑Only" : "Mode: Editable";
        badge.style.borderColor = ro ? "#f59e0b" : "#16a34a";
      }
      // Hide edit controls in read-only (UX). Enforcement is in requireEditable().
      document.querySelectorAll("[data-edit='1']").forEach(el=>{
        el.style.display = ro ? "none" : "";
      });
    }


    let __adminPendingCb = null;
    let __adminPendingAction = "—";

    function getRole(){
      return sessionStorage.getItem(ADMIN_UNLOCK_KEY) || "";
    }
    function isAdmin(){
      return getRole() === "admin";
    }
    function isEditor(){
      return getRole() === "editor";
    }
    function hasAnyRole(){
      const r = getRole();
      return r === "admin" || r === "editor";
    }

    function updateAdminUI(){
      const badge = document.getElementById("adminBadge");
      const statusLine = document.getElementById("adminStatusLine");
      const pending = document.getElementById("adminPendingAction");
      const unlocked = isAdmin();

      if(badge){
        badge.textContent = unlocked ? "Admin: Unlocked" : "Admin: Locked";
        badge.style.borderColor = unlocked ? "#16a34a" : "#334155";
      }
      if(statusLine){
        statusLine.innerHTML = unlocked ? 'Admin is <b style="color:#22c55e;">UNLOCKED</b>.' : 'Admin is <b style="color:#f59e0b;">LOCKED</b>.';
      }
      if(pending){
        pending.textContent = __adminPendingAction || "—";
      }
    }

    function openAdminModal(actionLabel, cb){
      __adminPendingAction = actionLabel || "—";
      __adminPendingCb = (typeof cb === "function") ? cb : null;
      const m = document.getElementById("adminModal");
      if(m) m.classList.remove("hidden");
      const msg = document.getElementById("adminUnlockMsg"); if(msg) msg.textContent = "";
      const msg2 = document.getElementById("adminSetMsg"); if(msg2) msg2.textContent = "";
      updateAdminUI();
    }

    function closeAdminModal(){
      const m = document.getElementById("adminModal");
      if(m) m.classList.add("hidden");
      __adminPendingCb = null;
      __adminPendingAction = "—";
      updateAdminUI();
    }

    function lockAdmin(){
      sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
      updateAdminUI();
    }

    async function sha256Hex(str){
      // Uses SubtleCrypto where available (offline-safe in modern browsers)
      if(window.crypto && window.crypto.subtle){
        const enc = new TextEncoder().encode(str);
        const digest = await window.crypto.subtle.digest("SHA-256", enc);
        return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,"0")).join("");
      }
      // Fallback (not cryptographic): last resort for older browsers
      let h = 0; for(let i=0;i<str.length;i++){ h = Math.imul(31,h) + str.charCodeAt(i) | 0; }
      return "fallback-" + String(h);
    }

    async function getStoredPinHash(){
      try{ return localStorage.getItem(ADMIN_PIN_HASH_KEY) || ""; }catch(e){ return ""; }
    }

    async function setStoredPinHash(hash){
      localStorage.setItem(ADMIN_PIN_HASH_KEY, hash);
    }

    
    async function getStoredEditorPinHash(){
      try{ return localStorage.getItem(EDITOR_PIN_HASH_KEY) || ""; }catch(e){ return ""; }
    }
    async function setStoredEditorPinHash(hash){
      localStorage.setItem(EDITOR_PIN_HASH_KEY, hash);
    }

async function attemptAdminUnlock(){
      const pin = (document.getElementById("adminPin")||{}).value || "";
      const roleSel = (document.getElementById("unlockRole")||{}).value || "editor";
      const msg = document.getElementById("adminUnlockMsg");

      if(pin.trim().length < 4){
        if(msg) msg.textContent = "PIN must be at least 4 characters.";
        return;
      }

      const hash = await sha256Hex(ADMIN_SALT + pin.trim());

      if(roleSel === "admin"){
        const stored = await getStoredPinHash();
        if(!stored){
          if(msg) msg.textContent = "No Admin PIN is set yet. Set it using “Set / Reset PIN” (trusted admin machine).";
          return;
        }
        if(hash !== stored){
          if(msg) msg.textContent = "Incorrect Admin PIN.";
          return;
        }
        sessionStorage.setItem(ADMIN_UNLOCK_KEY, "admin");
        if(msg) msg.textContent = "Unlocked as Admin.";
      }else{
        const storedE = await getStoredEditorPinHash();
        if(!storedE){
          if(msg) msg.textContent = "No Editor PIN is set yet. Ask an Admin to set it.";
          return;
        }
        if(hash !== storedE){
          if(msg) msg.textContent = "Incorrect Editor PIN.";
          return;
        }
        sessionStorage.setItem(ADMIN_UNLOCK_KEY, "editor");
        if(msg) msg.textContent = "Unlocked as Editor.";
      }

      updateAdminUI();
      updatePortalModeUI();
      try{ logAudit("ROLE_UNLOCK", {role: (getRole&&getRole())||""}); }catch(e){}

      if(__adminPendingCb){
        const cb = __adminPendingCb;
        const action = __adminPendingAction;
        __adminPendingCb = null;
        __adminPendingAction = "—";
        try{ cb(); }catch(e){ console.warn("Pending action failed:", action, e); }
      }
    }

    async function resetAdminPin(){
      const current = ((document.getElementById("adminPinCurrent")||{}).value || "").trim();
      const pin1 = ((document.getElementById("adminPinNew")||{}).value || "").trim();
      const pin2 = ((document.getElementById("adminPinNew2")||{}).value || "").trim();
      const msg = document.getElementById("adminSetMsg");

      if(pin1.length < 4){
        if(msg) msg.textContent = "New PIN must be at least 4 characters.";
        return;
      }
      if(pin1 !== pin2){
        if(msg) msg.textContent = "New PIN + Confirm PIN do not match.";
        return;
      }

      const stored = await getStoredPinHash();
      if(stored){
        // Verify current PIN before allowing reset
        const curHash = await sha256Hex(ADMIN_SALT + current);
        if(curHash !== stored){
          if(msg) msg.textContent = "Current PIN is incorrect. Cannot reset.";
          return;
        }
      }else{
        // No stored PIN: allow set without current
        if(current){
          // ignore
        }
      }

      const newHash = await sha256Hex(ADMIN_SALT + pin1);
      await setStoredPinHash(newHash);
      sessionStorage.setItem(ADMIN_UNLOCK_KEY, "admin");
      if(msg) msg.textContent = "Admin PIN updated. Admin is now unlocked for this session.";
      updateAdminUI();
    }

    async function resetEditorPin(){
      const adminPin = ((document.getElementById("adminPinForEditor")||{}).value || "").trim();
      const pin1 = ((document.getElementById("editorPinNew")||{}).value || "").trim();
      const pin2 = ((document.getElementById("editorPinNew2")||{}).value || "").trim();
      const msg = document.getElementById("editorSetMsg");

      if(pin1.length < 4){
        if(msg) msg.textContent = "New Editor PIN must be at least 4 characters.";
        return;
      }
      if(pin1 !== pin2){
        if(msg) msg.textContent = "Editor PIN + Confirm do not match.";
        return;
      }

      const storedAdmin = await getStoredPinHash();
      if(!storedAdmin){
        if(msg) msg.textContent = "Admin PIN is not set. Set Admin PIN first.";
        return;
      }
      const adminHash = await sha256Hex(ADMIN_SALT + adminPin);
      if(adminHash !== storedAdmin){
        if(msg) msg.textContent = "Admin PIN is incorrect. Cannot set Editor PIN.";
        return;
      }

      const newHash = await sha256Hex(ADMIN_SALT + pin1);
      await setStoredEditorPinHash(newHash);
      if(msg) msg.textContent = "Editor PIN updated successfully.";
    }


    function requireRole(actionLabel, minRole, cb){
      const role = getRole();
      const ok = (minRole === "admin") ? (role === "admin") : (role === "admin" || role === "editor");
      if(ok){
        return cb();
      }
      openAdminModal(actionLabel || "Protected action", cb);
      return null;
    }

    function requireEditable(actionLabel, minRole, cb){
      if(isReadOnly()){
        toastOrAlert("Portal is in Read‑Only mode. Ask Admin to switch to Editable.");
        return null;
      }
      return requireRole(actionLabel, minRole, cb);
    }

    function show(id) {
      // hide all sections
      document.querySelectorAll('main section').forEach(s => { s.classList.remove('active'); s.style.display = ''; });
      const el = document.getElementById(id);
      if (el) { el.classList.add('active'); el.style.display = ''; }


      // update nav button active
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(btn => {
        const onclick = btn.getAttribute('onclick') || '';
        if (onclick.includes("'" + id + "'")) btn.classList.add('active');
      });

      // close sidebar on mobile
      if (window.innerWidth <= 1024) {
        toggleSidebar(true);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function toggleSidebar(forceClose) {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('overlay');
      const isOpen = sidebar.classList.contains('open');
      const shouldClose = forceClose === true || isOpen;
      if (shouldClose) {
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      } else {
        sidebar.classList.add('open');
        overlay.classList.add('show');
      }
    }

    function filterNav() {
      const q = (document.getElementById('navSearch').value || '').toLowerCase().trim();
      document.querySelectorAll('#nav .nav-btn').forEach(btn => {
        const title = (btn.getAttribute('data-title') || btn.textContent || '').toLowerCase();
        btn.style.display = title.includes(q) ? 'flex' : 'none';
      });
      document.querySelectorAll('#nav .nav-title').forEach(t => t.style.display = q ? 'none' : 'block');
    }

    function copyFrom(id) {
      const el = document.getElementById(id);
      if (!el) return;
      const text = el.innerText || el.textContent || '';
      // Try Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      } else {
        fallbackCopy(text);
      }
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    }

    function saveField(el) {
      const key = "kioskops:" + el.id;
      let val = "";
      if (el.type === "checkbox") val = el.checked;
      else val = el.value;
      localStorage.setItem(key, String(val));
    }

    function restoreField(el) {
      const key = "kioskops:" + el.id;
      const v = localStorage.getItem(key);
      if (v === null) return;
      if (el.type === "checkbox") el.checked = (v === "true");
      else el.value = v;
    }

    function resetAll() {
      if (!confirm("Reset all saved checkboxes/notes for this portal?")) return;
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("kioskops:")) localStorage.removeItem(k);
      });
      location.reload();
    }


    
    function copyToClipboard(text){
      const t = (text || "").toString();
      if(!t){ toastOrAlert("Nothing to copy."); return; }
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(t).then(()=>toast("Copied")).catch(()=>fallbackCopy(t));
      } else { fallbackCopy(t); }
      function fallbackCopy(v){
        const ta = document.createElement("textarea");
        ta.value = v; document.body.appendChild(ta);
        ta.select(); ta.setSelectionRange(0, 999999);
        try{ document.execCommand("copy"); toast("Copied"); }catch(e){ toastOrAlert("Copy failed"); }
        document.body.removeChild(ta);
      }
    }

    function openUrl(url){
      const u = (url || "").trim();
      if(!u){ toastOrAlert("No URL provided."); return; }
      const a = document.createElement("a");
      a.href = u;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

function escapeHtml(str){
      return (str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
    }

    function toPrintableClone(sectionEl){
      const clone = sectionEl.cloneNode(true);

      // Remove interactive-only elements inside clone
      clone.querySelectorAll('button, .btn, .alert').forEach(el => el.remove());

      // Replace form fields with readable text
      clone.querySelectorAll('input, select, textarea').forEach(el => {
        let text = "";
        if (el.type === "checkbox") text = el.checked ? "☑" : "☐";
        else if (el.tagName === "SELECT") text = (el.value || "").trim();
        else text = (el.value || "").trim();

        const span = document.createElement("span");
        span.className = "field-value";
        span.textContent = text || "—";
        el.replaceWith(span);
      });

      // Remove nav anchors if any
      clone.querySelectorAll('a').forEach(a => {
        const span = document.createElement("span");
        span.textContent = a.textContent || a.getAttribute("href") || "";
        a.replaceWith(span);
      });

      return clone;
    }

    function buildPrintArea(scope){
      const pa = document.getElementById("printArea");
      pa.innerHTML = "";

      const date = v('t_date') || new Date().toISOString().slice(0,10);
      const time = new Date().toLocaleString();
      const client = v('t_client') || "—";
      const project = v('t_project') || "—";
      const model = v('t_model') || "—";
      const serial = v('t_serial') || "—";
      const location = v('t_location') || "—";
      const tech = v('t_tech') || "—";

      const h = document.createElement("div");
      h.innerHTML = `
        <h1>Kiosk Deployment Checklist Report</h1>
        <div class="small">Generated: ${escapeHtml(time)} • Scope: ${escapeHtml(scope.toUpperCase())}</div>
        <div class="small"><strong>Suggested filename:</strong> ${escapeHtml(makePdfFileBase(scope))}.pdf</div>
        <div class="meta-grid">
          <div><strong>Client/Event:</strong> ${escapeHtml(client)}</div>
          <div><strong>Project Code:</strong> ${escapeHtml(project)}</div>
          <div><strong>Model:</strong> ${escapeHtml(model)}</div>
          <div><strong>Serial:</strong> ${escapeHtml(serial)}</div>
          <div><strong>Location:</strong> ${escapeHtml(location)}</div>
          <div><strong>Technician:</strong> ${escapeHtml(tech)}</div>
          <div><strong>Date:</strong> ${escapeHtml(date)}</div>
          <div><strong>Upload To:</strong> Basecamp “Deployment Start” post</div>
        </div>
        <div class="small"><strong>How to save:</strong> In the print dialog, select <em>Save as PDF</em>. Then upload the PDF to Basecamp.</div>
      `;
      pa.appendChild(h);

      const sectionsFull = ["physical","compliance","power","health","baseline","kiosk","content","qa","handover"];
      const sectionsQA = ["health","kiosk","qa","handover"];
      const ids = (scope === "full") ? sectionsFull : sectionsQA;

      ids.forEach(id => {
        const s = document.getElementById(id);
        if (!s) return;
        const title = document.createElement("h2");
        title.textContent = (s.querySelector("h2")?.textContent || ("Section: " + id));
        pa.appendChild(title);
        const clone = toPrintableClone(s);
        // remove duplicate header inside clone for cleaner PDF
        const h2 = clone.querySelector("h2");
        if (h2) h2.remove();
        pa.appendChild(clone);
      });

      const footer = document.createElement("div");
      footer.className = "pagebreak";
      footer.innerHTML = `
        <h2>Sign-Off</h2>
        <table>
          <tr><th style="width:25%;">Technician Name</th><td>${escapeHtml(tech)}</td></tr>
          <tr><th>Technician Signature</th><td style="height:28px;"></td></tr>
          <tr><th>Client/PM Name</th><td style="height:28px;"></td></tr>
          <tr><th>Client/PM Signature</th><td style="height:28px;"></td></tr>
        </table>
        <div class="small">Attach this PDF to Basecamp. If any test failed, include the issue ticket link and photos.</div>
      `;
      pa.appendChild(footer);
    }

    let _prevTitle = "";
    function savePdf(scope){
      try{ logAudit("PDF_EXPORT_SCOPE", {scope: scope||"qa"}); }catch(e){}
      scope = scope || "qa";

      // Mark “Export QA as PDF” as done when using the button
      const qaPdf = document.getElementById("qa_log2");
      if (qaPdf) {
        qaPdf.checked = true;
        localStorage.setItem("kioskops:qa_log2", "true");
      }
      _prevTitle = document.title;
      document.title = makePdfFileBase(scope);

      // Note: Most browsers use the page title as the default PDF filename in the Save dialog.

      buildPrintArea(scope);
      document.body.classList.add("printing");
      window.print();
    }

    window.addEventListener("afterprint", () => {
      document.body.classList.remove("printing");
      if (_prevTitle) document.title = _prevTitle;
    });


    function exportReport() {
      try{ logAudit("REPORT_EXPORT", {}); }catch(e){}
      // export stored kioskops keys to a text file
      const keys = Object.keys(localStorage).filter(k => k.startsWith("kioskops:")).sort();
      const lines = [];
      lines.push("BrandM3dia KioskOps Offline Report");
      lines.push("Generated: " + new Date().toISOString());
      lines.push("--------------------------------------------------");
      keys.forEach(k => {
        lines.push(k.replace("kioskops:", "") + ": " + localStorage.getItem(k));
      });
      const blob = new Blob([lines.join("\n")], { type: "text/plain" });
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0,10);
      a.download = "kioskops_report_" + date + ".txt";
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    }

    function generateBasecamp() {
      const client = v('t_client'), project = v('t_project'), model = v('t_model'), serial = v('t_serial');
      const location = v('t_location'), tech = v('t_tech'), date = v('t_date') || new Date().toISOString().slice(0,10);
      const notes = v('t_notes');
      const out = [
        "[Deployment Start – " + serial + " – " + client + " – " + date + "]",
        "",
        "Project Code: " + project,
        "Model: " + model,
        "Serial: " + serial,
        "Location: " + location,
        "Field Tech: " + tech,
        "",
        "Photos to attach:",
        "- Flycase (all sides)",
        "- Kiosk out of case",
        "- Service panel open",
        "- Accessories laid out",
        "",
        "Notes:",
        notes || "(none)",
      ].join("\n");
      set('basecamp_out', out);
    }

    function generateETL() {
      const model = v('t_model'), serial = v('t_serial'), location = v('t_location');
      const date = v('t_date') || new Date().toISOString().slice(0,10);
      const out = [
        "Subject: ETL Certification Request – " + model + " – " + serial,
        "",
        "Model: " + model,
        "Serial: " + serial,
        "Current location: " + location,
        "Deployment date: " + date,
        "",
        "Notes: New unit, first deployment provisioning. Please confirm ETL certification status and approval to deploy.",
        "Photos attached: serial label + certification label (if present)."
      ].join("\n");
      set('etl_out', out);
    }

    function generateAsset() {
      const client = v('t_client'), project = v('t_project'), model = v('t_model'), serial = v('t_serial');
      const location = v('t_location'), status = v('t_status'), notes = v('t_notes');
      const out = [
        "Asset Portal Update (asset.bm3group.com)",
        "",
        "Serial: " + serial,
        "Model: " + model,
        "Status: " + status,
        "Location: " + location,
        "Assigned project: " + project,
        "Client/Event: " + client,
        "Notes: " + (notes || "(none)"),
        "",
        "Photos to upload: flycase, kiosk, service panel, accessories."
      ].join("\n");
      set('asset_out', out);
    }

    function v(id) {
      const el = document.getElementById(id);
      return el ? (el.value || "").trim() : "";
    }
    function set(id, text) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }

    
    // --- PDF filename helpers (offline-safe) ---
    function slugify(input, maxLen){
      input = (input || "").toString().trim();
      // Replace spaces with underscores
      input = input.replace(/\s+/g, "_");
      // Remove characters that break filenames on Windows/macOS
      input = input.replace(/[^a-zA-Z0-9_\-\.]/g, "");
      // Collapse multiple underscores
      input = input.replace(/_+/g, "_");
      if (maxLen && input.length > maxLen) input = input.slice(0, maxLen);
      return input || "UNKNOWN";
    }

    function yyyymmdd(dateStr){
      // Accept YYYY-MM-DD or ISO; fallback today
      const d = dateStr ? new Date(dateStr) : new Date();
      const yyyy = d.getFullYear().toString();
      const mm = String(d.getMonth()+1).padStart(2,"0");
      const dd = String(d.getDate()).padStart(2,"0");
      return `${yyyy}${mm}${dd}`;
    }

    function makePdfFileBase(scope){
      scope = (scope || "qa").toLowerCase();
      const serial = slugify(v('t_serial') || "SERIAL", 24);
      const client = slugify(v('t_client') || "CLIENT", 18);
      const date = yyyymmdd(v('t_date') || new Date().toISOString().slice(0,10));
      const tag = (scope === "full") ? "FULL" : "QA";
      // Example: 20251223_DAMAC_ABC12345_QA
      return `${date}_${client}_${serial}_${tag}`;
    }
// init storage restore
    window.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('[data-store]').forEach(el => {
        if (!el.id) return;
        restoreField(el);
        el.addEventListener('change', () => saveField(el));
        el.addEventListener('input', () => saveField(el));
      });
    });
  
    // === Scenario Links / Content Manager (offline) ===
    const DEFAULT_SCENARIO_LINKS = {
      a: { links: [
        { type:"sop", title:"OS Imaging / Baseline Setup SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409240123", notes:"Ubuntu 20.04 imaging + baseline" },
        { type:"sop", title:"Kiosk Mode SOP (Online)", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409264331", notes:"Online kiosk engine setup" },
        { type:"sop", title:"Kiosk Mode Assets / Uploads", url:"https://3.basecamp.com/4938325/buckets/20576475/uploads/9409277758", notes:"Configs/assets" },
        { type:"sop", title:"Pre‑Rental + Live Event + After‑Sales bundle", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"QA + event + return" }
      ]},
      b: { links: [
        { type:"sop", title:"Pre‑Rental Inspection & Preparation SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"QA before redeploy" },
        { type:"sop", title:"Event Kiosk Rental IT Ops Checklist", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"Field checklist" },
        { type:"sop", title:"Kiosk Mode SOP (Online)", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409264331", notes:"Validate kiosk lock/idle" },
        { type:"sop", title:"Scripts Repo (Health Checks)", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409146592", notes:"Health scripts + kiosk engine" }
      ]},
      c: { links: [
        { type:"sop", title:"OS Imaging / Baseline Setup SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409240123", notes:"Reinstall path" },
        { type:"sop", title:"Scripts Repo (Recovery & Health)", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409146592", notes:"Recovery helpers" },
        { type:"sop", title:"Pre‑Rental / QA SOPs", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"Must pass before redeploy" }
      ]},
      d: { links: [
        { type:"sop", title:"Kiosk Mode SOP (Online)", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409264331", notes:"URL kiosk + whitelist" },
        { type:"sop", title:"Live Event Support SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"Uptime + incident handling" }
      ]},
      e: { links: [
        { type:"sop", title:"WordPress Offline Deployment SOP", url:"(offline pack)", notes:"Included in the ZIP pack / SOP folder" },
        { type:"sop", title:"Pre‑Rental / QA SOPs", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"Offline retest + analytics export" }
      ]},
      f: { links: [
        { type:"sop", title:"Live Event Support SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"No experimental changes onsite" }
      ]},
      g: { links: [
        { type:"sop", title:"After Sales Support – Warranty Service SOP", url:"(offline pack)", notes:"Included in the ZIP pack / SOP folder" },
        { type:"sop", title:"Live Event Support SOP", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409270125", notes:"Shutdown + return procedure" }
      ]}
    };

    const LINKS_STORAGE_KEY = "kioskops:scenario_links:v1";

    function loadScenarioLinks(){
      try{
        const raw = localStorage.getItem(LINKS_STORAGE_KEY);
        if(!raw) return structuredClone(DEFAULT_SCENARIO_LINKS);
        const obj = JSON.parse(raw);
        // minimal validation
        if(!obj || typeof obj !== "object") return structuredClone(DEFAULT_SCENARIO_LINKS);
        return obj;
      }catch(e){
        return structuredClone(DEFAULT_SCENARIO_LINKS);
      }
    }

    function saveScenarioLinks(obj){
      localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(obj));
    }

    let scenarioLinks = loadScenarioLinks();

    function pillClass(type){
      if(type==="video") return "video";
      if(type==="scribe") return "scribe";
      if(type==="sop") return "sop";
      return "other";
    }

    function escapeHtml(str){
      return (str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
    }

    function renderScenarioResources(){
      document.querySelectorAll(".scenario-resources[data-scenario]").forEach(card=>{
        const sid = card.getAttribute("data-scenario");
        const data = scenarioLinks[sid] || {links:[]};
        const groups = { sop:[], video:[], scribe:[], other:[] };
        (data.links||[]).forEach(l=>{
          const t = (l.type||"other").toLowerCase();
          (groups[t] || groups.other).push(l);
        });

        function makeList(arr, type){
          if(!arr.length) return `<div class="small-muted">No ${type} links added yet.</div>`;
          return `<ul class="resource-list">` + arr.map(l=>{
            const u = l.url || "";
            const link = u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer">Open</a>` : `<span class="muted">No URL</span>`;
            const note = l.notes ? `<div class="small-muted" style="margin-top:2px;">${escapeHtml(l.notes)}</div>` : "";
            return `<li><span class="pill ${pillClass(l.type)}">${escapeHtml((l.type||"other").toUpperCase())}</span><b>${escapeHtml(l.title||"Untitled")}</b><div class="small-muted">${link}</div>${note}</li>`;
          }).join("") + `</ul>`;
        }

        card.innerHTML = `
          <h3>Scenario Resources (Videos + ScribeHow + SOPs)</h3>
          <div class="small-muted">These links are editable offline using <b>🧩 Links</b>. Export JSON to share updates.</div>
          <div class="resource-group"><h4>SOP Links</h4>${makeList(groups.sop, "SOP")}</div>
          <div class="resource-group"><h4>Videos</h4>${makeList(groups.video, "Video")}</div>
          <div class="resource-group"><h4>ScribeHow</h4>${makeList(groups.scribe, "ScribeHow")}</div>
          <div class="resource-group"><h4>Other</h4>${makeList(groups.other, "Other")}</div>
          <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn" onclick="openLinkManager('${sid}')">Manage links for this scenario</button>
          </div>
        `;
      });
    }

    function openLinkManager(preselect){
      const m = document.getElementById("linkManagerModal");
      if(!m) return;
      m.classList.remove("hidden");
      if(preselect){
        const sel = document.getElementById("lmScenario");
        if(sel) sel.value = preselect;
      }
      renderLinkManagerList();
    }

    function closeLinkManager(){
      const m = document.getElementById("linkManagerModal");
      if(m) m.classList.add("hidden");
    }

    function clearLinkForm(){
      ["lmTitle","lmUrl","lmNotes"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      const t = document.getElementById("lmType"); if(t) t.value="video";
    }

    function addScenarioLink(){
      const sid = document.getElementById("lmScenario").value;
      const type = document.getElementById("lmType").value;
      const title = (document.getElementById("lmTitle").value||"").trim();
      const url = (document.getElementById("lmUrl").value||"").trim();
      const notes = (document.getElementById("lmNotes").value||"").trim();

      if(!title || !url){
        alert("Please enter at least a Title and URL.");
        return;
      }
      if(!scenarioLinks[sid]) scenarioLinks[sid] = {links:[]};
      scenarioLinks[sid].links = scenarioLinks[sid].links || [];
      scenarioLinks[sid].links.push({ type, title, url, notes });
      saveScenarioLinks(scenarioLinks);
      clearLinkForm();
      renderLinkManagerList();
      renderScenarioResources();
    }

    function deleteScenarioLink(sid, idx){
      if(!confirm("Delete this link?")) return;
      if(!scenarioLinks[sid] || !scenarioLinks[sid].links) return;
      scenarioLinks[sid].links.splice(idx, 1);
      saveScenarioLinks(scenarioLinks);
      renderLinkManagerList();
      renderScenarioResources();
    }

    function renderLinkManagerList(){
      const sid = document.getElementById("lmScenario").value;
      const list = document.getElementById("lmList");
      const arr = (scenarioLinks[sid] && scenarioLinks[sid].links) ? scenarioLinks[sid].links : [];
      if(!list) return;
      if(!arr.length){
        list.innerHTML = `<div class="muted">No links yet for this scenario.</div>`;
        return;
      }
      list.innerHTML = arr.map((l, i)=>`
        <div class="item">
          <div class="meta">
            <div class="title">
              <span class="pill ${pillClass(l.type)}">${(l.type||"OTHER").toString().toUpperCase()}</span>
              ${escapeHtml(l.title||"Untitled")}
            </div>
            <div class="link">
              ${l.url ? `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.url)}</a>` : `<span class="muted">No URL</span>`}
            </div>
            ${l.notes ? `<div class="note">${escapeHtml(l.notes)}</div>` : ``}
          </div>
          <div class="actions" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${l.url ? `<button class="btn btn-secondary lm-open" data-url="${escapeHtml(l.url)}">Open</button>` : ``}
            ${l.url ? `<button class="btn btn-secondary lm-copy" data-url="${escapeHtml(l.url)}">Copy</button>` : ``}
            <button class="btn danger" onclick="deleteScenarioLink('${sid}', ${i})">Delete</button>
          </div>
        </div>
      `).join("");

      // Bind link buttons (after render)
      list.querySelectorAll(".lm-open").forEach(b=>{
        b.addEventListener("click", ()=>openUrl(b.getAttribute("data-url")||""));
      });
      list.querySelectorAll(".lm-copy").forEach(b=>{
        b.addEventListener("click", ()=>copyToClipboard(b.getAttribute("data-url")||""));
      });
}

    function exportScenarioLinks(){
      const blob = new Blob([JSON.stringify(scenarioLinks, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bm3_kiosk_scenario_links.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }

    async function importScenarioLinksFile(file){
      if(!file) return;
      try{
        const text = await file.text();
        const obj = JSON.parse(text);
        if(!obj || typeof obj !== "object") throw new Error("Invalid JSON");
        scenarioLinks = obj;
        saveScenarioLinks(scenarioLinks);
        renderLinkManagerList();
        renderScenarioResources();
        alert("Imported scenario links successfully.");
      }catch(e){
        alert("Import failed: " + (e.message || e));
      }finally{
        const inp = document.getElementById("importLinksFile");
        if(inp) inp.value = "";
      }
    }

    function resetScenarioLinks(){
      if(!confirm("Reset ALL scenario links to defaults? This cannot be undone.")) return;
      scenarioLinks = structuredClone(DEFAULT_SCENARIO_LINKS);
      saveScenarioLinks(scenarioLinks);
      renderLinkManagerList();
      renderScenarioResources();
    }

    // Render scenario resource cards on load
    window.addEventListener("DOMContentLoaded", () => {
      try { renderScenarioResources(); } catch(e) {}
    });

    // Close modal on ESC
    window.addEventListener("keydown", (e)=>{
      if(e.key === "Escape"){
        const m = document.getElementById("linkManagerModal");
        if(m && !m.classList.contains("hidden")) closeLinkManager();
      }
    });


    /* === Corporate Docs Library (offline) === */
    const CORP_DOCS_STORAGE_KEY = "kioskops:corp_docs_v1";
    const DEFAULT_CORP_DOCS = [
      {cat:"Governance", title:"IT Governance & Operations (Doc)", url:"./SOP/BrandM3dia IT Governance and Operations.docx", notes:"Corporate operating model, roles, and standards."},
      {cat:"Operations", title:"Field Execution Guide (PDF)", url:"./BrandM3dia_Kiosk_Field_Execution_Guide_v2.0-UX.pdf", notes:"Primary field manual (offline copy)."},
      {cat:"Operations", title:"Scenario Router One‑Pager (PDF)", url:"./BrandM3dia_Kiosk_Scenario_Router_OnePager.pdf", notes:"Quick ‘Which scenario?’ router."},
      {cat:"Compliance", title:"ETL / Electrical Safety Compliance", url:"https://3.basecamp.com/4938325/buckets/20576475/vaults/9409240123", notes:"Use OS Imaging SOP vault as compliance reference + request template."},
      {cat:"Operations", title:"Pre‑Rental Inspection & Preparation SOP", url:"./SOP/Pre-Rental Inspection & Preparation.docx", notes:"Mandatory readiness checks before rental/deployment."},
      {cat:"Operations", title:"Live Event Support SOP", url:"./SOP/Live Event Support SOP.docx", notes:"Monitoring + onsite support during events."},
      {cat:"Operations", title:"After‑Sales Support – Warranty Service SOP", url:"./SOP/After Sales Support - Warranty Service.docx", notes:"Returns, warranty triage, and repair process."},
      {cat:"Operations", title:"WordPress Offline Deployment SOP", url:"./SOP/Wordpress Offline deployment.docx", notes:"Offline/localhost content deployment."},
    ];

    function loadCorpDocs(){
      try{
        const raw = localStorage.getItem(CORP_DOCS_STORAGE_KEY);
        if(!raw) return structuredClone(DEFAULT_CORP_DOCS);
        const arr = JSON.parse(raw);
        if(!Array.isArray(arr)) return structuredClone(DEFAULT_CORP_DOCS);
        return arr;
      }catch(e){
        return structuredClone(DEFAULT_CORP_DOCS);
      }
    }
    function saveCorpDocs(arr){
      localStorage.setItem(CORP_DOCS_STORAGE_KEY, JSON.stringify(arr));
    }

    let corpDocs = loadCorpDocs();

    function renderCorpDocs(){
      const host = document.getElementById("corpDocsList");
      if(!host) return;
      const grouped = {};
      corpDocs.forEach(d => {
        grouped[d.cat] = grouped[d.cat] || [];
        grouped[d.cat].push(d);
      });
      host.innerHTML = Object.keys(grouped).sort().map(cat => {
        const items = grouped[cat].map(d => {
          const note = d.notes ? `<div class="small-muted">${escapeHtml(d.notes)}</div>` : "";
          return `<li><a href="${escapeAttr(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.title)}</a>${note}</li>`;
        }).join("");
        return `<div class="resource-group"><h4>${escapeHtml(cat)}</h4><ul class="resource-list">${items}</ul></div>`;
      }).join("");
    }

    function openCorpDocsManager(){
      const m = document.getElementById("corpDocsModal");
      if(!m) return;
      m.classList.remove("hidden");
      renderCorpDocsManagerList();
    }
    function closeCorpDocsManager(){
      const m = document.getElementById("corpDocsModal");
      if(m) m.classList.add("hidden");
    }

    function renderCorpDocsManagerList(){
      const box = document.getElementById("corpDocsManagerList");
      if(!box) return;
      box.innerHTML = corpDocs.map((d,i)=>`
        <div class="lm-item">
          <div class="meta">
            <div><strong>${escapeHtml(d.title)}</strong> <span class="small-muted">(${escapeHtml(d.cat)})</span></div>
            <div class="small-muted"><a href="${escapeAttr(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a></div>
            ${d.notes?`<div class="small-muted">${escapeHtml(d.notes)}</div>`:""}
          </div>
          <div class="actions">
            <button class="btn danger" onclick="deleteCorpDoc(${i})">Delete</button>
          </div>
        </div>
      `).join("");
    }

    function addCorpDoc(){
      const title = (document.getElementById("cd_title")||{}).value?.trim() || "";
      const cat = (document.getElementById("cd_cat")||{}).value || "Operations";
      const url = (document.getElementById("cd_url")||{}).value?.trim() || "";
      const notes = (document.getElementById("cd_notes")||{}).value?.trim() || "";
      if(!title || !url){ alert("Please enter a Title and URL."); return; }
      corpDocs.push({cat, title, url, notes});
      saveCorpDocs(corpDocs);
      clearCorpDocForm();
      renderCorpDocsManagerList();
      renderCorpDocs();
    }
    function clearCorpDocForm(){
      ["cd_title","cd_url","cd_notes"].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=""; });
      const sel = document.getElementById("cd_cat"); if(sel) sel.value="Governance";
    }
    function deleteCorpDoc(i){
      if(!confirm("Delete this doc link?")) return;
      corpDocs.splice(i,1);
      saveCorpDocs(corpDocs);
      renderCorpDocsManagerList();
      renderCorpDocs();
    }

    function exportCorpDocs(){
      const blob = new Blob([JSON.stringify(corpDocs, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bm3_kiosk_corporate_docs.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    async function importCorpDocs(file){
      try{
        if(!file) return;
        const txt = await file.text();
        const arr = JSON.parse(txt);
        if(!Array.isArray(arr)) throw new Error("Invalid JSON format.");
        corpDocs = arr;
        saveCorpDocs(corpDocs);
        renderCorpDocsManagerList();
        renderCorpDocs();
        alert("Imported corporate docs config.");
      }catch(e){
        alert("Import failed: " + e.message);
      }
    }

    function exportPortalConfig(){
      const cfg = {
        version: "2.4-UX",
        exported_at: new Date().toISOString(),
        scenario_links: scenarioLinks,
        corporate_docs: corpDocs,
        basecamp_settings: loadBasecampSettingsSafe()
      };
      const blob = new Blob([JSON.stringify(cfg, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "bm3_kiosk_portal_config.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    async function importPortalConfig(file){
      try{
        if(!file) return;
        const txt = await file.text();
        const cfg = JSON.parse(txt);
        if(cfg.scenario_links){ scenarioLinks = cfg.scenario_links; saveScenarioLinks(scenarioLinks); renderScenarioResources(); }
        if(cfg.corporate_docs){ corpDocs = cfg.corporate_docs; saveCorpDocs(corpDocs); renderCorpDocs(); }
        if(cfg.basecamp_settings){ saveBasecampSettings(cfg.basecamp_settings); }
        alert("Portal config imported.");
      }catch(e){
        alert("Import failed: " + e.message);
      }
    }

    /* === Basecamp Integration (optional) === */
    const BASECAMP_SETTINGS_KEY = "kioskops:basecamp_settings_v1";

    function loadBasecampSettingsSafe(){
      try{
        const raw = localStorage.getItem(BASECAMP_SETTINGS_KEY);
        if(!raw) return {};
        const obj = JSON.parse(raw);
        if(!obj || typeof obj !== "object") return {};
        return obj;
      }catch(e){ return {}; }
    }

    function hydrateBasecampSettingsForm(){
      const s = loadBasecampSettingsSafe();
      const setv = (id,val)=>{ const el=document.getElementById(id); if(el && val!==undefined && val!==null) el.value=val; };
      setv("bc_account", s.accountId||"");
      setv("bc_bucket", s.bucketId||"");
      setv("bc_todolist", s.todolistId||"");
      setv("bc_useragent", s.userAgent||"BrandM3dia KioskOps Portal (ops@brandm3dia.com)");
      // token stored separately
      const tok = localStorage.getItem("kioskops:bc_token") || "";
      const tel = document.getElementById("bc_token"); if(tel) tel.value = tok;
    }

    function saveBasecampSettings(obj){
      // If called with object, save directly. Otherwise, read from form.
      let s = obj && typeof obj === "object" ? obj : null;
      if(!s){
        s = {
          accountId: (document.getElementById("bc_account")||{}).value?.trim() || "",
          bucketId: (document.getElementById("bc_bucket")||{}).value?.trim() || "",
          todolistId: (document.getElementById("bc_todolist")||{}).value?.trim() || "",
          userAgent: (document.getElementById("bc_useragent")||{}).value?.trim() || ""
        };
        const tok = (document.getElementById("bc_token")||{}).value?.trim() || "";
        if(tok) localStorage.setItem("kioskops:bc_token", tok);
      }
      localStorage.setItem(BASECAMP_SETTINGS_KEY, JSON.stringify(s));
      const status = document.getElementById("bc_status");
      if(status) status.textContent = "Saved Basecamp settings locally.";
      return s;
    }

    function clearBasecampToken(){
      localStorage.removeItem("kioskops:bc_token");
      const tel = document.getElementById("bc_token"); if(tel) tel.value = "";
      const status = document.getElementById("bc_status");
      if(status) status.textContent = "Token cleared.";
    }

    function getBasecampAuthHeaders(){
      const s = loadBasecampSettingsSafe();
      const token = localStorage.getItem("kioskops:bc_token") || "";
      if(!s.accountId || !s.bucketId || !s.todolistId) throw new Error("Missing Basecamp IDs. Fill Account ID, Bucket ID, and To‑Do List ID.");
      if(!token) throw new Error("Missing access token. Paste OAuth token then Save.");
      const ua = (s.userAgent || "BrandM3dia KioskOps Portal (ops@brandm3dia.com)").trim();
      return { s, token, ua };
    }

    async function testBasecampConnection(){
      try{
        saveBasecampSettings();
        const {s, token, ua} = getBasecampAuthHeaders();
        const status = document.getElementById("bc_status");
        if(status) status.textContent = "Testing connection…";
        const url = `https://3.basecampapi.com/${encodeURIComponent(s.accountId)}/buckets/${encodeURIComponent(s.bucketId)}.json`;
        const res = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": ua
          }
        });
        if(!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if(status) status.textContent = `OK: Connected to project bucket “${data.name || data.title || "Bucket"}”.`;
      }catch(e){
        const status = document.getElementById("bc_status");
        if(status) status.textContent = "Test failed: " + e.message + " (Use JSON export + local sync script if browser blocks requests.)";
      }
    }

    function buildTaskBundle(){
      const includeFails = (document.getElementById("task_include_fails")||{}).checked;
      const includeIncomplete = (document.getElementById("task_include_incomplete")||{}).checked;

      const serial = (document.getElementById("task_serial")||{}).value?.trim() || "";
      const scenario = (document.getElementById("task_scenario")||{}).value || "";
      const todos = [];

      // 1) Pass/Fail selects + QA selects
      if(includeFails){
        document.querySelectorAll("select").forEach(sel=>{
          const opts = Array.from(sel.options||[]).map(o=>o.textContent.trim());
          if(!(opts.includes("Pass") && opts.includes("Fail"))) return;
          const val = (sel.value||"").trim();
          if(val !== "Fail") return;
          // Get human label from table row or surrounding context
          let label = "";
          const tr = sel.closest("tr");
          if(tr){
            const firstCell = tr.querySelector("td");
            if(firstCell) label = firstCell.textContent.trim();
          }
          if(!label){
            const lbl = document.querySelector(`label[for="${sel.id}"]`);
            if(lbl) label = lbl.textContent.trim();
          }
          label = label || sel.id;
          let notes = "";
          const notesInput = document.getElementById(sel.id + "n");
          if(notesInput) notes = (notesInput.value||"").trim();
          todos.push({
            content: `FIX: ${label}${serial?` (Serial ${serial})`:""}`,
            description: notes ? `Notes: ${notes}` : ""
          });
        });
      }

      // 2) Unchecked checklist items
      if(includeIncomplete){
        document.querySelectorAll('input[type="checkbox"][data-store]').forEach(cb=>{
          if(cb.checked) return;
          const li = cb.closest("li");
          let label = cb.id;
          if(li){
            const div = li.querySelector("div");
            if(div) label = div.textContent.trim();
          }
          todos.push({
            content: `COMPLETE: ${label}${serial?` (Serial ${serial})`:""}`,
            description: `Portal step incomplete. Scenario: ${scenario||"N/A"}`
          });
        });
      }

      return {
        meta: {
          portal_version: "2.4-UX",
          created_at: new Date().toISOString(),
          device_serial: serial,
          scenario: scenario
        },
        todos
      };
    }

    function downloadTaskBundle(){
      const bundle = buildTaskBundle();
      if(!bundle.todos.length){
        alert("No tasks generated. Tip: mark Pass/Fail items or select 'Create tasks for incomplete checkbox steps'.");
        return;
      }
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {type:"application/json"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0,10).replaceAll("-","");
      a.download = `bm3_basecamp_tasks_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    async function directSyncToBasecamp(){
      try{ logAudit("BASECAMP_DIRECT_SYNC", {mode:"manual"}); }catch(e){}
      try{
        saveBasecampSettings();
        const {s, token, ua} = getBasecampAuthHeaders();
        const bundle = buildTaskBundle();
        if(!bundle.todos.length) { alert("No tasks to sync."); return; }

        const status = document.getElementById("bc_status");
        if(status) status.textContent = `Syncing ${bundle.todos.length} task(s)…`;

        for(const t of bundle.todos){
          const url = `https://3.basecampapi.com/${encodeURIComponent(s.accountId)}/buckets/${encodeURIComponent(s.bucketId)}/todolists/${encodeURIComponent(s.todolistId)}/todos.json`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "User-Agent": ua,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ content: t.content, description: t.description || "" })
          });
          if(!res.ok){
            const txt = await res.text();
            throw new Error(`Failed to create todo: HTTP ${res.status} — ${txt}`);
          }
        }
        if(status) status.textContent = "Success: Tasks created in Basecamp.";
        alert("Tasks synced to Basecamp.");
      }catch(e){
        const status = document.getElementById("bc_status");
        if(status) status.textContent = "Direct sync failed: " + e.message + " (Use JSON export + local sync script for reliability.)";
        alert("Direct sync failed. Use Download Task Bundle JSON, then run the local sync script.");
      }
    }


    // === Role gating wrappers (Editor/Admin) + Read‑Only mode ===
    (function(){
      const wrap = (fnName, actionLabel, minRole, editable) => {
        const orig = window[fnName];
        if(typeof orig !== "function") return;
        window[fnName] = function(...args){
          const gate = editable ? requireEditable : requireRole;
          return gate(actionLabel || "Protected action", minRole || "editor", ()=>orig.apply(this, args));
        };
      };

      // Editor: can edit portal resources (scenario links + corporate docs)
      wrap("openLinkManager", "Edit Scenario Links", "editor", true);
      wrap("addScenarioLink", "Edit Scenario Links", "editor", true);
      wrap("deleteScenarioLink", "Edit Scenario Links", "editor", true);
      wrap("importScenarioLinksFile", "Edit Scenario Links", "editor", true);

      // Admin-only destructive resets
      wrap("resetScenarioLinks", "Reset Scenario Links", "admin", true);

      wrap("openCorpDocsManager", "Edit Corporate Docs", "editor", true);
      wrap("addCorpDoc", "Edit Corporate Docs", "editor", true);
      wrap("deleteCorpDoc", "Edit Corporate Docs", "editor", true);
      wrap("importCorpDocs", "Edit Corporate Docs", "editor", true);
      wrap("importCorpDocsFile", "Edit Corporate Docs", "editor", true);
      wrap("resetCorpDocs", "Reset Corporate Docs", "admin", true);

      // Admin: Basecamp/API configuration and direct sync
      wrap("saveBasecampSettings", "Configure Basecamp API", "admin", true);
      wrap("clearBasecampToken", "Configure Basecamp API", "admin", true);
      wrap("testBasecampConnection", "Configure Basecamp API", "admin", true);
      wrap("directSyncToBasecamp", "Configure Basecamp API", "admin", true);

      document.addEventListener("DOMContentLoaded", ()=>{
        // default read-only to ON if key missing
        try{
          if(localStorage.getItem(READ_ONLY_KEY) === null){
            localStorage.setItem(READ_ONLY_KEY, "1");
          }
        }catch(e){}
        updateAdminUI();
        updatePortalModeUI();
      });
    })();


    // Ensure new sections render on load
    document.addEventListener("DOMContentLoaded", ()=>{
      renderCorpDocs();
      hydrateBasecampSettingsForm();
    });



    // =========================
    // AUDIT LOG (Local, Offline)
    // =========================
    const AUDIT_LOG_KEY = "kioskops:audit_log_v1";
    const PORTAL_META_KEY = "kioskops:portal_meta_v1";

    function getOperatorName(){
      const n = (document.getElementById("op_name")?.value || localStorage.getItem("kioskops:op_name") || "").trim();
      return n || "Unknown";
    }

    function getOperatorNotes(){
      return (document.getElementById("op_notes")?.value || localStorage.getItem("kioskops:op_notes") || "").trim();
    }

    function safeJsonParse(raw, fallback){
      try{ return JSON.parse(raw); }catch(e){ return fallback; }
    }

    function loadAudit(){
      const raw = localStorage.getItem(AUDIT_LOG_KEY);
      return raw ? safeJsonParse(raw, []) : [];
    }

    function saveAudit(arr){
      localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(arr));
    }

    function summarizePortalState(){
      // counts only (avoids secrets)
      const links = safeJsonParse(localStorage.getItem(LINKS_STORAGE_KEY) || "null", null);
      const docs  = safeJsonParse(localStorage.getItem(CORP_DOCS_STORAGE_KEY) || "null", null);
      const bc    = safeJsonParse(localStorage.getItem(BASECAMP_SETTINGS_KEY) || "null", null);

      const scenarioCounts = {};
      if(links && links.scenarios){
        Object.keys(links.scenarios).forEach(k=>{
          scenarioCounts[k] = (links.scenarios[k] || []).length;
        });
      }
      return {
        version: "v2.13-UX",
        readonly: isReadOnly ? isReadOnly() : true,
        scenarioCounts,
        corpDocsCount: Array.isArray(docs) ? docs.length : 0,
        basecampConfigured: !!(bc && (bc.account_id || bc.project_id || bc.bucket_id)),
      };
    }

    function logAudit(action, details){
      try{
        const role = getRole ? (getRole() || "locked") : "locked";
        const actor = getOperatorName();
        const notes = getOperatorNotes();

        const entry = {
          ts: new Date().toISOString(),
          actor,
          role,
          action,
          details: details || {},
          portal: summarizePortalState(),
          notes: notes || ""
        };

        const arr = loadAudit();
        arr.unshift(entry);
        // keep reasonable cap
        if(arr.length > 2000) arr.length = 2000;
        saveAudit(arr);
      }catch(e){
        console.warn("Audit log failed:", e);
      }
    }

    function renderAuditTable(){
      const tbl = document.querySelector("#audit_table tbody");
      if(!tbl) return;
      tbl.innerHTML = "";
      const filter = (document.getElementById("audit_filter")?.value || "").toLowerCase().trim();
      const rows = loadAudit();

      const fmt = (iso)=>{
        try{
          const d = new Date(iso);
          return d.toLocaleString();
        }catch(e){ return iso; }
      };

      rows
        .filter(r=>{
          if(!filter) return true;
          const hay = JSON.stringify(r).toLowerCase();
          return hay.includes(filter);
        })
        .slice(0, 500) // UI cap
        .forEach(r=>{
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${escapeHtml(fmt(r.ts))}</td>
            <td>${escapeHtml(r.actor || "—")}</td>
            <td>${escapeHtml((r.role||"locked").toUpperCase())}</td>
            <td>${escapeHtml(r.action || "—")}</td>
            <td><div class="small">${escapeHtml(JSON.stringify(r.details || {}))}</div></td>
          `;
          tbl.appendChild(tr);
        });

      const sum = document.getElementById("audit_summary");
      if(sum){
        sum.textContent = `Total events on this laptop: ${rows.length}. Showing up to 500.`;
      }
    }

    function refreshAuditUI(){
      // Restore profile fields
      const n = localStorage.getItem("kioskops:op_name") || "";
      const nn = localStorage.getItem("kioskops:op_notes") || "";
      const nameEl = document.getElementById("op_name");
      const notesEl = document.getElementById("op_notes");
      if(nameEl && !nameEl.value) nameEl.value = n;
      if(notesEl && !notesEl.value) notesEl.value = nn;

      const roleEl = document.getElementById("op_role");
      if(roleEl){
        const r = (getRole && getRole()) || "";
        roleEl.value = r ? r.toUpperCase() : "LOCKED";
      }
      renderAuditTable();
    }

    function exportAudit(){
      const fmt = (document.getElementById("audit_export_fmt")?.value || "json");
      const lim = parseInt(document.getElementById("audit_export_limit")?.value || "50", 10);
      const rows = loadAudit();
      const out = (lim === 0) ? rows : rows.slice(0, lim);

      if(fmt === "csv"){
        const header = ["timestamp","actor","role","action","details_json"];
        const lines = [header.join(",")];
        out.forEach(r=>{
          const line = [
            JSON.stringify(r.ts||""),
            JSON.stringify(r.actor||""),
            JSON.stringify(r.role||""),
            JSON.stringify(r.action||""),
            JSON.stringify(JSON.stringify(r.details||{}))
          ].join(",");
          lines.push(line);
        });
        downloadText(lines.join("\n"), `kioskops_audit_${new Date().toISOString().slice(0,10)}.csv`, "text/csv");
      }else{
        downloadText(JSON.stringify(out, null, 2), `kioskops_audit_${new Date().toISOString().slice(0,10)}.json`, "application/json");
      }
      logAudit("AUDIT_EXPORT", {format: fmt, limit: lim});
    }

    function copyAuditSummary(){
      const rows = loadAudit().slice(0, 10);
      const lines = [];
      lines.push("Audit Summary (last 10)");
      rows.forEach(r=>{
        lines.push(`${r.ts} | ${r.actor} | ${String(r.role||"").toUpperCase()} | ${r.action} | ${JSON.stringify(r.details||{})}`);
      });
      copy(lines.join("\n"));
      logAudit("AUDIT_COPY_SUMMARY", {count: 10});
      toastOrAlert("Copied audit summary.");
    }

    function clearAuditLog(){
      return requireRole("Clear Audit Log", "admin", ()=>{
        localStorage.removeItem(AUDIT_LOG_KEY);
        logAudit("AUDIT_CLEARED", {});
        renderAuditTable();
        toastOrAlert("Audit log cleared.");
      });
    }

    // Persist operator fields via saveField (kioskops:op_name etc)
    // =========================
    // CONFIG PUBLISHER (Golden Config)
    // =========================

    function portalMeta(){
      const raw = localStorage.getItem(PORTAL_META_KEY);
      return raw ? safeJsonParse(raw, {}) : {};
    }

    function setPortalMeta(meta){
      localStorage.setItem(PORTAL_META_KEY, JSON.stringify(meta||{}));
    }

    function configDigest(obj){
      // stable-ish digest for quick compare (no crypto)
      const s = JSON.stringify(obj);
      let h = 0;
      for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; }
      return ("00000000" + h.toString(16)).slice(-8);
    }

    function exportGoldenConfig(){
      return requireRole("Export Golden Config", "admin", ()=>{
        const include = document.getElementById("cfg_include")?.value || "links_docs";
        const name = (document.getElementById("cfg_name")?.value || "").trim() || ("GoldenConfig_" + new Date().toISOString().slice(0,10));

        const payload = {
          schema: "kioskops_golden_config_v1",
          name,
          created_at: new Date().toISOString(),
          created_by: getOperatorName(),
          portal_version: "v2.13-UX",
          scenario_links: safeJsonParse(localStorage.getItem(LINKS_STORAGE_KEY) || "null", null),
          corp_docs: safeJsonParse(localStorage.getItem(CORP_DOCS_STORAGE_KEY) || "null", null),
        };

        if(include === "all_no_token"){
          payload.basecamp_settings = safeJsonParse(localStorage.getItem(BASECAMP_SETTINGS_KEY) || "null", null);
        }

        payload.digest = configDigest(payload);

        downloadText(JSON.stringify(payload, null, 2), `${name.replace(/[^a-z0-9_\-]+/gi,"_")}.json`, "application/json");

        // store meta locally
        setPortalMeta({ last_export: payload.created_at, last_digest: payload.digest, name: payload.name });
        const d = document.getElementById("cfg_digest");
        if(d) d.textContent = `Exported: ${payload.name} | Digest: ${payload.digest}`;

        logAudit("GOLDEN_CONFIG_EXPORT", {name: payload.name, include});
      });
    }

    function copyGoldenConfigDigest(){
      const meta = portalMeta();
      const text = meta.last_digest ? `Golden Config Digest: ${meta.last_digest} (${meta.name||"unnamed"})` : "No golden config exported yet.";
      copy(text);
      logAudit("GOLDEN_CONFIG_DIGEST_COPY", {digest: meta.last_digest || ""});
      toastOrAlert("Copied.");
    }

    function backupCurrentConfig(){
      const payload = {
        schema: "kioskops_backup_config_v1",
        created_at: new Date().toISOString(),
        created_by: getOperatorName(),
        portal_version: "v2.13-UX",
        scenario_links: safeJsonParse(localStorage.getItem(LINKS_STORAGE_KEY) || "null", null),
        corp_docs: safeJsonParse(localStorage.getItem(CORP_DOCS_STORAGE_KEY) || "null", null),
        basecamp_settings: safeJsonParse(localStorage.getItem(BASECAMP_SETTINGS_KEY) || "null", null),
        digest: ""
      };
      payload.digest = configDigest(payload);
      downloadText(JSON.stringify(payload, null, 2), `kioskops_backup_${new Date().toISOString().slice(0,10)}_${payload.digest}.json`, "application/json");
    }

    function importGoldenConfig(){
      return requireRole("Import Golden Config", "admin", ()=>{
        const fileEl = document.getElementById("cfg_file");
        const status = document.getElementById("cfg_status");
        if(!fileEl || !fileEl.files || !fileEl.files[0]){
          if(status) status.textContent = "Select a .json file first.";
          return;
        }

        const after = document.getElementById("cfg_after")?.value || "readonly";
        const backup = document.getElementById("cfg_backup")?.value || "backup";

        if(backup === "backup"){
          backupCurrentConfig();
        }

        const f = fileEl.files[0];
        const reader = new FileReader();
        reader.onload = ()=>{
          try{
            const obj = JSON.parse(reader.result);
            if(!obj || obj.schema !== "kioskops_golden_config_v1"){
              if(status) status.textContent = "Invalid golden config schema.";
              return;
            }
            if(obj.scenario_links) localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(obj.scenario_links));
            if(obj.corp_docs) localStorage.setItem(CORP_DOCS_STORAGE_KEY, JSON.stringify(obj.corp_docs));
            if(obj.basecamp_settings) localStorage.setItem(BASECAMP_SETTINGS_KEY, JSON.stringify(obj.basecamp_settings));

            setPortalMeta({ last_import: new Date().toISOString(), last_digest: obj.digest || configDigest(obj), name: obj.name || "imported" });

            if(after === "readonly"){
              try{ localStorage.setItem(READ_ONLY_KEY, "1"); }catch(e){}
            }else{
              try{ localStorage.setItem(READ_ONLY_KEY, "0"); }catch(e){}
            }

            if(status) status.textContent = `Applied: ${obj.name || "Unnamed"} | Digest: ${obj.digest || "—"}`;
            try{ updatePortalModeUI(); }catch(e){}
            try{ renderScenarioLinksUI && renderScenarioLinksUI(); }catch(e){}
            try{ renderCorpDocs && renderCorpDocs(); }catch(e){}

            logAudit("GOLDEN_CONFIG_IMPORT", {name: obj.name || "", digest: obj.digest || ""});
            toastOrAlert("Golden config applied.");
          }catch(e){
            if(status) status.textContent = "Failed to import config: " + e.message;
          }
        };
        reader.readAsText(f);
      });
    }

    // =========================
    // UPLOAD PACKET (PDF + JSON)
    // =========================

    function getActiveScenarioId(){
      // active scenario stored in state variable (currentSection)
      try{ return window._currentSection || "a"; }catch(e){ return "a"; }
    }

    function getScenarioLinksForPacket(mode){
      const links = safeJsonParse(localStorage.getItem(LINKS_STORAGE_KEY) || "null", null) || {};
      const scenarios = links.scenarios || {};
      if(mode === "none") return [];
      if(mode === "all"){
        const out = [];
        Object.keys(scenarios).forEach(k=>{
          out.push({ scenario: k, links: scenarios[k] || [] });
        });
        return out;
      }
      const active = getActiveScenarioId();
      const key = (active && scenarios[active]) ? active : "a";
      return [{ scenario: key, links: scenarios[key] || [] }];
    }

    function getAuditForPacket(mode){
      if(mode === "none") return [];
      const rows = loadAudit();
      if(mode === "0") return rows;
      const n = parseInt(mode, 10);
      return rows.slice(0, isNaN(n)?20:n);
    }

    function packetFilenameBase(){
      const prefix = (v("p_prefix") || "").trim();
      const date = (v("t_date") || new Date().toISOString().slice(0,10)).replaceAll("-","");
      const serial = (v("t_serial") || "SERIAL").replace(/[^a-z0-9]+/gi,"");
      const base = (prefix ? prefix + "_" : "") + date + "_KioskPacket_" + serial;
      return base.replace(/_{2,}/g,"_");
    }

    function buildPacketExtras(pa){
      // scenario links block
      const linksMode = v("p_links") || "active";
      const auditMode = v("p_audit") || "20";

      const links = getScenarioLinksForPacket(linksMode);
      if(links && links.length){
        const div = document.createElement("div");
        div.className = "pagebreak";
        div.innerHTML = `<h2>Scenario Resources</h2>` +
          links.map(s=>{
            const title = (s.scenario||"").toUpperCase();
            const rows = (s.links||[]).map(l=>`<tr><td>${escapeHtml(l.type||"link")}</td><td>${escapeHtml(l.title||"")}</td><td>${l.url? `<a href="${escapeHtml(l.url)}">${escapeHtml(l.url)}</a>`:""}</td><td>${escapeHtml(l.notes||"")}</td></tr>`).join("");
            return `<h3>Scenario ${title}</h3><table><tr><th style="width:90px;">Type</th><th style="width:220px;">Title</th><th>URL</th><th style="width:220px;">Notes</th></tr>${rows || `<tr><td colspan="4" class="small">No links configured.</td></tr>`}</table>`;
          }).join("");
        pa.appendChild(div);
      }

      // incident block
      const incidentAny = (v("i_id") || v("i_summary") || v("i_steps") || v("i_resolution") || v("i_media"));
      if(incidentAny){
        const div = document.createElement("div");
        div.className = "pagebreak";
        div.innerHTML = `
          <h2>Incident Report</h2>
          <table>
            <tr><th style="width:22%;">Incident ID</th><td>${escapeHtml(v("i_id")||"—")}</td></tr>
            <tr><th>Severity</th><td>${escapeHtml(v("i_sev")||"—")}</td></tr>
            <tr><th>Summary</th><td>${escapeHtml(v("i_summary")||"—")}</td></tr>
            <tr><th>Steps Tried</th><td>${escapeHtml(v("i_steps")||"—").replaceAll("\n","<br/>")}</td></tr>
            <tr><th>Resolution</th><td>${escapeHtml(v("i_resolution")||"—").replaceAll("\n","<br/>")}</td></tr>
            <tr><th>Media Filenames</th><td>${escapeHtml(v("i_media")||"—")}</td></tr>
          </table>
          <div class="small">Attach photos/videos separately in Basecamp and reference filenames above.</div>
        `;
        pa.appendChild(div);
      }

      // audit block
      const auditRows = getAuditForPacket(auditMode);
      if(auditRows && auditRows.length){
        const div = document.createElement("div");
        div.className = "pagebreak";
        const rows = auditRows.map(r=>`<tr><td>${escapeHtml(r.ts||"")}</td><td>${escapeHtml(r.actor||"")}</td><td>${escapeHtml(String(r.role||"").toUpperCase())}</td><td>${escapeHtml(r.action||"")}</td><td>${escapeHtml(JSON.stringify(r.details||{}))}</td></tr>`).join("");
        div.innerHTML = `
          <h2>Audit Trail (Selected)</h2>
          <table>
            <tr><th style="width:170px;">Timestamp</th><th style="width:140px;">Actor</th><th style="width:80px;">Role</th><th style="width:160px;">Action</th><th>Details</th></tr>
            ${rows}
          </table>
        `;
        pa.appendChild(div);
      }
    }

    // Extend existing buildPrintArea to support "packet"
    const _origBuildPrintArea = buildPrintArea;
    buildPrintArea = function(scope){
      _origBuildPrintArea(scope === "packet" ? "full" : scope);

      if(scope === "packet"){
        const pa = document.getElementById("printArea");
        // Add packet extras after full checklist sections but before sign-off
        // Original buildPrintArea appends sign-off footer at the end; we can move it by rebuilding:
        // Quick approach: append extras at the end (after sign-off) is acceptable; it will still print in order.
        buildPacketExtras(pa);

        // Add packet footer note
        const note = document.createElement("div");
        note.className = "pagebreak";
        note.innerHTML = `
          <h2>Upload Instructions</h2>
          <ol>
            <li>Save this PDF.</li>
            <li>Upload to Basecamp → Docs (or Message) under the correct client/event project.</li>
            <li>Attach proof photos/videos separately and reference filenames.</li>
          </ol>
          <div class="small">Packet generated offline from the KioskOps Portal.</div>
        `;
        pa.appendChild(note);
      }
    };

    function generatePacketPdf(){
      const scope = v("p_scope") || "packet";
      const base = packetFilenameBase();
      const titleBefore = document.title;
      document.title = base;
      savePdf(scope); // uses print
      document.title = titleBefore;
      logAudit("PDF_EXPORT", {scope});
      const st = document.getElementById("packet_status");
      if(st) st.textContent = `PDF generated via Print dialog. Default filename: ${base}.pdf`;
    }

    function exportPacketJSON(){
      const payload = {
        schema: "kioskops_upload_packet_v1",
        generated_at: new Date().toISOString(),
        generated_by: getOperatorName(),
        role: (getRole && getRole()) || "locked",
        portal_version: "v2.13-UX",
        checklist_fields: exportKioskOpsFields(),
        scenario_links: getScenarioLinksForPacket(v("p_links")||"active"),
        incident: {
          id: v("i_id")||"",
          severity: v("i_sev")||"",
          summary: v("i_summary")||"",
          steps: v("i_steps")||"",
          resolution: v("i_resolution")||"",
          media: v("i_media")||""
        },
        audit: getAuditForPacket(v("p_audit")||"20"),
      };
      const base = packetFilenameBase();
      downloadText(JSON.stringify(payload, null, 2), `${base}.json`, "application/json");
      logAudit("PACKET_EXPORT_JSON", {scope: v("p_scope")||"packet"});
      const st = document.getElementById("packet_status");
      if(st) st.textContent = `Exported ${base}.json`;
    }

    function openPacketPreview(){
      // open printable view in a new window (no print automatically)
      const base = packetFilenameBase();
      const w = window.open("", "_blank");
      if(!w){ toastOrAlert("Popup blocked. Allow popups to preview."); return; }

      const payload = {
        title: base,
        when: new Date().toLocaleString(),
        by: getOperatorName(),
        scope: v("p_scope")||"packet"
      };

      w.document.open();
      w.document.write(`
<!doctype html><html><head><meta charset="utf-8"/>
<title>${escapeHtml(base)}</title>
<style>
body{font-family: Arial, sans-serif; padding:20px; color:#0f172a;}
h1{margin:0 0 6px;}
.small{color:#475569; font-size:12px;}
table{border-collapse:collapse; width:100%; margin:10px 0;}
th,td{border:1px solid #cbd5e1; padding:6px; font-size:12px; vertical-align:top;}
th{background:#f1f5f9; text-align:left;}
hr{border:0; border-top:1px solid #e2e8f0; margin:16px 0;}
@media print{.noprint{display:none;}}

.wiz-scenarios{display:flex; flex-direction:column; gap:.35rem; margin:.6rem 0;}
.wiz-opt{display:flex; gap:.5rem; align-items:flex-start; padding:.35rem .5rem; border:1px solid var(--border); border-radius:10px; background:rgba(148,163,184,.06);}
.wiz-opt input{margin-top:.2rem;}
.wiz-checks{display:flex; flex-direction:column; gap:.35rem; margin:.6rem 0;}
.wiz-checks label{display:flex; gap:.5rem; align-items:flex-start;}

</style></head><body>
<div class="noprint" style="margin-bottom:10px;">
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<h1>Upload Packet Preview</h1>
<div class="small">Generated: ${escapeHtml(payload.when)} | By: ${escapeHtml(payload.by)} | Scope: ${escapeHtml(payload.scope)}</div>
<hr/>
<div id="content"></div>
<script>
</scr"+"ipt>
</body></html>
      `);
      w.document.close();

      // Build content using current portal printArea HTML for packet
      // Reuse existing buildPrintArea("packet") output by copying from current window
      buildPrintArea("packet");
      const pa = document.getElementById("printArea");
      const content = pa ? pa.innerHTML : "<p>No print area found.</p>";
      const contEl = w.document.getElementById("content");
      if(contEl) contEl.innerHTML = content;

      logAudit("PACKET_PREVIEW_OPENED", {});
    }

    // Export all kioskops:* fields for packet JSON
    function exportKioskOpsFields(){
      const out = {};
      Object.keys(localStorage).forEach(k=>{
        if(!k.startsWith("kioskops:")) return;
        if(k === "kioskops:bc_token") return; // never export token
        out[k] = localStorage.getItem(k);
      });
      return out;
    }


    // =========================
    // LAUNCH WIZARD (Field Flow) — Scenario Stack + Guided Packet
const WIZ_STACK_KEY = "kioskops:wiz_stack";

// --- Helpers
function wizLoad(){
  try { return JSON.parse(localStorage.getItem(WIZ_STACK_KEY) || "null"); } catch(e){ return null; }
}
function wizSave(state, note){
  localStorage.setItem(WIZ_STACK_KEY, JSON.stringify(state));
  try { if(typeof logAudit === "function") logAudit("wizard.update", note || "Wizard updated", state); } catch(e){}
}
function wizPatch(patch, note){
  const cur = wizLoad() || {};
  const next = Object.assign({}, cur, patch, { updatedAt: new Date().toISOString() });
  wizSave(next, note);
  return next;
}
function formatStack(stack){
  const nice = (stack||[]).filter(Boolean).map(s=>("Scenario " + s.toUpperCase()));
  return nice.length ? nice.join(" + ") : "None selected";
}
function getWizardStack(){
  const s = wizLoad();
  if(s && Array.isArray(s.stack) && s.stack.length) return s.stack.filter(Boolean);
  // fallback: derive from individual fields
  if(s && (s.device || s.mode || s.phase)){
    return [s.device||"", s.mode||"", s.phase||""].filter(Boolean);
  }
  return [];
}
function setRadios(name, value){
  const nodes = document.querySelectorAll(`input[type=radio][name="${name}"]`);
  nodes.forEach(n => { n.checked = (n.value === (value || "")); });
}
function getRadio(name){
  const el = document.querySelector(`input[type=radio][name="${name}"]:checked`);
  return el ? el.value : "";
}

// --- Wizard actions
function wizardSaveScenarioStack(){
  const device = getRadio("wizDevice");
  const mode = getRadio("wizMode");
  const phase = getRadio("wizPhase");
  const stack = [device, mode, phase].filter(Boolean);

  if(!device){
    toast("Select a Device Condition (A/B/C) before continuing.");
    return;
  }

  wizPatch({ device, mode, phase, stack, step1_done:true }, `Scenario stack set: ${formatStack(stack)}`);
  wizardRefresh();
  toast("Scenario stack saved.");
}

function wizardAutoDetect(){
  // Heuristics:
  // 1) If any OS Health item is marked FAIL → suggest Scenario C
  // 2) If Offline QA row is filled (qa9) or FAIL/PASS → suggest Scenario E
  // Otherwise: keep current selections (or default to storage B if device is empty)
  let suggestedDevice = getRadio("wizDevice") || "";
  let suggestedMode = getRadio("wizMode") || "";

  try {
    const osSelects = Array.from(document.querySelectorAll('select[id^="os"]'));
    const anyFail = osSelects.some(s => (s.value || "").toLowerCase() === "fail");
    if(anyFail) suggestedDevice = "c";
  } catch(e){}

  try{
    const qaOffline = document.getElementById("qa9");
    if(qaOffline && qaOffline.value) suggestedMode = "e";
  }catch(e){}

  if(!suggestedDevice) suggestedDevice = "b"; // safe default
  setRadios("wizDevice", suggestedDevice);
  setRadios("wizMode", suggestedMode);
  // do not auto-set phase

  toast(`Auto-detect suggestion applied: ${formatStack([suggestedDevice, suggestedMode, getRadio("wizPhase")].filter(Boolean))}`);
}

function wizardOpenScenarioLinks(){
  const stack = getWizardStack();
  const primary = stack[0] || "a";
  // Prefer Scenario Resources cards (they contain clickable Open links)
  if(document.querySelectorAll(".scenario-resources[data-scenario]").length){
    if(document.getElementById("scenarios")) show("scenarios");
    setTimeout(()=>{
      const c = document.querySelector(`.scenario-resources[data-scenario="${primary}"]`);
      if(c) c.scrollIntoView({behavior:"smooth", block:"start"});
    }, 50);
    toast("Scenario resources opened.");
    return;
  }
  // Fallback: open Link Manager modal filtered to primary scenario
  try{
    if(typeof openLinkManager === "function"){
      openLinkManager(primary);
      toast("Link Manager opened (filtered).");
      return;
    }
  }catch(e){}
  toastOrAlert("Links section not found.");
}
  } catch(e){}
  // Fallback: open the scenario section
  show(primary);
}

function wizardConfirmCompliance(){
  const serial = (document.getElementById("wiz_serial")||{}).value || "";
  const eventName = (document.getElementById("wiz_event")||{}).value || "";
  const bc = !!(document.getElementById("wiz_bc_done")||{}).checked;
  const asset = !!(document.getElementById("wiz_asset_done")||{}).checked;
  const photos = !!(document.getElementById("wiz_photos_done")||{}).checked;

  const ok = bc && asset && photos;
  wizPatch({ serial, eventName, compliance:{ bc, asset, photos }, step2_done: ok }, ok ? "Compliance gate confirmed" : "Compliance gate started (incomplete)");

  const el = document.getElementById("wiz_compliance_status");
  if(el) el.textContent = ok ? "✅ Confirmed" : "⚠️ Incomplete (Basecamp + Asset + Photos required)";
  if(!ok) toast("Compliance gate is not complete yet (Basecamp + Asset + Photos).");
  else toast("Compliance gate confirmed.");
}

function wizardConfirmChecklists(){
  const physical = !!(document.getElementById("wiz_chk_physical")||{}).checked;
  const os = !!(document.getElementById("wiz_chk_os")||{}).checked;
  const kiosk = !!(document.getElementById("wiz_chk_kiosk")||{}).checked;
  const qa = !!(document.getElementById("wiz_chk_qa")||{}).checked;

  // Minimum: Physical + QA, plus OS/Kiosk as applicable
  const ok = physical && qa;
  wizPatch({ checklists:{ physical, os, kiosk, qa }, step3_done: ok }, ok ? "Checklists confirmed" : "Checklists started (incomplete)");

  const el = document.getElementById("wiz_checklist_status");
  if(el) el.textContent = ok ? "✅ Confirmed (Physical + QA)" : "⚠️ Incomplete (Physical + QA required)";
  if(!ok) toast("Complete at least Physical + Final QA before generating the upload packet.");
  else toast("Checklists confirmed.");
}

function wizardBuildPacket(){
  const s = wizLoad() || {};
  const stack = getWizardStack();
  const device = stack[0] || s.device || "";
  if(!device){
    toast("Set your scenario stack first (Step 1).");
    return;
  }

  // Pre-fill packet builder fields
  const prefix = (document.getElementById("wiz_prefix")||{}).value || "";
  const scope = (document.getElementById("wiz_packet_scope")||{}).value || "packet";
  const audit = (document.getElementById("wiz_packet_audit")||{}).value || "50";

  const pPrefix = document.getElementById("p_prefix");
  const pScope = document.getElementById("p_scope");
  const pAudit = document.getElementById("p_audit");
  const pLinks = document.getElementById("p_links");

  if(pPrefix && prefix) pPrefix.value = prefix;
  if(pScope) pScope.value = scope;
  if(pAudit) pAudit.value = audit;
  if(pLinks) pLinks.value = "active";

  // Save wizard + jump to packet generator
  wizPatch({ step4_started:true }, "Upload packet generation started");
  show("packet");

  // Give UI a tick then build
  setTimeout(()=> {
    try {
      if(typeof generatePacketPdf === "function") generatePacketPdf();
      const el = document.getElementById("wiz_packet_status");
      if(el) el.textContent = "✅ Generated (check Downloads).";
      wizPatch({ step4_done:true }, "Upload packet generated");
    } catch(e){
      toast("Packet generation failed. Try again from the Packet Builder.");
    }
  }, 150);
}

function wizardReset(){
  if(!confirm("Reset wizard state? (Does not erase checklist data.)")) return;
  localStorage.removeItem(WIZ_STACK_KEY);
  wizardRefresh();
  toast("Wizard reset.");
}

// --- Active scenario helpers (override for packet builder)
function getActiveScenarioIds(){
  const stack = getWizardStack();
  if(stack && stack.length) return stack;
  if(window._currentSection) return [window._currentSection];
  return ["a"];
}
function getActiveScenarioId(){
  return (getActiveScenarioIds()[0] || "a");
}

// Override: include scenario stack when 'active' is selected in upload packet builder
function getScenarioLinksForPacket(mode){
  const links = safeJsonParse(localStorage.getItem(LINKS_STORAGE_KEY) || "null", null) || {};
  const scenarios = links.scenarios || {};

  const mapOne = (k)=>({ scenario:k, links: (scenarios[k] || []) });

  if(mode === "none") return [];
  if(mode === "all"){
    return Object.keys(SCENARIO_LABELS).map(k=>mapOne(k));
  }
  // active = scenario stack
  return getActiveScenarioIds().map(k=>mapOne(k));
}

// --- Offline templates + download helper
function downloadTemplate(filename, content){
  const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 50);
}

const WINDOWS_KIOSK_CHECKLIST = `Windows Kiosk Validation Checklist
================================
[ ] Dedicated kiosk user created (no personal account)
[ ] Assigned Access / Kiosk mode configured
[ ] Kiosk app launches automatically after reboot
[ ] User cannot exit to desktop / start menu
[ ] Network stable (LAN > Wi‑Fi > LTE)
[ ] Idle return or session reset works (if required)
[ ] Touch + peripherals validated (if used)
[ ] Evidence captured (photo/video) + Basecamp upload
`;

const WINDOWS_KIOSK_PS1 = `# Create-KioskUser-Template.ps1
# Template only — review with IT Lead before using.
# Purpose: create a local kiosk user for Assigned Access setup.

param(
  [string]$UserName = "kiosk",
  [string]$TempPassword = "ChangeMe-Immediately!"
)

Write-Host "Creating local user: $UserName"
net user $UserName $TempPassword /add

Write-Host "Setting password never expires (optional)"
wmic UserAccount where Name="$UserName" set PasswordExpires=FALSE

Write-Host "Next: Configure Assigned Access via Settings → Accounts → Set up a kiosk."
`;

const ANDROID_KIOSK_CHECKLIST = `Android Kiosk Validation Checklist
================================
[ ] Device enrolled (MDM / Device Owner) OR approved local lock method applied
[ ] Auto‑launch app configured (or kiosk launcher)
[ ] User cannot exit app (lock task / pinning)
[ ] Device stays awake while charging (event mode)
[ ] Wi‑Fi configured + hotspot fallback documented
[ ] Touch + camera/QR validated (if used)
[ ] Evidence captured + Basecamp upload
`;

const ANDROID_ADB_NOTES = `Android ADB Helper Notes (Templates)
================================
# Enable developer options + USB debugging first.
# Confirm device connected:
adb devices

# Keep screen on while plugged (varies by device):
adb shell settings put global stay_on_while_plugged_in 3

# Launch a package (example):
adb shell monkey -p com.example.app -c android.intent.category.LAUNCHER 1

# NOTE:
# Enforcing true kiosk / lock task mode typically requires Device Owner / MDM.
# Do NOT attempt unapproved security changes onsite.
`;

function wizardRefresh(){
  const s = wizLoad() || {};
  // Apply saved radios
  if(typeof setRadios === "function"){
    setRadios("wizDevice", s.device || "");
    setRadios("wizMode", s.mode || "");
    setRadios("wizPhase", s.phase || "");
  }

  const stack = getWizardStack();
  const stackEl = document.getElementById("wiz_stack_status");
  if(stackEl) stackEl.textContent = stack.length ? formatStack(stack) : "No scenario stack selected yet.";

  // Refill basic fields
  const f = (id,val)=>{ const el=document.getElementById(id); if(el && val!==undefined && val!==null){ if(el.type==="checkbox") el.checked=!!val; else el.value = val; } };
  f("wiz_serial", s.serial || "");
  f("wiz_event", s.eventName || "");
  f("wiz_prefix", s.prefix || (document.getElementById("wiz_prefix")||{}).value || "");
  f("wiz_bc_done", s.compliance && s.compliance.bc);
  f("wiz_asset_done", s.compliance && s.compliance.asset);
  f("wiz_photos_done", s.compliance && s.compliance.photos);

  f("wiz_chk_physical", s.checklists && s.checklists.physical);
  f("wiz_chk_os", s.checklists && s.checklists.os);
  f("wiz_chk_kiosk", s.checklists && s.checklists.kiosk);
  f("wiz_chk_qa", s.checklists && s.checklists.qa);

  const compEl = document.getElementById("wiz_compliance_status");
  if(compEl) compEl.textContent = s.step2_done ? "✅ Confirmed" : "Not confirmed yet.";

  const chkEl = document.getElementById("wiz_checklist_status");
  if(chkEl) chkEl.textContent = s.step3_done ? "✅ Confirmed" : "Not confirmed yet.";

  const pktEl = document.getElementById("wiz_packet_status");
  if(pktEl) pktEl.textContent = s.step4_done ? "✅ Generated" : "Not generated yet.";
}


    // Refresh when wizard is opened (safe hook)
    (function(){
      try{
        const _origShow = (typeof window.show === "function") ? window.show : (typeof show === "function" ? show : null);
        if(!_origShow) return;
        window.show = function(id){
          _origShow(id);
          if(id === "wizard" && typeof wizardRefresh === "function"){ wizardRefresh(); }
        };
      }catch(e){}
    })();

/* ============================
   v4.0 Global Exports (Auto)
   Exposes all functions used by inline onclick handlers.
   ============================ */
(function(){
  try{
    const exportNames = [
  "addCorpDoc",
  "addScenarioLink",
  "attemptAdminUnlock",
  "clearAuditLog",
  "clearBasecampToken",
  "clearCorpDocForm",
  "clearLinkForm",
  "closeAdminModal",
  "closeCorpDocsManager",
  "closeLinkManager",
  "copyAuditSummary",
  "copyFrom",
  "copyGoldenConfigDigest",
  "directSyncToBasecamp",
  "downloadTaskBundle",
  "downloadTemplate",
  "exportAudit",
  "exportCorpDocs",
  "exportGoldenConfig",
  "exportPacketJSON",
  "exportPortalConfig",
  "exportReport",
  "exportScenarioLinks",
  "generateAsset",
  "generateBasecamp",
  "generateETL",
  "generatePacketPdf",
  "importGoldenConfig",
  "lockAdmin",
  "openAdminModal",
  "openCorpDocsManager",
  "openLinkManager",
  "openPacketPreview",
  "refreshAuditUI",
  "renderAuditTable",
  "renderScenarioResources",
  "resetAdminPin",
  "resetAll",
  "resetEditorPin",
  "resetScenarioLinks",
  "saveBasecampSettings",
  "savePdf",
  "show",
  "testBasecampConnection",
  "toggleReadOnly",
  "toggleSidebar",
  "wizardAutoDetect",
  "wizardBuildPacket",
  "wizardConfirmChecklists",
  "wizardConfirmCompliance",
  "wizardOpenScenarioLinks",
  "wizardReset",
  "wizardSaveScenarioStack"
];
    exportNames.forEach(n=>{
      if(typeof window[n] !== 'function' && typeof globalThis[n] === 'function') {
        window[n] = globalThis[n];
      }
    });
    // Ensure show/toggleSidebar are always exported if present
    if(typeof window.show !== 'function' && typeof globalThis.show === 'function') window.show = globalThis.show;
    if(typeof window.toggleSidebar !== 'function' && typeof globalThis.toggleSidebar === 'function') window.toggleSidebar = globalThis.toggleSidebar;
  } catch(e) {}
})();
