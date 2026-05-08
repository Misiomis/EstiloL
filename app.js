// ============================================================
//  Estilo Libertad — Gestión de Ventas en Vivo
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── FIREBASE CONFIG ─────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCkyOsEdLL4RC01RKi7knMwRjtBwXH7fAs",
  authDomain:        "vivo-cfcc1.firebaseapp.com",
  projectId:         "vivo-cfcc1",
  storageBucket:     "vivo-cfcc1.firebasestorage.app",
  messagingSenderId: "367112738062",
  appId:             "1:367112738062:web:25657a130a20c8b202f35f",
  measurementId:     "G-QCBT9HG4Y6"
};
// ─────────────────────────────────────────────────────────────

// ─── LOGIN ───────────────────────────────────────────────────
const LOGIN_USER = "Estilo Libertad";
const LOGIN_PASS = "Libertad2026";
// ─────────────────────────────────────────────────────────────

const USE_FIREBASE = true;

// ============================================================
//  STORAGE ABSTRACTION
// ============================================================
class LocalDB {
  constructor(key) { this._key = key; this._subs = new Set(); }
  _load() {
    try {
      return (JSON.parse(localStorage.getItem(this._key)) || []).map(v => ({
        ...v, fechaCreacion: v.fechaCreacion ? new Date(v.fechaCreacion) : new Date()
      }));
    } catch { return []; }
  }
  _save(items) { localStorage.setItem(this._key, JSON.stringify(items)); this._notify(items); }
  _notify(items) {
    const parsed = items.map(v => ({ ...v, fechaCreacion: v.fechaCreacion instanceof Date ? v.fechaCreacion : new Date(v.fechaCreacion) }));
    this._subs.forEach(cb => cb(parsed));
  }
  subscribe(cb) { this._subs.add(cb); cb(this._load()); return () => this._subs.delete(cb); }
  async add(data) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    const items = this._load();
    items.unshift({ ...data, id, fechaCreacion: new Date() });
    this._save(items);
    return id;
  }
  async update(id, changes) {
    const items = this._load();
    const i = items.findIndex(v => v.id === id);
    if (i !== -1) { items[i] = { ...items[i], ...changes }; this._save(items); }
  }
  async remove(id) { this._save(this._load().filter(v => v.id !== id)); }
}

class FirestoreDB {
  constructor(db, col) { this._db = db; this._col = col; }
  subscribe(cb) {
    const q = query(collection(this._db, this._col), orderBy("fechaCreacion", "desc"));
    return onSnapshot(q, snap => {
      cb(snap.docs.map(d => ({ id: d.id, ...d.data(), fechaCreacion: d.data().fechaCreacion?.toDate() ?? new Date() })));
    }, err => { console.error("Firestore:", err); showToast("Sin conexión con Firebase — usando datos locales", "info"); });
  }
  async add(data) {
    const ref = await addDoc(collection(this._db, this._col), { ...data, fechaCreacion: serverTimestamp() });
    return ref.id;
  }
  async update(id, changes) { await updateDoc(doc(this._db, this._col, id), changes); }
  async remove(id) { await deleteDoc(doc(this._db, this._col, id)); }
}

let storagePedidos, storageSort;
if (USE_FIREBASE) {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    const db  = getFirestore(app);
    storagePedidos = new FirestoreDB(db, "ventas");
    storageSort    = new FirestoreDB(db, "sorteos");
  } catch (e) {
    console.warn("Firebase no disponible, modo local:", e);
    storagePedidos = new LocalDB("nyn_pedidos");
    storageSort    = new LocalDB("nyn_sorteos");
  }
} else {
  storagePedidos = new LocalDB("nyn_pedidos");
  storageSort    = new LocalDB("nyn_sorteos");
}

// ============================================================
//  ESTADO
// ============================================================
let allVentas    = [];
let allSorteos   = [];
let editId       = null;
let activeFilter = "todos";
let searchQuery  = "";

// ============================================================
//  DOM
// ============================================================
const $ = id => document.getElementById(id);

const formVenta        = $("form-venta");
const inpCliente       = $("inp-cliente");
const inpTelefono      = $("inp-telefono");
const selProducto      = $("sel-producto");
const inpMarca         = $("inp-marca");
const selSegmento      = $("sel-segmento");
const inpAccesorio     = $("inp-accesorio");
const inpAccesorioOtro = $("inp-accesorio-otro");
const inpTalle         = $("inp-talle");
const inpColor         = $("inp-color");
const inpPrecio        = $("inp-precio");
const inpPago          = $("inp-pago");
const inpEditId        = $("inp-edit-id");
const dynMarca         = $("dyn-marca");
const dynSegmento      = $("dyn-segmento");
const dynAccesorio     = $("dyn-accesorio");
const dynAccesorioOtro = $("dyn-accesorio-otro");
const btnGuardar       = $("btn-guardar");
const btnLbl           = btnGuardar ? btnGuardar.querySelector(".btn-lbl") : null;
const editBanner       = $("edit-banner");
const formTitle        = $("form-title");
const btnCancelEdit    = $("btn-cancel-edit");

const statTotal      = $("stat-total");
const statPending    = $("stat-pending");
const statEntregados = $("stat-entregados");

const inpSearch      = $("inp-search");
const btnSearchClear = $("btn-search-clear");
const resultsEl      = $("results");
const resumenEl      = $("resumen-container");
const entregadosEl   = $("entregados-list");

const formSorteo = $("form-sorteo");
const inpGanador = $("inp-ganador");
const inpPremio  = $("inp-premio");
const btnSorteo  = $("btn-sorteo");
const sorteoList = $("sorteo-list");

const btnPdf  = $("btn-pdf");
const toastEl = $("toast");

const inpVivoNombre     = $("inp-vivo-nombre");
const btnVivoAdd        = $("btn-vivo-add");
const btnLimpiarVivo    = $("btn-limpiar-vivo");
const vivoLista         = $("vivo-lista");
const vivoCount         = $("vivo-count");
const btnVivoStart      = $("btn-vivo-start");
const vivoRuletaBox     = $("vivo-ruleta-box");
const vivoRuletaNom     = $("vivo-ruleta-nombre");
const vivoRuletaTot     = $("vivo-ruleta-total");
const vivoGanadorBox    = $("vivo-ganador-box");
const vivoGanadorNom    = $("vivo-ganador-nombre");
const btnAceptarGanador = $("btn-aceptar-ganador");
const inpVivoPremio     = $("inp-vivo-premio");
const btnRepetirVivo    = $("btn-repetir-vivo");
const btnResetVivo      = $("btn-reset-vivo");

const appEl          = $("app");
const loginOverlay   = $("login-overlay");
const loginForm      = $("login-form");
const inpLoginUser   = $("inp-login-user");
const inpLoginPass   = $("inp-login-pass");
const loginError     = $("login-error");
const btnEye         = $("btn-eye");

// ============================================================
//  UTILIDADES
// ============================================================
const esc = str => str ? String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) : "";
const fmtPrice    = n => Number(n || 0).toLocaleString("es-AR");
const parsePrecio = s => {
  const str = String(s).replace(/[$\s]/g, '').trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(str)) return Number(str.replace(/\./g, ''));
  if (/^\d{1,3}(,\d{3})+$/.test(str))  return Number(str.replace(/,/g, ''));
  return parseFloat(str.replace(/[^\d.]/g, '')) || 0;
};
const fmtDate     = d => d ? d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" }) : "";
const fmtTime     = d => d ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
const dateKey     = d => d instanceof Date ? d.toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

function showToast(msg, type = "info") {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.className = `toast toast--show toast--${type}`;
  setTimeout(() => toastEl.classList.remove("toast--show"), 3500);
}

// ============================================================
//  SONIDO (Web Audio API — sin archivos externos)
// ============================================================
let audioCtx = null;

function getAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}

function playTick(freq = 700) {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.055);
  } catch(e) {}
}

function playWinner() {
  try {
    const ctx = getAudio();
    if (!ctx) return;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      const t = ctx.currentTime + i * 0.13;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  } catch(e) {}
}

// ============================================================
//  CONFETTI
// ============================================================
function launchConfetti() {
  const layer = document.createElement("div");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9997;overflow:hidden;";
  document.body.appendChild(layer);
  const colors = ["#8BAF86","#D4BC98","#B0CCA9","#ffffff","#5A7A56","#E8DDD0","#6dcf6d","#A8906E"];
  for (let i = 0; i < 130; i++) {
    const p     = document.createElement("div");
    const color = colors[i % colors.length];
    const size  = 4 + Math.random() * 8;
    const left  = Math.random() * 100;
    const delay = Math.random() * 1.2;
    const dur   = 2.2 + Math.random() * 1.8;
    const shape = Math.random() > 0.4 ? "50%" : "2px";
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${color};left:${left}%;top:-12px;border-radius:${shape};animation:confettiFall ${dur}s ${delay}s ease-in forwards;`;
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 4800);
}

// ============================================================
//  LOGIN
// ============================================================
function setupLogin() {
  if (localStorage.getItem("nyn_auth") === "ok") {
    showApp();
    return;
  }

  if (btnEye) {
    btnEye.addEventListener("click", () => {
      const isPass = inpLoginPass.type === "password";
      inpLoginPass.type = isPass ? "text" : "password";
      btnEye.querySelector("svg").style.opacity = isPass ? ".5" : "1";
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", e => {
      e.preventDefault();
      const user = inpLoginUser?.value.trim();
      const pass = inpLoginPass?.value;
      if (user === LOGIN_USER && pass === LOGIN_PASS) {
        localStorage.setItem("nyn_auth", "ok");
        loginOverlay.classList.add("login-out");
        setTimeout(showApp, 400);
      } else {
        if (loginError) loginError.hidden = false;
        if (inpLoginPass) {
          inpLoginPass.classList.add("err");
          setTimeout(() => inpLoginPass.classList.remove("err"), 1500);
        }
      }
    });
  }
}

function showApp() {
  if (loginOverlay) loginOverlay.style.display = "none";
  if (appEl)        appEl.hidden = false;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  boot();
}

// ============================================================
//  BOOT
// ============================================================
function boot() {
  setupTabs();
  setupProductoChange();
  setupAccesorioOtro();
  setupPayToggle();
  setupForm();
  setupSearch();
  setupSorteoForm();
  setupEditCancel();
  setupSorteoVivo();

  if (btnPdf) btnPdf.addEventListener("click", () => showToast("Función PDF próximamente", "info"));

  storagePedidos.subscribe(ventas => {
    allVentas = ventas;
    updateStats();
    renderResults();
    renderDailySummary();
    renderEntregados();
  });

  storageSort.subscribe(sorteos => {
    allSorteos = sorteos;
    renderSorteos();
  });

  if (inpCliente) inpCliente.focus();
}

// ============================================================
//  TABS
// ============================================================
function setupTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tabName);
    b.setAttribute("aria-selected", b.dataset.tab === tabName ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach(p => {
    p.classList.toggle("active", p.id === `panel-${tabName}`);
  });
  if (tabName === "buscar")  setTimeout(() => inpSearch  && inpSearch.focus(), 80);
  if (tabName === "sorteo")  setTimeout(() => inpGanador && inpGanador.focus(), 80);
}

// ============================================================
//  CAMPOS DINÁMICOS
// ============================================================
function setupProductoChange() {
  if (selProducto) selProducto.addEventListener("change", applyProductoLogic);
}

function applyProductoLogic() {
  const p = selProducto.value;
  closeField(dynMarca); closeField(dynSegmento);
  closeField(dynAccesorio); closeField(dynAccesorioOtro);
  if (p === "Zapatillas") openField(dynMarca);
  else if (p === "Abrigo" || p === "Remera") openField(dynSegmento);
  else if (p === "Accesorio") openField(dynAccesorio);
}

function setupAccesorioOtro() {
  if (inpAccesorio) {
    inpAccesorio.addEventListener("change", () => {
      if (inpAccesorio.value === "Otro") {
        openField(dynAccesorioOtro);
        if (inpAccesorioOtro) inpAccesorioOtro.focus();
      } else {
        closeField(dynAccesorioOtro);
      }
    });
  }
}

function openField(el)  { if (el) el.classList.add("open"); }
function closeField(el) { if (el) el.classList.remove("open"); }

// ============================================================
//  PAYMENT TOGGLE
// ============================================================
function setupPayToggle() {
  document.querySelectorAll(".pay-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".pay-btn").forEach(b => b.classList.remove("pay-btn--active"));
      btn.classList.add("pay-btn--active");
      if (inpPago) inpPago.value = btn.dataset.status;
    });
  });
}

// ============================================================
//  FORMULARIO VENTAS
// ============================================================
function setupForm() {
  if (!formVenta) return;
  formVenta.addEventListener("submit", async e => {
    e.preventDefault();
    if (!validateForm()) return;
    setLoading(btnGuardar, true);

    const datos = {
      nombreCliente: inpCliente.value.trim(),
      producto:      selProducto.value,
      talle:         inpTalle.value.trim(),
      color:         inpColor.value.trim(),
      precio:        parsePrecio(inpPrecio.value),
      estadoPago:    inpPago.value,
      entregado:     false
    };
    if (inpTelefono?.value.trim()) datos.telefono = inpTelefono.value.trim();
    if (selProducto.value === "Zapatillas" && inpMarca?.value.trim()) datos.marca = inpMarca.value.trim();
    if ((selProducto.value === "Abrigo" || selProducto.value === "Remera") && selSegmento?.value) datos.segmento = selSegmento.value;
    if (selProducto.value === "Accesorio" && inpAccesorio?.value) {
      datos.tipoAccesorio = inpAccesorio.value === "Otro" ? inpAccesorioOtro?.value.trim() : inpAccesorio.value;
    }

    try {
      if (editId) {
        await storagePedidos.update(editId, datos);
        showToast(`✓ Pedido de ${datos.nombreCliente} actualizado`, "ok");
      } else {
        await storagePedidos.add(datos);
        showToast(`✓ Venta guardada para ${datos.nombreCliente}`, "ok");
      }
      resetForm();
    } catch (err) {
      console.error(err);
      showToast("Error al guardar — revisá las reglas de Firestore", "err");
    } finally {
      setLoading(btnGuardar, false);
    }
  });
}

function validateForm() {
  let ok = true;
  [inpCliente, selProducto, inpTalle, inpPrecio].forEach(f => {
    if (f) {
      f.classList.remove("err");
      if (!f.value.trim()) { f.classList.add("err"); ok = false; }
    }
  });
  if (!ok) showToast("Completá los campos obligatorios", "err");
  return ok;
}

function resetForm() {
  editId = null;
  formVenta.reset();
  if (inpPago) inpPago.value = "pendiente";
  document.querySelectorAll(".pay-btn").forEach(b => b.classList.remove("pay-btn--active"));
  const pendBtn = document.querySelector('[data-status="pendiente"]');
  if (pendBtn) pendBtn.classList.add("pay-btn--active");
  closeField(dynMarca); closeField(dynSegmento);
  closeField(dynAccesorio); closeField(dynAccesorioOtro);
  if (editBanner) editBanner.hidden = true;
  if (formTitle)  formTitle.textContent = "Registrar Venta";
  if (btnLbl)     btnLbl.textContent = "Guardar Venta";
  if (inpEditId)  inpEditId.value = "";
}

function setupEditCancel() {
  if (btnCancelEdit) btnCancelEdit.addEventListener("click", resetForm);
}

function setLoading(btn, on) {
  if (btn) { btn.disabled = on; btn.classList.toggle("loading", on); }
}

// ============================================================
//  ACCIÓN EN TARJETAS (global para inline onclick)
// ============================================================
window.handleAction = async function(action, id) {
  if (action === "deliver") {
    try {
      await storagePedidos.update(id, { entregado: true, estadoPago: "pagado" });
      showToast("📦 Producto marcado como entregado", "ok");
    } catch (err) {
      console.error(err);
      showToast("Error al actualizar", "err");
    }
  } else if (action === "delete") {
    if (!confirm("¿Eliminar este pedido?")) return;
    try {
      await storagePedidos.remove(id);
      showToast("Pedido eliminado", "info");
    } catch (err) {
      console.error(err);
      showToast("Error al eliminar", "err");
    }
  }
};

// ============================================================
//  BÚSQUEDA Y RENDER (agrupado por día)
// ============================================================
function setupSearch() {
  if (inpSearch) {
    inpSearch.addEventListener("input", e => {
      searchQuery = e.target.value.trim().toLowerCase();
      if (btnSearchClear) btnSearchClear.hidden = !searchQuery;
      renderResults();
    });
  }
  if (btnSearchClear) {
    btnSearchClear.addEventListener("click", () => {
      if (inpSearch) inpSearch.value = "";
      searchQuery = "";
      btnSearchClear.hidden = true;
      renderResults();
      inpSearch?.focus();
    });
  }
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("chip--active"));
      chip.classList.add("chip--active");
      activeFilter = chip.dataset.filter;
      renderResults();
    });
  });
}

function updateStats() {
  if (statTotal)      statTotal.textContent      = allVentas.length;
  if (statPending)    statPending.textContent    = allVentas.filter(v => v.estadoPago === "pendiente" && !v.entregado).length;
  if (statEntregados) statEntregados.textContent = allVentas.filter(v => v.entregado).length;
}

function renderResults() {
  if (!resultsEl) return;
  let list = [...allVentas];
  if (searchQuery) list = list.filter(v => v.nombreCliente?.toLowerCase().includes(searchQuery));
  if (activeFilter === "pendiente") list = list.filter(v => v.estadoPago === "pendiente" && !v.entregado);
  else if (activeFilter === "pagado") list = list.filter(v => v.estadoPago === "pagado" && !v.entregado);

  if (!list.length) {
    resultsEl.innerHTML = searchQuery
      ? `<div class="empty"><div class="empty-ico">😕</div><p>No se encontraron pedidos para "<strong>${esc(searchQuery)}</strong>"</p></div>`
      : `<div class="empty"><div class="empty-ico">🔍</div><p>Buscá por nombre o filtrá por estado</p></div>`;
    return;
  }

  // Agrupar por día
  const byDate = {};
  list.forEach(v => {
    const k = dateKey(v.fechaCreacion);
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(v);
  });

  resultsEl.innerHTML = "";
  Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(dk => {
    const sep = document.createElement("div");
    sep.className = "day-sep";
    const dayTotal = byDate[dk].reduce((s, v) => s + (v.precio || 0), 0);
    sep.innerHTML = `
      <span class="day-sep-label">${fmtDate(new Date(dk + "T12:00:00"))}</span>
      <span class="day-sep-total">$${fmtPrice(dayTotal)}</span>
    `;
    resultsEl.appendChild(sep);
    byDate[dk].forEach(v => resultsEl.appendChild(buildCard(v)));
  });
}

function buildCard(v) {
  const card = document.createElement("div");
  const cls  = v.entregado ? "card-delivered" : v.estadoPago === "pagado" ? "card-paid" : "card-pending";
  card.className = `card ${cls}`;

  let extra = "";
  if (v.marca)         extra += ` · ${esc(v.marca)}`;
  if (v.segmento)      extra += ` · ${esc(v.segmento)}`;
  if (v.tipoAccesorio) extra += ` · ${esc(v.tipoAccesorio)}`;
  if (v.color)         extra += ` · ${esc(v.color)}`;

  const estadoTag = v.entregado
    ? `<span class="tag tag-delivered">Entregado</span>`
    : v.estadoPago === "pagado"
      ? `<span class="tag tag-paid">Pagado</span>`
      : `<span class="tag tag-pending">Pendiente</span>`;

  card.innerHTML = `
    <div class="card-head">
      <strong>${esc(v.nombreCliente)}</strong>
      ${estadoTag}
    </div>
    <div class="card-body">
      ${esc(v.producto)}${extra} · T: ${esc(v.talle)} · <strong>$${fmtPrice(v.precio)}</strong>
      ${v.telefono ? `<br><span class="card-tel">📞 ${esc(v.telefono)}</span>` : ""}
    </div>
    <div class="card-actions">
      ${!v.entregado ? `<button onclick="handleAction('deliver','${v.id}')">📦 Entregar</button>` : ""}
      <button onclick="handleAction('delete','${v.id}')">🗑 Eliminar</button>
    </div>
  `;
  return card;
}

// ============================================================
//  RESUMEN DIARIO
// ============================================================
function renderDailySummary() {
  if (!resumenEl) return;
  if (!allVentas.length) {
    resumenEl.innerHTML = `<div class="empty"><div class="empty-ico">📅</div><p>Todavía no hay pedidos registrados</p></div>`;
    return;
  }

  const byDate = {};
  allVentas.forEach(v => {
    const k = dateKey(v.fechaCreacion);
    if (!byDate[k]) byDate[k] = [];
    byDate[k].push(v);
  });

  resumenEl.innerHTML = "";
  Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach(dk => {
    const ventas  = byDate[dk];
    const total   = ventas.reduce((acc, v) => acc + (v.precio || 0), 0);
    const pagadas = ventas.filter(v => v.estadoPago === "pagado").length;
    const pending = ventas.filter(v => v.estadoPago === "pendiente" && !v.entregado).length;
    const entreg  = ventas.filter(v => v.entregado).length;

    const group = document.createElement("div");
    group.className = "resumen-day";
    group.innerHTML = `
      <div class="resumen-day-head">
        <span class="resumen-day-label">${fmtDate(new Date(dk + "T12:00:00"))}</span>
        <span class="resumen-total">$${fmtPrice(total)}</span>
      </div>
      <div class="resumen-badges">
        <span class="badge badge-total">${ventas.length} ventas</span>
        <span class="badge badge-paid">✓ ${pagadas} pagadas</span>
        <span class="badge badge-pending">⏳ ${pending} pendientes</span>
        <span class="badge badge-delivered">📦 ${entreg} entregados</span>
      </div>
      <div class="resumen-items">
        ${ventas.map(v => `
          <div class="resumen-item">
            <span>${esc(v.nombreCliente)} — ${esc(v.producto)} T:${esc(v.talle)}</span>
            <span>$${fmtPrice(v.precio)}</span>
          </div>
        `).join("")}
      </div>
    `;
    resumenEl.appendChild(group);
  });
}

// ============================================================
//  ENTREGADOS
// ============================================================
function renderEntregados() {
  if (!entregadosEl) return;
  const entregados = allVentas.filter(v => v.entregado);
  if (!entregados.length) {
    entregadosEl.innerHTML = `<div class="empty"><div class="empty-ico">📦</div><p>Todavía no se entregó ningún producto</p></div>`;
    return;
  }
  entregadosEl.innerHTML = "";
  entregados.forEach(v => {
    const card = document.createElement("div");
    card.className = "card card-delivered";
    card.innerHTML = `
      <div class="card-head">
        <strong>${esc(v.nombreCliente)}</strong>
        <span class="tag tag-delivered">Entregado</span>
      </div>
      <div class="card-body">
        ${esc(v.producto)} · T: ${esc(v.talle)}${v.color ? ` · ${esc(v.color)}` : ""} · <strong>$${fmtPrice(v.precio)}</strong>
      </div>
    `;
    entregadosEl.appendChild(card);
  });
}

// ============================================================
//  SORTEOS — FORMULARIO MANUAL
// ============================================================
function setupSorteoForm() {
  if (!formSorteo) return;
  formSorteo.addEventListener("submit", async e => {
    e.preventDefault();
    const ganador = inpGanador?.value.trim();
    const premio  = inpPremio?.value.trim();
    if (!ganador || !premio) {
      showToast("Completá ganador y premio", "err");
      return;
    }
    setLoading(btnSorteo, true);
    try {
      await storageSort.add({ ganador, premio });
      showToast(`🏆 ${ganador} registrado como ganador`, "ok");
      formSorteo.reset();
    } catch (err) {
      console.error(err);
      showToast("Error al registrar el sorteo", "err");
    } finally {
      setLoading(btnSorteo, false);
    }
  });
}

// ============================================================
//  SORTEOS — RENDER LISTA
// ============================================================
function renderSorteos() {
  if (!sorteoList) return;
  if (!allSorteos.length) {
    sorteoList.innerHTML = `
      <div class="empty">
        <div class="empty-ico">🏆</div>
        <p>Todavía no se registraron ganadores</p>
      </div>`;
    return;
  }
  sorteoList.innerHTML = "";
  allSorteos.forEach(s => {
    const card = document.createElement("div");
    card.className = "sorteo-card";
    card.innerHTML = `
      <div class="sorteo-card-head">🏆 ${esc(s.ganador)}</div>
      <div class="sorteo-card-body">Premio: ${esc(s.premio)}</div>
      <div class="sorteo-card-time">🕐 ${fmtTime(s.fechaCreacion)}</div>
    `;
    sorteoList.appendChild(card);
  });
}

// ============================================================
//  SORTEO EN VIVO (con sonido y exclusión de ganadores)
// ============================================================
function setupSorteoVivo() {
  if (!btnVivoAdd) return;
  let participantes = [];
  let ganadorActual = null;
  let ganadoresSesion = new Set(); // excluidos en tandas de repetición
  let tickFreq = 700;

  function addParticipante() {
    const nom = inpVivoNombre?.value.trim();
    if (!nom) return;
    participantes.push(nom);
    if (inpVivoNombre) inpVivoNombre.value = "";
    inpVivoNombre?.focus();
    renderParticipantes();
  }

  if (inpVivoNombre) {
    inpVivoNombre.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); addParticipante(); }
    });
  }

  btnVivoAdd.onclick = addParticipante;

  if (btnLimpiarVivo) {
    btnLimpiarVivo.onclick = () => {
      participantes = [];
      ganadorActual = null;
      ganadoresSesion = new Set();
      renderParticipantes();
    };
  }

  function renderParticipantes() {
    if (!vivoLista) return;
    const elegibles = participantes.filter(p => !ganadoresSesion.has(p));
    if (participantes.length === 0) {
      vivoLista.innerHTML = `<p class="vivo-empty-hint">Agregá al menos 2 participantes para sortear</p>`;
    } else {
      vivoLista.innerHTML = participantes.map((p, i) => {
        const yaGano = ganadoresSesion.has(p);
        return `<div class="vivo-item${yaGano ? " vivo-item--ganado" : ""}">${i + 1}. ${esc(p)}${yaGano ? " ✓" : ""}</div>`;
      }).join("");
    }
    if (vivoCount)    vivoCount.textContent  = participantes.length;
    if (btnVivoStart) btnVivoStart.disabled  = elegibles.length < 2;
  }

  function iniciarSorteo() {
    const elegibles = participantes.filter(p => !ganadoresSesion.has(p));
    if (elegibles.length < 1) {
      showToast("¡Todos los participantes ya ganaron en esta tanda!", "info");
      return;
    }
    if (elegibles.length < 2) {
      showToast(`Solo queda ${elegibles[0]} — será el ganador`, "info");
    }
    if (vivoGanadorBox) vivoGanadorBox.hidden = true;
    if (vivoRuletaBox)  vivoRuletaBox.hidden  = false;
    if (vivoRuletaTot)  vivoRuletaTot.textContent = elegibles.length;
    if (btnVivoStart)   btnVivoStart.disabled  = true;

    tickFreq = 700;
    let i = 0;
    let tickCount = 0;

    const interval = setInterval(() => {
      if (vivoRuletaNom) vivoRuletaNom.textContent = elegibles[i % elegibles.length];
      i++;
      tickCount++;
      if (tickCount % 2 === 0) playTick(tickFreq);
      if (tickCount > 20) tickFreq = Math.max(300, tickFreq - 15);
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      ganadorActual = elegibles[Math.floor(Math.random() * elegibles.length)];
      ganadoresSesion.add(ganadorActual);
      if (vivoRuletaBox)  vivoRuletaBox.hidden  = true;
      if (vivoGanadorBox) vivoGanadorBox.hidden  = false;
      if (vivoGanadorNom) vivoGanadorNom.textContent = ganadorActual;
      if (inpVivoPremio)  inpVivoPremio.value = "";
      renderParticipantes();
      playWinner();
      launchConfetti();
    }, 3000);
  }

  if (btnVivoStart) btnVivoStart.onclick = iniciarSorteo;

  if (btnRepetirVivo) {
    btnRepetirVivo.onclick = () => {
      ganadorActual = null;
      iniciarSorteo();
    };
  }

  if (btnAceptarGanador) {
    btnAceptarGanador.onclick = async () => {
      if (!ganadorActual) return;
      const premio = inpVivoPremio?.value.trim() || "Sin especificar";
      btnAceptarGanador.disabled = true;
      btnAceptarGanador.textContent = "Guardando…";
      try {
        await storageSort.add({ ganador: ganadorActual, premio });
        showToast(`🏆 ${ganadorActual} registrado como ganador`, "ok");
        if (vivoGanadorBox) vivoGanadorBox.hidden = true;
        ganadorActual = null;
        participantes = [];
        ganadoresSesion = new Set();
        renderParticipantes();
        switchTab("sorteo");
      } catch (err) {
        console.error(err);
        showToast("Error al registrar el ganador", "err");
      } finally {
        btnAceptarGanador.disabled = false;
        btnAceptarGanador.textContent = "✅ Aceptar ganador";
      }
    };
  }

  if (btnResetVivo) {
    btnResetVivo.onclick = () => {
      if (vivoGanadorBox) vivoGanadorBox.hidden = true;
      if (vivoRuletaBox)  vivoRuletaBox.hidden  = true;
      ganadorActual = null;
      participantes = [];
      ganadoresSesion = new Set();
      renderParticipantes();
    };
  }
}

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", setupLogin);
