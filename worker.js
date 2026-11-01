/**
 * Aristotl.es live tools — API (Cloudflare Worker + D1)
 *
 * Bindings expected (set them in the Worker's Settings):
 *   DB               D1 database binding
 *   HOST_KEY         secret: the password you type on the host console
 *   ALLOWED_ORIGINS  variable: comma-separated origins, e.g. "https://aristotl.es"
 *   CAMERA_KEY       secret (optional): password for the camera page (the host password also works)
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (optional): Google OAuth client, for YouTube uploads
 *   AI               (optional) Workers AI binding: speech transcription and AI coaching feedback
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
  if (a === "speeches" && b && c === "filmer" && m === "POST") { requireHost(request, env); return setFilmer(request, env, b); }
  if (a === "sessions" && b && c === "camera" && m === "POST") { requireHost(request, env); return setCameraMode(request, env, b); }
  if (a === "sessions" && b && c === "shuffle" && m === "POST") { requireHost(request, env); return shuffleCameras(env, b); }
  if (a === "sessions" && b && c === "technique" && m === "POST") { requireHost(request, env); return setTechnique(request, env, b); }
  if (a === "sessions" && b && c === "deck" && m === "POST") { requireHost(request, env); return setDeck(request, env, b); }
  if (a === "speeches" && b && c === "impromptu" && m === "POST") { requireHost(request, env); return setImpromptu(request, env, b); }
  if (a === "sessions" && b && c === "awards" && m === "GET") { requireHost(request, env); return sessionAwards(env, b); }

  // ---- YouTube connection (host) and camera uploads
  if (a === "youtube" && b === "status" && m === "GET") { requireHost(request, env); return youtubeStatus(env); }
  if (a === "youtube" && b === "connect" && m === "POST") { requireHost(request, env); return youtubeConnect(request, env); }
  if (a === "youtube" && b === "exchange" && m === "POST") { requireHost(request, env); return youtubeExchange(request, env); }
  if (a === "youtube" && b === "disconnect" && m === "POST") { requireHost(request, env); return youtubeDisconnect(env); }
  if (a === "camera" && b === "check" && m === "POST") { requireCamera(request, env); return json({ ok: true, youtube: Boolean(await getSetting(env, "yt_refresh")) }); }
  if (a === "speeches" && b && c === "uploads" && m === "POST") { await requireUploader(request, env, b); return startUpload(request, env, b); }
  if (a === "uploads" && b && !c && m === "PUT") { await requireUploader(request, env, null, b); return uploadChunk(request, env, b); }
  if (a === "uploads" && b && !c && m === "GET") { await requireUploader(request, env, null, b); return uploadStatus(env, b); }

  // ---- admin (password protected)
  if (a === "admin" && b === "passports" && !c && m === "GET") { requireHost(request, env); return adminPassports(env); }
  if (a === "admin" && b === "passports" && c && m === "GET") { requireHost(request, env); return adminPassport(env, c); }
  if (a === "admin" && b === "stats" && m === "GET") { requireHost(request, env); return adminStats(env); }

  // ---- public, anonymous benchmarks
  if (a === "stats" && b === "benchmarks" && m === "GET") return publicBenchmarks(env);

  // ---- audience
  if (a === "sessions" && b && c === "live" && m === "GET") return liveState(request, env, b);
  if (a === "sessions" && b && c === "join" && m === "POST") return joinSession(request, env, b);
  if (a === "sessions" && b && c === "volunteer" && m === "POST") return volunteer(request, env, b);
  if (a === "speeches" && b && c === "start" && m === "POST") return speakerStart(request, env, b);
  if (a === "speeches" && b && c === "again" && m === "POST") return speakAgain(request, env, b);
  if (a === "speeches" && b && c === "votes" && m === "POST") return castVote(request, env, b);
  if (a === "speeches" && b && c === "fillers" && m === "POST") return countFillers(request, env, b);

  // ---- speaker
  if (a === "speeches" && b && c === "results" && m === "GET") return speechResults(request, env, b, url.searchParams.get("k"));
  if (a === "speeches" && b && c === "self" && m === "POST") return selfRate(request, env, b);
  if (a === "speeches" && b && c === "analysis" && m === "POST") return speechAnalysis(request, env, b);
  if (a === "speeches" && b && c === "audio" && m === "POST") { await requireUploader(request, env, b); return audioChunk(request, env, b); }

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
    `SELECT sp.id, sp.speaker, sp.status, sp.result_token, sp.created_at, sp.film, sp.youtube_id, sp.filmer, sp.participant_id, sp.topic, sp.impromptu, sp.shape, sp.focus_roles, sp.parent_id, sp.kind, sp.seconds, (SELECT o.speaker FROM speeches o WHERE o.id = sp.parent_id) AS after,
            (SELECT COUNT(*) FROM speech_audio a WHERE a.speech_id = sp.id) AS audio, COUNT(v.voter) AS votes
       FROM speeches sp LEFT JOIN votes v ON v.speech_id = sp.id
      WHERE sp.session_code = ?
      GROUP BY sp.id ORDER BY sp.created_at ASC, sp.rowid ASC`
  ).bind(session.code).all();
  const plan = await filmingPlan(env, session, results);
  const roles = rolePlan(session, results, plan.participants, plan.filmerOf);
  for (const sp of results) { sp.filmed_by = plan.filmerOf[sp.id]; sp.roles = roles[sp.id]; }
  return json({
    session: { ...session, timer_end: undefined }, speeches: results, timer: timerState(session),
    participants: plan.participants.map(p => ({ id: p.id, name: p.name, speech_id: p.speech_id })),
    camera: { mode: session.camera_mode || "rotation", person: session.camera_person || null },
    ai: Boolean(env.AI),
  });
}

/* Speech timer, shared with every phone in the room.
   Stored as an absolute end time (ms); clients get "remaining_ms" so their own clock doesn't matter. */
const TIMER_MAX = 60 * 60;
const OVERTIME_MAX_MS = 3 * 60 * 1000;
const PREP_MS = 5000;                                   // "get ready" countdown before the speech clock starts
function timerState(session) {
  if (!session.timer_end) return null;
  const remaining = session.timer_end - Date.now();
  if (remaining < -OVERTIME_MAX_MS) return null;       // forgotten timer: stop flashing after 3 minutes over
  return { duration: session.timer_duration, remaining_ms: remaining, prep_ms: Math.max(0, remaining - session.timer_duration * 1000) };
}
const THINK_MS = 30000;                                 // impromptu: 30 s to think about the surprise topic
async function startClock(env, code, seconds, prep = PREP_MS) {
  const end = Date.now() + prep + seconds * 1000;
  await env.DB.prepare("UPDATE sessions SET timer_end = ?, timer_duration = ? WHERE code = ?").bind(end, seconds, code).run();
  return { duration: seconds, remaining_ms: prep + seconds * 1000, prep_ms: prep };
}
/* Get-ready time for the speech on stage: 30 s to think for an impromptu speech, 5 s otherwise. */
async function prepFor(env, session) {
  if (!session.current_speech_id) return PREP_MS;
  const sp = await env.DB.prepare("SELECT impromptu, status FROM speeches WHERE id = ?").bind(session.current_speech_id).first();
  return sp && sp.status === "open" && sp.impromptu ? THINK_MS : PREP_MS;
}
async function setTimer(request, env, code) {
  const session = await mustGetSession(env, code);
  const body = await readJson(request);
  if (body.action === "stop") {
    await env.DB.prepare("UPDATE sessions SET timer_end = NULL WHERE code = ?").bind(session.code).run();
    return json({ timer: null });
  }
  if (body.action === "add") {                          // +N seconds to a running clock
    if (!session.timer_end) throw new HttpError(409, "The timer isn't running");
    const add = Math.max(5, Math.min(600, Number(body.seconds) || 30));
    await env.DB.prepare("UPDATE sessions SET timer_end = timer_end + ?, timer_duration = timer_duration + ? WHERE code = ?").bind(add * 1000, add, session.code).run();
    return json({ timer: timerState({ ...session, timer_end: session.timer_end + add * 1000, timer_duration: session.timer_duration + add }) });
  }
  const seconds = body.action === "reset" ? Number(session.timer_duration) || 120 : Number(body.seconds);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > TIMER_MAX) throw new HttpError(400, "Timer must be between 5 seconds and 60 minutes");
  if (body.action === "set") {                          // just remember the length for the next speech
    if (timerState(session)) return json({ timer: timerState(session), duration: session.timer_duration }); // don't change a running clock
    await env.DB.prepare("UPDATE sessions SET timer_duration = ? WHERE code = ?").bind(seconds, session.code).run();
    return json({ timer: timerState(session), duration: seconds });
  }
  // a restart ("reset") never gives the thinking time again: the topic is already known
  const prep = body.action === "reset" ? PREP_MS : await prepFor(env, session);
  return json({ timer: await startClock(env, session.code, seconds, prep) });
}

/* ---------------------------------------------------------- impromptu */
const IMPRO_TOPICS = [
  "The best meal I've ever had", "A habit I'm proud of", "The most useful thing I own", "Morning person or night owl?",
  "A place that changed me", "The last thing that made me laugh out loud", "The best advice I ever ignored",
  "A skill everyone should learn before 30", "What I'd do with one extra hour a day", "The best boss I ever had",
  "Meetings: fix them or kill them?", "Remote, office or hybrid?", "The mistake that taught me the most",
  "How to say no to your manager", "Is it better to be respected or liked?", "What does success mean to you?",
  "Should children have phones?", "Is honesty always the best policy?", "What will people find strange about us in 100 years?",
  "Is social media making us lonelier?", "Pitch a holiday on the Moon", "Defend pineapple on pizza",
  "Convince us to adopt your (imaginary) pet dragon", "Sell us the world's most useless invention",
  "If animals could talk, which would be the rudest?", "Why Madrid is the best city in the world",
  "The superpower I'd choose — and why it's a bad idea", "A rule I'd add to every country", "Cats or dogs: settle it tonight",
  "The one app I'd delete from everyone's phone", "Why you should learn to cook one dish perfectly", "My hidden talent",
];
const IMPRO_SHAPES = [
  "PREP: Point → Reason → Example → Point", "Past · Present · Future", "Problem · Solution · Impact",
  "Story · Message · Action", "What · So what · Now what", "Three reasons, then your point again",
];
const pick = list => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
/* Topic decks: "classic" is built in; the others are JSON files on the site (tools/assets/decks/<id>.json),
   e.g. black cards from Cards Against Humanity (CC BY-NC-SA). Each file: { "name": "...", "cards": ["...", ...] }. */
const DECKS = ["classic", "cah_family", "cah_es", "retros", "cah_main"];
const deckCache = new Map();
async function deckCards(env, deck) {
  if (!deck || deck === "classic" || !DECKS.includes(deck)) return IMPRO_TOPICS;
  if (deckCache.has(deck)) return deckCache.get(deck);
  try {
    const r = await fetch(`${siteOrigin(env)}/tools/assets/decks/${deck}.json`, { cf: { cacheTtl: 3600 } });
    const d = await r.json(); const cards = (d.cards || []).filter(x => typeof x === "string" && x.length < 300);
    if (cards.length) { deckCache.set(deck, cards); return cards; }
  } catch {}
  return IMPRO_TOPICS;
}
async function setDeck(request, env, code) {
  const session = await mustGetSession(env, code);
  const { deck } = await readJson(request);
  if (!DECKS.includes(deck)) throw new HttpError(400, "Unknown deck");
  await env.DB.prepare("UPDATE sessions SET impro_deck = ? WHERE code = ?").bind(deck, session.code).run();
  return json({ deck });
}
async function drawTopic(env, sp) {
  const session = await mustGetSession(env, sp.session_code);
  const deck = session.impro_deck || "classic", cards = await deckCards(env, deck);
  const { results } = await env.DB.prepare("SELECT topic FROM speeches WHERE session_code = ? AND topic IS NOT NULL").bind(sp.session_code).all();
  const used = new Set(results.map(r => r.topic));
  const fresh = cards.filter(t => !used.has(t));
  const topic = pick(fresh.length ? fresh : cards);
  const shape = topic.includes("_____") ? "Fill in the blank, then defend your answer" : pick(IMPRO_SHAPES);
  await env.DB.prepare("UPDATE speeches SET topic = ?, shape = ? WHERE id = ?").bind(topic, shape, sp.id).run();
  return topic;
}
async function setImpromptu(request, env, id) {
  const body = await readJson(request);
  const on = body.impromptu ? 1 : 0;
  const r = await env.DB.prepare("UPDATE speeches SET impromptu = ?, topic = CASE WHEN ? = 1 THEN NULL ELSE topic END, shape = NULL WHERE id = ? AND status = 'waiting'").bind(on, on, id).run();
  if (!r.meta?.changes) throw new HttpError(409, "This speech has already started");
  return json({ id, impromptu: on });
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
    if (speech.impromptu && speech.status === "waiting") await drawTopic(env, speech);   // surprise topic revealed on start
    // only one speech open at a time per session
    await env.DB.batch([
      env.DB.prepare("UPDATE speeches SET status = 'closed', closed_at = datetime('now') WHERE session_code = ? AND status = 'open' AND id != ?").bind(speech.session_code, id),
      env.DB.prepare("UPDATE speeches SET status = 'open', closed_at = NULL WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE sessions SET current_speech_id = ? WHERE code = ?").bind(id, speech.session_code),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare("UPDATE speeches SET status = 'closed', closed_at = datetime('now') WHERE id = ?").bind(id),
      env.DB.prepare("UPDATE sessions SET current_speech_id = NULL, timer_end = NULL WHERE code = ? AND current_speech_id = ?").bind(speech.session_code, id),
    ]);
  }
  return json({ id, status });
}

async function deleteSpeech(env, id) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM votes WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM filler_counts WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM role_reports WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM self_ratings WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM uploads WHERE speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM passport_speeches WHERE speech_id = ?").bind(id),
    env.DB.prepare("UPDATE sessions SET current_speech_id = NULL WHERE current_speech_id = ?").bind(id),
    env.DB.prepare("DELETE FROM speeches WHERE id = ?").bind(id),
  ]);
  return json({ id, deleted: true });
}

/* --------------------------------------------------------------- audience */

async function liveState(request, env, code) {
  const session = await mustGetSession(env, code);
  let speech = null;
  if (session.current_speech_id) {
    speech = await env.DB.prepare("SELECT sp.id, sp.speaker, sp.status, sp.film, sp.youtube_id, sp.participant_id, sp.topic, sp.shape, sp.impromptu, sp.kind, o.speaker AS after FROM speeches sp LEFT JOIN speeches o ON o.id = sp.parent_id WHERE sp.id = ? AND sp.status = 'open'")
      .bind(session.current_speech_id).first();
  }
  const next = await env.DB.prepare(
    "SELECT speaker FROM speeches WHERE session_code = ? AND status = 'waiting' ORDER BY created_at ASC, rowid ASC LIMIT 1"
  ).bind(session.code).first();
  const lastClosed = await env.DB.prepare(
    "SELECT id, speaker, topic FROM speeches WHERE session_code = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT 1"
  ).bind(session.code).first();
  const out = { last: lastClosed || null, session: { code: session.code, title: session.title, technique: session.technique, camera_mode: session.camera_mode || "rotation", duration: Number(session.timer_duration) || 120 },
    speech: speech ? { id: speech.id, speaker: speech.speaker, status: speech.status, film: speech.film, youtube_id: speech.youtube_id, topic: speech.topic, shape: speech.shape, impromptu: !!speech.impromptu, kind: speech.kind || null, after: speech.after || null } : null,
    next: next ? next.speaker : null, timer: timerState(session) };
  const me = await participantFromRequest(request, env, session.code);
  if (me) {
    const { results: list } = await env.DB.prepare(
      "SELECT id, speaker, status, film, filmer, participant_id, result_token, topic, impromptu, focus_roles, parent_id, kind, seconds, created_at FROM speeches WHERE session_code = ? ORDER BY created_at ASC, rowid ASC"
    ).bind(session.code).all();
    const plan = await filmingPlan(env, session, list);
    const roles = rolePlan(session, list, plan.participants, plan.filmerOf);
    const mineAll = list.filter(x => x.participant_id === me.id);
    const mine = mineAll.find(x => x.status !== "closed") || mineAll[mineAll.length - 1];
    const pending = list.filter(x => x.status !== "closed");
    const duty = pending.find(x => x.status === "open" && plan.filmerOf[x.id]?.id === me.id) || pending.find(x => plan.filmerOf[x.id]?.id === me.id);
    const firstWaiting = pending.find(x => x.status === "waiting");
    const roleSp = pending.find(x => x.status === "open") || firstWaiting;
    const myRole = roleSp && (roles[roleSp.id] || []).find(r => r.id === me.id);
    out.me = {
      id: me.id, name: me.name,
      role: myRole ? { role: myRole.role, speech_id: roleSp.id, speaker: roleSp.speaker, when: roleSp.status === "open" ? "now" : "next" } : null,
      speech: mine ? { id: mine.id, status: mine.status, result_token: mine.result_token, film: mine.film, topic: mine.topic, impromptu: !!mine.impromptu,
                       kind: mine.kind || null, focus_roles: mine.focus_roles || "", seconds: mine.seconds || null,
                       self_done: mine.status === "closed" ? !!(await selfFigure(env, mine.id)) : false } : null,
      film: duty ? { speech_id: duty.id, speaker: duty.speaker, when: duty.status === "open" ? "now" : duty.id === firstWaiting?.id ? "next" : "later" } : null,
      camera_person: session.camera_mode === "single" && session.camera_person === me.id,
    };
  }
  return json(out);
}

/* ------------------------------------------------- participants & filming */
/* People join from their phone with their name: they get a private id+secret (kept on the phone),
   and, if they speak tonight, a place in the speaker list.
   Who films whom:
     rotation (default): participants in a random order form a circle; each speaker is filmed by the next person
     single:             one camera person films everyone (any participant can volunteer, or the host picks)
     camera:             only the dedicated camera page (camera password) films
   The host can override any single speech. */

async function participantFromRequest(request, env, code) {
  const h = request.headers.get("X-Participant") || "";
  const [id, secret] = h.split(".");
  if (!id || !secret) return null;
  const p = await env.DB.prepare("SELECT * FROM participants WHERE id = ? AND session_code = ?").bind(id, code).first();
  return p && timingSafeEqual(secret, p.secret) ? p : null;
}

async function joinSession(request, env, code) {
  const session = await mustGetSession(env, code);
  const body = await readJson(request);
  const name = clean(body.name, 60);
  if (!name) throw new HttpError(400, "Please enter your name");
  const speaking = body.speaking !== false, film = body.film === false ? 0 : 1;
  const impromptu = body.impromptu ? 1 : 0;
  const focusRoles = (Array.isArray(body.focus) ? body.focus : []).filter(r => r in ROLES).slice(0, 2).join(",") || null;
  const topic = impromptu ? null : clean(body.topic, 120) || null;
  let p = await participantFromRequest(request, env, session.code);
  if (p) {
    await env.DB.prepare("UPDATE participants SET name = ? WHERE id = ?").bind(name, p.id).run();
    await env.DB.prepare("UPDATE speeches SET speaker = ?, film = ?, topic = ?, impromptu = ?, focus_roles = ? WHERE participant_id = ? AND status = 'waiting'").bind(name, film, topic, impromptu, focusRoles, p.id).run();
  } else {
    p = { id: randomId(10), secret: randomId(20) };
    await env.DB.prepare("INSERT INTO participants (id, session_code, name, secret, ord) VALUES (?, ?, ?, ?, ?)")
      .bind(p.id, session.code, name, p.secret, Math.random()).run();
  }
  let speech = await env.DB.prepare("SELECT id, status, result_token FROM speeches WHERE participant_id = ?").bind(p.id).first();
  if (speaking && !speech) {
    speech = { id: randomId(10), status: "waiting", result_token: randomId(16) };
    await env.DB.prepare("INSERT INTO speeches (id, session_code, speaker, result_token, film, participant_id, topic, impromptu, focus_roles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(speech.id, session.code, name, speech.result_token, film, p.id, topic, impromptu, focusRoles).run();
  } else if (!speaking && speech && speech.status === "waiting") {
    await env.DB.prepare("DELETE FROM speeches WHERE id = ?").bind(speech.id).run();
    speech = null;
  }
  return json({ participant: { id: p.id, secret: p.secret, name }, speech }, 201);
}

/* ------------------------------------------------------------ audience roles */
/* Each role watches for one family of speaker habits (the profiles of the speaker test).
   The display text lives in tools/assets/practice.js; here we only need the keys and the item counts. */
const ROLES = { um: 0, structure: 5, body: 5, voice: 5, clarity: 4, confidence: 3, energy: 4 };
const THEME_ROLES = {
  ethos: ["confidence", "structure"], pathos: ["energy", "voice"], logos: ["structure", "clarity"],
  "five-canons": ["structure", "body"], "problem-solution-impact": ["structure", "clarity"],
  "story-message-action": ["structure", "energy"], hooks: ["structure", "energy"], "the-pause": ["um", "voice"],
  "vocal-variety": ["voice", "um"], "eye-contact-and-space": ["body", "energy"], improvisation: ["structure", "um"],
  "pitching-yourself": ["clarity", "confidence"],
};
const ROLE_ORDER = ["um", "structure", "body", "voice", "clarity", "confidence", "energy"];
function rolesWanted(session, sp) {
  const mine = String(sp.focus_roles || "").split(",").filter(r => r in ROLES);
  const list = [...mine, ...(THEME_ROLES[session.technique] || []), "um", ...ROLE_ORDER];
  return [...new Set(list)];
}
/* Who watches what, for each speech: everyone except the speaker and their filmer, rotating by speech. */
function rolePlan(session, speeches, participants, filmerOf) {
  const out = {};
  speeches.forEach((sp, idx) => {
    const filmer = filmerOf[sp.id]?.type === "participant" ? filmerOf[sp.id].id : null;
    const eligible = participants.filter(p => p.id !== sp.participant_id && p.id !== filmer);
    if (!eligible.length) { out[sp.id] = []; return; }
    const roles = rolesWanted(session, sp).slice(0, Math.min(eligible.length, 4));
    out[sp.id] = roles.map((role, k) => { const p = eligible[(idx + k) % eligible.length]; return { role, id: p.id, name: p.name }; });
  });
  return out;
}
async function setTechnique(request, env, code) {
  const session = await mustGetSession(env, code);
  const technique = clean((await readJson(request)).technique, 60) || null;
  await env.DB.prepare("UPDATE sessions SET technique = ? WHERE code = ?").bind(technique, session.code).run();
  return json({ technique });
}

/* Someone in the audience wants a go at the same topic: "I can do better", "different angle", "I want to add
   something" (30 s, next in line). Creates a speech for them on that topic, linked to the original. */
const AGAIN_KINDS = { retry: null, angle: null, addon: 30 };
async function speakAgain(request, env, id) {
  const src = await env.DB.prepare("SELECT * FROM speeches WHERE id = ?").bind(id).first();
  if (!src) throw new HttpError(404, "Speech not found");
  const me = await participantFromRequest(request, env, src.session_code);
  if (!me) throw new HttpError(401, "Join the session first");
  const kind = (await readJson(request)).kind;
  if (!(kind in AGAIN_KINDS)) throw new HttpError(400, "Unknown option");
  if (src.status === "waiting") throw new HttpError(409, "This speech hasn't started yet");
  const pending = await env.DB.prepare("SELECT id FROM speeches WHERE participant_id = ? AND status = 'waiting'").bind(me.id).first();
  if (pending) throw new HttpError(409, "You're already on the speakers list — wait for your turn");
  const last = await env.DB.prepare("SELECT film FROM speeches WHERE participant_id = ? ORDER BY created_at DESC LIMIT 1").bind(me.id).first();
  let created = null;                                       // an add-on jumps to the front of the list
  if (kind === "addon") {
    const first = await env.DB.prepare("SELECT MIN(created_at) AS t FROM speeches WHERE session_code = ? AND status = 'waiting'").bind(src.session_code).first();
    if (first?.t) created = (await env.DB.prepare("SELECT datetime(?, '-1 second') AS t").bind(first.t).first()).t;
  }
  const nid = randomId(10), token = randomId(16);
  await env.DB.prepare(
    `INSERT INTO speeches (id, session_code, speaker, result_token, film, participant_id, topic, parent_id, kind, seconds, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
  ).bind(nid, src.session_code, me.name, token, last ? last.film : 1, me.id, src.topic || null, src.id, kind, AGAIN_KINDS[kind], created).run();
  return json({ id: nid, kind, topic: src.topic || null }, 201);
}

async function filmingPlan(env, session, speeches) {
  const { results: participants } = await env.DB.prepare("SELECT id, name, ord FROM participants WHERE session_code = ? ORDER BY ord").bind(session.code).all();
  const byId = Object.fromEntries(participants.map(p => [p.id, p]));
  for (const sp of speeches) if (sp.participant_id && byId[sp.participant_id]) byId[sp.participant_id].speech_id = sp.id;
  const who = p => p ? { type: "participant", id: p.id, name: p.name } : null;
  const CAMERA = { type: "camera", name: "Camera page" }, NONE = { type: "none", name: "Not filmed" };
  const mode = session.camera_mode || "rotation";
  const filmerOf = {};
  let k = 0;
  for (const sp of speeches) {
    if (!sp.film || sp.filmer === "none") { filmerOf[sp.id] = NONE; continue; }
    if (sp.filmer === "camera") { filmerOf[sp.id] = CAMERA; continue; }
    if (sp.filmer && byId[sp.filmer] && sp.filmer !== sp.participant_id) { filmerOf[sp.id] = { ...who(byId[sp.filmer]), forced: true }; continue; }
    if (mode === "camera") { filmerOf[sp.id] = CAMERA; continue; }
    if (mode === "single" && byId[session.camera_person] && session.camera_person !== sp.participant_id) { filmerOf[sp.id] = who(byId[session.camera_person]); continue; }
    const others = participants.filter(p => p.id !== sp.participant_id);
    if (!others.length) { filmerOf[sp.id] = CAMERA; continue; }
    if (sp.participant_id && byId[sp.participant_id]) {
      const i = participants.findIndex(p => p.id === sp.participant_id);
      filmerOf[sp.id] = who(participants[(i + 1) % participants.length]);
    } else filmerOf[sp.id] = who(others[k++ % others.length]);
  }
  return { participants, filmerOf };
}

async function setFilmer(request, env, id) {
  const body = await readJson(request);
  const f = body.filmer == null || body.filmer === "" || body.filmer === "auto" ? null : clean(String(body.filmer), 40);
  const r = await env.DB.prepare("UPDATE speeches SET filmer = ? WHERE id = ?").bind(f, id).run();
  if (!r.meta?.changes) throw new HttpError(404, "Speech not found");
  return json({ id, filmer: f });
}
async function setCameraMode(request, env, code) {
  const session = await mustGetSession(env, code);
  const body = await readJson(request);
  const mode = ["rotation", "single", "camera"].includes(body.mode) ? body.mode : "rotation";
  const person = mode === "single" ? clean(String(body.person || ""), 40) || null : null;
  await env.DB.prepare("UPDATE sessions SET camera_mode = ?, camera_person = ? WHERE code = ?").bind(mode, person, session.code).run();
  return json({ mode, person });
}
async function shuffleCameras(env, code) {
  const session = await mustGetSession(env, code);
  const { results } = await env.DB.prepare("SELECT id FROM participants WHERE session_code = ?").bind(session.code).all();
  if (results.length) await env.DB.batch(results.map(p => env.DB.prepare("UPDATE participants SET ord = ? WHERE id = ?").bind(Math.random(), p.id)));
  return json({ ok: true, participants: results.length });
}
async function volunteer(request, env, code) {
  const session = await mustGetSession(env, code);
  const me = await participantFromRequest(request, env, session.code);
  if (!me) throw new HttpError(401, "Join the session first");
  const body = await readJson(request);
  if (body.stop) {
    if (session.camera_person === me.id) await env.DB.prepare("UPDATE sessions SET camera_mode = 'rotation', camera_person = NULL WHERE code = ?").bind(session.code).run();
    return json({ camera_person: false });
  }
  await env.DB.prepare("UPDATE sessions SET camera_mode = 'single', camera_person = ? WHERE code = ?").bind(me.id, session.code).run();
  return json({ camera_person: true });
}

/* A speaker can start their own speech from their phone (if nothing else is on stage). */
async function speakerStart(request, env, id) {
  const sp = await env.DB.prepare("SELECT * FROM speeches WHERE id = ?").bind(id).first();
  if (!sp) throw new HttpError(404, "Speech not found");
  const me = await participantFromRequest(request, env, sp.session_code);
  if (!me || sp.participant_id !== me.id) throw new HttpError(403, "This isn't your speech");
  const session = await mustGetSession(env, sp.session_code);
  if (session.current_speech_id && session.current_speech_id !== sp.id) {
    const cur = await env.DB.prepare("SELECT status FROM speeches WHERE id = ?").bind(session.current_speech_id).first();
    if (cur && cur.status === "open") throw new HttpError(409, "Someone else is speaking right now");
  }
  await setSpeechStatus(env, sp.id, "open");
  const timer = await startClock(env, sp.session_code, Number(sp.seconds) || Number(session.timer_duration) || 120, sp.impromptu ? THINK_MS : PREP_MS);
  return json({ ok: true, timer });
}

/* Who may upload a speech's video: the camera page (camera/host password), or the participant assigned to film it. */
async function requireUploader(request, env, speechId, uploadId) {
  const h = request.headers.get("Authorization") || "";
  const key = h.startsWith("Bearer ") ? h.slice(7) : "";
  if ((env.CAMERA_KEY && timingSafeEqual(key, env.CAMERA_KEY)) || (env.HOST_KEY && timingSafeEqual(key, env.HOST_KEY))) return;
  if (uploadId) { const up = await env.DB.prepare("SELECT speech_id FROM uploads WHERE id = ?").bind(uploadId).first(); speechId = up?.speech_id; }
  const sp = speechId && await env.DB.prepare("SELECT * FROM speeches WHERE id = ?").bind(speechId).first();
  if (sp) {
    const session = await env.DB.prepare("SELECT * FROM sessions WHERE code = ?").bind(sp.session_code).first();
    const me = await participantFromRequest(request, env, sp.session_code);
    if (me) {
      const { results: list } = await env.DB.prepare("SELECT id, film, filmer, participant_id FROM speeches WHERE session_code = ? ORDER BY created_at ASC, rowid ASC").bind(sp.session_code).all();
      const plan = await filmingPlan(env, session, list);
      if (plan.filmerOf[sp.id]?.id === me.id) return;
    }
  }
  throw new HttpError(401, "You're not the camera for this speech");
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
  const focus = Number.isInteger(Number(body.focus)) && body.focus >= 1 && body.focus <= 5 ? Number(body.focus) : null;
  if (body.role && body.role.role in ROLES) {                 // the voter's role checklist for this speech
    const r = body.role, n = ROLES[r.role];
    const items = Array.from({ length: n }, (_, i) => { const v = Number(r.items?.[i]); return [0, 1, 2].includes(v) ? v : null; });
    const count = Number.isInteger(Number(r.count)) ? Math.max(0, Math.min(999, Number(r.count))) : null;
    await env.DB.prepare(
      `INSERT INTO role_reports (speech_id, voter, role, data, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (speech_id, voter, role) DO UPDATE SET data = excluded.data, note = excluded.note, created_at = datetime('now')`
    ).bind(speechId, voter, r.role, JSON.stringify({ items, count }), clean(r.note, MAX_TEXT) || null).run();
  }
  await env.DB.prepare(
    `INSERT INTO votes (speech_id, voter, ethos, pathos, logos, structure, delivery, worked, next_rep, focus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (speech_id, voter) DO UPDATE SET
       ethos = excluded.ethos, pathos = excluded.pathos, logos = excluded.logos,
       structure = excluded.structure, delivery = excluded.delivery,
       worked = excluded.worked, next_rep = excluded.next_rep, focus = excluded.focus, created_at = datetime('now')`
  ).bind(speechId, voter, scores.ethos, scores.pathos, scores.logos, scores.structure, scores.delivery, worked, nextRep, focus).run();
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
    `SELECT sp.id, sp.speaker, sp.status, sp.result_token, sp.created_at, sp.youtube_id, sp.topic, sp.kind, sp.parent_id, sp.seconds, s.timer_duration, s.title, s.technique, s.code
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
              session: speech.title, technique: speech.technique, youtube_id: speech.youtube_id || null,
              topic: speech.topic || null, kind: speech.kind || null, target: speech.seconds || speech.timer_duration || null },
    ...results,
    self: await selfFigure(env, id),
    fillers: await fillerFigure(env, id),
    focus: await focusFigure(env, id),
    roles: await roleReports(env, id),
    previous: await previousAttempt(env, speech),
    worked: comments.map(c => c.worked).filter(Boolean),
    next_rep: comments.map(c => c.next_rep).filter(Boolean),
  });
}

async function focusFigure(env, id) {
  const r = await env.DB.prepare("SELECT COUNT(focus) AS n, AVG(focus) AS avg FROM votes WHERE speech_id = ?").bind(id).first();
  return r && r.n ? { avg: round1(r.avg), votes: r.n } : null;
}
async function roleReports(env, id) {
  const { results } = await env.DB.prepare("SELECT role, data, note FROM role_reports WHERE speech_id = ? ORDER BY created_at").bind(id).all();
  return results.map(r => ({ role: r.role, note: r.note, ...JSON.parse(r.data || "{}") }));
}
/* For a follow-up ("I can do better" etc.): the original speech it answers, to compare. */
async function previousAttempt(env, speech) {
  if (!speech.parent_id) return null;
  const prev = await env.DB.prepare("SELECT id, speaker, kind FROM speeches WHERE id = ?").bind(speech.parent_id).first();
  if (!prev) return null;
  const agg = await aggregate(env, prev.id);
  return agg.votes ? { id: prev.id, speaker: prev.speaker, kind: prev.kind || null, ...agg, fillers: (await fillerFigure(env, prev.id))?.count ?? null } : null;
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

/* ----------------------------------------------------------------- awards */
/* End-of-night awards for the projector, from tonight's closed speeches. */
async function sessionAwards(env, code) {
  const session = await mustGetSession(env, code);
  const { results: rows } = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, COUNT(v.voter) AS n, AVG(v.ethos) AS ethos, AVG(v.pathos) AS pathos, AVG(v.logos) AS logos,
            AVG(v.structure) AS structure, AVG(v.delivery) AS delivery
       FROM speeches sp LEFT JOIN votes v ON v.speech_id = sp.id
      WHERE sp.session_code = ? AND sp.status = 'closed' GROUP BY sp.id`
  ).bind(session.code).all();
  const sp = rows.filter(r => r.n > 0).map(r => ({ id: r.id, speaker: r.speaker, votes: r.n,
    scores: Object.fromEntries(CRITERIA.map(k => [k, r[k]])), overall: CRITERIA.reduce((t, k) => t + r[k], 0) / CRITERIA.length }));
  const awards = [];
  if (!sp.length) return json({ session: { title: session.title }, awards });
  const minVotes = Math.min(2, Math.max(...sp.map(x => x.votes)));          // ignore 1-vote speeches when others have more
  const fair = sp.filter(x => x.votes >= minVotes);
  const best = (list, f) => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  const fav = best(fair, x => x.overall);
  awards.push({ key: "favourite", icon: "🏆", title: "The room's favourite", winner: fav.speaker, detail: `${round1(fav.overall)} / 5 average from ${fav.votes} people` });
  // most improved: biggest jump vs the same speaker's earlier speeches in their passport
  let improved = null;
  for (const x of sp) {
    const prev = await env.DB.prepare(
      `SELECT AVG((v.ethos + v.pathos + v.logos + v.structure + v.delivery) / 5.0) AS avg
         FROM passport_speeches me JOIN passport_speeches ps ON ps.passport_id = me.passport_id
         JOIN speeches o ON o.id = ps.speech_id AND o.id != me.speech_id AND o.created_at < (SELECT created_at FROM speeches WHERE id = me.speech_id)
         JOIN votes v ON v.speech_id = o.id
        WHERE me.speech_id = ?`
    ).bind(x.id).first();
    if (prev && prev.avg != null) { const d = x.overall - prev.avg; if (d > 0.05 && (!improved || d > improved.d)) improved = { x, d }; }
  }
  if (improved) awards.push({ key: "improved", icon: "📈", title: "Most improved", winner: improved.x.speaker, detail: `+${round1(improved.d)} on their previous average` });
  // fewest fillers among speeches someone counted
  const counted = [];
  for (const x of sp) { const f = await fillerFigure(env, x.id); if (f) counted.push({ x, n: f.count }); }
  const focusRows = [];
  for (const x of fair) { const f = await focusFigure(env, x.id); if (f) focusRows.push({ x, f }); }
  if (focusRows.length >= 2 && session.technique) {
    const w = focusRows.reduce((a, b) => (b.f.avg > a.f.avg ? b : a));
    awards.push({ key: "theme", icon: "🎯", title: "Theme champion", winner: w.x.speaker, detail: `${w.f.avg} / 5 on tonight's theme` });
  }
  if (counted.length >= 2) { const q = counted.reduce((a, b) => (b.n < a.n ? b : a)); awards.push({ key: "smooth", icon: "🤫", title: "Smoothest talker", winner: q.x.speaker, detail: `only ${q.n} “um”${q.n === 1 ? "" : "s"}` }); }
  const LABEL = { ethos: ["🤝", "Most trusted", "Ethos"], pathos: ["❤️", "Moved us most", "Pathos"], logos: ["🧠", "Clearest argument", "Logos"],
                  structure: ["🧱", "Best built speech", "Structure"], delivery: ["🎙️", "Best delivery", "Delivery"] };
  const won = new Set(awards.map(a => a.winner));
  if (fair.length >= 2) for (const k of CRITERIA) {
    // share the spotlight: within 0.5 of the top score, prefer someone without an award yet
    const top = best(fair, x => x.scores[k]);
    const fresh = fair.filter(x => !won.has(x.speaker) && x.scores[k] >= top.scores[k] - 0.5);
    const w = fresh.length ? best(fresh, x => x.scores[k]) : top; won.add(w.speaker);
    awards.push({ key: k, icon: LABEL[k][0], title: LABEL[k][1], winner: w.speaker, detail: `${LABEL[k][2]} ${round1(w.scores[k])} / 5` });
  }
  return json({ session: { title: session.title }, speeches: sp.length, awards });
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

/* ---------------------------------------------------------- speech analysis */
/* A phone that films (or the host laptop) sends the speech audio in ~20 s WAV pieces. Workers AI (Whisper)
   writes it down word by word; this file measures fillers, pace, pauses, hedges… from the words, and a
   Workers AI language model writes the coaching feedback, mixing those numbers with what the room said.
   Needs a Workers AI binding called "AI" (Worker → Settings → Bindings). */
const WHISPER = "@cf/openai/whisper-large-v3-turbo";
const COACH_LLM = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const AUDIO_SOURCES = ["phone", "room"];               // preference order: the filming phone is closer to the speaker
const FILLER_PROMPT = {
  "": "Um, uh, hmm... euh, eh.",
  en: "Um, so, uh, I was like, you know... hmm, okay.",
  fr: "Euh, alors, du coup, en fait... bah, voilà, hein.",
  es: "Eh, este, o sea, bueno... pues, mmm, vale.",
};

async function audioChunk(request, env, id) {
  if (!env.AI) throw new HttpError(503, "AI analysis isn't switched on yet");
  const raw = await request.text();
  if (raw.length > 3_000_000) throw new HttpError(413, "Audio piece too large");
  let body; try { body = JSON.parse(raw); } catch { throw new HttpError(400, "Invalid JSON"); }
  const source = AUDIO_SOURCES.includes(body.source) ? body.source : "phone";
  const idx = Number(body.idx), total = Number(body.total), offset = Math.max(0, Math.round(Number(body.offset_ms) || 0));
  if (!Number.isInteger(idx) || !Number.isInteger(total) || idx < 0 || total < 1 || total > 90 || idx >= total) throw new HttpError(400, "Bad audio piece number");
  const sp = await env.DB.prepare("SELECT id FROM speeches WHERE id = ?").bind(id).first();
  if (!sp) throw new HttpError(404, "Speech not found");
  const voice = body.voice && typeof body.voice === "object" ? JSON.stringify(body.voice).slice(0, 2000) : null;
  let words = [], lang = null, text = "";
  if (typeof body.audio === "string" && body.audio.length > 100) {
    // later pieces: same language as the first one, with fillers written in that language
    const first = idx > 0 ? await env.DB.prepare("SELECT lang FROM speech_audio WHERE speech_id = ? AND source = ? AND lang IS NOT NULL ORDER BY idx LIMIT 1").bind(id, source).first() : null;
    const known = first?.lang && FILLER_PROMPT[first.lang] ? first.lang : "";
    const opts = { audio: body.audio, initial_prompt: FILLER_PROMPT[known] };
    if (known) opts.language = known;
    let res;
    try { res = await env.AI.run(WHISPER, opts); }
    catch (e) { console.error("whisper", e); throw new HttpError(502, "Transcription failed, retrying may help"); }
    words = whisperWords(res, offset);
    text = words.map(w => w[0]).join(" ");
    lang = (res.transcription_info?.language || known || "").slice(0, 5) || null;
  }
  await env.DB.prepare(
    `INSERT OR REPLACE INTO speech_audio (speech_id, source, idx, total, offset_ms, text, words, lang, voice) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, source, idx, total, offset, text, JSON.stringify(words), lang, voice).run();
  return json({ ok: true, words: words.length });
}

/* Whisper output → [[word, start_ms, end_ms], …]. Uses word timings when given, otherwise spreads each segment. */
function whisperWords(res, offset) {
  const out = [], ms = s => Math.round((Number(s) || 0) * 1000) + offset;
  for (const seg of res?.segments || []) {
    if (seg.no_speech_prob > 0.85 && (seg.avg_logprob ?? 0) < -0.8) continue;        // silence the model "heard" words in
    if (Array.isArray(seg.words) && seg.words.length) {
      for (const w of seg.words) { const t = String(w.word ?? w.text ?? "").trim(); if (t) out.push([t, ms(w.start), ms(w.end)]); }
    } else {
      const toks = String(seg.text || "").trim().split(/\s+/).filter(Boolean), s = ms(seg.start), e = ms(seg.end);
      toks.forEach((t, i) => out.push([t, Math.round(s + (e - s) * i / toks.length), Math.round(s + (e - s) * (i + 1) / toks.length)]));
    }
  }
  if (!out.length && res?.text) String(res.text).trim().split(/\s+/).filter(Boolean).forEach((t, i) => out.push([t, offset + i * 350, offset + i * 350 + 300]));
  return out;
}

/* ---- measuring the transcript */
const HARD_FILLERS = new Set("um umm ummm uh uhh uhm er erm ah ahh hmm hm mm mmm mmh euh euhh heu hum eh ehh ehm em emm eeh".split(" "));
const P_APOLOGY = ["i'm sorry", "i am sorry", "sorry", "apologies", "excuse me", "pardon", "désolé", "désolée", "excusez-moi", "excuse-moi", "perdón", "perdona", "perdonad", "lo siento", "disculpa", "disculpad", "disculpen"];
const P_HEDGE = ["i think", "i guess", "i believe", "i feel like", "maybe", "perhaps", "probably", "kind of", "sort of", "a little bit", "i'm not sure", "not sure",
  "je pense", "je crois", "peut-être", "un peu", "je sais pas", "je ne sais pas", "j'ai l'impression", "en quelque sorte",
  "creo que", "pienso que", "quizás", "quizá", "tal vez", "a lo mejor", "un poco", "no sé"];
const P_CRUTCH = ["you know", "i mean", "basically", "actually", "literally", "du coup", "en fait", "genre", "tu vois", "vous voyez", "o sea", "en plan", "digamos"];
const SOFT_CRUTCH = new Set("like so okay ok right alors bon ben bah voilà quoi bueno pues vale este tipo entonces".split(" "));  // only when followed by a comma
const phraseList = (list, tag) => list.map(p => [p.split(" "), tag]).sort((a, b) => b[0].length - a[0].length);
const PHRASES = [...phraseList(P_APOLOGY, "a"), ...phraseList(P_HEDGE, "h"), ...phraseList(P_CRUTCH, "c")];
const normWord = w => String(w).toLowerCase().replace(/[’`]/g, "'").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");

function measureSpeech(words, voice, recordedMs) {
  const toks = words.map(([w, s, e]) => ({ w, s, e, n: normWord(w), tag: "" }));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t.n) continue;
    if (HARD_FILLERS.has(t.n.replace(/(.)\1{2,}/g, "$1$1"))) { t.tag = "f"; continue; }
    let hit = null;
    for (const [p, tag] of PHRASES) {
      if (p.every((x, j) => toks[i + j]?.n === x)) { hit = [p.length, tag]; break; }
    }
    if (hit) { for (let j = 0; j < hit[0]; j++) if (!toks[i + j].tag) toks[i + j].tag = hit[1]; toks[i].start = hit[1]; i += hit[0] - 1; continue; }
    if (SOFT_CRUTCH.has(t.n) && /[,…]|\.\.\.$/.test(t.w)) { t.tag = "c"; t.start = "c"; continue; }
    if (/\d/.test(t.n)) t.tag = "n";
  }
  const spoken = toks.filter(t => t.n && t.tag !== "f");
  const first = toks[0], last = toks[toks.length - 1];
  const span = toks.length ? Math.max(1000, last.e - first.s) : 0, mins = span / 60000;
  const tally = tag => {
    const m = new Map();
    toks.forEach((t, i) => {
      if ((tag === "f" ? t.tag === "f" : t.start === tag)) {
        let ph = t.n; if (tag !== "f") { let j = i + 1; while (toks[j] && toks[j].tag === tag && !toks[j].start) ph += " " + toks[j++].n; }
        m.set(ph, (m.get(ph) || 0) + 1);
      }
    });
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { count: top.length ? [...m.values()].reduce((a, b) => a + b, 0) : 0, top };
  };
  // pauses between words (the speech's first and last words bound it: the get-ready silence isn't counted)
  const gaps = [];
  for (let i = 1; i < toks.length; i++) { const g = toks[i].s - toks[i - 1].e; if (g >= 1500) gaps.push({ at: toks[i - 1].e - first.s, ms: g }); }
  // pace per 30 s
  const pace = [];
  if (toks.length) for (let t0 = first.s; t0 < last.e; t0 += 30000) {
    const n = spoken.filter(t => t.s >= t0 && t.s < t0 + 30000).length, len = Math.min(30000, last.e - t0);
    if (len >= 8000) pace.push(Math.round(n / (len / 60000)));
  }
  // sentences
  const text = toks.map(t => t.w).join(" ");
  const sents = text.split(/(?<=[.!?…])\s+/).map(s => s.split(/\s+/).filter(w => normWord(w) && !HARD_FILLERS.has(normWord(w))).length).filter(n => n > 0);
  // repeated three-word phrases
  const tri = new Map(), plain = spoken.map(t => t.n);
  for (let i = 0; i + 2 < plain.length; i++) { const k = plain.slice(i, i + 3).join(" "); tri.set(k, (tri.get(k) || 0) + 1); }
  const repeats = [...tri.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const f = tally("f");
  return {
    words: spoken.length, speaking_ms: span, recorded_ms: recordedMs || null,
    wpm: mins ? Math.round(spoken.length / mins) : 0, pace,
    fillers: { ...f, per_min: mins ? Math.round(f.count / mins * 10) / 10 : 0 },
    crutches: tally("c"), hedges: tally("h"), apologies: tally("a"),
    numbers: toks.filter(t => t.tag === "n").length,
    pauses: { count: gaps.length, long: gaps.filter(g => g.ms >= 3000).length, blanks: gaps.filter(g => g.ms >= 5000).length,
              longest_ms: gaps.reduce((a, g) => Math.max(a, g.ms), 0), list: gaps.slice(0, 40) },
    sentences: { count: sents.length, avg: sents.length ? Math.round(sents.reduce((a, b) => a + b, 0) / sents.length) : 0, longest: sents.reduce((a, b) => Math.max(a, b), 0) },
    repeats, voice: voice || null,
    tokens: toks.map(t => [t.w, t.s - (first?.s || 0), t.e - (first?.s || 0), t.tag]),
  };
}

async function loadTranscript(env, id) {
  const { results } = await env.DB.prepare("SELECT source, idx, total, words, lang, voice FROM speech_audio WHERE speech_id = ? ORDER BY idx").bind(id).all();
  if (!results.length) return { state: "none" };
  const by = {};
  for (const r of results) (by[r.source] = by[r.source] || []).push(r);
  const done = AUDIO_SOURCES.find(s => by[s] && by[s].length >= by[s][0].total);
  if (!done) { const s = AUDIO_SOURCES.find(x => by[x]); return { state: "processing", got: by[s].length, total: by[s][0].total }; }
  const rows = by[done];
  const words = rows.flatMap(r => JSON.parse(r.words || "[]"));
  const vrow = rows.find(r => r.voice), voice = vrow ? JSON.parse(vrow.voice) : null;
  const langs = rows.map(r => r.lang).filter(Boolean);
  return { state: "ready", source: done, words, voice, lang: langs[0] || null };
}

/* POST /speeches/:id/analysis  { k, lang, report: bool, context: { theme, roles } } */
async function speechAnalysis(request, env, id) {
  const body = await readJsonBig(request, 20000);
  const speech = await env.DB.prepare(
    `SELECT sp.id, sp.speaker, sp.status, sp.result_token, sp.topic, sp.impromptu, sp.kind, sp.seconds, sp.parent_id, s.technique, s.timer_duration
       FROM speeches sp JOIN sessions s ON s.code = sp.session_code WHERE sp.id = ?`).bind(id).first();
  if (!speech) throw new HttpError(404, "Speech not found");
  if (!hostOk(request, env) && body.k !== speech.result_token) throw new HttpError(403, "This link is not valid");
  const tr = await loadTranscript(env, id);
  if (tr.state !== "ready") return json({ ai: Boolean(env.AI), ...tr });
  const voice = tr.voice || null;
  const m = measureSpeech(tr.words, voice, voice?.recorded_ms);
  const out = { ai: true, state: "ready", source: tr.source, lang: tr.lang, metrics: m };
  if (!body.report) return json(out);
  if (speech.status !== "closed") return json({ ...out, report: null, report_wait: "after" });
  if (m.words < 15) return json({ ...out, report: null, report_wait: "short" });

  const lang = ["en", "es", "fr"].includes(body.lang) ? body.lang : "en";
  const room = await aggregate(env, id);
  const extras = {
    self: await selfFigure(env, id), fillers: await fillerFigure(env, id), focus: await focusFigure(env, id), roles: await roleReports(env, id),
    comments: (await env.DB.prepare("SELECT worked, next_rep FROM votes WHERE speech_id = ? AND (worked IS NOT NULL OR next_rep IS NOT NULL) ORDER BY created_at").bind(id).all()).results,
  };
  const key = [room.votes, extras.roles.length, extras.comments.length, extras.self ? 1 : 0, extras.fillers?.count ?? "", m.words].join(":");
  const cached = await env.DB.prepare("SELECT key, report, created_at FROM speech_reports WHERE speech_id = ? AND lang = ?").bind(id, lang).first();
  const fresh = cached && (cached.key === key || Date.now() - Date.parse(cached.created_at + "Z") < 90_000);
  if (fresh && !body.again) return json({ ...out, report: JSON.parse(cached.report), report_at: cached.created_at });
  try {
    const report = await coachReport(env, { speech, m, room, extras, lang, context: body.context || {}, tokens: m.tokens, speechLang: tr.lang });
    await env.DB.prepare("INSERT OR REPLACE INTO speech_reports (speech_id, lang, key, report, created_at) VALUES (?, ?, ?, ?, datetime('now'))").bind(id, lang, key, JSON.stringify(report)).run();
    return json({ ...out, report });
  } catch (e) {
    console.error("coach", e && e.message);
    if (cached) return json({ ...out, report: JSON.parse(cached.report), report_at: cached.created_at });
    return json({ ...out, report: null, report_error: "The AI coach couldn't write the feedback this time. Reload the page to try again." });
  }
}

async function readJsonBig(request, max) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, "Request too large");
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, "Invalid JSON"); }
}

const LANG_NAME = { en: "English", es: "Spanish (Spain)", fr: "French" };
const COACH_ROLES = {
  um: { en: "Filler words", profiles: { en: ["The Filler-Machine"], fr: ["la Machine à tics"], es: ["la Máquina de muletillas"] } },
  structure: { en: "Structure", profiles: { en: ["The Rambler", "The Windbag", "The Burier", "The Forgettable"], fr: ["le Bavard", "le Moulin à paroles", "celui qui enterre son message", "l'Oubliable"], es: ["el Divagador", "el Charlatán", "el que entierra su mensaje", "el Olvidable"] } },
  body: { en: "Body & eyes", profiles: { en: ["The Statue", "The Pacer", "The Shaker", "The Escaper", "The Reader"], fr: ["la Statue", "celui qui fait les cent pas", "celui qui tremble", "celui qui fuit du regard", "le Lecteur"], es: ["la Estatua", "el que no para de caminar", "el que tiembla", "el que esquiva la mirada", "el Lector"] } },
  voice: { en: "Voice", profiles: { en: ["The Monotone", "The Mumbler", "The Speed-Talker", "The Robot"], fr: ["le Monotone", "celui qui marmonne", "celui qui parle trop vite", "le Robot"], es: ["el Monótono", "el que masculla", "el que habla demasiado rápido", "el Robot"] } },
  clarity: { en: "Clarity", profiles: { en: ["The Jargon-Monger", "The Data-Dumper"], fr: ["le Jargonneur", "celui qui noie sous les chiffres"], es: ["el de la jerga", "el que ahoga en datos"] } },
  confidence: { en: "Confidence", profiles: { en: ["The Apologiser", "The Impostor", "The People-Pleaser", "The Defensive"], fr: ["celui qui s'excuse", "l'Imposteur", "celui qui veut plaire", "le Défensif"], es: ["el que pide perdón", "el Impostor", "el que quiere agradar", "el Defensivo"] } },
  energy: { en: "Connection", profiles: { en: ["The Joker", "The Showman", "The Freezer", "The Overcompensator"], fr: ["le Blagueur", "le Showman", "celui qui se fige", "celui qui en fait trop"], es: ["el Bromista", "el Showman", "el que se bloquea", "el que se pasa"] } },
};
const ROLE_KEYS = Object.keys(COACH_ROLES);

async function coachReport(env, { speech, m, room, extras, lang, context, tokens, speechLang }) {
  const L = LANG_NAME[lang];
  const sec = ms => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, "0")}`;
  const top = t => t.top.map(([w, n]) => `“${w}” ×${n}`).join(", ") || "none";
  const ctx = context && typeof context === "object" ? context : {};
  const theme = ctx.theme && typeof ctx.theme === "object" ? ctx.theme : null;
  const roleDefs = ctx.roles && typeof ctx.roles === "object" ? ctx.roles : {};
  const target = speech.seconds || speech.timer_duration;
  // transcript with pause marks
  let tx = "", prevEnd = null;
  for (const [w, s, e] of tokens) { if (prevEnd != null && s - prevEnd >= 1500) tx += ` [pause ${((s - prevEnd) / 1000).toFixed(1)}s]`; tx += " " + w; prevEnd = e; }
  tx = tx.trim(); if (tx.length > 14000) tx = tx.slice(0, 14000) + " […]";
  const v = m.voice;
  const lines = [
    `SPEAKER: ${speech.speaker}`,
    `TOPIC: ${speech.topic ? `"${speech.topic}"` : "not given"}${speech.impromptu ? " (impromptu: surprise topic, 30 s to think)" : ""}${speech.kind ? ` (follow-up attempt on someone else's topic: ${speech.kind})` : ""}`,
    theme ? `THEME OF THE NIGHT: ${String(theme.title || "").slice(0, 80)}. Audience question: ${String(theme.focus || "").slice(0, 160)}. Suggested plan: ${(Array.isArray(theme.plan) ? theme.plan : []).slice(0, 6).map((p, i) => `${i + 1}. ${String(p[0]).slice(0, 60)} (${String(p[1] || "").slice(0, 120)})`).join(" ")}` : "THEME OF THE NIGHT: none",
    `TIME: target ${target ? sec(target * 1000) : "not set"}, actual speaking time ${sec(m.speaking_ms)}`,
    "",
    "MEASURED AUTOMATICALLY FROM THE TRANSCRIPT (speech-to-text may miss some 'um's and mishear words):",
    `- Pace: ${m.wpm} words/min (comfortable range 120–160). Per 30 s: ${m.pace.join(", ") || "n/a"}`,
    `- Filler sounds: ${m.fillers.count} (${m.fillers.per_min}/min): ${top(m.fillers)}${extras.fillers ? `. The human um-counter in the room counted ${extras.fillers.count}` : ""}`,
    `- Crutch words: ${m.crutches.count}: ${top(m.crutches)}`,
    `- Hedges: ${m.hedges.count}: ${top(m.hedges)}`,
    `- Apologies: ${m.apologies.count}: ${top(m.apologies)}`,
    `- Pauses of 1.5 s or more: ${m.pauses.count} (of 3 s+: ${m.pauses.long}, blanks of 5 s+: ${m.pauses.blanks}, longest ${(m.pauses.longest_ms / 1000).toFixed(1)} s)`,
    `- Sentences: ${m.sentences.count}, average ${m.sentences.avg} words, longest ${m.sentences.longest} words`,
    `- Numbers said: ${m.numbers}. Repeated phrases: ${m.repeats.map(([p, n]) => `“${p}” ×${n}`).join(", ") || "none"}`,
    v ? `- Voice (indicative, phone microphone): pitch variation ${v.pitch_st ?? "?"} semitones (under 2 sounds monotone, over 4 very expressive); loudness variation ${v.loud_db ?? "?"} dB; volume at the end vs the start ${v.fade_db ?? "?"} dB` : "- Voice: not measured",
    "",
    `THE ROOM (${room.votes} people voted, scores out of 5): ${room.votes ? CRITERIA.map(k => `${k} ${room.scores[k]}`).join(", ") : "no votes"}`,
    extras.focus ? `- Theme score: ${extras.focus.avg}/5` : "",
    extras.self ? `- Speaker's own rating: ${CRITERIA.map(k => `${k} ${extras.self[k]}`).join(", ")}` : "",
    ...extras.roles.map(r => {
      const d = roleDefs[r.role] || {}, items = Array.isArray(d.items) ? d.items : [];
      const marks = (r.items || []).map((x, i) => x == null || !items[i] ? null : `${String(items[i]).slice(0, 80)}: ${["no", "partly", "yes"][x] || "?"}`).filter(Boolean);
      return `- Role report, ${COACH_ROLES[r.role]?.en || r.role} watcher: ${marks.join("; ") || "no ticks"}${r.count != null && (r.role === "um" || d.count) ? `; counted ${r.count} ${r.role === "um" ? "fillers" : String(d.count || "").slice(0, 40)}` : ""}${r.note ? `; note: "${String(r.note).slice(0, 200)}"` : ""}`;
    }),
    ...extras.comments.flatMap(c => [c.worked ? `- Comment, what worked: "${c.worked}"` : "", c.next_rep ? `- Comment, try next time: "${c.next_rep}"` : ""]).filter(Boolean),
    "",
    "TRANSCRIPT ([pause Xs] = silence):",
    tx,
  ].filter(x => x !== "").join("\n");

  const profiles = ROLE_KEYS.map(k => `${k} (${COACH_ROLES[k].en}): ${COACH_ROLES[k].profiles[lang].join(" / ")}`).join("\n");
  const spoken = LANG_NAME[speechLang] || speechLang || "the speech's language";
  const system = `You are the coach of Aristotl.es, a friendly public speaking club in Madrid. You review one short club speech using its automatic transcript, measurements and the feedback people in the room gave.
Rules:
- Write every explanation in ${L}, warm, direct and concrete. Address the speaker as "you" (${lang === "fr" ? "tutoiement" : lang === "es" ? "tuteo" : "informal"}).
- Quotes from the speech and rewritten sentences stay in the language the speaker used (${spoken}), never translated.
- Be specific: quote the speaker's own words (short quotes) and use the measured numbers. No generic advice.
- The transcript is automatic: don't comment on spelling or punctuation; some fillers may be missing from it.
Fields:
- main_message: the speaker's own core message, in one sentence, as they would say it (NOT your opinion of the speech). message_clear: false only if no clear message comes through.
- summary: one or two sentences on what the speech said.
- structure: opening / body / closing = what the speaker did in each part and whether it worked; verdict clear, partial or unclear.
- theme: two sentences on how well the speech practised tonight's theme, using the plan as a checklist. "" if there is no theme.
- habits: exactly one entry per area, each with a verdict "good", "ok" or "work" and a one- or two-sentence note with evidence (a number or a quote):
  um = filler sounds and crutch words (measured counts, human counter);
  structure = opening, clear point, order, real ending;
  body = posture, eyes, hands: you cannot see it, so use only the room's reports; if there are none, verdict "unknown" and note "";
  voice = pace in words/min, pauses, pitch and loudness variation, room comments about the voice;
  clarity = sentence length, jargon, numbers, concrete examples;
  confidence = hedges, apologies, taking a clear position, strong ending;
  energy = connection with the audience, story, emotion, humour, room comments.
  "profile": when the speaker clearly shows that area's habit, the matching name from this list, otherwise "":
${profiles}
- strengths: two specific things that worked.
- improvements: the 3 most useful changes for next time, most important first; "example" rewrites one of their actual sentences better (in ${spoken}) or gives a one-line drill.
- room_vs_ai: where the room's feedback and your analysis agree or differ, in one or two sentences. If nobody gave feedback, say so briefly.
- drill: one short exercise for next week.
Return only JSON matching the schema.`;

  const schema = {
    type: "object",
    properties: {
      summary: { type: "string" },
      main_message: { type: "string" },
      message_clear: { type: "boolean" },
      structure: { type: "object", properties: { opening: { type: "string" }, body: { type: "string" }, closing: { type: "string" }, verdict: { type: "string", enum: ["clear", "partial", "unclear"] } }, required: ["opening", "body", "closing", "verdict"] },
      theme: { type: "string" },
      habits: { type: "array", items: { type: "object", properties: { area: { type: "string", enum: ROLE_KEYS }, verdict: { type: "string", enum: ["good", "ok", "work", "unknown"] }, note: { type: "string" }, profile: { type: "string" } }, required: ["area", "verdict", "note", "profile"] } },
      strengths: { type: "array", items: { type: "string" } },
      improvements: { type: "array", items: { type: "object", properties: { area: { type: "string", enum: ROLE_KEYS }, tip: { type: "string" }, example: { type: "string" } }, required: ["area", "tip", "example"] } },
      room_vs_ai: { type: "string" },
      drill: { type: "string" },
    },
    required: ["summary", "main_message", "message_clear", "structure", "theme", "habits", "strengths", "improvements", "room_vs_ai", "drill"],
  };
  const messages = [{ role: "system", content: system }, { role: "user", content: lines + `\n\nWrite the review in ${L} (quotes and rewrites in ${spoken}). One entry in "habits" for each of: ${ROLE_KEYS.join(", ")}, each with a verdict and an evidence-based note.` }];
  let res;
  try { res = await env.AI.run(COACH_LLM, { messages, response_format: { type: "json_schema", json_schema: schema }, max_tokens: 2200, temperature: 0.4 }); }
  catch (e) { console.error("coach json_schema", e && e.message); res = await env.AI.run(COACH_LLM, { messages, max_tokens: 2200, temperature: 0.4 }); }
  let r = res?.response;
  if (typeof r === "string") { const a = r.indexOf("{"), b = r.lastIndexOf("}"); r = JSON.parse(r.slice(a, b + 1)); }
  if (!r || typeof r !== "object") throw new Error("no report");
  return tidyReport(r);
}

function tidyReport(r) {
  const s = (x, n = 600) => (typeof x === "string" ? x.trim().slice(0, n) : "");
  const habits = (Array.isArray(r.habits) ? r.habits : []).filter(h => ROLE_KEYS.includes(h?.area))
    .map(h => ({ area: h.area, verdict: ["good", "ok", "work", "unknown"].includes(h.verdict) ? h.verdict : "ok", note: s(h.note, 400), profile: s(h.profile, 60) }));
  const seen = new Set();
  return {
    summary: s(r.summary), main_message: s(r.main_message, 300), message_clear: r.message_clear !== false,
    structure: { opening: s(r.structure?.opening, 400), body: s(r.structure?.body, 400), closing: s(r.structure?.closing, 400), verdict: ["clear", "partial", "unclear"].includes(r.structure?.verdict) ? r.structure.verdict : "partial" },
    theme: s(r.theme, 500),
    habits: ROLE_KEYS.map(k => habits.find(h => h.area === k && !seen.has(k) && seen.add(k))).filter(Boolean),
    strengths: (Array.isArray(r.strengths) ? r.strengths : []).map(x => s(x, 300)).filter(Boolean).slice(0, 3),
    improvements: (Array.isArray(r.improvements) ? r.improvements : []).map(x => ({ area: ROLE_KEYS.includes(x?.area) ? x.area : "", tip: s(x?.tip, 300), example: s(x?.example, 400) })).filter(x => x.tip).slice(0, 4),
    room_vs_ai: s(r.room_vs_ai, 500), drill: s(r.drill, 400),
  };
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
  const redirect = siteOrigin(env) + "/tools/admin.html"; // Google sends the user back to the admin page
  const u = new URL(gUrl(env, "GOOGLE_AUTH_URL", "https://accounts.google.com/o/oauth2/v2/auth"));
  u.search = "?" + new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: YT_SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  }).toString();
  return json({ url: u.toString() });
}

async function youtubeExchange(request, env) {
  const { code, state } = await readJson(request);
  const st = state && await env.DB.prepare("SELECT created_at FROM oauth_states WHERE state = ?").bind(String(state)).first();
  if (!st || Date.now() - st.created_at > 15 * 60e3) throw new HttpError(400, "That connection link expired. Click Connect again.");
  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?").bind(String(state)).run();
  const res = await fetch(gUrl(env, "GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"), {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(code || ""), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: siteOrigin(env) + "/tools/admin.html", grant_type: "authorization_code" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) {
    console.error("token exchange", res.status, JSON.stringify(tok));
    throw new HttpError(502, "Google didn't give the site access" + (tok.error_description ? ": " + tok.error_description : "") + ". Try again and tick the YouTube permission boxes.");
  }
  await setSetting(env, "yt_refresh", tok.refresh_token);
  accessCache = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
  let channel = null;
  try {
    const ch = await (await fetch(gUrl(env, "YT_API_URL", "https://www.googleapis.com/youtube/v3") + "/channels?part=snippet&mine=true",
      { headers: { Authorization: "Bearer " + tok.access_token } })).json();
    const c = ch.items?.[0];
    channel = c ? { id: c.id, title: c.snippet?.title } : null;
    await setSetting(env, "yt_channel", channel ? JSON.stringify(channel) : null);
  } catch {}
  return json({ connected: true, channel });
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Offset, X-Participant",
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
