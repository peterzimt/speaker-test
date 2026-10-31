/* Aristotl.es — participant pages in English, Spanish and French.
   English text is the key: every text node, placeholder, title and aria-label whose English text is in the
   dictionary is swapped for the chosen language, including text the page adds later (a MutationObserver).
   Strings with numbers or names use PATTERNS. Load after tools.js. */
(function () {
  "use strict";
  const SUPPORTED = ["en", "es", "fr"];
  const KEY = "aristotles.lang";
  function pickLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (q && SUPPORTED.includes(q)) { try { localStorage.setItem(KEY, q); } catch {} return q; }
    try { const s = localStorage.getItem(KEY); if (SUPPORTED.includes(s)) return s; } catch {}
    const n = (navigator.language || "en").slice(0, 2).toLowerCase();
    return SUPPORTED.includes(n) ? n : "en";
  }
  const lang = pickLang();
  const DICT = window.ARISTOTLES_DICT || {};      // { "English": [es, fr] } from i18n-dict.js
  const PATTERNS = window.ARISTOTLES_PATTERNS || [];
  const col = lang === "es" ? 0 : lang === "fr" ? 1 : -1;
  const norm = s => s.replace(/\s+/g, " ").trim();

  function tr(text) {
    if (col < 0 || !text) return null;
    const k = norm(text); if (!k) return null;
    const hit = DICT[k];
    if (hit && hit[col]) return hit[col];
    for (const [re, out] of PATTERNS) { const m = k.match(re); if (m) return out[col](...m.slice(1)); }
    // "🎯 Some text": translate the text after a leading emoji/symbol
    const em = k.match(/^([^\p{L}\p{N}“"(¿¡]+)\s(.+)$/u);
    if (em && DICT[em[2]]?.[col]) return em[1] + " " + DICT[em[2]][col];
    // "A · B · C": translate each part that we know
    if (k.includes(" · ")) {
      const parts = k.split(" · "), out = parts.map(x => tr(x) ?? x);
      if (out.some((x, i) => x !== parts[i])) return out.join(" · ");
    }
    return null;
  }
  function t(text) { return tr(text) ?? text; }
  function swapText(node) {
    const v = node.nodeValue, r = tr(v);
    if (r != null && r !== norm(v)) { const lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0]; node.nodeValue = lead + r + trail; }
  }
  const ATTRS = ["placeholder", "title", "aria-label"];
  function walk(root) {
    if (root.nodeType === 3) return swapText(root);
    if (root.nodeType !== 1 || root.closest?.("[data-no-i18n], script, style")) return;
    for (const a of ATTRS) if (root.hasAttribute(a)) { const r = tr(root.getAttribute(a)); if (r != null) root.setAttribute(a, r); }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: n => (n.nodeType === 1 && (n.matches("script, style, [data-no-i18n]")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n; while ((n = it.nextNode())) {
      if (n.nodeType === 3) swapText(n);
      else for (const a of ATTRS) if (n.hasAttribute(a)) { const r = tr(n.getAttribute(a)); if (r != null) n.setAttribute(a, r); }
    }
  }
  function start() {
    document.documentElement.lang = lang;
    if (col < 0) return;
    walk(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") swapText(m.target);
        else if (m.type === "attributes") { const r = tr(m.target.getAttribute(m.attributeName)); if (r != null && r !== m.target.getAttribute(m.attributeName)) m.target.setAttribute(m.attributeName, r); }
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (document.title) document.title = t(document.title);
  }

  /* EN · ES · FR switch, e.g. AT.langSwitch(document.querySelector(".topbar .row")) */
  function langSwitch(host) {
    if (!host) return;
    const box = document.createElement("span");
    box.className = "langsw"; box.setAttribute("data-no-i18n", "");
    box.innerHTML = SUPPORTED.map(l => `<button type="button" data-l="${l}" aria-pressed="${l === lang}">${l.toUpperCase()}</button>`).join("");
    box.addEventListener("click", e => {
      const b = e.target.closest("button[data-l]"); if (!b || b.dataset.l === lang) return;
      try { localStorage.setItem(KEY, b.dataset.l); } catch {}
      const u = new URL(location.href); u.searchParams.delete("lang"); location.replace(u);
    });
    host.appendChild(box);
  }
  const css = document.createElement("style");
  css.textContent = `.langsw{display:inline-flex;border:1px solid rgba(255,255,255,.18);border-radius:999px;overflow:hidden}
    .langsw button{font:700 11px/1 "Space Mono",monospace;letter-spacing:.06em;padding:7px 8px;background:transparent;border:0;color:inherit;opacity:.55;cursor:pointer}
    .langsw button[aria-pressed="true"]{opacity:1;background:rgba(255,255,255,.12)}`;
  document.head.appendChild(css);

  window.AT = Object.assign(window.AT || {}, { lang, t, langSwitch });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
