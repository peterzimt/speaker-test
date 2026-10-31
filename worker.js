/**
 * Aristotl.es live tools — API (Cloudflare Worker + D1)
 *
 * Bindings expected (set them in the Worker's Settings):
 *   DB               D1 database binding
 *   HOST_KEY         secret: the password you type on the host console
 *   ALLOWED_ORIGINS  variable: comma-separated origins, e.g. "https://aristotl.es"
 *   CAMERA_KEY       secret (optional): password for the camera page (the host password also works)
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (optional): Google OAuth client, for YouTube uploads
 *
 * Single file, no dependencies: you can paste it straight into the dashboard editor.
 */

const CRITERIA = ["ethos", "pathos", "logos", "structure", "delivery"];
const MAX_TEXT = 280;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      const res = await route(request, env);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof HttpError ? err.message : "Something went wrong";
      if (!(err instanceof HttpError)) console.error(err);
      return json({ error: message }, status, cors);
    }
  },
};

/* ------------------------------------------------------------------ routing */

async function route(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts[0] !== "api") throw new HttpError(404, "Not found");
  const [, a, b, c] = parts;
  const m = request.method;

  if (!a) return json({ ok: true, service: "aristotl.es live tools" });

  // ---- host (password protected)
  if (a === "host" && b === "check" && m === "POST") { requireHost(request, env); return json({ ok: true }); }
  if (a === "sessions" && !b && m === "POST") { requireHost(request, env); return createSession(request, env); }
  if (a === "sessions" && !b && m === "GET") { requireHost(request, env); return listSessions(env); }
  if (a === "sessions" && b && !c && m === "GET") { requireHost(request, env); return getSessionForHost(env, b); }
  if (a === "sessions" && b && c === "speeches" && m === "POST") { requireHost(request, env); return addSpeech(request, env, b); }
  if (a === "speeches" && b && c === "open" && m === "POST") { requireHost(request, env); return setSpeechStatus(env, b, "open"); }
  if (a === "speeches" && b && c === "close" && m === "POST") { requireHost(request, env); return setSpeechStatus(env, b, "closed"); }
  if (a === "speeches" && b && !c && m === "DELETE") { requireHost(request, env); return deleteSpeech(env, b); }
  if (a === "sessions" && b && c === "timer" && m === "POST") { requireHost(request, env); return setTimer(request, env, b); }
  if (a === "speeches" && b && c === "film" && m === "POST") { requireHost(request, env); return setFilm(request, env, b); }

  // ---- YouTube connection (host) and camera uploads
  if (a === "youtube" && b === "status" && m === "GET") { requireHost(request, env); return youtubeStatus(env); }
  if (a === "youtube" && b === "connect" && m === "POST") { requireHost(request, env); return youtubeConnect(request, env); }
  if (a === "youtube" && b === "callback" && m === "GET") return youtubeCallback(request, env);
  if (a === "youtube" && b === "disconnect" && m === "POST") { requireHost(request, env); return youtubeDisconnect(env); }
  if (a === "camera" && b === "check" && m === "POST") { requireCamera(request, env); return json({ ok: true, youtube: Boolean(await getSetting(env, "yt_refresh")) }); }
  if (a === "speeches" && b && c === "uploads" && m === "POST") { requireCamera(request, env); return startUpload(request, env, b); }
  if (a === "uploads" && b && !c && m === "PUT") { requireCamera(request, env); return uploadChunk(request, env, b); }
  if (a === "uploads" && b && !c && m === "GET") { requireCamera(request, env); return uploadStatus(env, b); }

  // ---- admin (password protected)
  if (a === "admin" && b === "passports" && !c && m === "GET") { requireHost(request, env); return adminPassports(env); }
  if (a === "admin" && b === "passports" && c && m === "GET") { requireHost(request, env); return adminPassport(env, c); }
  if (a === "admin" && b === "stats" && m === "GET") { requireHost(request, env); return adminStats(env); }

  // ---- public, anonymous benchmarks
  if (a === "stats" && b === "benchmarks" && m === "GET") return publicBenchmarks(env);

  // ---- audience
  if (a === "sessions" && b && c === "live" && m === "GET") return liveState(env, b);
  if (a === "speeches" && b && c === "votes" && m === "POST") return castVote(request, env, b);
  if (a === "speeches" && b && c === "fillers" && m === "POST") return countFillers(request, env, b);

  // ---- speaker
  if (a === "speeches" && b && c === "results" && m === "GET") return speechResults(request, env, b, url.searchParams.get("k"));
  if (a === "speeches" && b && c === "self" && m === "POST") return selfRate(request, env, b);

  // ---- passport
  if (a === "passports" && !b && m === "POST") return createPassport(request, env);
  if (a === "passports" && b && !c && m === "GET") return getPassport(env, b, url.searchParams.get("k"));
  if (a === "passports" && b && !c && m === "PATCH") return updatePassport(request, env, b);
  if (a === "passports" && b && c === "speeches" && m === "POST") return addToPassport(request, env, b);

  throw new HttpError(404, "Not found");
}

/* ------------------------------------------------------------------- host */

async function createSession(request, env) {
  const body = await readJson(request);
  const title = clean(body.title, 80) || `Session ${new Date().toISOString().slice(0, 10)}`;
  const technique = clean(body.technique, 60) || null;
  for (let i = 0; i < 5; i++) {
    const code = randomCode(4);
    const exists = await env.DB.prepare("SELECT 1 FROM sessions WHERE code = ?").bind(code).first();
    if (exists) continue;
    await env.DB.prepare("INSERT INTO sessions (code, title, technique) VALUES (?, ?, ?)").bind(code, title, technique).run();
    return json({ code, title, technique }, 201);
  }
  throw new HttpError(500, "Could not create a session code, try again");
}

async function listSessions(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.code, s.title, s.technique, s.created_at,
            (SELECT COUNT(*) FROM speeches sp WHERE sp.session_code = s.code) AS speeches
       FROM sessions s ORDER BY s.created_at DESC LIMIT 20`
  ).all();
  return json({ sessions: results });
}

async function getSessionForHost(env, code) {
  const session = await mustGetSession(env, code);
  const { results } = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, sp.status, sp.result_token, sp.created_at, sp.film, sp.youtube_id,
            COUNT(v.voter) AS votes
       FROM speeches sp LEFT JOIN votes v ON v.speech_id = sp.id
      WHERE sp.session_code = ?
      GROUP BY sp.id ORDER BY sp.created_at ASC`
  ).bind(session.code).all();
  return json({ session, speeches: results, timer: timerState(session) });
}

/* Speech timer, shared with every phone in the room.
   Stored as an absolute end time (ms); clients get "remaining_ms" so their own clock doesn't matter. */
const TIMER_MAX = 60 * 60;
function timerState(session) {
  if (!session.timer_end) return null;
  return { duration: session.timer_duration, remaining_ms: session.timer_end - Date.now() };
}
async function setTimer(request, env, code) {
  const session = await mustGetSession(env, code);
  const body = await readJson(request);
  if (body.action === "stop") {
    await env.DB.prepare("UPDATE sessions SET timer_end = NULL WHERE code = ?").bind(session.code).run();
    return json({ timer: null });
  }
  const seconds = Number(body.seconds);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > TIMER_MAX) throw new HttpError(400, "Timer must be between 5 seconds and 60 minutes");
  const end = Date.now() + seconds * 1000;
  await env.DB.prepare("UPDATE sessions SET timer_end = ?, timer_duration = ? WHERE code = ?").bind(end, seconds, session.code).run();
  return json({ timer: { duration: seconds, remaining_ms: seconds * 1000 } });
}

async function addSpeech(request, env, code) {
  const session = await mustGetSession(env, code);
  const body = await readJson(request);
  const speaker = clean(body.speaker, 60);
  if (!speaker) throw new HttpError(400, "Speaker name is required");
  const id = randomId(10);
  const token = randomId(16);
  const film = body.film ? 1 : 0;
  await env.DB.prepare("INSERT INTO speeches (id, session_code, speaker, result_token, film) VALUES (?, ?, ?, ?, ?)")
    .bind(id, session.code, speaker, token, film).run();
  return json({ id, speaker, status: "waiting", result_token: token, votes: 0, film }, 201);
}

async function setFilm(request, env, id) {
  const body = await readJson(request);
  const film = body.film ? 1 : 0;
  const r = await env.DB.prepare("UPDATE speeches SET film = ? WHERE id = ?").bind(film, id).run();
  if (!r.meta?.changes) throw new HttpError(404, "Speech not found");
  return json({ id, film });
}

async function setSpeechStatus(env, id, status) {
  const speech = await env.DB.prepare("SELECT * FROM speeches WHERE id = ?").bind(id).first();
  if (!speech) throw new HttpError(404, "Speech not found");
  if (status === "open") {
    // only one speech open at a time per session
    await env.DB.batch([
      env.DB.prepare("UPDATE speeches SET status = 'closed', closed_at = datetime('now') WHERE session_code = ? AND status = 'open' AND id != ?").bind(speech.session_code, id),
      env.DB.prepare("UPDATE speeches SET status = 'open', closed_at = NULL WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE sessions SET current_speech_id = ? WHERE code = ?").bind(id, speech.session_code),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare("UPDATE speeches SET status = 'closed', closed_at = datetime('now') WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE sessions SET current_speech_id = NULL WHERE code = ? AND current_speech_id = ?").bind(speech.session_code, id),
    ]);
  }
  return json({ id, status });
}

async function deleteSpeech(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM votes WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM filler_counts WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM self_ratings WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM uploads WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM passport_speeches WHERE speech_id = ?").bind(id),
    env.DB.prepare("UPDATE sessions SET current_speech_id = NULL WHERE current_speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM speeches WHERE id = ?").bind(id),
  ]);
  return json({ id, deleted: true });
}

/* --------------------------------------------------------------- audience */

async function liveState(env, code) {
  const session = await mustGetSession(env, code);
  let speech = null;
  if (session.current_speech_id) {
    speech = await env.DB.prepare("SELECT id, speaker, status, film, youtube_id FROM speeches WHERE id = ? AND status = 'open'")
      .bind(session.current_speech_id).first();
  }
  const next = await env.DB.prepare(
    "SELECT speaker FROM speeches WHERE session_code = ? AND status = 'waiting' ORDER BY created_at ASC LIMIT 1"
  ).bind(session.code).first();
  return json({ session: { code: session.code, title: session.title, technique: session.technique }, speech, next: next ? next.speaker : null, timer: timerState(session) });
}

async function castVote(request, env, speechId) {
  const speech = await env.DB.prepare("SELECT id, status FROM speeches WHERE id = ?").bind(speechId).first();
  if (!speech) throw new HttpError(404, "Speech not found");
  if (speech.status !== "open") throw new HttpError(409, "Voting is closed for this speech");
  const body = await readJson(request);
  const voter = clean(body.voter, 40);
  if (!voter || voter.length < 8) throw new HttpError(400, "Missing voter id");
  const scores = {};
  for (const k of CRITERIA) {
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, `Score "${k}" must be 1–5`);
    scores[k] = n;
  }
  const worked = clean(body.worked, MAX_TEXT) || null;
  const nextRep = clean(body.next_rep, MAX_TEXT) || null;
  await env.DB.prepare(
    `INSERT INTO votes (speech_id, voter, ethos, pathos, logos, structure, delivery, worked, next_rep)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (speech_id, voter) DO UPDATE SET
       ethos = excluded.ethos, pathos = excluded.pathos, logos = excluded.logos,
       structure = excluded.structure, delivery = excluded.delivery,
       worked = excluded.worked, next_rep = excluded.next_rep, created_at = datetime('now')`
  ).bind(speechId, voter, scores.ethos, scores.pathos, scores.logos, scores.structure, scores.delivery, worked, nextRep).run();
  return json({ ok: true });
}

/* Filler-word counter: one or more people tap for every "um". Each counter sends their running total;
   the speech's figure is the median of the counters, so one over-eager tapper can't skew it. */
async function countFillers(request, env, speechId) {
  const speech = await env.DB.prepare("SELECT id, status FROM speeches WHERE id = ?").bind(speechId).first();
  if (!speech) throw new HttpError(404, "Speech not found");
  if (speech.status !== "open") throw new HttpError(409, "Counting is closed for this speech");
  const body = await readJson(request);
  const counter = clean(body.counter, 40);
  const count = Number(body.count);
  if (!counter || counter.length < 8) throw new HttpError(400, "Missing counter id");
  if (!Number.isInteger(count) || count < 0 || count > 999) throw new HttpError(400, "Invalid count");
  await env.DB.prepare(
    `INSERT INTO filler_counts (speech_id, counter, count) VALUES (?, ?, ?)
     ON CONFLICT (speech_id, counter) DO UPDATE SET count = excluded.count, updated_at = datetime('now')`
  ).bind(speechId, counter, count).run();
  return json({ ok: true });
}
async function fillerFigure(env, speechId) {
  const { results } = await env.DB.prepare("SELECT count FROM filler_counts WHERE speech_id = ? ORDER BY count").bind(speechId).all();
  if (!results.length) return null;
  const c = results.map(r => r.count), mid = Math.floor(c.length / 2);
  return { count: c.length % 2 ? c[mid] : Math.round((c[mid - 1] + c[mid]) / 2), counters: c.length };
}

/* ---------------------------------------------------------------- speaker */

async function speechResults(request, env, id, token) {
  const speech = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, sp.status, sp.result_token, sp.created_at, sp.youtube_id, s.title, s.technique, s.code
       FROM speeches sp JOIN sessions s ON s.code = sp.session_code WHERE sp.id = ?`
  ).bind(id).first();
  if (!speech) throw new HttpError(404, "Speech not found");
  const isHost = hostOk(request, env);
  if (!isHost && token !== speech.result_token) throw new HttpError(403, "This link is not valid");
  const results = await aggregate(env, id);
  const { results: comments } = await env.DB.prepare(
    "SELECT worked, next_rep FROM votes WHERE speech_id = ? AND (worked IS NOT NULL OR next_rep IS NOT NULL) ORDER BY created_at"
  ).bind(id).all();
  return json({
    speech: { id: speech.id, speaker: speech.speaker, status: speech.status, date: speech.created_at,
              session: speech.title, technique: speech.technique, youtube_id: speech.youtube_id || null },
    ...results,
    self: await selfFigure(env, id),
    fillers: await fillerFigure(env, id),
    worked: comments.map(c => c.worked).filter(Boolean),
    next_rep: comments.map(c => c.next_rep).filter(Boolean),
  });
}

async function aggregate(env, speechId) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n, AVG(ethos) AS ethos, AVG(pathos) AS pathos, AVG(logos) AS logos,
            AVG(structure) AS structure, AVG(delivery) AS delivery
       FROM votes WHERE speech_id = ?`
  ).bind(speechId).first();
  const scores = {};
  for (const k of CRITERIA) scores[k] = row.n ? round1(row[k]) : null;
  return { votes: row.n, scores };
}

/* --------------------------------------------------------------- passport */

async function createPassport(request, env) {
  const body = await readJson(request);
  const name = clean(body.name, 60);
  if (!name) throw new HttpError(400, "Name is required");
  const profile = clean(body.profile, 40) || null;
  const id = randomId(10);
  const secret = randomId(20);
  await env.DB.prepare("INSERT INTO passports (id, secret, name, profile) VALUES (?, ?, ?, ?)").bind(id, secret, name, profile).run();
  return json({ id, secret, name, profile }, 201);
}

async function mustGetPassport(env, id, secret) {
  const p = await env.DB.prepare("SELECT * FROM passports WHERE id = ?").bind(id).first();
  if (!p || !secret || p.secret !== secret) throw new HttpError(404, "Passport not found");
  return p;
}

async function getPassport(env, id, secret) {
  const p = await mustGetPassport(env, id, secret);
  const { results } = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, sp.result_token, sp.created_at, sp.youtube_id, s.title, s.technique,
            COUNT(v.voter) AS votes,
            AVG(v.ethos) AS ethos, AVG(v.pathos) AS pathos, AVG(v.logos) AS logos,
            AVG(v.structure) AS structure, AVG(v.delivery) AS delivery
       FROM passport_speeches ps
       JOIN speeches sp ON sp.id = ps.speech_id
       JOIN sessions s ON s.code = sp.session_code
       LEFT JOIN votes v ON v.speech_id = sp.id
      WHERE ps.passport_id = ?
      GROUP BY sp.id ORDER BY sp.created_at ASC`
  ).bind(id).all();
  const speeches = [];
  for (const r of results) speeches.push({
    id: r.id, token: r.result_token, date: r.created_at, session: r.title, technique: r.technique, votes: r.votes,
    scores: Object.fromEntries(CRITERIA.map(k => [k, r.votes ? round1(r[k]) : null])),
    fillers: (await fillerFigure(env, r.id))?.count ?? null,
    self: await selfFigure(env, r.id),
    youtube_id: r.youtube_id || null,
  });
  return json({ passport: { id: p.id, name: p.name, profile: p.profile, created_at: p.created_at }, speeches });
}

async function updatePassport(request, env, id) {
  const body = await readJson(request);
  const p = await mustGetPassport(env, id, body.k);
  const name = clean(body.name, 60) || p.name;
  const profile = body.profile === undefined ? p.profile : (clean(body.profile, 40) || null);
  await env.DB.prepare("UPDATE passports SET name = ?, profile = ? WHERE id = ?").bind(name, profile, id).run();
  return json({ id, name, profile });
}

async function addToPassport(request, env, id) {
  const body = await readJson(request);
  await mustGetPassport(env, id, body.k);
  const speech = await env.DB.prepare("SELECT id, result_token FROM speeches WHERE id = ?").bind(clean(body.speech_id, 40)).first();
  if (!speech || speech.result_token !== body.token) throw new HttpError(403, "This speech link is not valid");
  await env.DB.prepare("INSERT OR IGNORE INTO passport_speeches (passport_id, speech_id) VALUES (?, ?)").bind(id, speech.id).run();
  return json({ ok: true });
}

/* ------------------------------------------------------------ self-rating */

async function selfRate(request, env, id) {
  const body = await readJson(request);
  const speech = await env.DB.prepare("SELECT id, result_token FROM speeches WHERE id = ?").bind(id).first();
  if (!speech || body.k !== speech.result_token) throw new HttpError(403, "This link is not valid");
  const sc = {};
  for (const k of CRITERIA) {
    const n = Number(body[k]);
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, `Score "${k}" must be 1–5`);
    sc[k] = n;
  }
  await env.DB.prepare(
    `INSERT INTO self_ratings (speech_id, ethos, pathos, logos, structure, delivery) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (speech_id) DO UPDATE SET ethos = excluded.ethos, pathos = excluded.pathos, logos = excluded.logos,
       structure = excluded.structure, delivery = excluded.delivery, created_at = datetime('now')`
  ).bind(id, sc.ethos, sc.pathos, sc.logos, sc.structure, sc.delivery).run();
  return json({ ok: true, self: sc });
}
async function selfFigure(env, id) {
  const r = await env.DB.prepare("SELECT ethos, pathos, logos, structure, delivery FROM self_ratings WHERE speech_id = ?").bind(id).first();
  return r || null;
}

/* ---------------------------------------------------------------- YouTube */
/* The site uploads to the host's channel with an OAuth refresh token (scope: upload + read channel name).
   The camera phone never sees a Google token: it sends the video in chunks to this Worker, which forwards
   them to YouTube's resumable upload session. Videos are unlisted. */

const YT_SCOPES = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const chunkSize = env => Number(env.CHUNK_BYTES) || 8 * 1024 * 1024; // must be a multiple of 256 KiB
const gUrl = (env, k, d) => env[k] || d;

async function getSetting(env, key) { const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first(); return r ? r.value : null; }
async function setSetting(env, key, value) {
  if (value == null) return env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(key).run();
  return env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')").bind(key, value).run();
}
function siteOrigin(env) { return String(env.ALLOWED_ORIGINS || "https://aristotl.es").split(",")[0].trim(); }
function requireCamera(request, env) {
  const h = request.headers.get("Authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7) : "";
  const ok = (env.CAMERA_KEY && timingSafeEqual(key, env.CAMERA_KEY)) || (env.HOST_KEY && timingSafeEqual(key, env.HOST_KEY));
  if (!ok) throw new HttpError(401, "Wrong camera password");
}

async function youtubeStatus(env) {
  return json({
    configured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    connected: Boolean(await getSetting(env, "yt_refresh")),
    channel: await getSetting(env, "yt_channel"),
    camera_password: Boolean(env.CAMERA_KEY),
  });
}

async function youtubeConnect(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new HttpError(400, "Google client ID/secret are not set on the Worker yet");
  const state = randomId(24);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(Date.now() - 3600e3),
    env.DB.prepare("INSERT INTO oauth_states (state, created_at) VALUES (?, ?)").bind(state, Date.now()),
  ]);
  const redirect = new URL(request.url).origin + "/api/youtube/callback";
  const u = new URL(gUrl(env, "GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth"));
  u.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: YT_SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return json({ url: u.toString() });
}

async function youtubeCallback(request, env) {
  const url = new URL(request.url);
  const back = (msg) => new Response(null, { status: 302, headers: { Location: siteOrigin(env) + "/tools/admin.html?youtube=" + encodeURIComponent(msg) + "#youtube" } });
  const state = url.searchParams.get("state"), code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("cancelled");
  const st = state && await env.DB.prepare("SELECT created_at FROM oauth_states WHERE state = ?").bind(state).first();
  if (!st || Date.now() - st.created_at > 15 * 60e3) return back("expired");
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(state).run();
  const res = await fetch(gUrl(env, "GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + "/api/youtube/callback", grant_type: "authorization_code" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) { console.error("token exchange", res.status, JSON.stringify(tok)); return back("failed"); }
  await setSetting(env, "yt_refresh", tok.refresh_token);
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  try {
    const ch = await (await fetch(gUrl(env, "YT_API_URL", "https://www.googleapis.com/youtube/v3") + "/channels?part=snippet&mine=true",
      { headers: { Authorization: "Bearer " + tok.access_token } })).json();
    const c = ch.items?.[0];
    await setSetting(env, "yt_channel", c ? JSON.stringify({ id: c.id, title: c.snippet?.title }) : null);
  } catch {}
  return back("connected");
}

async function youtubeDisconnect(env) {
  const rt = await getSetting(env, "yt_refresh");
  if (rt) { try { await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), { method: "POST" }); } catch {} }
  await setSetting(env, "yt_refresh", null); await setSetting(env, "yt_channel", null);
  accessCache = null;
  return json({ connected: false });
}

let accessCache = null;
async function accessToken(env) {
  if (accessCache && accessCache.exp > Date.now()) return accessCache.token;
  const rt = await getSetting(env, "yt_refresh");
  if (!rt) throw new HttpError(409, "YouTube is not connected yet (Admin → YouTube)");
  const res = await fetch(gUrl(env, "GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: "refresh_token" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("refresh", res.status, JSON.stringify(tok));
    if (tok.error === "invalid_grant") await setSetting(env, "yt_refresh", null);
    throw new HttpError(502, "YouTube refused the connection. Reconnect it in Admin → YouTube.");
  }
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  return accessCache.token;
}

async function startUpload(request, env, speechId) {
  const sp = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, sp.film, sp.created_at, s.title, s.technique FROM speeches sp
       JOIN sessions s ON s.code = sp.session_code WHERE sp.id = ?`).bind(speechId).first();
  if (!sp) throw new HttpError(404, "Speech not found");
  if (!sp.film) throw new HttpError(403, "This speaker hasn't agreed to be filmed");
  const body = await readJson(request);
  const size = Number(body.size), mime = String(body.mime || "video/mp4").split(";")[0];
  if (!Number.isInteger(size) || size < 1000 || size > 4 * 1024 ** 3) throw new HttpError(400, "Invalid video size");
  if (!/^video\/[\w.+-]+$/.test(mime)) throw new HttpError(400, "Invalid video type");
  const tidy = t => String(t).replace(/[<>]/g, "");
  const title = tidy(`${sp.speaker} · ${sp.title} · Aristotl.es public speaking`).slice(0, 100);
  const description = tidy(`Speech by ${sp.speaker} at the Aristotl.es public speaking meetup in Madrid (${sp.created_at.slice(0, 10)}).` +
    (sp.technique ? `\nTechnique of the week: ${sp.technique.replace(/-/g, " ")}.` : "") +
    `\n\nJoin us: ${siteOrigin(env)}/meetup.html`);
  const token = await accessToken(env);
  const res = await fetch(gUrl(env, "YT_UPLOAD_URL", "https://www.googleapis.com/upload/youtube/v3/videos") + "?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "content-type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size), "X-Upload-Content-Type": mime },
    body: JSON.stringify({
      snippet: { title, description, categoryId: "27" },
      status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false, embeddable: true },
    }),
  });
  const loc = res.headers.get("Location");
  if (!res.ok || !loc) { console.error("yt start", res.status, await res.text()); throw new HttpError(502, `YouTube refused the upload (${res.status})`); }
  const id = randomId(14);
  await env.DB.prepare("INSERT INTO uploads (id, speech_id, upload_url, size, mime, status) VALUES (?, ?, ?, ?, ?, 'uploading')")
    .bind(id, speechId, loc, size, mime).run();
  return json({ upload_id: id, chunk: chunkSize(env), received: 0 }, 201);
}

async function finishUpload(env, up, res) {
  const v = await res.json().catch(() => ({}));
  if (!v.id) throw new HttpError(502, "YouTube didn't return a video id");
  await env.DB.batch([
    env.DB.prepare("UPDATE uploads SET status = 'done', received = size, youtube_id = ? WHERE id = ?").bind(v.id, up.id),
    env.DB.prepare("UPDATE speeches SET youtube_id = ? WHERE id = ?").bind(v.id, up.speech_id),
  ]);
  return json({ done: true, received: up.size, youtube_id: v.id });
}
const rangeEnd = res => { const r = res.headers.get("Range"); const m = r && r.match(/bytes=0-(\d+)/); return m ? Number(m[1]) + 1 : 0; };

async function uploadChunk(request, env, id) {
  const up = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(id).first();
  if (!up) throw new HttpError(404, "Upload not found");
  if (up.status === "done") return json({ done: true, received: up.size, youtube_id: up.youtube_id });
  const start = Number(request.headers.get("X-Offset"));
  const len = Number(request.headers.get("Content-Length"));
  if (!Number.isInteger(start) || start < 0 || !len || len > chunkSize(env) || start + len > up.size) throw new HttpError(400, "Bad chunk");
  const buf = await request.arrayBuffer();
  if (buf.byteLength !== len) throw new HttpError(400, "Incomplete chunk");
  const res = await fetch(up.upload_url, {
    method: "PUT",
    headers: { "Content-Range": `bytes ${start}-${start + len - 1}/${up.size}` },
    body: buf,
  });
  if (res.status === 200 || res.status === 201) return finishUpload(env, up, res);
  if (res.status === 308) {
    const received = rangeEnd(res);
    await env.DB.prepare("UPDATE uploads SET received = ? WHERE id = ?").bind(received, id).run();
    return json({ done: false, received });
  }
  console.error("yt chunk", res.status, await res.text());
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare("UPDATE uploads SET status = 'expired' WHERE id = ?").bind(id).run();
    throw new HttpError(410, "This upload expired, start it again");
  }
  throw new HttpError(502, `YouTube upload error (${res.status}), retrying may help`);
}

async function uploadStatus(env, id) {
  const up = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(id).first();
  if (!up) throw new HttpError(404, "Upload not found");
  if (up.status === "done") return json({ done: true, received: up.size, youtube_id: up.youtube_id });
  const res = await fetch(up.upload_url, { method: "PUT", headers: { "Content-Length": "0", "Content-Range": `bytes */${up.size}` } });
  if (res.status === 200 || res.status === 201) return finishUpload(env, up, res);
  if (res.status === 308) return json({ done: false, received: rangeEnd(res) });
  throw new HttpError(410, "This upload expired, start it again");
}

/* ------------------------------------------------------------------ admin */

const MIN_GROUP = 3; // never publish an average built from fewer people than this
const LEVELS = [
  { id: "first", label: "First speech", from: 1, to: 1 },
  { id: "early", label: "Speeches 2–3", from: 2, to: 3 },
  { id: "regular", label: "Speeches 4–6", from: 4, to: 6 },
  { id: "seasoned", label: "7+ speeches", from: 7, to: 1e9 },
];
const levelOf = n => LEVELS.find(l => n >= l.from && n <= l.to).id;
// Speaker profile -> family, as on the home page (A Overwhelmed … F Disconnected)
const FAMILY = {
  escaper: "A", freezer: "A", shaker: "A", apologiser: "A", impostor: "B", overcompensator: "B",
  monotone: "C", mumbler: "C", speedtalker: "C", filler: "C", statue: "C", pacer: "C", reader: "C",
  rambler: "D", datadumper: "D", burier: "D", jargon: "D", forgettable: "D",
  windbag: "E", showman: "E", bulldozer: "E", joker: "E", robot: "F", pleaser: "F", defensive: "F",
};

// One row per (passport, speech) with that speech's average scores and its rank in the passport.
async function rankedPassportSpeeches(env) {
  const { results } = await env.DB.prepare(
    `WITH sc AS (
       SELECT speech_id, COUNT(*) AS n, AVG(ethos) AS ethos, AVG(pathos) AS pathos, AVG(logos) AS logos,
              AVG(structure) AS structure, AVG(delivery) AS delivery
         FROM votes GROUP BY speech_id)
     SELECT ps.passport_id, p.profile, sp.id AS speech_id, sp.created_at, s.technique,
            ROW_NUMBER() OVER (PARTITION BY ps.passport_id ORDER BY sp.created_at) AS rn,
            sc.n, sc.ethos, sc.pathos, sc.logos, sc.structure, sc.delivery
       FROM passport_speeches ps
       JOIN passports p ON p.id = ps.passport_id
       JOIN speeches sp ON sp.id = ps.speech_id
       JOIN sessions s ON s.code = sp.session_code
       LEFT JOIN sc ON sc.speech_id = sp.id`
  ).all();
  return results;
}

function averageScores(rows) {
  const scored = rows.filter(r => r.n);
  const out = {};
  for (const k of CRITERIA) out[k] = scored.length ? round1(scored.reduce((a, r) => a + r[k], 0) / scored.length) : null;
  return out;
}
function weakest(row) {
  let best = null;
  for (const k of CRITERIA) if (row[k] != null && (best === null || row[k] < row[best])) best = k;
  return best;
}
function groupStats(rows, keyFn) {
  const groups = {};
  for (const r of rows) { const k = keyFn(r); if (k == null) continue; (groups[k] ||= []).push(r); }
  return Object.fromEntries(Object.entries(groups).map(([k, list]) => {
    const scored = list.filter(r => r.n);
    const weak = {};
    for (const r of scored) { const w = weakest(r); if (w) weak[w] = (weak[w] || 0) + 1; }
    return [k, {
      speeches: list.length, people: new Set(list.map(r => r.passport_id)).size,
      scores: averageScores(list), weakest: weak,
    }];
  }));
}

async function adminPassports(env) {
  const { results } = await env.DB.prepare(
    `WITH sc AS (
       SELECT speech_id, COUNT(*) AS n, AVG((ethos + pathos + logos + structure + delivery) / 5.0) AS overall
         FROM votes GROUP BY speech_id)
     SELECT p.id, p.secret, p.name, p.profile, p.created_at,
            COUNT(ps.speech_id) AS speeches, MAX(sp.created_at) AS last_speech,
            AVG(sc.overall) AS overall
       FROM passports p
       LEFT JOIN passport_speeches ps ON ps.passport_id = p.id
       LEFT JOIN speeches sp ON sp.id = ps.speech_id
       LEFT JOIN sc ON sc.speech_id = ps.speech_id
      GROUP BY p.id ORDER BY COALESCE(MAX(sp.created_at), p.created_at) DESC`
  ).all();
  return json({ passports: results.map(r => ({ ...r, overall: r.overall == null ? null : round1(r.overall) })) });
}

async function adminPassport(env, id) {
  const p = await env.DB.prepare("SELECT * FROM passports WHERE id = ?").bind(id).first();
  if (!p) throw new HttpError(404, "Passport not found");
  return getPassport(env, p.id, p.secret);
}

async function adminStats(env) {
  const totals = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM sessions) AS sessions,
            (SELECT COUNT(*) FROM speeches) AS speeches,
            (SELECT COUNT(*) FROM votes) AS votes,
            (SELECT COUNT(*) FROM passports) AS passports,
            (SELECT COUNT(DISTINCT passport_id) FROM passport_speeches) AS active_passports,
            (SELECT COUNT(*) FROM speeches WHERE id IN (SELECT speech_id FROM passport_speeches)) AS tracked_speeches`
  ).first();

  const { results: bySession } = await env.DB.prepare(
    `SELECT s.code, s.title, s.technique, s.created_at,
            COUNT(DISTINCT sp.id) AS speeches, COUNT(v.voter) AS votes
       FROM sessions s
       LEFT JOIN speeches sp ON sp.session_code = s.code
       LEFT JOIN votes v ON v.speech_id = sp.id
      GROUP BY s.code ORDER BY s.created_at ASC`
  ).all();

  const { results: allSpeeches } = await env.DB.prepare(
    `SELECT sp.id, s.technique, COUNT(v.voter) AS n,
            AVG(v.ethos) AS ethos, AVG(v.pathos) AS pathos, AVG(v.logos) AS logos,
            AVG(v.structure) AS structure, AVG(v.delivery) AS delivery
       FROM speeches sp JOIN sessions s ON s.code = sp.session_code
       LEFT JOIN votes v ON v.speech_id = sp.id
      GROUP BY sp.id`
  ).all();

  const ranked = await rankedPassportSpeeches(env);
  const firsts = ranked.filter(r => r.rn === 1);
  const firstIssues = {};
  for (const r of firsts) { const w = r.n ? weakest(r) : null; if (w) firstIssues[w] = (firstIssues[w] || 0) + 1; }

  const profiles = await env.DB.prepare("SELECT profile, COUNT(*) AS n FROM passports WHERE profile IS NOT NULL GROUP BY profile").all();

  return json({
    totals,
    overall: averageScores(allSpeeches),
    sessions: bySession,
    levels: LEVELS.map(l => ({ ...l, to: l.to > 999 ? null : l.to, ...(groupStats(ranked, r => levelOf(r.rn))[l.id] || { speeches: 0, people: 0, scores: averageScores([]), weakest: {} }) })),
    firstIssues,
    byProfile: groupStats(ranked, r => r.profile),
    byFamily: groupStats(ranked, r => FAMILY[r.profile]),
    firstByFamily: groupStats(firsts, r => FAMILY[r.profile]),
    profileCounts: Object.fromEntries(profiles.results.map(r => [r.profile, r.n])),
    byTechnique: groupStats(allSpeeches.map(r => ({ ...r, passport_id: r.id })), r => r.technique),
  });
}

async function publicBenchmarks(env) {
  const ranked = await rankedPassportSpeeches(env);
  const safe = obj => Object.fromEntries(Object.entries(obj)
    .filter(([, g]) => g.people >= MIN_GROUP)
    .map(([k, g]) => [k, { people: g.people, speeches: g.speeches, scores: g.scores }]));
  return new Response(JSON.stringify({
    minGroup: MIN_GROUP,
    levels: safe(groupStats(ranked, r => levelOf(r.rn))),
    profiles: safe(groupStats(ranked, r => r.profile)),
    families: safe(groupStats(ranked, r => FAMILY[r.profile])),
    everyone: safe({ all: groupStats(ranked, () => "all").all || { people: 0 } }).all || null,
  }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" } });
}

/* ---------------------------------------------------------------- helpers */

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "https://aristotl.es").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || allowed[0] : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Offset",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function hostOk(request, env) {
  const h = request.headers.get("Authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7) : "";
  return Boolean(env.HOST_KEY) && timingSafeEqual(key, env.HOST_KEY);
}
function requireHost(request, env) {
  if (!env.HOST_KEY) throw new HttpError(500, "HOST_KEY is not set on the Worker");
  if (!hostOk(request, env)) throw new HttpError(401, "Wrong host password");
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function mustGetSession(env, code) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE code = ?").bind(String(code || "").toUpperCase()).first();
  if (!s) throw new HttpError(404, "Session not found");
  return s;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 10000) throw new HttpError(413, "Request too large");
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "Invalid JSON"); }
}

function clean(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function round1(n) { return Math.round(n * 10) / 10; }

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion
function randomCode(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => ALPHA[b % ALPHA.length]).join("");
}
function randomId(len) {
  const chars = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
