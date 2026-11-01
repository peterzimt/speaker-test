/* Aristotl.es — the AI analysis block of the feedback card (speech.html).
   Shows what the recording says: counts from the transcript, the voice, the exact transcript, then the
   AI coach's feedback (which also reads what the room said). Text is English; i18n-dict.js translates
   the fixed labels, the coach writes in the reader's language. */
(function () {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const t = x => (window.AT && AT.t ? AT.t(x) : x);
  const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;
  const ROLES = () => window.AUDIENCE_ROLES || {};

  const css = document.createElement("style");
  css.textContent = `
  .ai-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}
  .ai-tile{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px}
  .ai-tile .l{font:700 10px/1.2 "Space Mono",monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
  .ai-tile .v{font:600 24px/1.1 Fraunces,serif;margin-top:4px}
  .ai-tile .s{font-size:12.5px;opacity:.75;margin-top:2px}
  .ai-tile.good{border-color:rgba(63,163,110,.5)} .ai-tile.warn{border-color:rgba(208,96,79,.55)}
  .ai-top{font-size:13.5px;opacity:.85}
  .ai-pace{display:flex;align-items:flex-end;gap:4px;height:46px;margin-top:6px}
  .ai-pace span{flex:1;background:var(--gold,#E9B85C);border-radius:3px 3px 0 0;min-height:3px;position:relative}
  .ai-pace span.fast{background:#D0604F} .ai-pace span.slow{background:#7FA7D9}
  .ai-sec{border-top:1px solid rgba(127,127,127,.2);padding-top:12px}
  .ai-sec h4{margin:0 0 6px;font:700 11.5px/1.2 "Space Mono",monospace;letter-spacing:.1em;text-transform:uppercase;opacity:.8}
  .ai-chip{display:inline-block;font:700 11px/1 "Space Mono",monospace;padding:4px 7px;border-radius:999px;margin-left:6px;vertical-align:middle;background:rgba(255,255,255,.08)}
  .ai-chip.good{background:rgba(63,163,110,.22);color:#7FD3A4} .ai-chip.ok{background:rgba(201,150,47,.22);color:#E9C46A} .ai-chip.work{background:rgba(208,96,79,.22);color:#F09584}
  .ai-habit{padding:8px 0;border-top:1px dashed rgba(127,127,127,.18)} .ai-habit:first-of-type{border-top:0}
  .ai-prof{font-size:12.5px;font-style:italic;opacity:.8}
  .ai-ex{border-left:3px solid var(--gold,#E9B85C);padding:4px 10px;margin-top:4px;font-style:italic;opacity:.9;font-size:14px}
  .ai-tx{font-size:15px;line-height:1.75}
  .ai-tx p{margin:0 0 10px} .ai-tx .tm{font:700 10.5px "Space Mono",monospace;opacity:.5;margin-right:6px}
  .ai-tx .f{background:rgba(208,96,79,.3);border-radius:4px;padding:0 2px} .ai-tx .c{background:rgba(201,150,47,.28);border-radius:4px;padding:0 2px}
  .ai-tx .h{text-decoration:underline wavy rgba(127,167,217,.9);text-underline-offset:4px} .ai-tx .a{background:rgba(160,110,220,.3);border-radius:4px;padding:0 2px}
  .ai-tx .n{font-weight:700;color:var(--gold-bright,#F2C46D)} .ai-tx .pz{font:700 10.5px "Space Mono",monospace;opacity:.6;padding:1px 4px;border:1px solid rgba(255,255,255,.2);border-radius:4px;margin:0 2px}
  .ai-legend{display:flex;flex-wrap:wrap;gap:8px;font-size:12.5px;margin-bottom:10px}
  .ai-tx summary,.ai-more summary{cursor:pointer;font-weight:600}
  .ai-wait{display:flex;gap:10px;align-items:center;font-size:14px;opacity:.85}
  .ai-dot{width:10px;height:10px;border-radius:50%;background:var(--gold,#E9B85C);animation:aip 1s ease-in-out infinite alternate}
  @keyframes aip{from{opacity:.25}to{opacity:1}}`;
  document.head.appendChild(css);

  function tile(label, value, sub, cls = "") {
    return `<div class="ai-tile ${cls}"><div class="l">${esc(t(label))}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
  }
  const top = list => (list || []).map(([w, n]) => `“${esc(w)}” ×${n}`).join(", ");

  function metricsHtml(m, target) {
    const v = m.voice || {};
    const pace = m.wpm < 110 ? ["Slow", "warn"] : m.wpm <= 165 ? ["Good pace", "good"] : m.wpm <= 185 ? ["Fast", "warn"] : ["Very fast", "warn"];
    const um = m.fillers.per_min <= 1 ? "good" : m.fillers.per_min >= 4 ? "warn" : "";
    const time = target ? (Math.abs(m.speaking_ms / 1000 - target) <= Math.max(15, target * 0.15) ? "good" : "warn") : "";
    const pitch = v.pitch_st == null ? null : v.pitch_st < 2 ? ["Monotone", "warn"] : v.pitch_st <= 4 ? ["Varied", "good"] : ["Very expressive", "good"];
    let h = `<div class="ai-tiles">`
      + tile("Speaking time", mmss(m.speaking_ms), target ? `${esc(t("Target"))} ${mmss(target * 1000)}` : "", time)
      + tile("Pace", `${m.wpm}`, `${esc(t("words / min"))} · ${esc(t(pace[0]))}`, pace[1])
      + tile("“Um”s", `${m.fillers.count}`, `${m.fillers.per_min} ${esc(t("per minute"))}`, um)
      + tile("Crutch words", `${m.crutches.count}`, "", m.crutches.count >= 6 ? "warn" : "")
      + tile("Pauses", `${m.pauses.count}`, m.pauses.count ? `${esc(t("Longest"))} ${(m.pauses.longest_ms / 1000).toFixed(1)} s` : esc(t("No pause of 1.5 s or more")), m.pauses.blanks ? "warn" : m.pauses.count ? "good" : "")
      + tile("Hedges", `${m.hedges.count}`, esc(t("“I think”, “maybe”, “kind of”…")), m.hedges.count >= 5 ? "warn" : "")
      + tile("Apologies", `${m.apologies.count}`, "", m.apologies.count ? "warn" : "good")
      + tile("Sentences", `${m.sentences.avg}`, `${esc(t("words on average"))} · ${esc(t("longest"))} ${m.sentences.longest}`, m.sentences.avg > 25 ? "warn" : "")
      + tile("Numbers", `${m.numbers}`, "", m.numbers > 8 ? "warn" : "")
      + (pitch ? tile("Voice melody", `${v.pitch_st}`, `${esc(t("semitones"))} · ${esc(t(pitch[0]))}`, pitch[1]) : "")
      + (v.loud_db != null ? tile("Volume changes", `${v.loud_db}`, "dB" + (v.loud_db < 4 ? ` · ${esc(t("Flat"))}` : ""), v.loud_db < 4 ? "warn" : "") : "")
      + (v.fade_db != null ? tile("End of speech", `${v.fade_db > 0 ? "+" : ""}${v.fade_db}`, `dB · ${esc(t(v.fade_db <= -4 ? "Voice fades at the end" : "Voice holds to the end"))}`, v.fade_db <= -4 ? "warn" : "good") : "")
      + `</div>`;
    const tops = [["Fillers", m.fillers], ["Crutch words", m.crutches], ["Hedges", m.hedges], ["Apologies", m.apologies]].filter(([, x]) => x.count);
    if (tops.length || m.repeats.length) {
      h += `<div class="ai-top stack" style="gap:2px">${tops.map(([l, x]) => `<div><strong>${esc(t(l))}:</strong> <span data-no-i18n>${top(x.top)}</span></div>`).join("")}`
        + (m.repeats.length ? `<div><strong>${esc(t("Repeated phrases"))}:</strong> <span data-no-i18n>${top(m.repeats)}</span></div>` : "") + `</div>`;
    }
    if (m.pace.length > 1) {
      const max = Math.max(...m.pace, 180);
      h += `<div><div class="small soft">${esc(t("Pace every 30 seconds (words / min)"))}</div><div class="ai-pace">${m.pace.map(p => `<span class="${p > 175 ? "fast" : p < 105 ? "slow" : ""}" style="height:${Math.round(p / max * 100)}%" title="${p}"></span>`).join("")}</div></div>`;
    }
    return h;
  }

  function transcriptHtml(tokens) {
    let html = "", para = [], start = 0, words = 0, prevEnd = null;
    const flush = () => { if (para.length) html += `<p><span class="tm">${mmss(start)}</span>${para.join(" ")}</p>`; para = []; words = 0; };
    for (const [w, s, e, tag] of tokens) {
      const gap = prevEnd == null ? 0 : s - prevEnd;
      if (gap >= 2500 || (words > 55 && /[.!?…]$/.test(para[para.length - 1] || ""))) { if (gap >= 1500) para.push(`<span class="pz">⏸ ${(gap / 1000).toFixed(1)} s</span>`); flush(); }
      else if (gap >= 1500) para.push(`<span class="pz">⏸ ${(gap / 1000).toFixed(1)} s</span>`);
      if (!para.length) start = s;
      para.push(tag ? `<span class="${tag}">${esc(w)}</span>` : esc(w)); words++; prevEnd = e;
    }
    flush();
    return html;
  }

  const VERDICT = { good: ["✓ Strong", "good"], ok: ["~ OK", "ok"], work: ["✗ Work on it", "work"], unknown: ["– Not seen", ""] };
  const STRUCT = { clear: ["Clear", "good"], partial: ["Partly clear", "ok"], unclear: ["Unclear", "work"] };
  function reportHtml(r) {
    const R = ROLES(), P = x => `<span data-no-i18n>${esc(x)}</span>`;
    const roleName = k => R[k] ? `${R[k].icon} ${esc(t(R[k].name))}` : esc(k);
    const st = STRUCT[r.structure.verdict] || STRUCT.partial;
    let h = `<div class="ai-sec"><h4>${esc(t("Your message"))}</h4><p class="best" style="font-size:19px;margin:0">${P(r.main_message || "—")}</p>`
      + (r.message_clear ? "" : `<p class="small" style="margin:4px 0 0;color:#F09584">${esc(t("⚠ The room may not have caught one clear message."))}</p>`)
      + (r.summary ? `<p class="small soft" style="margin:6px 0 0">${P(r.summary)}</p>` : "") + `</div>`;
    h += `<div class="ai-sec"><h4>🧱 ${esc(t("Structure"))} <span class="ai-chip ${st[1]}">${esc(t(st[0]))}</span></h4>`
      + [["Opening", r.structure.opening], ["Middle", r.structure.body], ["Ending", r.structure.closing]].filter(x => x[1]).map(([l, x]) => `<div class="small" style="margin:3px 0"><strong>${esc(t(l))}:</strong> ${P(x)}</div>`).join("") + `</div>`;
    if (r.theme) h += `<div class="ai-sec"><h4>🎯 ${esc(t("Tonight's theme"))}</h4><div class="small">${P(r.theme)}</div></div>`;
    if (r.habits.length) h += `<div class="ai-sec"><h4>${esc(t("Habit by habit"))}</h4>` + r.habits.map(x => {
      const v = VERDICT[x.verdict] || VERDICT.ok;
      return `<div class="ai-habit"><div><strong>${roleName(x.area)}</strong><span class="ai-chip ${v[1]}">${esc(t(v[0]))}</span></div>`
        + (x.profile ? `<div class="ai-prof">${esc(t("Profile:"))} ${P(x.profile)}</div>` : "") + (x.note ? `<div class="small">${P(x.note)}</div>` : "") + `</div>`;
    }).join("") + `</div>`;
    if (r.strengths.length) h += `<div class="ai-sec"><h4>✓ ${esc(t("What worked"))}</h4>${r.strengths.map(x => `<div class="comment">${P(x)}</div>`).join("")}</div>`;
    if (r.improvements.length) h += `<div class="ai-sec"><h4>→ ${esc(t("Next time"))}</h4>` + r.improvements.map((x, i) =>
      `<div style="margin-bottom:10px"><div><strong>${i + 1}.</strong> ${x.area && R[x.area] ? R[x.area].icon + " " : ""}${P(x.tip)}</div>${x.example ? `<div class="ai-ex">${P(x.example)}</div>` : ""}</div>`).join("") + `</div>`;
    if (r.room_vs_ai) h += `<div class="ai-sec"><h4>👥 ${esc(t("The room vs the AI"))}</h4><div class="small">${P(r.room_vs_ai)}</div></div>`;
    if (r.drill) h += `<div class="ai-sec"><h4>🏋️ ${esc(t("Drill for next week"))}</h4><div class="small">${P(r.drill)}</div></div>`;
    return h;
  }

  /* mount(el, { id, k, target, context }) */
  async function mount(el, opt) {
    const call = (report) => AT.api(`/speeches/${encodeURIComponent(opt.id)}/analysis`, { method: "POST", body: { k: opt.k, lang: AT.lang || "en", report, context: report ? opt.context : undefined } });
    const head = `<div class="kicker" style="margin:0">🤖 ${esc(t("AI analysis"))}</div>`;
    let a;
    try { a = await call(false); } catch { return; }
    if (a.state === "none") {
      if (!a.ai) return;
      el.innerHTML = head + `<p class="small soft" style="margin:0">${esc(t("No recording of this speech, so no AI analysis. Next time, say yes to filming — or ask the host to switch on the room microphone."))}</p>`;
      el.classList.remove("hidden"); return;
    }
    if (a.state === "processing") {
      el.innerHTML = head + `<div class="ai-wait"><span class="ai-dot"></span><span>${esc(t("Writing down your speech…"))} <span data-no-i18n>(${a.got}/${a.total})</span></span></div>`;
      el.classList.remove("hidden"); setTimeout(() => mount(el, opt), 6000); return;
    }
    const m = a.metrics;
    if (m.words < 5) {
      el.innerHTML = head + `<p class="small soft" style="margin:0">${esc(t("The recording didn't pick up enough words to analyse. Next time, put the filming phone closer to the speaker."))}</p>`;
      el.classList.remove("hidden"); return;
    }
    el.innerHTML = head + `<h3 style="margin:0">${esc(t("What the recording says"))}</h3>`
      + `<p class="small soft" style="margin:0">${esc(t("Measured automatically from the sound. The transcript can miss words and some “um”s: the um counter in the room stays the reference."))}</p>`
      + metricsHtml(m, opt.target)
      + `<div id="aiReport"><div class="ai-wait"><span class="ai-dot"></span><span>${esc(t("The AI coach is reading your speech and the room's feedback…"))}</span></div></div>`
      + `<details class="ai-tx ai-sec"><summary>📝 ${esc(t("Exact transcript"))}</summary><div class="ai-legend" style="margin-top:10px"><span class="f">${esc(t("um"))}</span><span class="c">${esc(t("crutch word"))}</span><span class="h">${esc(t("hedge"))}</span><span class="a">${esc(t("apology"))}</span><span class="n">123</span><span class="pz">⏸ ${esc(t("pause"))}</span></div><div data-no-i18n>${transcriptHtml(m.tokens)}</div></details>`;
    el.classList.remove("hidden");
    const box = el.querySelector("#aiReport");
    let rep;
    try { rep = await call(true); } catch (ex) { box.innerHTML = `<p class="small soft">${esc(ex.message)}</p>`; return; }
    if (rep.report) box.innerHTML = reportHtml(rep.report);
    else if (rep.report_wait === "after") box.innerHTML = `<p class="small soft" style="margin:0">${esc(t("The coach's feedback appears once the speech is over and the room has voted. Reload this page in a minute."))}</p>`;
    else if (rep.report_wait === "short") box.innerHTML = `<p class="small soft" style="margin:0">${esc(t("Too few words were recorded for coaching feedback."))}</p>`;
    else box.innerHTML = `<p class="small soft" style="margin:0">${esc(t(rep.report_error || "The AI coach couldn't write the feedback this time. Reload the page to try again."))}</p>`;
  }

  window.ATAnalysis = { mount, metricsHtml, transcriptHtml, reportHtml };
})();
