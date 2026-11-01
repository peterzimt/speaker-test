/* Aristotl.es — phone video recorder + chunked, resumable upload to the API (→ YouTube).
   Used by the participant page when it's your turn to film. */
(function () {
  "use strict";
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pickMime() {
    const c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return c.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || "";
  }

  window.ATRecorder = function ({ headers, onChange }) {
    const API = AT.API + "/api";
    const self = { stream: null, rec: null, recSpeech: null, recStart: 0, queue: [], uploading: false };
    const cap = window.ATAudio ? ATAudio.capture() : null;             // sound copy for the AI analysis
    let chunks = [];
    const changed = () => { try { onChange && onChange(self); } catch {} };

    async function call(path, opts = {}) {
      const res = await fetch(API + path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
      let data = {}; try { data = await res.json(); } catch {}
      if (!res.ok) { const e = new Error(data.error || "Error " + res.status); e.status = res.status; throw e; }
      return data;
    }

    self.open = async function () {
      if (self.stream) return self.stream;
      self.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      });
      cap?.prime();
      changed(); return self.stream;
    };
    self.close = function () {
      if (self.rec) return;                      // never cut a recording
      self.stream?.getTracks().forEach(t => t.stop()); self.stream = null; changed();
    };
    self.start = function (speech) {
      if (!self.stream || self.rec) return false;
      const mime = pickMime();
      const rec = new MediaRecorder(self.stream, mime ? { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 } : undefined);
      chunks = []; self.recSpeech = { id: speech.id, speaker: speech.speaker }; self.recStart = Date.now();
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      cap?.start(self.stream);
      const capFor = { id: speech.id };
      rec.onstop = () => {
        const aiItem = { speech: { id: capFor.id, speaker: speech.speaker }, ai: "sending" };
        cap?.stop().then(audio => {
          if (!audio) return;
          const q = self.queue.find(x => x.speech.id === capFor.id) || aiItem;
          q.ai = "sending"; changed();
          return ATAudio.send(audio, { speechId: capFor.id, source: "phone", call }).then(() => { q.ai = "sent"; changed(); }, (ex) => { q.ai = "error"; q.aiErr = ex.message; changed(); });
        }).catch(() => {});
        const type = (rec.mimeType || mime || "video/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        const item = { speech: self.recSpeech, blob, type, state: "waiting", received: 0, uploadId: null, youtube: null, err: null, secs: Math.round((Date.now() - self.recStart) / 1000) };
        self.rec = null; self.recSpeech = null; chunks = [];
        if (blob.size > 50_000) self.queue.push(item);
        changed(); pump();
      };
      rec.start(1000); self.rec = rec; changed(); return true;
    };
    self.stop = function () { if (self.rec && self.rec.state !== "inactive") self.rec.stop(); };
    self.retry = function (item) { item.state = "waiting"; item.err = null; changed(); pump(); };
    self.filmed = id => self.queue.some(q => q.speech.id === id) || self.recSpeech?.id === id;
    self.pending = () => !!self.rec || self.queue.some(q => q.state !== "done");

    async function pump() {
      if (self.uploading) return;
      const q = self.queue.find(x => x.state === "waiting"); if (!q) return;
      self.uploading = true; q.state = "uploading"; changed();
      try { await uploadOne(q); q.state = "done"; }
      catch (ex) { q.state = "error"; q.err = ex.message; }
      self.uploading = false; changed(); pump();
    }
    async function uploadOne(q) {
      let chunk = 8 * 1048576;
      if (!q.uploadId) {
        const r = await call(`/speeches/${q.speech.id}/uploads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ size: q.blob.size, mime: q.type }) });
        q.uploadId = r.upload_id; chunk = r.chunk; q.received = 0;
      } else {
        const s = await call(`/uploads/${q.uploadId}`); if (s.done) { q.youtube = s.youtube_id; return; } q.received = s.received;
      }
      let fails = 0;
      while (q.received < q.blob.size) {
        const part = q.blob.slice(q.received, Math.min(q.received + chunk, q.blob.size));
        try {
          const r = await call(`/uploads/${q.uploadId}`, { method: "PUT", headers: { "X-Offset": String(q.received), "content-type": "application/octet-stream" }, body: part });
          fails = 0;
          if (r.done) { q.youtube = r.youtube_id; q.received = q.blob.size; changed(); return; }
          q.received = r.received; changed();
        } catch (ex) {
          if (ex.status === 410) { q.uploadId = null; throw new Error("Upload expired — tap Retry"); }
          if ([401, 403, 409].includes(ex.status)) throw ex;
          if (++fails > 6) throw new Error("Connection problem — tap Retry");
          await sleep(1500 * fails);
          try { const s = await call(`/uploads/${q.uploadId}`); if (s.done) { q.youtube = s.youtube_id; return; } q.received = s.received; } catch {}
        }
      }
    }
    window.addEventListener("beforeunload", (e) => { if (self.pending()) { e.preventDefault(); e.returnValue = ""; } });
    return self;
  };
})();
