/* Aristotl.es — records a speech's sound for the AI analysis.
   Taps the microphone stream (the filming phone's, or the host laptop's), keeps a 16 kHz mono copy,
   measures the voice (pitch and loudness variation) on the phone, then sends the audio in ~20 s WAV pieces
   cut at quiet moments: POST /speeches/:id/audio, transcribed by Workers AI.
   Usage: const cap = ATAudio.capture(); cap.prime() in a tap; cap.start(stream); const a = await cap.stop();
          await ATAudio.send(a, { speechId, source: "phone" | "room", call }) */
(function () {
  "use strict";
  const RATE = 16000, PIECE = 20 * RATE, MIN_PIECE = 14 * RATE;
  let ctx = null;
  function audioCtx() {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    if (!ctx || ctx.state === "closed") ctx = new C();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  function capture() {
    let node = null, src = null, mute = null, parts = [], len = 0, carry = 0, startedAt = 0;
    const self = {
      active: false,
      prime() { try { audioCtx(); } catch {} },                     // call during a tap so iOS lets the audio run
      start(stream) {
        const c = audioCtx(); const track = stream?.getAudioTracks?.()[0];
        if (!c || !track || self.active) return false;
        parts = []; len = 0; carry = 0; startedAt = Date.now();
        src = c.createMediaStreamSource(new MediaStream([track]));
        node = c.createScriptProcessor(4096, 1, 1);
        mute = c.createGain(); mute.gain.value = 0;
        const step = c.sampleRate / RATE;
        node.onaudioprocess = (e) => {
          const inp = e.inputBuffer.getChannelData(0);
          const n = Math.floor((inp.length - carry) / step); if (n <= 0) return;
          const out = new Int16Array(n);
          for (let i = 0; i < n; i++) {                              // average the samples that fall in each 16 kHz slot
            const a = carry + i * step, b = a + step; let s = 0, k = 0;
            for (let j = Math.floor(a); j < b && j < inp.length; j++) { s += inp[j]; k++; }
            const v = k ? s / k : 0; out[i] = Math.max(-1, Math.min(1, v)) * 32767;
          }
          carry = carry + n * step - inp.length; if (carry < 0) carry = 0;
          if (len < RATE * 60 * 15) { parts.push(out); len += n; }   // 15 min safety limit
        };
        src.connect(node); node.connect(mute); mute.connect(c.destination);
        self.active = true; return true;
      },
      async stop() {
        if (!self.active) return null;
        self.active = false;
        try { src.disconnect(); node.disconnect(); mute.disconnect(); } catch {}
        node.onaudioprocess = null;
        const pcm = new Int16Array(len); let o = 0; for (const p of parts) { pcm.set(p, o); o += p.length; }
        parts = []; len = 0;
        if (pcm.length < RATE * 3) return null;
        await new Promise(r => setTimeout(r, 0));
        return { pcm, recorded_ms: Date.now() - startedAt, voice: { ...measureVoice(pcm), recorded_ms: Date.now() - startedAt } };
      },
    };
    return self;
  }

  /* 32 ms frames: loudness (dB) and pitch (autocorrelation) of the voiced frames */
  function measureVoice(pcm) {
    const F = 512, db = [];
    for (let i = 0; i + F <= pcm.length; i += F) {
      let s = 0; for (let j = i; j < i + F; j++) { const v = pcm[j] / 32768; s += v * v; }
      db.push(10 * Math.log10(s / F + 1e-10));
    }
    if (db.length < 20) return {};
    const sorted = [...db].sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.1)];
    const voiced = db.map((d, i) => (d > floor + 12 ? i : -1)).filter(i => i >= 0);
    const vdb = voiced.map(i => db[i]);
    const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
    const pitches = [], W = 1024, minLag = Math.floor(RATE / 400), maxLag = Math.floor(RATE / 70);
    for (let n = 0; n < voiced.length; n += 2) {
      const i = voiced[n] * F; if (i + W + maxLag > pcm.length) break;
      let e0 = 0; for (let j = 0; j < W; j++) e0 += pcm[i + j] * pcm[i + j];
      if (!e0) continue;
      let best = 0, lag = 0;
      for (let L = minLag; L <= maxLag; L++) {
        let c = 0, e1 = 0;
        for (let j = 0; j < W; j += 2) { c += pcm[i + j] * pcm[i + j + L]; e1 += pcm[i + j + L] * pcm[i + j + L]; }
        const r = c / Math.sqrt((e0 / 2) * e1 + 1);
        if (r > best) { best = r; lag = L; }
      }
      if (best > 0.55 && lag) pitches.push(RATE / lag);
    }
    let pitch = null, st = null;
    if (pitches.length > 15) {
      const p = [...pitches].sort((a, b) => a - b), med = p[Math.floor(p.length / 2)];
      const semis = pitches.map(f => 12 * Math.log2(f / med)).filter(x => Math.abs(x) < 12);   // drop octave errors
      pitch = Math.round(med); st = Math.round(sd(semis) * 10) / 10;
    }
    const q = Math.max(1, Math.floor(vdb.length / 4));
    return {
      pitch_hz: pitch, pitch_st: st,
      loud_db: vdb.length > 10 ? Math.round(sd(vdb) * 10) / 10 : null,
      fade_db: vdb.length > 40 ? Math.round((mean(vdb.slice(-q)) - mean(vdb.slice(0, q))) * 10) / 10 : null,
      voiced: Math.round(voiced.length / db.length * 100),
    };
  }

  /* Cut into ~20 s pieces at the quietest 50 ms between 14 and 20 s, skip silent pieces */
  function pieces(pcm) {
    const out = []; let at = 0;
    while (at < pcm.length) {
      let end = Math.min(pcm.length, at + PIECE);
      if (end < pcm.length && end - at > MIN_PIECE) {
        let best = end, low = Infinity;
        for (let i = at + MIN_PIECE; i + 800 <= end; i += 400) {
          let s = 0; for (let j = i; j < i + 800; j += 4) s += Math.abs(pcm[j]);
          if (s < low) { low = s; best = i + 400; }
        }
        end = best;
      }
      const seg = pcm.subarray(at, end);
      let loud = 0; for (let j = 0; j < seg.length; j += 160) if (Math.abs(seg[j]) > 500) loud++;
      out.push({ offset_ms: Math.round(at / RATE * 1000), pcm: seg, silent: loud < seg.length / 160 * 0.02 });
      at = end;
    }
    return out;
  }
  function wav(pcm) {
    const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true);
    v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length * 2, true);
    new Int16Array(b, 44).set(pcm);
    return new Blob([b], { type: "audio/wav" });
  }
  const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* call(path, {method, headers, body}) → JSON, throwing errors with .status (the page's own API helper) */
  async function send(audio, { speechId, source, call, onProgress }) {
    if (!audio) return false;
    const list = pieces(audio.pcm);
    for (let i = 0; i < list.length; i++) {
      const p = list[i], body = { source, idx: i, total: list.length, offset_ms: p.offset_ms };
      if (i === list.length - 1) body.voice = audio.voice;
      if (!p.silent) body.audio = await b64(wav(p.pcm));
      for (let tries = 0; ; tries++) {
        try { await call(`/speeches/${encodeURIComponent(speechId)}/audio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); break; }
        catch (ex) {
          if ([400, 401, 403, 404, 413, 503].includes(ex.status) || tries >= 4) throw ex;
          await sleep(2000 * (tries + 1));
        }
      }
      onProgress && onProgress(i + 1, list.length);
    }
    return true;
  }

  window.ATAudio = { capture, send, measureVoice, pieces };
})();
