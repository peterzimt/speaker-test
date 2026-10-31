/* Aristotl.es — practice plans per theme (technique of the night) and audience roles.
   A plan is a speech skeleton that forces the speaker to practise the theme; "focus" is the extra question
   the audience scores. Roles each watch one family of habits from the speaker test. Text is English;
   i18n-dict.js holds the Spanish and French. */
window.PRACTICE_PLANS = {
  ethos: { focus: "Did you trust them — and could you say why?", plan: [
    ["Why me", "One sentence on your link to the topic: something you did, saw or paid for."],
    ["What's in it for you", "Tell the room what they'll get from the next minutes."],
    ["One honest limit", "Admit something you don't know or got wrong."],
    ["Proof", "One specific fact, number or story that backs you up."],
    ["Close with conviction", "Your recommendation, said slowly, looking at one person."]] },
  pathos: { focus: "Did you feel something?", plan: [
    ["Open on a person", "A name and a moment — not a statistic."],
    ["One sensory detail", "A sound, an object, a sentence someone said."],
    ["The turning point", "What changed, and what they felt at that moment."],
    ["Bring it to us", "Why it matters to the people in this room, now."],
    ["Close on the feeling", "End on the image, not on a summary."]] },
  logos: { focus: "Could you repeat their argument?", plan: [
    ["Claim", "Your point in fewer than fifteen words."],
    ["Reason 1 + evidence", "Something the room can check or already accepts."],
    ["Reason 2 + evidence", "A different kind of proof: example, number, expert."],
    ["The best objection", "Say the strongest counter-argument and answer it in one line."],
    ["Claim again", "Same point, new words, then stop."]] },
  "five-canons": { focus: "Was it prepared, ordered and delivered — not read?", plan: [
    ["Hook line", "A first sentence that earns attention."],
    ["Three points, in order", "Announce them, then deliver them in that order."],
    ["One memorable phrase", "An image or a line people will repeat."],
    ["No notes", "Speak from the skeleton, not a script."],
    ["Slow last line", "Deliver the final sentence slowly, then stay silent for two seconds."]] },
  "problem-solution-impact": { focus: "Did you feel the problem before hearing the solution?", plan: [
    ["Problem", "One concrete example and what it costs. About 40% of your time."],
    ["Solution", "One idea, explained simply. Not three options."],
    ["Impact", "Paint the world after: what changes, for whom."],
    ["Next step", "One specific thing to do this week."]] },
  "story-message-action": { focus: "Was there one clear message and one action?", plan: [
    ["Start in the action", "Drop us in the middle of the scene — no “so, a few years ago…”."],
    ["The twist", "The moment it went wrong or surprised you."],
    ["Message", "One sentence starting “What I learned is…”."],
    ["Action", "One small step the room can take this week."]] },
  hooks: { focus: "Did the first sentence make you want to listen?", plan: [
    ["Hook", "A question, a scene or a bold claim. No name, no agenda."],
    ["Two-second pause", "Let the hook land before you go on."],
    ["Your point", "Deliver the content the hook promised."],
    ["Callback", "Close by returning to your opening hook."]] },
  "the-pause": { focus: "Did they use silence instead of fillers?", plan: [
    ["Silent start", "Stand, look at the room, count two, then speak."],
    ["Key line 1 + pause", "Say it, then two seconds of silence."],
    ["Key line 2 + pause", "Same again. Resist filling the gap."],
    ["Slow close", "Final line slowly, then silence before “thank you”."]] },
  "vocal-variety": { focus: "Did the voice change with the content?", plan: [
    ["Quiet opening", "Start softer than usual — make them lean in."],
    ["Speed up", "One exciting part, faster and with energy."],
    ["Slow down", "Your key line, slow and clear."],
    ["Land it", "Last word of the speech loud and firm — no fading."]] },
  "eye-contact-and-space": { focus: "Did they talk to faces and move with purpose?", plan: [
    ["Centre, planted", "Open from the centre, feet still."],
    ["Part 1 from the left", "Walk there for idea one. One person per sentence."],
    ["Part 2 from the right", "Move only when the idea changes."],
    ["Back to centre", "Close where you started, feet planted."]] },
  improvisation: { focus: "Was there a clear point, even without preparation?", plan: [
    ["Point first", "Breathe and say your point, even if it's simple."],
    ["One reason", "Why you think so."],
    ["One example", "A concrete moment or fact."],
    ["Point again", "Say it in different words — then stop."]] },
  "pitching-yourself": { focus: "Would you know how to help them?", plan: [
    ["Who you help", "“I help [who] with [what problem].”"],
    ["Proof", "One result or story, with a number if you have one."],
    ["How", "One line on how you do it."],
    ["The ask", "What you're looking for, so people know how to help."]] },
};

/* Roles. type "check": tap ✓ / ~ / ✗ for each item. The um counter uses the filler counter.
   "watches" lists the speaker-test profiles each role helps with. */
window.AUDIENCE_ROLES = {
  um: { icon: "🔢", name: "Um counter", watches: "The Filler-Machine",
    brief: "Count every “um”, “uh”, “so”, “like” with the filler counter.", items: [] },
  structure: { icon: "🧱", name: "Structure checker", watches: "The Rambler, The Windbag, The Burier, The Forgettable",
    brief: "Follow the shape of the speech.", items: [
      "Clear opening — no “so, hi, I'm…”", "Main point said early", "Easy-to-follow middle", "Real ending — not “that's it”", "You could repeat the main point"] },
  body: { icon: "🧍", name: "Body & eyes watcher", watches: "The Statue, The Pacer, The Shaker, The Escaper, The Reader",
    brief: "Watch the eyes, feet and hands.", items: [
      "Looked at people — not floor, ceiling or notes", "Feet planted — no wandering", "Hands used on purpose", "Moved only with the ideas", "Open, confident posture"] },
  voice: { icon: "🎙️", name: "Voice watcher", watches: "The Monotone, The Mumbler, The Speed-Talker, The Robot",
    brief: "Close your eyes for a few seconds and just listen.", items: [
      "Loud enough for the back row", "Not rushing", "Voice varied — not flat", "Ends of sentences landed", "Used pauses"] },
  clarity: { icon: "💬", name: "Clarity checker", watches: "The Jargon-Monger, The Data-Dumper",
    brief: "Could a 12-year-old follow it?", items: [
      "Simple words — no jargon", "Few numbers, each explained", "At least one concrete example", "One idea at a time"] },
  confidence: { icon: "💪", name: "Confidence watcher", watches: "The Apologiser, The Impostor, The People-Pleaser, The Defensive",
    brief: "Count apologies and hedges: sorry, I think, maybe, just, kind of.", count: "Apologies & hedges", items: [
      "Started without apologising", "Took a clear position", "Ended strong — no “sorry, that's all”"] },
  energy: { icon: "⚡", name: "Connection watcher", watches: "The Joker, The Showman, The Freezer, The Overcompensator",
    brief: "Watch the bond between speaker and room.", items: [
      "Real connection with the audience", "Humour or energy served the point", "Recovered well from a slip or blank", "You felt something"] },
};
window.ROLE_SHORT = { um: "🔢 Filler words", structure: "🧱 Structure", body: "🧍 Body & eyes", voice: "🎙️ Voice", clarity: "💬 Clarity", confidence: "💪 Confidence", energy: "⚡ Connection" };

/* Someone in the audience takes the same topic */
window.AGAIN_OPTIONS = [
  ["retry", "🔁", "I can do better", "Take this topic yourself, later tonight."],
  ["angle", "🔄", "Same topic, different angle", "Take the other side, or tell it as a story."],
  ["addon", "➕", "I want to add something", "30 seconds, next in line."],
];
window.AGAIN_LABEL = { retry: "🔁 Can do better", angle: "🔄 New angle", addon: "➕ Add-on" };

/* Shared renderers (phone + feedback card). esc = HTML escaper. */
window.PracticeUI = {
  roleReports(list, esc) {
    if (!list || !list.length) return "";
    const by = {};
    for (const r of list) (by[r.role] = by[r.role] || []).push(r);
    return Object.entries(by).map(([key, reps]) => {
      const R = AUDIENCE_ROLES[key]; if (!R) return "";
      const med = a => { a = a.filter(x => x != null).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
      const rows = R.items.map((label, i) => {
        const v = reps.map(r => r.items?.[i]).filter(x => x != null); if (!v.length) return "";
        const avg = v.reduce((a, b) => a + b, 0) / v.length;
        const mark = avg >= 1.5 ? "✓" : avg >= 0.75 ? "~" : "✗", cls = avg >= 1.5 ? "ok" : avg >= 0.75 ? "mid" : "no";
        return `<div class="rr-item ${cls}"><span class="rr-mark">${mark}</span><span>${esc(label)}</span></div>`;
      }).join("");
      const count = med(reps.map(r => r.count));
      const countLine = key === "um" ? (count != null ? `<div class="rr-count">${count} <span>“um”s</span></div>` : "")
        : R.count && count != null ? `<div class="rr-count">${count} <span>${esc(R.count)}</span></div>` : "";
      const notes = reps.map(r => r.note).filter(Boolean).map(n => `<div class="rr-note">“${esc(n)}”</div>`).join("");
      if (!rows && !countLine && !notes) return "";
      return `<div class="rr"><div class="rr-h">${R.icon} <strong>${esc(R.name)}</strong></div>${countLine}${rows}${notes}</div>`;
    }).join("");
  },
  previous(prev, scores, CRITERIA, esc) {
    if (!prev) return "";
    const rows = CRITERIA.map(c => {
      const a = prev.scores[c.key], b = scores[c.key]; if (a == null || b == null) return "";
      const d = Math.round((b - a) * 10) / 10;
      return `<span style="color:${c.hex};font-weight:600">${c.label}</span><span class="n">${a}</span><span class="n">${b}</span><span class="n ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" : ""}${d}</span>`;
    }).join("");
    return `<div class="vs vs4"><span></span><span class="h">${esc(prev.speaker || "")}</span><span class="h">You</span><span class="h">Δ</span>${rows}</div>`;
  },
};
