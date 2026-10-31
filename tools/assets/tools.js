/* Aristotl.es tools — shared helpers */
(function () {
  "use strict";

  const API = String(window.ARISTOTLES_API || "").replace(/\/+$/, "");

  const CRITERIA = [
    { key: "ethos", label: "Ethos", hint: "Credibility — did you trust them?", color: "var(--c-ethos)", hex: "#A07CD0" },
    { key: "pathos", label: "Pathos", hint: "Connection — did you feel something?", color: "var(--c-pathos)", hex: "#E07A6B" },
    { key: "logos", label: "Logos", hint: "Reasoning — was the point clear and convincing?", color: "var(--c-logos)", hex: "#6B8CCF" },
    { key: "structure", label: "Structure", hint: "Shape — a clear start, spine and close?", color: "var(--c-structure)", hex: "#E9B85C" },
    { key: "delivery", label: "Delivery", hint: "Voice, pace, eyes, body, use of space.", color: "var(--c-delivery)", hex: "#4FB6A6" },
  ];

  /* ---------- storage that never throws ---------- */
  const store = {
    get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  function randomId(n = 16) {
    const chars = "abcdefghijkmnopqrstuvwxyz23456789";
    const b = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(b, x => chars[x % chars.length]).join("");
  }
  function voterId() {
    let v = store.get("aristotles.voter");
    if (!v) { v = randomId(16); store.set("aristotles.voter", v); }
    return v;
  }

  /* ---------- API ---------- */
  async function api(path, { method = "GET", body, host = false } = {}) {
    if (!API || API.includes("YOUR-SUBDOMAIN")) throw new Error("The tools are not connected yet: set your Worker address in tools/assets/config.js.");
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (host) { const k = store.get("aristotles.hostKey"); if (k) headers["Authorization"] = "Bearer " + k; }
    let res;
    try {
      res = await fetch(API + "/api" + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error("Can't reach the server. Check the connection and try again.");
    }
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  /* ---------- small DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function param(name) { return new URLSearchParams(location.search).get(name); }
  function fmtDate(s) {
    if (!s) return "";
    const d = new Date(String(s).replace(" ", "T") + (String(s).endsWith("Z") ? "" : "Z"));
    return isNaN(d) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function siteUrl(path) { return new URL(path, location.href).href; }

  /* ---------- QR code (vendored qrcode-generator) ---------- */
  function qrSvg(text, { dark = "#1B1426", light = "#F4EFE4", margin = 2 } = {}) {
    const qr = window.qrcode(0, "M");
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), size = n + margin * 2;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  /* ---------- radar chart ---------- */
  function radarSvg(scores, { size = 320, compare = null, labels = true, ink = "#EDE6F2", soft = "rgba(237,230,242,.16)" } = {}) {
    const cx = size / 2, cy = size / 2, R = size * (labels ? 0.33 : 0.44), N = CRITERIA.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * v / 5, cy + Math.sin(a) * R * v / 5]; };
    const poly = obj => CRITERIA.map((c, i) => pt(i, Math.max(0, Math.min(5, Number(obj?.[c.key]) || 0))).map(n => n.toFixed(1)).join(",")).join(" ");
    let g = "";
    for (let ring = 1; ring <= 5; ring++) g += `<polygon points="${CRITERIA.map((_, i) => pt(i, ring).join(",")).join(" ")}" fill="none" stroke="${soft}" stroke-width="${ring === 5 ? 1.4 : 1}"/>`;
    CRITERIA.forEach((_, i) => { const [x, y] = pt(i, 5); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${soft}"/>`; });
    if (compare) g += `<polygon points="${poly(compare)}" fill="none" stroke="${ink}" stroke-opacity=".45" stroke-width="1.6" stroke-dasharray="4 4"/>`;
    g += `<polygon points="${poly(scores)}" fill="rgba(233,184,92,.28)" stroke="#E9B85C" stroke-width="2.4" stroke-linejoin="round"/>`;
    CRITERIA.forEach((c, i) => { const [x, y] = pt(i, Math.max(0, Math.min(5, Number(scores?.[c.key]) || 0))); g += `<circle cx="${x}" cy="${y}" r="4.5" fill="${c.hex}" stroke="#1B1426" stroke-width="1.5"/>`; });
    if (labels) CRITERIA.forEach((c, i) => {
      const [x0, y] = pt(i, 6.2);
      const x = Math.max(size * 0.12, Math.min(size * 0.88, x0));
      const v = scores?.[c.key];
      const anchor = "middle";
      g += `<text x="${x}" y="${y - 4}" text-anchor="${anchor}" font-family="Space Mono, monospace" font-size="${size * 0.036}" font-weight="700" letter-spacing=".08em" fill="${c.hex}">${c.label.toUpperCase()}</text>`;
      g += `<text x="${x}" y="${y + size * 0.05}" text-anchor="${anchor}" font-family="Fraunces, Georgia, serif" font-size="${size * 0.06}" font-weight="600" fill="${ink}">${v == null ? "–" : Number(v).toFixed(1)}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="100%" role="img" aria-label="Feedback radar chart">${g}</svg>`;
  }

  /* ---------- speaker profiles & characters, read live from the home page ----------
     The home page already contains the 25 profiles, the 6 families and the character
     drawing code. We reuse them so everything stays in sync with your site. */
  let charactersPromise = null;
  function loadCharacters() {
    if (charactersPromise) return charactersPromise;
    charactersPromise = (async () => {
      const html = await (await fetch("/", { cache: "force-cache" })).text();
      const scripts = Array.from(html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g), m => m[1]);
      const src = scripts.find(s => s.includes("function avatar(") && s.includes("const GROUPS"));
      if (!src) throw new Error("Profiles not found on the home page");
      const cut = src.indexOf("/* ---------- render");
      const code = cut > 0 ? src.slice(0, cut) : src;
      const lib = new Function(code + "\n;return { avatar, GROUPS, P };")();
      const groups = Object.fromEntries(lib.GROUPS.map(g => [g.id, g]));
      const profiles = lib.P.map(p => ({ ...p, group: groups[p.g] }));
      return {
        groups: lib.GROUPS, profiles,
        byId: Object.fromEntries(profiles.map(p => [p.id, p])),
        draw: (p) => lib.avatar(p.group.color, p.pose, p.face, p.id),
      };
    })().catch(err => { console.warn("Speaker profiles unavailable:", err); return null; });
    return charactersPromise;
  }

  /* ---------- passport kept on this phone ---------- */
  const passport = {
    get() { return store.get("aristotles.passport"); },
    set(p) { store.set("aristotles.passport", { id: p.id, secret: p.secret, name: p.name }); },
    clear() { store.del("aristotles.passport"); },
    link(p) { return siteUrl(`passport.html?id=${encodeURIComponent(p.id)}&k=${encodeURIComponent(p.secret)}`); },
  };

  // self-rating questions, from the speaker's point of view
  const SELF_HINTS = {
    ethos: "Credibility — did you feel like they trusted what you said?",
    pathos: "Connection — did you feel the room was with you?",
    logos: "Reasoning — do you think they could repeat your main point?",
    structure: "Shape — did you have a clear opening, spine and close?",
    delivery: "Voice, pace, eyes, body — how did you feel you came across?",
  };
  window.AT = { SELF_HINTS, API, CRITERIA, store, voterId, randomId, api, $, $$, esc, param, fmtDate, siteUrl, qrSvg, radarSvg, loadCharacters, passport };
})();
