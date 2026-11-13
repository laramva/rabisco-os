/* Rabisco OS — 365 dias de prática guiada (offline-first, sem servidor). */
(() => {
  "use strict";

  const COURSE_URL = "https://app.ilustraacademy.com/courses/c/";
  const LESSON_URL = "https://app.ilustraacademy.com/courses/l/";
  const STORE_KEY = "rabisco-os-v1";
  const TOTAL_DAYS = 365;
  const PLAN_V = 2; // 2 = trilha na ordem do PDF "ordem dos treinamentos" (v1.8)
  const PLAN_V_START = "2026-11-12";
  const APP_VERSION = "1.8"; // bump together with VERSION in sw.js on every publish, so installed apps update themselves

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const todayISO = () => isoDate(new Date());
  function isoDate(d) { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }
  function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoDate(d); }
  function diffDays(a, b) { return Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000); }
  const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  /* ------------------------------------------------------------------ data */
  const COURSES = window.COURSES || [];
  const EX = window.EX || {};
  const CHALLENGES = window.CHALLENGES || [];
  const TRILHAS = window.TRILHAS || [];
  const CH_COURSE = window.CH_COURSE || {}; // courseKey -> weekly challenges for that course
  const CH_BOSS = window.CH_BOSS || [];      // one list of monthly bosses per trilha
  const LAB = window.LAB || { modules: [] };
  const TIPS = window.TIPS || [];

  // Short lessons (welcome, materials...) can share a day with the next lesson.
  const LIGHT_RE = /^(boas[ -]vindas|boas vindas ao curso|materiais|materiais e exerc[ií]cios|exerc[ií]cios e materiais|exerc[ií]cios|apostila.*|ordem dos treinamentos|recursos da plataforma|introdu[cç][aã]o|introdu[cç][aã]o ao curso|tudo pronto para iniciar\?)$/i;

  // The Trilha 365 follows the PDF "ordem dos treinamentos": trilhas in order, courses in order, lessons in order.
  // Courses outside the PDF stay in the Biblioteca as extras.
  const PLAN_COURSES = [];
  TRILHAS.forEach((t, ti) => t.c.forEach((x, k) => {
    const c = COURSES.find((cc) => cc.id.startsWith(x.k));
    if (!c) return;
    Object.assign(c, { trilha: t, tn: ti + 1, po: ti * 100 + k, unlock: x.u, key: x.k, cat: `${t.n} · ${t.t}` });
    PLAN_COURSES.push(c);
  }));
  COURSES.forEach((c) => { if (!c.trilha) { c.key = c.id.slice(0, 8); c.po = 1000 + (c.po || 0); c.cat = "Extras (fora da trilha) · " + c.cat; } });
  COURSES.sort((a, b) => a.po - b.po);

  // Flatten every lesson of every course, keeping its exercises.
  const LESSONS = [];
  const LESSON_BY_ID = {};
  const missingEx = [];
  COURSES.forEach((c, ci) => {
    const exList = EX[c.id.slice(0, 8)] || [];
    let idx = 0;
    c.mods.forEach((m) => {
      m.l.forEach(([title, id]) => {
        const ex = exList[idx] || null;
        if (!ex) missingEx.push(c.title + " › " + title);
        const L = { id, title, course: c, ci, mod: m.m, idx, n: idx + 1, ex: ex || [], light: LIGHT_RE.test(title.trim()), url: LESSON_URL + id };
        idx++;
        LESSONS.push(L);
        LESSON_BY_ID[id] = L;
      });
    });
    c.count = idx;
    if (exList.length && exList.length !== idx) console.warn("[exercícios] contagem diferente em", c.title, exList.length, "≠", idx);
  });
  if (missingEx.length) console.warn("[exercícios] aulas sem exercício:", missingEx);

  /* ------------------------------------------------------------- the plan */
  // Every 7th day is a challenge about that week's course (every 28th a boss of the trilha), day 365 is the grand finale.
  // The other days get the lessons, one per day; when there are more lessons than days, short lessons share a day.
  function buildPlan() {
    const special = new Set();
    for (let d = 7; d < TOTAL_DAYS; d += 7) special.add(d);
    special.add(TOTAL_DAYS);
    const lessonDays = [];
    for (let d = 1; d <= TOTAL_DAYS; d++) if (!special.has(d)) lessonDays.push(d);
    const w = (l) => (l.light ? 0.5 : 1);
    let units = PLAN_COURSES.flatMap((c) => LESSONS.filter((l) => l.course === c)).map((l) => [l]);
    while (units.length > lessonDays.length) {
      let best = -1, bestCost = Infinity;
      for (let i = 0; i + 1 < units.length; i++) {
        const a = units[i], b = units[i + 1];
        if (a[0].course !== b[0].course || a.length + b.length > 3) continue;
        const cost = a.concat(b).reduce((s, l) => s + w(l), 0);
        if (cost < bestCost) { best = i; bestCost = cost; }
      }
      if (best < 0) for (let i = 0; i + 1 < units.length; i++) if (units[i].length + units[i + 1].length <= 3) { best = i; break; }
      if (best < 0) break;
      units.splice(best, 2, units[best].concat(units[best + 1]));
    }
    const days = {};
    lessonDays.forEach((d, i) => {
      // fewer lessons than days: the extra days repeat the previous lesson as a practice day
      const list = units[i] || null;
      days[d] = list ? { n: d, type: "lesson", lessons: list } : { n: d, type: "lesson", lessons: units[units.length - 1], practice: true };
    });
    // remember which plan day each lesson lives on (its first day)
    Object.values(days).forEach((D) => { if (!D.practice) D.lessons.forEach((l) => { if (!l.day) l.day = D.n; }); });
    // weekly challenge = the course most present in the previous 6 days; boss = the trilha of that course
    const used = {}, bossUsed = {};
    let week = 0;
    for (const d of [...special].sort((a, b) => a - b)) {
      if (d === TOTAL_DAYS) { days[d] = { n: d, type: "final", ch: window.FINALE }; continue; }
      week++;
      const recap = [];
      for (let x = d - 6; x < d; x++) if (days[x] && days[x].lessons && !days[x].practice) recap.push(...days[x].lessons);
      const count = new Map();
      recap.forEach((l) => count.set(l.course, (count.get(l.course) || 0) + 1));
      const course = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
      const c = course ? course[0] : PLAN_COURSES[PLAN_COURSES.length - 1];
      const boss = week % 4 === 0;
      let ch = null;
      if (boss && c && c.tn) { const list = CH_BOSS[c.tn - 1] || []; const k = bossUsed[c.tn] || 0; ch = list[k] || null; if (ch) bossUsed[c.tn] = k + 1; }
      if (!ch && c) { const list = CH_COURSE[c.key] || []; const k = used[c.key] || 0; ch = list[k] || null; if (ch) used[c.key] = k + 1; }
      if (!ch) ch = CHALLENGES[(week - 1) % Math.max(1, CHALLENGES.length)];
      days[d] = { n: d, type: boss ? "boss" : "week", week, ch, course: c, recap };
    }
    return days;
  }
  const PLAN = buildPlan();

  /* ---------------------------------------------------------------- state */
  const defaultState = () => ({
    v: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: "",
    startDate: todayISO(),
    days: {},          // planDay -> {done, date, picks:{lessonId:[bool,bool]}, chDone, note, minutes}
    ex: {},            // lessonId -> [bool,bool] (also from library)
    lab: {},           // labExerciseKey -> date
    activity: {},      // iso date -> minutes/count of activity
    freezes: 1,
    usedFreezes: {},   // iso date -> true
    badges: {},        // badgeId -> iso date
    xp: 0,
    theme: "light",
    gist: { id: "", token: "", lastSync: "" },
    timerMin: 30,
    xpBy: {},          // deviceId -> XP earned on that device (sync adds them up)
    mt: {},            // "ex:<id>" / "day:<n>" / "lab:<k>" / "cfg:<field>" / "photo:<id>" -> last change, so sync keeps the newest edit
    photoIdx: {},      // photoId -> {c: 1 once saved in the account, kind, day, ts} | {del: true, gone} once deleted (g: old Gist copy)
    devices: {},       // deviceId -> {kind, app, ver, fp, photos, at}: what each device had at its last sync
    planV: PLAN_V,     // version of the Trilha 365 the days/exercises refer to
  });

  // Random id for this browser, kept outside the synced state.
  const DEVICE = (() => {
    try {
      let d = localStorage.getItem("rabisco-os-device");
      if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("rabisco-os-device", d); }
      return d;
    } catch (e) { return "local"; }
  })();
  function fixState(s) {
    const o = Object.assign(defaultState(), s);
    o.gist = Object.assign({ id: "", token: "", lastSync: "" }, o.gist);
    if (o.xp && !Object.keys(o.xpBy).length) o.xpBy = { [DEVICE]: o.xp };
    // Trilha 365 v2 (ordem do PDF, exercícios novos): the old day numbers and exercise marks no longer match,
    // so they restart; XP, streak, badges, Lab and every photo stay.
    if (!s || (s.planV || 1) < PLAN_V) {
      o.days = {}; o.ex = {};
      o.mt = Object.fromEntries(Object.entries(o.mt || {}).filter(([k]) => !/^(day|ex):/.test(k)));
      // the new trail starts on its release day (same value on every device, so sync agrees)
      if (o.startDate < PLAN_V_START) o.startDate = PLAN_V_START;
      o.planV = PLAN_V;
    }
    return o;
  }
  const touch = (k) => { S.mt[k] = new Date().toISOString(); };

  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return fixState(JSON.parse(raw));
    } catch (e) { console.warn(e); }
    return defaultState();
  }
  function save(silent, noSync) {
    S.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast("Não consegui salvar no navegador: " + e.message, "⚠️"); }
    idbPut("kv", "state", S).catch(() => {});
    if (!silent) renderChips();
    if (!noSync) scheduleAutoSync();
  }

  /* ---------------------------------------------------------------- IndexedDB (photos + mirror) */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("rabisco-os", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); r.result.createObjectStore("photos", { keyPath: "id" }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function idbPut(store, key, val) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, "readwrite"); key == null ? t.objectStore(store).put(val) : t.objectStore(store).put(val, key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }
  async function idbGet(store, key) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  async function idbAll(store) { const d = await db(); return new Promise((res, rej) => { const q = d.transaction(store).objectStore(store).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
  async function idbDel(store, key) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, "readwrite"); t.objectStore(store).delete(key); t.oncomplete = res; t.onerror = () => rej(t.error); }); }

  // If localStorage was wiped but IndexedDB still has the mirror, restore it.
  (async () => {
    try {
      const mirror = await idbGet("kv", "state");
      if (mirror && (!localStorage.getItem(STORE_KEY) || (mirror.updatedAt || "") > (S.updatedAt || ""))) {
        if (Object.keys(mirror.days || {}).length > Object.keys(S.days || {}).length) { S = fixState(mirror); save(true); route(); }
      }
    } catch (e) {}
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  })();

  /* ---------------------------------------------------------------- progress logic */
  const isDayDone = (n) => !!(S.days[n] && S.days[n].done);
  function currentDay() { for (let d = 1; d <= TOTAL_DAYS; d++) if (!isDayDone(d)) return d; return TOTAL_DAYS; }
  const doneCount = () => Object.values(S.days).filter((d) => d.done).length;

  function logActivity(min) {
    const t = todayISO();
    S.activity[t] = (S.activity[t] || 0) + (min || 1);
  }
  function activeOn(iso) { return !!S.activity[iso] || !!S.usedFreezes[iso]; }
  function streak() {
    let n = 0, d = todayISO();
    if (!activeOn(d)) d = addDays(d, -1); // today still open: streak counts until yesterday
    while (activeOn(d)) { if (S.activity[d]) n++; d = addDays(d, -1); }
    return n;
  }
  function bestStreak() {
    const days = Object.keys(S.activity).concat(Object.keys(S.usedFreezes)).sort();
    if (!days.length) return 0;
    let best = 0, cur = 0, prev = null;
    for (const d of [...new Set(days)]) {
      cur = prev && diffDays(prev, d) === 1 ? cur + (S.activity[d] ? 1 : 0) : (S.activity[d] ? 1 : 0);
      best = Math.max(best, cur); prev = d;
    }
    return best;
  }
  // Auto-apply freezes to cover missed days (only for gaps right before today).
  function applyFreezes() {
    const t = todayISO();
    const y = addDays(t, -1);
    if (activeOn(y) || !Object.keys(S.activity).length) return;
    // find last active day
    let d = addDays(y, -1), gap = [y];
    for (let i = 0; i < 10 && !activeOn(d); i++) { gap.push(d); d = addDays(d, -1); }
    if (!activeOn(d)) return; // too long, streak already lost
    if (gap.length <= S.freezes) {
      gap.forEach((g) => (S.usedFreezes[g] = true));
      S.freezes -= gap.length;
      touch("cfg:freezes");
      save(true);
      setTimeout(() => toast(`Usei ${gap.length} cristal(is) de gelo ❄️ para proteger sua streak!`, "❄️"), 600);
    }
  }

  const LEVELS = [
    [0, "Rabiscador(a) de Guardanapo"], [150, "Aprendiz de Grafite"], [400, "Caçador(a) de Formas"], [800, "Domador(a) de Linhas"],
    [1300, "Esboçador(a) Estelar"], [1900, "Mago(a) do Gesture"], [2600, "Arquiteto(a) de Perspectivas"], [3400, "Alquimista das Cores"],
    [4300, "Criador(a) de Criaturas"], [5300, "Piloto(a) de Naves Neon"], [6400, "Feiticeiro(a) Cósmico(a)"], [7600, "Lenda do Sketchbook"], [9000, "Arquimago(a) das 365 Luas"],
  ];
  function level() {
    let i = 0; while (i + 1 < LEVELS.length && S.xp >= LEVELS[i + 1][0]) i++;
    const next = LEVELS[i + 1];
    return { i: i + 1, name: LEVELS[i][1], cur: LEVELS[i][0], next: next ? next[0] : null };
  }
  function addXP(n, why) {
    const before = level().i;
    S.xpBy[DEVICE] = (S.xpBy[DEVICE] || 0) + n;
    S.xp = Object.values(S.xpBy).reduce((a, b) => a + b, 0);
    const after = level();
    if (after.i > before) setTimeout(() => { confetti(); toast(`LEVEL UP! Nível ${after.i}: ${after.name}`, "🌟"); }, 400);
    if (why) toast(`+${n} XP · ${why}`, "✨");
  }

  /* ---------------------------------------------------------------- badges */
  const BADGES = [
    { id: "first", ico: "✏️", t: "Primeiro Traço", d: "Concluiu o dia 1", ok: () => isDayDone(1) },
    { id: "s3", ico: "🔥", t: "Faísca", d: "Streak de 3 dias", ok: () => bestStreak() >= 3 },
    { id: "s7", ico: "🌙", t: "Uma Lua Inteira", d: "Streak de 7 dias", ok: () => bestStreak() >= 7 },
    { id: "s14", ico: "🪐", t: "Órbita Estável", d: "Streak de 14 dias", ok: () => bestStreak() >= 14 },
    { id: "s30", ico: "☀️", t: "Mês Solar", d: "Streak de 30 dias", ok: () => bestStreak() >= 30 },
    { id: "s60", ico: "🌌", t: "Via Láctea", d: "Streak de 60 dias", ok: () => bestStreak() >= 60 },
    { id: "s100", ico: "💯", t: "Centenário(a)", d: "Streak de 100 dias", ok: () => bestStreak() >= 100 },
    { id: "s200", ico: "🛸", t: "Viagem Interestelar", d: "Streak de 200 dias", ok: () => bestStreak() >= 200 },
    { id: "d50", ico: "📒", t: "Sketchbook Cheio", d: "50 dias da trilha concluídos", ok: () => doneCount() >= 50 },
    { id: "d100", ico: "📚", t: "Biblioteca Viva", d: "100 dias da trilha", ok: () => doneCount() >= 100 },
    { id: "d182", ico: "🌗", t: "Meio Ano-Luz", d: "182 dias da trilha", ok: () => doneCount() >= 182 },
    { id: "d365", ico: "👑", t: "Arquimago(a) das 365 Luas", d: "Concluiu os 365 dias", ok: () => doneCount() >= 365 },
    { id: "w1", ico: "🏆", t: "Desafiante", d: "Primeiro desafio semanal", ok: () => Object.entries(S.days).some(([n, d]) => d.done && ["week", "boss"].includes(PLAN[n] && PLAN[n].type)) },
    { id: "boss1", ico: "🐉", t: "Matador(a) de Chefão", d: "Venceu um Boss mensal", ok: () => Object.entries(S.days).some(([n, d]) => d.done && PLAN[n] && PLAN[n].type === "boss") },
    { id: "boss6", ico: "⚔️", t: "Caça-Chefões", d: "6 Bosses vencidos", ok: () => Object.entries(S.days).filter(([n, d]) => d.done && PLAN[n] && PLAN[n].type === "boss").length >= 6 },
    { id: "turbo", ico: "⚡", t: "Modo Turbo", d: "Fez os 2 exercícios de uma aula no mesmo dia", ok: () => Object.values(S.ex).some((e) => e[0] && e[1]) },
    { id: "lab1", ico: "👾", t: "Cientista Maluco(a)", d: "Primeiro exercício do Lab Cósmico", ok: () => Object.keys(S.lab).length >= 1 },
    { id: "lab20", ico: "🧪", t: "Laboratório em Chamas", d: "20 exercícios do Lab Cósmico", ok: () => Object.keys(S.lab).length >= 20 },
    { id: "labAll", ico: "🧬", t: "Mestre das Criaturas", d: "Todos os exercícios do Lab Cósmico", ok: () => labTotal() > 0 && Object.keys(S.lab).length >= labTotal() },
    { id: "photo1", ico: "📸", t: "Galeria Aberta", d: "Guardou a primeira foto de desenho", ok: () => (S._photoCount || 0) >= 1 },
    { id: "photo30", ico: "🖼️", t: "Exposição Individual", d: "30 fotos na galeria", ok: () => (S._photoCount || 0) >= 30 },
    { id: "backup", ico: "💾", t: "Disquete Seguro", d: "Fez um backup", ok: () => !!S._backedUp },
    { id: "night", ico: "🦉", t: "Coruja Noturna", d: "Praticou depois das 23h", ok: () => !!S._night },
    { id: "early", ico: "🐓", t: "Madrugador(a)", d: "Praticou antes das 7h", ok: () => !!S._early },
    { id: "course1", ico: "🎓", t: "Curso Zerado", d: "Fez exercício de todas as aulas de um curso", ok: () => COURSES.some((c) => courseProgress(c).done === c.count && c.count > 0) },
  ];
  function checkBadges() {
    let got = 0;
    for (const b of BADGES) if (!S.badges[b.id] && safe(b.ok)) { S.badges[b.id] = todayISO(); got++; setTimeout(() => toast(`Nova conquista: ${b.t}`, b.ico), 900 + got * 700); }
    if (got) { confetti(); save(true); }
  }
  const safe = (f) => { try { return f(); } catch (e) { return false; } };
  const labTotal = () => LAB.modules.reduce((s, m) => s + (m.ex || []).length, 0);
  function courseProgress(c) {
    let done = 0;
    LESSONS.filter((l) => l.course === c).forEach((l) => { const e = S.ex[l.id]; if (e && (e[0] || e[1])) done++; });
    return { done, total: c.count };
  }

  /* ---------------------------------------------------------------- UI helpers */
  function win(title, body, opts = {}) {
    const menu = opts.menu ? `<div class="menu">${opts.menu.map((m) => `<span>${esc(m)}</span>`).join("")}</div>` : "";
    const status = opts.status ? `<div class="status">${opts.status.map((s) => `<span>${s}</span>`).join("")}</div>` : "";
    return `<section class="win ${opts.cls || ""}" ${opts.id ? `id="${opts.id}"` : ""}>
      <div class="bar"><span class="ttl">${opts.icon || "▣"} ${esc(title)}</span><span class="ctl" aria-hidden="true"><i>_</i><i>□</i><i>×</i></span></div>
      ${menu}<div class="body ${opts.screen ? "screen" : ""}">${body}</div>${status}</section>`;
  }
  function toast(msg, ico = "💬") {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = win("Mensagem do sistema", `<div style="display:flex;gap:12px;align-items:center"><span style="font-size:30px">${ico}</span><div>${esc(msg)}</div></div>`, { icon: "!" });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = document.createElement("div");
    box.className = "confetti";
    const items = ["⭐", "✨", "🌙", "🪐", "☀️", "💫", "🌟", "✦"];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement("span");
      s.textContent = items[i % items.length];
      s.style.left = Math.random() * 100 + "vw";
      s.style.animationDuration = 1.8 + Math.random() * 2 + "s";
      s.style.animationDelay = Math.random() * 0.6 + "s";
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4800);
  }
  function modal(title, html, onMount) {
    const d = document.createElement("dialog");
    d.innerHTML = win(title, html + `<div class="btn-row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-close>Fechar</button></div>`, { icon: "▣" });
    document.body.appendChild(d);
    d.addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === d) d.close(); });
    d.addEventListener("close", () => d.remove());
    d.showModal();
    if (onMount) onMount(d);
    return d;
  }
  const prog = (v, max, label) => `<div class="prog" role="progressbar" aria-valuenow="${v}" aria-valuemax="${max}"><i style="width:${max ? Math.min(100, (v / max) * 100) : 0}%"></i><span>${label ?? `${v}/${max}`}</span></div>`;
  const trilhaName = (c) => (c && c.trilha ? `${c.trilha.n} · ${c.trilha.t}` : "Extra");
  const exMinutes = (l) => (l.light ? 8 : 15);

  function renderChips() {
    const lv = level();
    $("#chips").innerHTML = `
      <span class="chip fire" title="Streak atual">🔥 ${streak()} dia(s)</span>
      <span class="chip ice" title="Cristais de gelo: protegem sua streak se você perder um dia">❄️ ${S.freezes}</span>
      <span class="chip xp" title="${esc(lv.name)}">⭐ Nv ${lv.i} · ${S.xp} XP</span>
      <span class="chip" title="Dias concluídos">📅 ${doneCount()}/365</span>
      ${signedIn() ? `<span class="chip" data-go="config" role="button" title="${esc(syncTitle())}">${{ sync: "☁️ …", ok: syncHealth().ok ? "☁️ ✔✔" : "☁️ ✔", erro: "☁️ ⚠️", offline: "☁️ off" }[syncMsg] || "☁️"}${photoLeft ? ` 📸${photoLeft}` : ""}</span>`
        : `<span class="chip login" data-act="login" role="button" title="Entre ou crie sua conta para salvar na nuvem e usar em qualquer aparelho">👤 Entrar</span>`}`;
  }

  /* ---------------------------------------------------------------- routes */
  const ROUTES = {
    hoje: { ico: "☀️", t: "Hoje", r: viewToday },
    trilha: { ico: "🗺️", t: "Trilha 365", r: viewMap },
    biblioteca: { ico: "📚", t: "Biblioteca", r: viewLibrary },
    lab: { ico: "👾", t: "Lab Cósmico", r: viewLab },
    desafios: { ico: "🏆", t: "Conquistas", r: viewBadges },
    galeria: { ico: "🖼️", t: "Galeria", r: viewGallery },
    config: { ico: "👤", t: "Conta", r: viewConfig },
  };
  let lastHash = null;
  function route() {
    const [name, arg] = (location.hash.slice(1) || "hoje").split("/");
    const main = $("#main");
    const samePage = lastHash === location.hash, y = window.scrollY;
    lastHash = location.hash;
    $$(".taskbar [data-go]").forEach((b) => b.setAttribute("aria-current", b.dataset.go === name || (name === "dia" && b.dataset.go === "trilha") ? "page" : "false"));
    if (name === "dia") main.innerHTML = viewDay(+arg || currentDay());
    else main.innerHTML = (ROUTES[name] || ROUTES.hoje).r(arg);
    renderChips();
    afterRender(name);
    // re-rendering the same page (marking an exercise, a sync) keeps the scroll position
    window.scrollTo({ top: samePage ? y : 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  window.addEventListener("hashchange", route);

  /* ---------------------------------------------------------------- views: today */
  function viewToday() {
    applyFreezes();
    // A day finished today stays on screen until tomorrow; an unfinished day stays (same exercises) until it is done.
    const finishedToday = Object.keys(S.days).map(Number).filter((k) => S.days[k].done && S.days[k].date === todayISO()).sort((a, b) => b - a)[0];
    const n = finishedToday || currentDay();
    const st = S.days[n] || {};
    if (!st.done && !st.seen) { S.days[n] = Object.assign(st, { seen: todayISO() }); save(true); }
    const waiting = !st.done && st.seen && st.seen < todayISO()
      ? `<div class="note" style="margin-bottom:12px">🔁 Este dia está te esperando (desde ${fmtDate(st.seen)}). Os exercícios e desafios continuam <b>os mesmos</b> até você concluir. Sem pressa, a trilha não pula nada.</div>` : "";
    const next = finishedToday && currentDay() !== n
      ? `<div class="note" style="margin-top:12px">✔ Dia ${n} concluído hoje! Amanhã aparece o próximo. Quer adiantar? <a class="btn sm lilac" href="#dia/${currentDay()}">Fazer o dia ${currentDay()} agora ▶</a></div>` : "";
    const calDay = Math.max(1, diffDays(S.startDate, todayISO()) + 1);
    const ahead = n - calDay;
    const lv = level();
    const tip = TIPS.length ? TIPS[(diffDays("2026-01-01", todayISO()) % TIPS.length + TIPS.length) % TIPS.length] : null;
    const doneToday = !!S.activity[todayISO()];
    let pace = "";
    if (ahead > 0) pace = `<span class="tag">adiantado(a) ${ahead} dia(s) 🚀</span>`;
    else if (ahead < -2) pace = `<span class="tag butter">sem pressa: a trilha espera por você 🐢</span>`;
    const greet = S.name ? `Oi, ${esc(S.name)}!` : "Oi, artista!";
    return `
      <div class="split">
        <div>
          ${win("Missao_do_dia.exe", `
            <div class="hero">
              <div class="daynum">${n}<small>de 365</small></div>
              <div class="info">
                <div class="kicker">${greet} ${doneToday ? "Missão de hoje cumprida ✔" : "Sua missão de hoje:"}</div>
                <h1>${dayTitle(PLAN[n])}</h1>
                <div>${dayTags(PLAN[n])} ${pace}</div>
              </div>
            </div>
            <hr class="hr">
            ${signedIn() ? "" : `<div class="note acct-nudge" style="margin-bottom:12px">☁️ <b>${sessionLost ? "Sua sessão expirou." : "Use em qualquer aparelho:"}</b> ${sessionLost ? "Entre de novo para continuar sincronizando." : "crie sua conta grátis (e-mail e senha) e seu progresso e suas fotos ficam salvos na nuvem."} <button class="btn sm mint" data-act="login" data-mode="${sessionLost || lastEmail() ? "in" : "up"}">${sessionLost || lastEmail() ? "👤 Entrar" : "✨ Criar conta"}</button></div>`}
            ${waiting}
            ${dayBody(n)}
            ${next}
          `, { icon: "☀️", menu: ["Arquivo", "Editar", "Exibir", "Ajuda"], status: [`Trilha: dia ${n}`, `Calendário: dia ${calDay}`, `${doneCount()} concluídos`] })}
        </div>
        <div>
          ${timerWin()}
          ${win("Status.sys", `
            <div class="kpi">
              <div><b>🔥 ${streak()}</b><span>streak atual</span></div>
              <div><b>🏅 ${bestStreak()}</b><span>melhor streak</span></div>
              <div><b>❄️ ${S.freezes}</b><span>cristais de gelo</span></div>
            </div>
            <p style="margin-top:12px"><b>Nível ${lv.i}:</b> ${esc(lv.name)}</p>
            ${prog(S.xp - lv.cur, (lv.next || S.xp) - lv.cur, lv.next ? `${S.xp}/${lv.next} XP` : "nível máximo!")}
            <p class="muted" style="margin-top:10px;font-size:13px">A cada 7 dias seguidos você ganha 1 cristal de gelo ❄️ (máx. 3). Se faltar um dia, ele protege sua streak automaticamente.</p>
            <div style="margin-top:8px">${heatmap(119)}</div>
          `, { icon: "📊" })}
          ${diceWin()}
          ${tip ? win("Dica_do_dia.txt", `<div class="bubble"><b>${esc(tip[0])}</b><br>${esc(tip[1])}</div>`, { icon: "💡" }) : ""}
        </div>
      </div>`;
  }

  function dayTitle(D) {
    if (!D) return "";
    if (D.type === "lesson") {
      const seen = new Set();
      const titles = D.lessons.map((l) => l.title.trim()).filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
      return titles.map(esc).join(" <span class='muted'>+</span> ");
    }
    if (D.type === "final") return esc((D.ch && D.ch.t) || "Grande Final");
    return (D.type === "boss" ? "" : "🏆 Desafio: ") + esc((D.ch && D.ch.t) || "Desafio da semana");
  }
  function dayTags(D) {
    if (!D) return "";
    if (D.type === "lesson") {
      const tracks = [...new Set(D.lessons.map((l) => l.course.title))];
      return tracks.map((t) => `<span class="tag lilac">${esc(t)}</span>`).join("") + `<span class="tag">⏱ ~${D.lessons.reduce((s, l) => s + exMinutes(l), 0)} min</span>`;
    }
    if (D.type === "final") return `<span class="tag butter">Dia 365</span><span class="tag pink">Grande Final</span>`;
    return `<span class="tag ${D.type === "boss" ? "pink" : "butter"}">${D.type === "boss" ? `Boss do mês #${D.week / 4}` : `Desafio semanal #${D.week}`}</span><span class="tag">⏱ ~${(D.ch && D.ch.min) || 30} min</span>`;
  }

  function exBlock(l, i, picked, scope) {
    const e = l.ex[i];
    if (!e) return `<div class="ex"><span></span><div class="muted">Exercício em preparação.</div></div>`;
    const done = (S.ex[l.id] || [])[i];
    return `<div class="ex ${done ? "done" : ""}">
        <button class="pick" data-act="toggle-ex" data-l="${l.id}" data-i="${i}" data-scope="${scope}" aria-pressed="${!!done}" title="Marcar como feito">${done ? "✓" : ""}</button>
        <div>
          <div class="meta">Exercício ${i + 1} · ${i === 0 ? "fixação" : "criativo"} · ~${exMinutes(l)} min</div>
          <h4>${esc(e[0])}</h4>
          <p>${esc(e[1])}</p>
          ${e[2] ? `<div class="tip">💡 ${esc(e[2])}</div>` : ""}
          ${photoSlot(`ex:${l.id}:${i}`, "📸 Foto deste exercício")}
        </div>
      </div>`;
  }
  // Photo button + thumbnails for one exercise / challenge / day (thumbnails are filled after render).
  const photoSlot = (ref, label) => `<div class="ex-foot"><label class="btn sm pink">${label}<input type="file" accept="image/*" multiple data-photo="${esc(ref)}" hidden></label><div class="thumbs" data-thumbs="${esc(ref)}"></div></div>`;
  function lessonCard(l, scope) {
    const first = l.n === 1 && l.course.unlock ? `<div class="note unlock" style="margin:8px 12px 0">🔓 <b>Começa o curso ${esc(l.course.title)}</b> (${esc(trilhaName(l.course))}). O que você vai desbloquear: ${esc(l.course.unlock)}</div>` : "";
    return `<article class="lesson ${l.course.tn === 5 ? "track-b" : ""} ${l.light ? "light" : ""}">
      <header>
        <div class="lt"><b>${esc(l.title)}</b><span>${esc(l.course.title)}${l.mod && l.mod !== l.title ? " › " + esc(l.mod) : ""} · aula ${l.n}/${l.course.count}</span></div>
        <a class="btn sm" href="${l.url}" target="_blank" rel="noopener">▶ Abrir aula</a>
      </header>${first}
      <div class="muted" style="padding:8px 12px 0;font-size:13px">Assista a aula (ou revise) e faça <b>1 dos 2 exercícios</b>, que treinam o tema desta aula. Fez os dois? Ganha bônus ⚡</div>
      ${exBlock(l, 0, 0, scope)}${exBlock(l, 1, 0, scope)}
      <div class="old-thumbs" data-old="${l.id}" hidden><div class="meta">🗂 Desenhos que você já tinha feito para esta aula (exercícios da versão anterior)</div><div class="thumbs" data-thumbs="old:${l.id}"></div></div>
    </article>`;
  }

  function challengeBody(D) {
    const ch = D.ch || { t: "Desafio", d: "", steps: [] };
    const recap = D.recap && D.recap.length ? `<details style="margin-top:12px"><summary class="mono">📼 Aulas da semana para revisar (${D.recap.length})</summary><ul class="clean">${D.recap.map((l) => `<li>• <a href="${l.url}" target="_blank" rel="noopener">${esc(l.title)}</a> <span class="muted">— ${esc(l.course.title)}</span></li>`).join("")}</ul></details>` : "";
    return `<div class="lesson ${D.type === "boss" ? "track-b" : "light"}">
      <header><div class="lt"><b>${esc(ch.t)}</b><span>${D.type === "boss" ? `Boss do mês · ${esc(trilhaName(D.course))} · vale 100 XP` : D.type === "final" ? "Grande final · vale 365 XP" : `Desafio da semana · ${esc(D.course ? D.course.title : "")} · vale 50 XP`}</span></div></header>
      <div style="padding:12px">
        <p>${esc(ch.d)}</p>
        ${ch.steps && ch.steps.length ? `<ol>${ch.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        ${ch.tip ? `<div class="tip" style="font-size:13.5px;background:var(--butter);border-left:4px solid var(--butter-2);padding:6px 10px">💡 ${esc(ch.tip)}</div>` : ""}
        ${ch.ref ? `<p class="muted" style="margin-top:8px;font-size:13px">🔎 Referência: ${ch.ref}</p>` : ""}
        ${photoSlot(`ch:${D.n}`, "📸 Foto do desafio")}
        ${recap}
      </div>
    </div>`;
  }

  function dayBody(n) {
    const D = PLAN[n];
    if (!D) return "<p>Dia inválido.</p>";
    const st = S.days[n] || {};
    const content = D.type === "lesson" ? D.lessons.map((l) => lessonCard(l, "day")).join("") : challengeBody(D);
    return `${content}
      <label class="field">📝 Diário de bordo (opcional): o que aprendeu, o que travou?
        <textarea data-note="${n}" placeholder="Ex.: hoje entendi que a linha do horizonte = altura dos olhos...">${esc(st.note || "")}</textarea>
      </label>
      <div class="btn-row">
        ${st.done
          ? `<span class="tag">✔ Concluído em ${fmtDate(st.date)}</span><button class="btn sm" data-act="undo-day" data-n="${n}">Desfazer</button>`
          : `<button class="btn mint" data-act="finish-day" data-n="${n}">✔ Concluir dia ${n}</button>`}
      </div>
      <div class="thumbs" data-thumbs="day:${n}" style="margin-top:8px"></div>
      <div class="btn-row" style="margin-top:8px">
        <label class="btn sm pink">📸 Foto extra do dia<input type="file" accept="image/*" multiple data-photo="day:${n}" hidden></label>
        <a class="btn sm" href="#dia/${Math.max(1, n - 1)}">◀ Dia ${Math.max(1, n - 1)}</a>
        <a class="btn sm" href="#dia/${Math.min(365, n + 1)}">Dia ${Math.min(365, n + 1)} ▶</a>
      </div>`;
  }

  function viewDay(n) {
    n = Math.min(TOTAL_DAYS, Math.max(1, n));
    const D = PLAN[n];
    return win(`Dia_${String(n).padStart(3, "0")}.exe`, `
      <div class="hero"><div class="daynum">${n}<small>de 365</small></div>
      <div class="info"><div class="kicker">${D.type === "lesson" ? trilhaName(D.lessons[0].course) : D.course ? "Dia especial · " + trilhaName(D.course) : "Dia especial"}</div><h1>${dayTitle(D)}</h1><div>${dayTags(D)}</div></div></div>
      <hr class="hr">${dayBody(n)}`, { icon: "📅", status: [`Previsto para ${fmtDate(addDays(S.startDate, n - 1))}`, isDayDone(n) ? "✔ concluído" : "pendente"] });
  }

  /* ---------------------------------------------------------------- timer */
  let T = { left: 0, total: 0, run: false, h: null };
  function timerWin() {
    return win("Cronometro.exe", `<div class="timer">
        <div class="lcd" id="lcd">${fmtT(T.left || S.timerMin * 60)}</div>
        <div class="bar"><i id="tbar"></i></div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn mint sm" data-act="timer-start">▶ ${T.run ? "Pausar" : "Iniciar"}</button>
          <button class="btn sm" data-act="timer-reset">↺</button>
          <select id="tmin" aria-label="Minutos">${[5, 10, 15, 20, 25, 30, 45, 60].map((m) => `<option ${m === S.timerMin ? "selected" : ""}>${m}</option>`).join("")}</select>
        </div>
      </div>`, { icon: "⏱", screen: true });
  }
  const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  function tick() {
    if (!T.run) return;
    T.left = Math.max(0, T.left - 1);
    const l = $("#lcd"), b = $("#tbar");
    if (l) l.textContent = fmtT(T.left);
    if (b) b.style.width = (100 * (1 - T.left / T.total)) + "%";
    document.title = `${fmtT(T.left)} · Rabisco OS`;
    if (T.left === 0) {
      T.run = false; clearInterval(T.h); document.title = "Rabisco OS";
      beep(); confetti(); toast("Tempo! Hora de concluir o dia ✔", "⏰");
      const btn = $('[data-act="timer-start"]'); if (btn) btn.textContent = "▶ Iniciar";
    }
  }
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = f; g.gain.value = 0.05;
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.15); o.stop(ctx.currentTime + i * 0.15 + 0.12);
      });
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- dice */
  function diceWin() {
    return win("Dado_cosmico.exe", `<div class="dice" id="dice">${rollDice()}</div>
      <div class="btn-row" style="margin-top:10px"><button class="btn pink sm" data-act="roll">🎲 Rolar de novo</button></div>
      <p style="margin-top:8px;font-size:12.5px;color:#cfc6dc">Aquecimento de 5 min ou ideia extra pro dia. Desenhe a primeira versão que vier!</p>`, { icon: "🎲", screen: true });
  }
  function rollDice() {
    const P = LAB.prompts || {};
    const pick = (a) => (a && a.length ? a[Math.floor(Math.random() * a.length)] : "?");
    return `Desenhe <b>${esc(pick(P.who))}</b> ${esc(pick(P.doing))} <b>${esc(pick(P.where))}</b>, com <b>${esc(pick(P.twist))}</b>. Restrição: <b>${esc(pick(P.rule))}</b>.`;
  }

  /* ---------------------------------------------------------------- heatmap */
  function heatmap(daysBack) {
    const end = todayISO();
    let start = addDays(end, -daysBack + 1);
    const wd = new Date(start + "T12:00:00").getDay();
    start = addDays(start, -wd);
    const cells = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const v = S.activity[d] || 0;
      const cls = S.usedFreezes[d] ? "fz" : v >= 45 ? "l3" : v >= 20 ? "l2" : v > 0 ? "l1" : "";
      cells.push(`<i class="${cls}" title="${fmtDate(d)}${v ? ` · ${v} min` : S.usedFreezes[d] ? " · cristal de gelo" : ""}"></i>`);
    }
    return `<div class="heat" aria-label="Mapa de atividade">${cells.join("")}</div><div class="legend"><span><i style="background:var(--mint-2)"></i>pouco</span><span><i style="background:var(--ok)"></i>30 min</span><span><i style="background:var(--lilac-2)"></i>45+ min</span><span><i style="background:var(--sky)"></i>gelo</span></div>`;
  }

  /* ---------------------------------------------------------------- views: map */
  // The map follows the PDF: Trilha → curso → dias (a challenge day sits with the course of the days before it).
  function viewMap() {
    const cur = currentDay();
    const groups = [];
    for (let d = 1; d <= TOTAL_DAYS; d++) {
      const D = PLAN[d];
      const c = D.type === "lesson" ? D.lessons[0].course : null;
      const last = groups[groups.length - 1];
      if (c && (!last || last.c !== c)) groups.push({ c, days: [d] });
      else if (last) last.days.push(d);
    }
    const cell = (d) => {
      const D = PLAN[d];
      const cls = [D.type === "week" ? "wk" : D.type === "boss" ? "boss" : D.type === "final" ? "final" : "", isDayDone(d) ? "done" : "", d === cur ? "cur" : ""].join(" ");
      const ttl = D.type === "lesson" ? D.lessons.map((l) => l.title).join(" + ") : (D.ch && D.ch.t) || "";
      return `<button class="${cls}" data-go-day="${d}" title="Dia ${d}: ${esc(ttl)}">${D.type === "boss" ? "👹" : D.type === "week" ? "★" : D.type === "final" ? "👑" : d}</button>`;
    };
    let html = "";
    TRILHAS.forEach((t) => {
      const gs = groups.filter((g) => g.c.trilha === t);
      if (!gs.length) return;
      const all = gs.flatMap((g) => g.days), done = all.filter(isDayDone).length;
      html += `<section class="trilha"><h2>${t.ico || "✦"} ${esc(t.n)} · ${esc(t.t)} <span class="muted mono">· dias ${all[0]}–${all[all.length - 1]} · ${done}/${all.length}</span></h2>
        <p class="muted" style="margin:0 0 6px">${esc(t.d)}</p>${prog(done, all.length)}
        ${gs.map((g, i) => `<h3 style="margin-top:14px">${i + 1}. ${esc(g.c.title)} <span class="muted mono">· ${g.c.count} aulas · dias ${g.days[0]}–${g.days[g.days.length - 1]}</span></h3>
          ${g.c.unlock ? `<p class="unlock-txt">🔓 ${esc(g.c.unlock)}</p>` : ""}<div class="map">${g.days.map(cell).join("")}</div>`).join("")}</section>`;
    });
    return win("Trilha_365.map", `
      <p>A trilha segue a <b>ordem dos treinamentos</b> da Ilustra Academy: ${TRILHAS.map((t) => `<b>${esc(t.n)}</b> (${esc(t.t)})`).join(" → ")}. São <b>${PLAN_COURSES.length} cursos</b> e <b>${PLAN_COURSES.reduce((s, c) => s + c.count, 0)} aulas</b>, uma por dia, na mesma ordem das aulas de cada curso. A cada 7 dias tem um desafio ★ do curso da semana e a cada 4 semanas um Boss 👹 da trilha.</p>
      ${prog(doneCount(), 365, `${doneCount()} de 365 dias`)}
      <div class="legend"><span><i style="background:var(--paper)"></i>aula</span><span><i style="background:var(--lilac)"></i>desafio</span><span><i style="background:var(--pink-2)"></i>boss</span><span><i style="background:var(--ok)"></i>feito</span><span><i style="outline:3px solid var(--hot)"></i>próximo</span></div>
      <hr class="hr">${html}
      <p class="muted" style="font-size:13px;margin-top:14px">Os outros cursos da plataforma (livros infantis, pintura digital, mentorias, lives...) continuam na 📚 Biblioteca, com exercícios, como extras fora da trilha.</p>`, { icon: "🗺️", menu: ["Mapa", "Trilhas", "Legenda"], status: [`Próximo: dia ${cur}`, `${PLAN_COURSES.reduce((s, c) => s + c.count, 0)} aulas`, `${PLAN_COURSES.length} cursos`] });
  }

  /* ---------------------------------------------------------------- views: library */
  let libQuery = "";
  function viewLibrary() {
    const cats = [...new Set(COURSES.map((c) => c.cat))];
    const total = LESSONS.length, withEx = LESSONS.filter((l) => l.ex.length === 2).length;
    const doneEx = Object.values(S.ex).reduce((s, e) => s + (e[0] ? 1 : 0) + (e[1] ? 1 : 0), 0);
    return win("Biblioteca.dir", `
      <p>Todos os cursos, módulos e aulas da Ilustra Academy, cada aula com <b>2 exercícios</b> e o link direto pra ela. Primeiro vêm os cursos da trilha, na ordem dos treinamentos; depois os extras. Marque aqui o que já praticou fora da trilha também.</p>
      <div class="kpi" style="margin-bottom:14px"><div><b>${COURSES.length}</b><span>cursos</span></div><div><b>${total}</b><span>aulas</span></div><div><b>${withEx * 2}</b><span>exercícios</span></div><div><b>${doneEx}</b><span>feitos</span></div></div>
      <div class="filters"><input type="search" id="libq" placeholder="Buscar aula, curso ou palavra do exercício..." value="${esc(libQuery)}" aria-label="Buscar"></div>
      <div id="libout">${libraryList(cats)}</div>`, { icon: "📚", menu: ["Arquivo", "Buscar", "Exibir"], status: [`${total} aulas`, `${withEx * 2} exercícios`] });
  }
  function libraryList(cats) {
    const q = libQuery.trim().toLowerCase();
    const match = (l) => !q || [l.title, l.course.title, l.mod, ...(l.ex || []).flat()].join(" ").toLowerCase().includes(q);
    let out = "";
    for (const cat of cats) {
      const cs = COURSES.filter((c) => c.cat === cat);
      const blocks = cs.map((c) => {
        const ls = LESSONS.filter((l) => l.course === c && match(l));
        if (!ls.length) return "";
        const p = courseProgress(c);
        let mod = null, rows = "";
        for (const l of ls) {
          if (l.mod !== mod) { mod = l.mod; if (mod) rows += `<div class="mod-title">${esc(mod)}</div>`; }
          const e = S.ex[l.id] || [];
          rows += `<div class="lrow"><div class="lh"><span class="mono">${String(l.n).padStart(2, "0")}</span><b>${esc(l.title)}</b>
            <a href="${l.url}" target="_blank" rel="noopener">▶ aula</a>${l.day ? ` <a href="#dia/${l.day}">· dia ${l.day}</a>` : ""}</div>
            <ol>${l.ex.map((x, i) => `<li class="${e[i] ? "done" : ""}"><label><input type="checkbox" data-act="toggle-ex" data-l="${l.id}" data-i="${i}" data-scope="lib" ${e[i] ? "checked" : ""}> <b>${esc(x[0])}</b></label> — ${esc(x[1])}${x[2] ? ` <i class="muted">💡 ${esc(x[2])}</i>` : ""}</li>`).join("")}</ol></div>`;
        }
        return `<details class="course" ${q ? "open" : ""}><summary><b>${esc(c.title)}</b><span class="tag ${c.trilha ? "lilac" : "pink"}">${c.count} aulas</span><span style="min-width:120px;flex:0 0 140px">${prog(p.done, p.total)}</span><a class="btn sm" href="${COURSE_URL + c.id}" target="_blank" rel="noopener">abrir curso</a></summary>
          <div class="cbody">${c.unlock ? `<p class="muted">🔓 ${esc(c.unlock)}</p>` : c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ""}${rows}</div></details>`;
      }).join("");
      if (blocks) out += `<h2 style="margin-top:18px">${esc(cat)}</h2>${blocks}`;
    }
    return out || `<p>Nada encontrado para “${esc(q)}”.</p>`;
  }

  /* ---------------------------------------------------------------- views: lab */
  function viewLab(arg) {
    const mods = LAB.modules || [];
    const total = labTotal(), done = Object.keys(S.lab).length;
    const sel = mods.find((m) => m.id === arg);
    if (sel) return labModule(sel);
    return `
      ${win("Laboratorio_Cosmico.exe", `
        <div class="hero"><span class="sticker">👾</span><div class="info"><div class="kicker">Seção extra</div><h1>${esc(LAB.title || "Lab Cósmico")}</h1><p>${esc(LAB.intro || "")}</p></div></div>
        ${prog(done, total, `${done}/${total} experimentos`)}
      `, { icon: "👾", menu: ["Experimentos", "Referências", "Artistas"], status: [`${mods.length} módulos`, `${total} exercícios`] })}
      ${LAB.dna ? win("Seu_DNA_visual.txt", `<p>${esc(LAB.dna.intro)}</p><div class="grid g3">${LAB.dna.traits.map((t) => `<div class="bubble"><b>${esc(t[0])}</b><br>${esc(t[1])}</div>`).join("")}</div>`, { icon: "🧬" }) : ""}
      <div class="grid g3">${mods.map((m) => {
        const d = (m.ex || []).filter((_, i) => S.lab[m.id + ":" + i]).length;
        return win(m.title, `<p style="font-size:34px;margin:0">${m.icon || "✦"}</p><p>${esc(m.intro)}</p>${prog(d, (m.ex || []).length)}<div class="btn-row" style="margin-top:10px"><a class="btn lilac sm" href="#lab/${m.id}">Abrir módulo ▶</a></div>`, { icon: m.icon || "✦" });
      }).join("")}</div>
      ${LAB.artists ? win("Artistas_pra_seguir.txt", LAB.artists.map((a) => `<div class="artist"><b>${esc(a.n)}</b> <span class="tag ${a.tag === "cyber" ? "pink" : a.tag === "sci" ? "sky" : a.tag === "cosmic" ? "butter" : "lilac"}">${esc(a.k)}</span><br><span style="font-size:13.5px">${esc(a.d)}</span> ${a.url ? `<a href="${a.url}" target="_blank" rel="noopener">↗ ver</a>` : ""}</div>`).join(""), { icon: "⭐" }) : ""}
      ${LAB.links ? win("Recursos_gratis.lnk", `<ul class="clean">${LAB.links.map((l) => `<li>• <a href="${l.url}" target="_blank" rel="noopener">${esc(l.t)}</a> — <span class="muted">${esc(l.d)}</span></li>`).join("")}</ul>`, { icon: "🔗" }) : ""}`;
  }
  function labModule(m) {
    const refs = (m.refs || []).map((r) => `<a class="ref" href="${r.url}" target="_blank" rel="noopener" style="text-decoration:none">
        <figure>${r.img ? `<img src="${r.img}" alt="${esc(r.t)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'ph',textContent:'✦'}))">` : `<span class="ph">${m.icon || "✦"}</span>`}</figure>
        <div class="rb"><b>${esc(r.t)}</b>${esc(r.note || "")}<div class="credit">${esc(r.by || "")}</div></div></a>`).join("");
    const exs = (m.ex || []).map((e, i) => {
      const k = m.id + ":" + i, done = !!S.lab[k];
      return `<div class="ex ${done ? "done" : ""}"><button class="pick" data-act="toggle-lab" data-k="${k}" aria-pressed="${done}" title="Marcar">${done ? "✓" : ""}</button>
        <div><div class="meta">Experimento ${i + 1} · ~${e[3] || 30} min</div><h4>${esc(e[0])}</h4><p>${esc(e[1])}</p>${e[2] ? `<div class="tip">💡 ${esc(e[2])}</div>` : ""}${photoSlot("lab:" + k, "📸 Foto deste experimento")}</div></div>`;
    }).join("");
    return `<p><a class="btn sm" href="#lab">◀ Voltar ao Lab</a></p>
      ${win(m.title, `<p>${esc(m.intro)}</p>${m.tips ? `<h3>Princípios</h3><ul>${m.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}`, { icon: m.icon })}
      ${refs ? win("Referencias.gal", `<p class="muted" style="font-size:13px">Somente obras de artistas reais: domínio público (Wikimedia Commons) ou links para as páginas dos próprios artistas. Nada de imagem gerada por IA.</p><div class="refs">${refs}</div>`, { icon: "🖼️" }) : ""}
      ${win("Experimentos.lst", `<div class="lesson" style="margin:0">${exs}</div>`, { icon: "🧪", status: [`${(m.ex || []).filter((_, i) => S.lab[m.id + ":" + i]).length}/${(m.ex || []).length} feitos`, "+15 XP cada"] })}`;
  }

  /* ---------------------------------------------------------------- views: badges & challenges */
  function viewBadges() {
    const got = BADGES.filter((b) => S.badges[b.id]).length;
    const chList = Object.values(PLAN).filter((D) => D.type !== "lesson");
    return win("Conquistas.exe", `
      <p>${got}/${BADGES.length} conquistas desbloqueadas.</p>
      <div class="badges">${BADGES.map((b) => `<div class="badge ${S.badges[b.id] ? "got" : ""}"><div class="ico">${b.ico}</div><b>${esc(b.t)}</b><small>${esc(b.d)}${S.badges[b.id] ? `<br>✔ ${fmtDate(S.badges[b.id])}` : ""}</small></div>`).join("")}</div>
    `, { icon: "🏆" }) + win("Desafios_e_Bosses.lst", `
      <p>Cada desafio semanal usa o curso que você estudou na semana; os Bosses juntam tudo da trilha.</p>
      <ul class="clean">${chList.map((D) => `<li>${isDayDone(D.n) ? "✅" : D.type === "boss" ? "👹" : D.type === "final" ? "👑" : "★"} <a href="#dia/${D.n}">Dia ${D.n} — ${esc((D.ch && D.ch.t) || "")}</a></li>`).join("")}</ul>`, { icon: "★" });
  }

  /* ---------------------------------------------------------------- views: gallery */
  // Photos live in IndexedDB; keep one in-memory copy so thumbnails don't re-read the whole store on every render.
  let PHOTOS = null;
  const photos = async () => PHOTOS || (PHOTOS = (await idbAll("photos").catch(() => [])).sort((a, b) => (a.ts || 0) - (b.ts || 0)));
  // ref: "ex:<lessonId>:<i>" | "lab:<module>:<i>" | "ch:<day>" | "day:<day>" | "" (avulso). Old photos only have `day`.
  // Photos sent before the v2 trail (no pv) keep their lesson but not the exercise slot: "old:<lessonId>" or "oldday:<old day>".
  function photoRef(p) {
    const r = p.ref || (p.day ? "day:" + p.day : "");
    if ((p.pv || 1) >= PLAN_V) return r;
    const [kind, a] = r.split(":");
    return kind === "ex" ? "old:" + a : kind === "ch" || kind === "day" ? "oldday:" + a : r;
  }
  function photoInfo(p) {
    const [kind, a, b] = photoRef(p).split(":");
    if (kind === "old") { const l = LESSON_BY_ID[a]; return { group: l && l.day ? "trilha" : "livre", day: l && l.day, what: l ? `Aula “${l.title}”` : "Desenho de exercício", sub: "exercício da versão anterior" }; }
    if (kind === "oldday") return { group: "antigo", what: `Desenho do dia ${a} da trilha antiga`, sub: "versão anterior" };
    if (kind === "ex") { const l = LESSON_BY_ID[a], e = l && l.ex[+b]; return { group: "trilha", day: l && l.day, what: e ? `Exercício ${+b + 1}: ${e[0]}` : "Exercício", sub: l ? l.title : "" }; }
    if (kind === "lab") { const m = (LAB.modules || []).find((x) => x.id === a), e = m && (m.ex || [])[+b]; return { group: "lab", mod: m, what: e ? `Experimento ${+b + 1}: ${e[0]}` : "Lab Cósmico", sub: m ? m.title : "" }; }
    if (kind === "ch") { const D = PLAN[+a]; return { group: "trilha", day: +a, what: (D && D.ch && D.ch.t) || "Desafio", sub: "Desafio" }; }
    if (kind === "day") return { group: "trilha", day: +a, what: "Desenho do dia", sub: "" };
    return { group: p.kind === "mood" ? "mood" : "livre", what: p.kind === "mood" ? "Referência do moodboard" : "Desenho avulso", sub: "" };
  }
  const photoCaption = (p) => { const i = photoInfo(p); return [i.day ? `Dia ${i.day}` : "", i.what, fmtDate(p.date)].filter(Boolean).join(" · "); };

  async function fillThumbs() {
    const els = $$("[data-thumbs]"); if (!els.length) return;
    const all = await photos();
    els.forEach((el) => {
      const list = all.filter((p) => photoRef(p) === el.dataset.thumbs);
      el.innerHTML = list.map((p) => `<button class="thumb" data-view="${p.id}" data-set="${esc(el.dataset.thumbs)}" title="Ver em tela cheia"><img src="${p.data}" alt="${esc(photoCaption(p))}"></button>`).join("");
      const box = el.closest(".old-thumbs"); if (box) box.hidden = !list.length;
    });
  }

  let galFilter = "tudo", galIds = [];
  const GAL_FILTERS = [["tudo", "Tudo"], ["trilha", "🗺️ Trilha"], ["lab", "👾 Lab"], ["livre", "✏️ Avulsos"], ["mood", "🧷 Moodboard"]];
  function viewGallery() {
    return win("Galeria_da_Evolucao", `
      <p>Cada foto fica ligada ao exercício em que você a enviou. Toque numa foto para ver em <b>tela cheia</b>. As fotos ficam <b>salvas no aparelho</b> (offline) e entram no backup completo.</p>
      <div class="btn-row" style="margin-bottom:12px"><label class="btn pink">📸 Adicionar desenho avulso<input type="file" accept="image/*" multiple data-photo="free" hidden></label>
      <label class="btn lilac">🧷 Adicionar referência ao moodboard<input type="file" accept="image/*" multiple data-photo="mood" hidden></label></div>
      <div class="btn-row gal-filter" role="tablist">${GAL_FILTERS.map(([k, t]) => `<button class="btn sm ${galFilter === k ? "lilac" : ""}" data-gf="${k}" role="tab" aria-selected="${galFilter === k}">${t}</button>`).join("")}</div>
      <div id="gal-out"><p class="muted">Carregando...</p></div>
    `, { icon: "🖼️", status: [`<span id="gal-count">…</span>`, "toque para ampliar"] });
  }
  async function fillGallery() {
    const out = $("#gal-out"); if (!out) return;
    const all = await photos();
    const art = all.filter((p) => p.kind !== "mood");
    S._photoCount = art.length;
    const cnt = $("#gal-count"); if (cnt) cnt.textContent = `${art.length} desenho(s) · ${new Set(art.map((p) => photoInfo(p).day).filter(Boolean)).size} dia(s) com foto`;
    const inFilter = (g) => galFilter === "tudo" || g === galFilter || (galFilter === "trilha" && g === "antigo");
    const shown = all.filter((p) => inFilter(photoInfo(p).group)).reverse(); // newest first
    galIds = shown.map((p) => p.id);
    const card = (p) => { const i = photoInfo(p); return `<figure class="shot"><button data-view="${p.id}" data-set="gal" title="Ver em tela cheia"><img src="${p.data}" alt="${esc(photoCaption(p))}" loading="lazy"></button><figcaption><b>${esc(i.what)}</b><span>${/anterior/.test(i.sub || "") ? esc(i.sub) + " · " : ""}${esc(fmtDate(p.date))}</span></figcaption></figure>`; };
    const groups = [];
    const byKey = new Map();
    for (const p of shown) {
      const i = photoInfo(p);
      const key = i.group === "trilha" ? "d" + i.day : i.group === "lab" ? "m" + (i.mod ? i.mod.id : "") : i.group;
      if (!byKey.has(key)) {
        const D = i.day && PLAN[i.day];
        const head = i.group === "trilha" ? `<a href="#dia/${i.day}">Dia ${i.day}</a> · ${D ? dayTitle(D) : ""}`
          : i.group === "lab" ? `<a href="#lab/${i.mod ? i.mod.id : ""}">👾 ${esc(i.sub || "Lab Cósmico")}</a>`
          : i.group === "mood" ? "🧷 Moodboard (suas referências)" : i.group === "antigo" ? "🗂 Desenhos da versão anterior da trilha" : "✏️ Desenhos avulsos";
        byKey.set(key, { head, items: [] }); groups.push(byKey.get(key));
      }
      byKey.get(key).items.push(p);
    }
    // Before × after: the first drawing next to the latest one.
    const ba = art.length >= 2 && (galFilter === "tudo" || galFilter === "trilha")
      ? `<div class="ba"><figure><button data-view="${art[0].id}" data-set="gal-ba"><img src="${art[0].data}" alt="primeiro desenho"></button><figcaption>✏️ Primeiro · ${esc(photoCaption(art[0]))}</figcaption></figure><figure><button data-view="${art[art.length - 1].id}" data-set="gal-ba"><img src="${art[art.length - 1].data}" alt="desenho mais recente"></button><figcaption>🌟 Mais recente · ${esc(photoCaption(art[art.length - 1]))}</figcaption></figure></div>` : "";
    out.innerHTML = groups.length
      ? `${ba ? `<h3>Antes × Depois</h3>${ba}` : ""}${groups.map((g) => `<h3 class="gal-h">${g.head} <span class="tag">${g.items.length}</span></h3><div class="gal">${g.items.map(card).join("")}</div>`).join("")}`
      : `<div class="drop">${galFilter === "mood" ? "Moodboard vazio 🧷" : "Nenhum desenho aqui ainda. Use o botão 📸 em qualquer exercício ✏️"}</div>`;
  }
  async function addPhotos(files, tag) {
    const [kind0, a, b] = tag.split(":");
    const ref = ["ex", "lab", "ch", "day"].includes(kind0) ? tag : "";
    const day = kind0 === "ex" ? (LESSON_BY_ID[a] || {}).day || null : kind0 === "ch" || kind0 === "day" ? +a : null;
    for (const f of files) {
      const data = await shrink(f, 1800);
      await idbPut("photos", null, { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), kind: tag === "mood" ? "mood" : "art", ref, day, date: todayISO(), ts: Date.now(), label: f.name, data, pv: PLAN_V });
    }
    PHOTOS = null;
    // Sending the photo of an exercise also marks it as done.
    let marked = false;
    if (kind0 === "ex" && !(S.ex[a] || [])[+b]) { toggleEx(a, +b); marked = true; }
    if (kind0 === "lab" && !S.lab[a + ":" + b]) { toggleLab(a + ":" + b); marked = true; }
    if (tag !== "mood") { const all = await photos(); S._photoCount = all.filter((p) => p.kind !== "mood").length; checkBadges(); save(); }
    if (marked) route(); else { fillThumbs(); fillGallery(); }
    toast(tag === "mood" ? "Referência salva no moodboard 🧷" : marked ? "Foto guardada e exercício marcado como feito ✔" : "Desenho guardado na galeria 📸", "🖼️");
  }

  // Fullscreen viewer: swipe or arrows to move, double-tap or 🔍 for real size.
  async function openViewer(id, set) {
    const all = await photos();
    const byId = new Map(all.map((p) => [p.id, p]));
    let list = set === "gal" ? galIds.slice() : set === "gal-ba" ? [id] : all.filter((p) => photoRef(p) === set).map((p) => p.id);
    list = list.filter((x) => byId.has(x)); if (!list.includes(id)) list = [id];
    let i = list.indexOf(id);
    const d = document.createElement("dialog");
    d.className = "viewer";
    d.innerHTML = `<div class="vbar"><span class="vcap"></span><span class="vpos"></span>
        <button class="btn sm" data-v="zoom" title="Tamanho real">🔍</button><a class="btn sm" data-v="dl" title="Baixar">⬇</a>
        <button class="btn sm" data-v="del" title="Apagar">🗑</button><button class="btn sm" data-v="close" title="Fechar">✕</button></div>
      <div class="vstage"><img alt=""></div>
      <button class="vnav prev" data-v="prev" aria-label="Anterior">‹</button><button class="vnav next" data-v="next" aria-label="Próxima">›</button>`;
    document.body.appendChild(d);
    const img = $("img", d), stage = $(".vstage", d);
    const show = () => {
      const p = byId.get(list[i]);
      img.src = p.data; img.alt = photoCaption(p);
      $(".vcap", d).textContent = photoCaption(p);
      $(".vpos", d).textContent = list.length > 1 ? `${i + 1}/${list.length}` : "";
      const dl = $('[data-v="dl"]', d); dl.href = p.data; dl.download = `rabisco-${p.day ? "dia-" + p.day : p.date}-${p.id.slice(-5)}.jpg`;
      $$(".vnav", d).forEach((b) => (b.hidden = list.length < 2));
      stage.classList.remove("zoom");
    };
    const go = (k) => { if (list.length > 1) { i = (i + k + list.length) % list.length; show(); } };
    d.addEventListener("click", async (e) => {
      const v = e.target.closest("[data-v]"); const a = v && v.dataset.v;
      if (a === "close" || e.target === stage) d.close();
      else if (a === "prev") go(-1);
      else if (a === "next") go(1);
      else if (a === "zoom") stage.classList.toggle("zoom");
      else if (a === "del" && confirm("Apagar esta foto?")) {
        const pid = list[i], pe = S.photoIdx[pid];
        await idbDel("photos", pid); PHOTOS = null; list.splice(i, 1);
        S.photoIdx[pid] = { del: true, g: pe && pe.g }; touch("photo:" + pid); save(true); // other devices delete it too
        fillThumbs(); fillGallery();
        if (!list.length) d.close(); else { i = i % list.length; show(); }
      }
    });
    img.addEventListener("dblclick", () => stage.classList.toggle("zoom"));
    let x0 = null;
    stage.addEventListener("touchstart", (e) => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
    stage.addEventListener("touchend", (e) => { if (x0 == null || stage.classList.contains("zoom")) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); x0 = null; });
    d.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); });
    d.addEventListener("close", () => { d.remove(); document.documentElement.style.overflow = ""; });
    show();
    document.documentElement.style.overflow = "hidden"; // the page behind must not scroll
    d.showModal();
  }
  function shrink(file, max) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => drawScaled(fr.result, max, 0.85).then(res, rej);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  function drawScaled(src, max, quality) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej;
      img.src = src;
    });
  }

  /* ---------------------------------------------------------------- views: config / backup / sync */
  function viewConfig() {
    const acct = signedIn() ? `
        <p>Você está na conta <b>${esc(AUTH.email)}</b>. Progresso e fotos ficam salvos nela e sincronizam sozinhos: quando você abre o app, a cada exercício marcado e quando sai dele. O que você faz em cada aparelho é <b>somado</b>, nada é apagado.</p>
        ${syncMsg === "erro" ? `<div class="note warn">⚠️ ${esc(syncErr)}</div>` : `<div class="note">${syncMsg === "sync" ? "☁️ Sincronizando…" : syncMsg === "offline" ? "☁️ Sem internet agora: o que você fizer fica guardado e sobe sozinho quando a internet voltar." : AUTH.lastSync ? "☁️ Última sincronização deste aparelho: " + new Date(AUTH.lastSync).toLocaleString("pt-BR") : "☁️ Conectando…"}${photoLeft ? ` · 📸 faltam ${photoLeft} foto(s)` : ""}</div>`}
        <h3 style="margin-top:12px">Aparelhos na sua conta</h3>
        ${devicesPanel()}
        <div class="btn-row" style="margin-top:10px"><button class="btn lilac" data-act="sync-now">🔄 Sincronizar agora</button><button class="btn sm" data-act="logout">Sair da conta neste aparelho</button></div>
        <p class="muted" style="font-size:13px;margin-top:10px">📲 <b>Outro aparelho</b> (iPad, celular, outro computador): abra <b>laramva.github.io/rabisco-os</b>, toque em <b>👤 Entrar</b> e use o mesmo e-mail e senha. Na primeira vez as fotos podem levar alguns minutos (o ☁️ 📸 no topo mostra quantas faltam).</p>` : `
        ${sessionLost ? `<div class="note warn">🔑 Sua sessão expirou. Entre de novo; nada do que está aqui foi perdido.</div>` : ""}
        <p>Crie sua <b>conta grátis</b> (só e-mail e senha) para guardar progresso e fotos na nuvem e usar o Rabisco OS em <b>qualquer aparelho</b>: PC, iPad, celular.</p>
        <div class="btn-row"><button class="btn mint" data-act="login" data-mode="up">✨ Criar conta</button><button class="btn lilac" data-act="login" data-mode="in">👤 Já tenho conta: Entrar</button></div>
        <p class="muted" style="font-size:13px;margin-top:10px">O que já está neste aparelho entra na conta quando você entrar. 📱 No iPad/iPhone, entre <b>pelo app da tela de início</b> (o Safari guarda os dados separado).</p>`;
    return `<div class="grid g2">
      ${win("Conta_Rabisco.net", acct, { icon: "👤" })}
      ${win("Perfil.ini", `
        <label class="field">Seu nome (aparece na saudação)<input type="text" id="cfg-name" value="${esc(S.name)}" maxlength="40"></label>
        <label class="field">Data de início da trilha<input type="date" id="cfg-start" value="${esc(S.startDate)}"></label>
        <label class="field">Tema<select id="cfg-theme"><option value="auto" ${S.theme === "auto" ? "selected" : ""}>Automático</option><option value="light" ${S.theme === "light" ? "selected" : ""}>Claro pastel</option><option value="dark" ${S.theme === "dark" ? "selected" : ""}>Escuro neon</option></select></label>
        <p class="muted" style="font-size:13px">A trilha não “pula” dias: se você faltar, o próximo dia continua te esperando. A streak conta dias do calendário em que você praticou.</p>`, { icon: "⚙️" })}
      ${win("Backup.dsk", `
        <p>Tudo fica salvo <b>no seu aparelho</b> (funciona offline)${signedIn() ? " e na sua conta" : ""}. Um arquivo de backup extra de vez em quando não faz mal:</p>
        <div class="btn-row"><button class="btn mint" data-act="export">💾 Baixar backup (progresso)</button><button class="btn" data-act="export-full">💾 Backup completo (+ fotos)</button>
        <label class="btn butter">📂 Restaurar backup<input type="file" accept=".json,application/json" id="imp" hidden></label></div>
        <p class="muted" style="font-size:13px;margin-top:10px">Dica: guarde o arquivo no Google Drive/iCloud.</p>`, { icon: "💾" })}
      ${win("Sobre.txt", `
        <p><b>Rabisco OS</b>: trilha de 365 dias com ${LESSONS.length} aulas, ${LESSONS.length * 2} exercícios, ${CHALLENGES.length} desafios e o Lab Cósmico. Funciona sem internet depois do 1º acesso e pode ser instalado como app (menu do navegador → “Instalar” / “Adicionar à tela inicial”).</p>
        <p class="muted" style="font-size:13px">Os links das aulas abrem a Ilustra Academy (precisa estar logado(a) lá). Este site é um caderno de exercícios pessoal e não é afiliado à Ilustra Academy.</p>
        ${missingEx.length ? `<div class="note warn">⚠️ ${missingEx.length} aula(s) ainda sem exercício.</div>` : `<div class="note">✔ Todas as ${LESSONS.length} aulas têm 2 exercícios.</div>`}
        <button class="btn sm" data-act="reset" style="margin-top:6px">Apagar todo o progresso…</button>`, { icon: "ℹ️" })}
    </div>`;
  }

  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function doExport(full) {
    const payload = { app: "rabisco-os", v: 1, exportedAt: new Date().toISOString(), state: Object.assign({}, S, { gist: { id: S.gist.id } }) }; // never write the token into a file
    if (full) payload.photos = await idbAll("photos").catch(() => []);
    S._backedUp = true; save(true); checkBadges();
    download(`rabisco-os-backup-${todayISO()}${full ? "-completo" : ""}.json`, JSON.stringify(payload));
    toast("Backup gerado 💾", "💾");
  }
  async function doImport(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "rabisco-os" || !data.state) throw new Error("arquivo não é um backup do Rabisco OS");
      if (!confirm("Restaurar este backup? O progresso atual deste aparelho será substituído (as fotos são somadas).")) return;
      const keepGist = S.gist;
      S = fixState(data.state);
      if (keepGist && keepGist.token && !(S.gist && S.gist.token)) S.gist = keepGist;
      for (const p of data.photos || []) await idbPut("photos", null, p);
      PHOTOS = null;
      save(); route(); toast("Backup restaurado ✔", "📂");
    } catch (e) { toast("Não consegui restaurar: " + e.message, "⚠️"); }
  }

  /* ---------------------------------------------------------------- account + cloud sync (Firebase, free Spark plan) */
  // A Rabisco OS account (e-mail + password) works on any device. Progress is one Firestore document per account and
  // each photo is its own document. Every sync pulls, merges and pushes, so what each device did adds up instead of overwriting.
  // The web key below is public by design: the security rules only let each signed-in account read and write users/<its uid>.
  const FB_KEY = "AIzaSyDd1q6kSiXG_Z0mbu0Dng9HVryQRHzgIH8";
  const FS = "https://firestore.googleapis.com/v1/projects/rabisco-os/databases/(default)/documents";
  const IDT = "https://identitytoolkit.googleapis.com/v1/accounts:";
  const AUTH_KEY = "rabisco-os-auth", EMAIL_KEY = "rabisco-os-email";
  let AUTH = (() => { try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || null; } catch (e) { return null; } })();
  const signedIn = () => !!(AUTH && AUTH.uid && AUTH.refresh);
  const lastEmail = () => { try { return localStorage.getItem(EMAIL_KEY) || ""; } catch (e) { return ""; } };
  function setAuth(a) {
    AUTH = a;
    try { if (a) { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); localStorage.setItem(EMAIL_KEY, a.email || ""); } else localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }
  const AUTH_ERR = {
    EMAIL_EXISTS: "Já existe uma conta com esse e-mail. Use “Entrar”.",
    INVALID_LOGIN_CREDENTIALS: "E-mail ou senha incorretos.",
    INVALID_PASSWORD: "E-mail ou senha incorretos.",
    EMAIL_NOT_FOUND: "E-mail ou senha incorretos.",
    INVALID_EMAIL: "Esse e-mail não parece válido.",
    MISSING_EMAIL: "Digite seu e-mail.",
    MISSING_PASSWORD: "Digite a senha.",
    WEAK_PASSWORD: "A senha precisa ter pelo menos 6 caracteres.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
    USER_DISABLED: "Esta conta foi desativada.",
    TOKEN_EXPIRED: "Sua sessão expirou. Entre de novo.",
    INVALID_REFRESH_TOKEN: "Sua sessão expirou. Entre de novo.",
    USER_NOT_FOUND: "Conta não encontrada. Entre de novo.",
  };
  async function authCall(url, body, form) {
    let r;
    try {
      r = await fetch(url, { method: "POST", cache: "no-store", headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json", "X-Firebase-Locale": "pt-BR" }, body: form ? new URLSearchParams(body) : JSON.stringify(body) });
    } catch (e) { const err = new Error("Sem internet agora. Conecte e tente de novo."); err.offline = true; throw err; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = String((j.error && j.error.message) || r.status).split(/[ :]/)[0];
      const e = new Error(AUTH_ERR[code] || `Não deu certo (${code}). Tente de novo.`); e.code = code; throw e;
    }
    return j;
  }
  async function signInOrUp(mode, email, password) {
    const j = await authCall(IDT + (mode === "up" ? "signUp" : "signInWithPassword") + "?key=" + FB_KEY, { email, password, returnSecureToken: true });
    setAuth({ uid: j.localId, email: j.email || email, token: j.idToken, refresh: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000, lastSync: "" });
  }
  const sendReset = (email) => authCall(IDT + "sendOobCode?key=" + FB_KEY, { requestType: "PASSWORD_RESET", email });
  // The sign-in lasts until "Sair": the short-lived token is renewed with the refresh token whenever needed.
  async function idToken(force) {
    if (!signedIn()) throw new Error("Entre na sua conta para sincronizar.");
    if (!force && AUTH.token && Date.now() < AUTH.exp - 120000) return AUTH.token;
    try {
      const j = await authCall("https://securetoken.googleapis.com/v1/token?key=" + FB_KEY, { grant_type: "refresh_token", refresh_token: AUTH.refresh }, true);
      setAuth(Object.assign({}, AUTH, { token: j.id_token, refresh: j.refresh_token || AUTH.refresh, exp: Date.now() + (+j.expires_in || 3600) * 1000 }));
      return AUTH.token;
    } catch (e) {
      if (!e.offline && /TOKEN|USER_|PROJECT_NUMBER_MISMATCH/.test(e.code || "")) { setAuth(null); sessionLost = true; }
      throw e;
    }
  }
  let sessionLost = false;
  async function fs(path, opt = {}, retried) {
    const init = { method: opt.method || "GET", cache: "no-store", headers: { Authorization: "Bearer " + (await idToken(retried)) } };
    if (opt.body) { init.body = opt.body; init.headers["Content-Type"] = "application/json"; }
    let r;
    try { r = await fetch(FS + path, init); } catch (e) { const err = new Error("Sem conexão com a nuvem agora."); err.offline = true; throw err; }
    if (r.status === 401 && !retried) return fs(path, opt, true);
    if (r.status === 404 && opt.miss) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const st = (j.error && j.error.status) || "";
      const e = new Error(r.status === 403 ? "A nuvem recusou o acesso. Saia da conta e entre de novo."
        : st === "RESOURCE_EXHAUSTED" ? "O limite grátis diário da nuvem acabou; continua sozinho amanhã."
        : `A nuvem respondeu ${r.status} ${st}`.trim());
      e.status = r.status; e.fsStatus = st; throw e;
    }
    return j;
  }
  const userPath = (p) => `/users/${AUTH.uid}/${p}`;

  const LOCAL_ONLY = ["gist", "theme", "timerMin", "_photoCount"];
  function syncPayload() { const c = JSON.parse(JSON.stringify(S)); LOCAL_ONLY.forEach((k) => delete c[k]); return JSON.stringify({ app: "rabisco-os", v: 1, state: c }); }
  // Order-independent fingerprint of the synced part of a state.
  function syncKey(s) {
    const st = (v) => Array.isArray(v) ? "[" + v.map(st).join(",") + "]"
      : v && typeof v === "object" ? "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + st(v[k])).join(",") + "}"
      : JSON.stringify(v);
    const c = Object.assign({}, s); LOCAL_ONLY.concat("updatedAt").forEach((k) => delete c[k]);
    return st(c);
  }
  function mergeState(a, b) { // a = this device, b = the cloud
    const ma = a.mt || {}, mb = b.mt || {};
    const timed = (k) => !!(ma[k] || mb[k]);
    const newer = (k) => ((ma[k] || "") >= (mb[k] || "") ? a : b);
    const minDate = (x, y) => (x && y ? (x < y ? x : y) : x || y);
    const maxMap = (A, B) => { const o = Object.assign({}, B); for (const k in A || {}) o[k] = Math.max(A[k] || 0, o[k] || 0); return o; };
    // Items edited since sync existed: newest edit wins (so un-marking sticks). Older items: union.
    function map(name, prefix, combine) {
      const A = a[name] || {}, B = b[name] || {}, out = {};
      for (const k of new Set(Object.keys(A).concat(Object.keys(B)))) {
        const v = timed(prefix + k) ? (newer(prefix + k)[name] || {})[k] : k in A && k in B ? combine(A[k], B[k]) : k in A ? A[k] : B[k];
        if (v !== undefined) out[k] = v;
      }
      return out;
    }
    const out = Object.assign(defaultState(), b, a);
    out.days = map("days", "day:", (x, y) => Object.assign({}, y, x, { done: x.done || y.done || undefined, note: x.note || y.note || undefined }));
    out.ex = map("ex", "ex:", (x, y) => [!!(x[0] || y[0]), !!(x[1] || y[1])]);
    out.lab = map("lab", "lab:", minDate);
    out.badges = map("badges", "badge:", minDate);
    out.photoIdx = map("photoIdx", "photo:", (x, y) => Object.assign({}, y, x, { g: x.g || y.g, c: x.c || y.c || undefined }));
    out.devices = map("devices", "dev:", (x, y) => ((x.at || "") >= (y.at || "") ? x : y));
    out.activity = maxMap(a.activity, b.activity);
    out.usedFreezes = Object.assign({}, b.usedFreezes, a.usedFreezes);
    out.xpBy = maxMap(a.xpBy, b.xpBy);
    out.xp = Object.values(out.xpBy).reduce((x, y) => x + y, 0);
    out.name = timed("cfg:name") ? newer("cfg:name").name : a.name || b.name;
    out.startDate = timed("cfg:startDate") ? newer("cfg:startDate").startDate : minDate(a.startDate, b.startDate);
    out.freezes = timed("cfg:freezes") ? newer("cfg:freezes").freezes : Math.max(a.freezes, b.freezes);
    ["_backedUp", "_night", "_early"].forEach((k) => { if (a[k] || b[k]) out[k] = true; });
    out.mt = Object.assign({}, mb); for (const k in ma) if (ma[k] > (out.mt[k] || "")) out.mt[k] = ma[k];
    out.createdAt = minDate(a.createdAt, b.createdAt);
    return out;
  }

  // Trilha v2 lives in its own document, so an app still on the old version can't mix old day marks back in.
  // The first time, the old document is read once (and migrated by fixState) to bring XP, badges and photos along.
  const PROGRESS_DOC = "data/progress" + PLAN_V;
  const parseDoc = (j) => { const raw = j && j.fields && j.fields.json && j.fields.json.stringValue; const data = raw ? JSON.parse(raw) : null; return data && data.app === "rabisco-os" && data.state ? fixState(data.state) : null; };
  async function readCloud() {
    const j = await fs(userPath(PROGRESS_DOC), { miss: true });
    if (j) return { remote: parseDoc(j), time: j.updateTime || "" };
    const old = await fs(userPath("data/progress"), { miss: true });
    return { remote: old ? parseDoc(old) : null, time: "" };
  }
  // The precondition makes a write fail if another device saved in between; the sync then merges again instead of overwriting.
  function writeCloud(time) {
    const pre = time ? "currentDocument.updateTime=" + encodeURIComponent(time) : "currentDocument.exists=false";
    return fs(userPath(PROGRESS_DOC) + "?" + pre, { method: "PATCH", body: JSON.stringify({ fields: { json: { stringValue: syncPayload() }, at: { timestampValue: new Date().toISOString() } } }) });
  }
  async function doSync() {
    let changed = false;
    for (let attempt = 0; ; attempt++) {
      const { remote, time } = await readCloud();
      const merged = remote ? mergeState(S, remote) : S;
      if (syncKey(merged) !== syncKey(S)) { S = merged; changed = true; }
      await stampDevice();
      if (remote && syncKey(S) === syncKey(remote)) break;
      try { await writeCloud(time); break; }
      catch (e) { if (attempt < 4 && /FAILED_PRECONDITION|ALREADY_EXISTS|ABORTED/.test(e.fsStatus || "")) continue; throw e; }
    }
    setAuth(Object.assign({}, AUTH, { lastSync: new Date().toISOString() }));
    save(true, true);
    return changed;
  }

  // One-time move from the old GitHub sync: bring what the Gist still holds (progress + photos) into the account, then drop the token.
  async function legacyImport() {
    const g = S.gist;
    if (!g || !g.token) return false;
    const gh = async (url) => {
      const r = await fetch(url, { cache: "no-store", headers: { Authorization: "Bearer " + g.token, Accept: "application/vnd.github+json" } });
      if (!r.ok) { const e = new Error("GitHub " + r.status); e.status = r.status; throw e; }
      return r.json();
    };
    const fileOf = async (j, name) => { const f = j.files && j.files[name]; return f ? JSON.parse(f.truncated ? await (await fetch(f.raw_url, { cache: "no-store" })).text() : f.content) : null; };
    let changed = false;
    try {
      let id = g.id;
      for (let page = 1; !id && page <= 30; page++) {
        const list = await gh(`https://api.github.com/gists?per_page=100&page=${page}`);
        const hit = list.filter((x) => x.files && x.files["rabisco-os-progresso.json"]).sort((x, y) => (y.updated_at > x.updated_at ? 1 : -1))[0];
        if (hit) id = hit.id; else if (list.length < 100) break;
      }
      if (id) {
        const data = await fileOf(await gh(`https://api.github.com/gists/${id}`), "rabisco-os-progresso.json");
        if (data && data.app === "rabisco-os" && data.state) {
          const merged = mergeState(S, fixState(data.state));
          if (syncKey(merged) !== syncKey(S)) { S = merged; changed = true; }
        }
      }
      const have = new Set((await photos()).map((p) => p.id));
      for (const [pid, e] of Object.entries(S.photoIdx)) {
        if (e.del || !e.g || have.has(pid)) continue;
        try {
          const data = await fileOf(await gh(`https://api.github.com/gists/${e.g}`), "rabisco-os-foto.json");
          if (data && data.photo && data.photo.data) { await idbPut("photos", null, data.photo); PHOTOS = null; changed = true; }
        } catch (err) { if (err.status !== 404) throw err; }
      }
    } catch (err) {
      if (err.status !== 401 && err.status !== 404) { console.warn("legacy import", err); return changed; } // offline or rate limit: try again next sync
    }
    S.gist = { id: "", token: "", lastSync: "" };
    save(true, true);
    return changed;
  }

  // Photos: each one is a document users/<uid>/photos/<id>; S.photoIdx[id].c marks it as saved in the cloud.
  const MAX_DOC = 900000; // Firestore documents hold up to 1 MiB
  async function fitForCloud(p) {
    let data = p.data, max = 1600, q = 0.8;
    while (data.length >= MAX_DOC && max >= 500) { data = await drawScaled(p.data, max, q); max -= 300; q = Math.max(0.6, q - 0.05); }
    return data === p.data ? p : Object.assign({}, p, { data });
  }
  let photoSyncing = false, photoLeft = 0;
  async function syncPhotos() {
    if (photoSyncing || !signedIn() || !navigator.onLine) return false;
    photoSyncing = true;
    let changed = false;
    try {
      const have = new Set((await photos()).map((p) => p.id));
      const idx = S.photoIdx;
      // deleted on another device
      for (const [id, e] of Object.entries(idx)) if (e.del && have.has(id)) { await idbDel("photos", id); PHOTOS = null; changed = true; }
      const up = (await photos()).filter((p) => !(idx[p.id] && (idx[p.id].c || idx[p.id].del)));
      const down = Object.entries(idx).filter(([id, e]) => !e.del && e.c && !have.has(id));
      photoLeft = up.length + down.length; renderChips();
      for (const p of up) {
        const c = await fitForCloud(p);
        await fs(userPath("photos/" + encodeURIComponent(p.id)), { method: "PATCH", body: JSON.stringify({ fields: { photo: { stringValue: JSON.stringify(c) } } }) });
        S.photoIdx[p.id] = Object.assign({}, S.photoIdx[p.id], { c: 1, kind: p.kind, day: p.day || null, ts: p.ts });
        save(true); photoLeft--; renderChips();
      }
      for (const [id] of down) {
        const j = await fs(userPath("photos/" + encodeURIComponent(id)), { miss: true });
        const raw = j && j.fields && j.fields.photo && j.fields.photo.stringValue;
        const p = raw ? JSON.parse(raw) : null;
        if (p && p.data) { await idbPut("photos", null, p); PHOTOS = null; changed = true; }
        photoLeft--; renderChips();
      }
      // remove the cloud copy of photos deleted here or elsewhere
      for (const [id, e] of Object.entries(S.photoIdx)) {
        if (!e.del || e.gone) continue;
        await fs(userPath("photos/" + encodeURIComponent(id)), { method: "DELETE" });
        S.photoIdx[id] = { del: true, gone: true }; save(true);
      }
    } catch (err) {
      console.warn("photo sync", err); // retried on the next sync (offline, daily limit...)
    } finally {
      photoSyncing = false; photoLeft = 0; renderChips();
    }
    if (changed) { const all = await photos(); S._photoCount = all.filter((p) => p.kind !== "mood").length; checkBadges(); fillThumbs(); fillGallery(); scheduleAutoSync(); }
    return changed;
  }

  // Each device writes what it holds at sync time, so any device can tell whether all of them match.
  function deviceKind() {
    const ua = navigator.userAgent;
    const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const kind = ipad ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "PC" : /Mac/.test(ua) ? "Mac" : "Aparelho";
    const app = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    return { kind, app };
  }
  function fingerprint(s) {
    const c = Object.assign({}, s); delete c.devices;
    c.mt = Object.fromEntries(Object.entries(s.mt || {}).filter(([k]) => !k.startsWith("dev:")));
    const str = syncKey(c); let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  async function stampDevice() {
    const k = deviceKind();
    const me = { kind: k.kind, app: k.app, ver: APP_VERSION, fp: fingerprint(S), photos: (await photos()).length, at: new Date().toISOString() };
    const old = S.devices[DEVICE];
    if (old && old.fp === me.fp && old.photos === me.photos && old.ver === me.ver && old.app === me.app && Date.now() - Date.parse(old.at) < 10 * 60000) return;
    S.devices[DEVICE] = me; touch("dev:" + DEVICE);
  }
  const photoTotal = () => Object.values(S.photoIdx).filter((e) => !e.del).length;
  // ok only when 2+ devices synced the same progress, all have every photo, and nothing here is still unsent
  function syncHealth() {
    const devs = Object.entries(S.devices || {}).sort((a, b) => (b[1].at || "").localeCompare(a[1].at || ""));
    const total = photoTotal();
    const latest = devs.length ? devs[0][1].fp : "";
    const mine = S.devices[DEVICE];
    const rows = devs.map(([id, d]) => ({ id, d, upToDate: d.fp === latest && d.photos === total }));
    const ok = signedIn() && devs.length >= 2 && rows.every((r) => r.upToDate) && !photoLeft && !!mine && mine.fp === fingerprint(S) && syncMsg !== "erro";
    return { rows, total, ok };
  }
  function ago(iso) {
    const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
    return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} dia(s)`;
  }
  function devicesPanel() {
    const h = syncHealth();
    if (!h.rows.length) return `<div class="note">☁️ Os aparelhos aparecem aqui depois da primeira sincronização.</div>`;
    const safari = h.rows.some((r) => /iPad|iPhone/.test(r.d.kind) && !r.d.app);
    return `${h.ok
        ? `<div class="note">✔ <b>Tudo sincronizado:</b> os ${h.rows.length} aparelhos têm o mesmo progresso e todas as ${h.total} foto(s).</div>`
        : `<div class="note warn">⏳ <b>Ainda não está tudo igual.</b> ${h.rows.length < 2 ? "Só este aparelho entrou na conta até agora: abra o Rabisco OS no outro aparelho e entre com o mesmo e-mail e senha." : "Abra o app nos aparelhos marcados com ⏳ e espere o ☁️ ficar ✔."}</div>`}
      <ul class="clean devs">${h.rows.map((r) => `<li>${r.upToDate ? "✔" : "⏳"} <b>${r.d.kind === "iPad" || r.d.kind === "iPhone" ? "📱" : "💻"} ${esc(r.d.kind)}</b> · ${r.d.app ? "app" : "navegador"}${r.id === DEVICE ? " <span class=\"tag\">este aparelho</span>" : ""}
        <br><span class="muted">v${esc(r.d.ver)} · sincronizou ${ago(r.d.at)} · ${r.d.photos}/${h.total} fotos</span>
        ${r.id !== DEVICE ? ` <button class="btn sm" data-act="dev-forget" data-id="${esc(r.id)}" title="Tirar da lista (volta sozinho se ainda estiver em uso)">esquecer</button>` : ""}</li>`).join("")}</ul>
      ${safari ? `<p class="muted" style="font-size:13px">📱 Um aparelho aparece como <b>navegador</b> no iPad/iPhone: é o Safari, que guarda os dados separado do app. Dá pra usar os dois (é só entrar na conta), mas se não usa o Safari toque em “esquecer” na linha dele.</p>` : ""}`;
  }

  let syncing = null, syncAgain = false, syncMsg = "", syncErr = "", syncT = null;
  const syncTitle = () => (syncMsg === "erro" ? "Erro na sincronização: " + syncErr
    : syncHealth().ok ? "✔✔ Todos os aparelhos têm o mesmo progresso e todas as fotos"
    : AUTH && AUTH.lastSync ? "Este aparelho sincronizou em " + new Date(AUTH.lastSync).toLocaleString("pt-BR") + " (veja os aparelhos em 👤 Conta)" : "Sincronização");
  const isTyping = () => { const el = document.activeElement; return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName); };
  function syncNow(quiet) {
    if (!signedIn()) return Promise.resolve();
    if (!navigator.onLine) { syncMsg = "offline"; renderChips(); return Promise.resolve(); }
    if (syncing) { syncAgain = true; return syncing; }
    clearTimeout(syncT); syncT = null;
    syncMsg = "sync"; renderChips();
    syncing = (async () => { const a = await legacyImport(); const b = await doSync(); return a || b; })().then((changed) => {
      syncMsg = "ok"; syncErr = "";
      if (changed) checkBadges();
      syncPhotos();
      if ((changed || !quiet) && !isTyping()) route();
      if (!quiet) toast(changed ? "Sincronizado: chegou progresso de outro aparelho ✔" : "Tudo sincronizado ✔", "☁️");
    }).catch((e) => {
      if (sessionLost) { syncMsg = ""; toast("Sua sessão expirou. Entre na conta de novo (👤 Conta).", "🔑"); route(); return; }
      syncMsg = e.offline ? "offline" : "erro"; syncErr = e.message || String(e);
      if (!quiet) { toast("Falha na sincronização: " + syncErr, "⚠️"); route(); }
    }).finally(() => {
      syncing = null; renderChips();
      if (syncAgain) { syncAgain = false; syncNow(true); }
    });
    return syncing;
  }
  function scheduleAutoSync() {
    if (!signedIn()) return;
    clearTimeout(syncT);
    syncT = setTimeout(() => syncNow(true), 4000);
  }

  // Sign in / create account / forgot password, all in one window.
  function openLogin(mode) {
    let m = mode || "in";
    const d = modal("Conta_Rabisco.exe", `<form class="acct" novalidate>
        <div class="btn-row acct-tabs" role="tablist"><button type="button" class="btn sm" data-mode="in" role="tab">👤 Entrar</button><button type="button" class="btn sm" data-mode="up" role="tab">✨ Criar conta</button></div>
        <p class="acct-intro"></p>
        <label class="field">E-mail<input type="email" name="email" autocomplete="username" autocapitalize="off" spellcheck="false" required value="${esc(lastEmail())}"></label>
        <label class="field acct-pw">Senha<span class="pw-row"><input type="password" name="pw" minlength="6" required><button type="button" class="btn sm" data-eye title="Mostrar senha">👁</button></span></label>
        <label class="field acct-pw2">Repita a senha<input type="password" name="pw2" autocomplete="new-password" minlength="6"></label>
        <div class="note warn acct-err" hidden></div>
        <div class="btn-row"><button type="submit" class="btn mint acct-go"></button><button type="button" class="btn sm acct-forgot" data-mode="reset">Esqueci a senha</button></div>
      </form>`, (dlg) => {
      const f = $("form", dlg), err = $(".acct-err", dlg), go = $(".acct-go", dlg);
      const show = () => {
        $$(".acct-tabs [data-mode]", dlg).forEach((b) => { b.classList.toggle("lilac", b.dataset.mode === m); b.setAttribute("aria-selected", b.dataset.mode === m); });
        $(".acct-intro", dlg).innerHTML = m === "up" ? "Crie sua conta grátis. Seu progresso e suas fotos ficam salvos nela e aparecem em <b>qualquer aparelho</b> em que você entrar."
          : m === "reset" ? "Digite o e-mail da conta. Vamos mandar um link para você criar uma senha nova (olhe também no spam)."
          : "Entre com o e-mail e a senha da sua conta Rabisco OS. O que já está neste aparelho é somado ao que está na conta.";
        $(".acct-pw", dlg).hidden = m === "reset"; $(".acct-pw2", dlg).hidden = m !== "up";
        f.pw.autocomplete = m === "up" ? "new-password" : "current-password";
        $(".acct-forgot", dlg).hidden = m !== "in";
        go.textContent = m === "up" ? "✨ Criar conta" : m === "reset" ? "📧 Mandar link" : "👤 Entrar";
        err.hidden = true;
      };
      const fail = (msg) => { err.textContent = msg; err.hidden = false; };
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-mode]"); if (b) { m = b.dataset.mode; show(); (m === "reset" || !f.email.value ? f.email : f.pw).focus(); }
        if (e.target.closest("[data-eye]")) { const t = f.pw.type === "password" ? "text" : "password"; f.pw.type = t; f.pw2.type = t; }
      });
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = f.email.value.trim(), pw = f.pw.value;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Digite um e-mail válido.");
        if (m !== "reset" && pw.length < 6) return fail("A senha precisa ter pelo menos 6 caracteres.");
        if (m === "up" && pw !== f.pw2.value) return fail("As duas senhas não são iguais.");
        go.disabled = true; const label = go.textContent; go.textContent = "⏳ Um instante…"; err.hidden = true;
        try {
          if (m === "reset") {
            await sendReset(email);
            m = "in"; show();
            $(".acct-intro", dlg).innerHTML = `📧 <b>Pronto!</b> Se existir uma conta com <b>${esc(email)}</b>, o link para criar uma senha nova chegou no e-mail (olhe no spam também). Depois é só entrar aqui com a senha nova.`;
          } else {
            await signInOrUp(m, email, pw);
            sessionLost = false;
            dlg.close();
            toast(m === "up" ? "Conta criada! Salvando seu progresso e suas fotos na nuvem… ☁️" : "Entrou! Juntando seu progresso e suas fotos… ☁️", "👤");
            route(); syncNow(true);
          }
        } catch (ex) { fail(ex.message); }
        finally { go.disabled = false; if (go.textContent === "⏳ Um instante…") go.textContent = label; }
      });
      show();
      setTimeout(() => (f.email.value ? f.pw : f.email).focus(), 50);
    });
    return d;
  }

  /* ---------------------------------------------------------------- actions */
  function toggleEx(lid, i, scope) {
    const e = S.ex[lid] || [false, false];
    e[i] = !e[i];
    S.ex[lid] = e;
    touch("ex:" + lid);
    if (e[i]) {
      const L = LESSON_BY_ID[lid];
      logActivity(L ? exMinutes(L) : 15);
      const h = new Date().getHours(); if (h >= 23) S._night = true; if (h < 7) S._early = true;
      addXP(e[0] && e[1] ? 15 : 10, e[0] && e[1] ? "modo turbo ⚡" : "exercício feito");
    }
    save(); checkBadges();
  }
  function toggleLab(k) {
    touch("lab:" + k);
    if (S.lab[k]) delete S.lab[k];
    else { S.lab[k] = todayISO(); logActivity(30); addXP(15, "experimento do Lab"); }
    save(); checkBadges();
  }
  function finishDay(n) {
    const D = PLAN[n];
    if (D.type === "lesson") {
      const missing = D.lessons.filter((l) => !(S.ex[l.id] || [])[0] && !(S.ex[l.id] || [])[1]);
      if (missing.length && !confirm(`Você ainda não marcou exercício em: ${missing.map((l) => l.title).join(", ")}.\nConcluir o dia mesmo assim?`)) return;
    }
    const prevStreak = streak();
    S.days[n] = Object.assign(S.days[n] || {}, { done: true, date: todayISO() });
    touch("day:" + n);
    logActivity(D.type === "lesson" ? 1 : 30);
    addXP(D.type === "final" ? 365 : D.type === "boss" ? 100 : D.type === "week" ? 50 : 20, D.type === "lesson" ? `dia ${n} concluído` : "desafio vencido!");
    const st = streak();
    if (st > prevStreak && st % 7 === 0 && S.freezes < 3) { S.freezes++; touch("cfg:freezes"); setTimeout(() => toast("Streak de " + st + " dias! Ganhou 1 cristal de gelo ❄️", "❄️"), 1200); }
    save(); checkBadges(); confetti();
    if (n === TOTAL_DAYS) setTimeout(() => modal("👑 365 DIAS!", `<p style="font-size:18px">Você completou a trilha inteira. Um ano de desenho, todo dia. Compare o desenho do dia 1 com o de hoje na Galeria. Isso é real, foi você que fez. 🌞🌙⭐</p>`), 800);
    route();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-go],[data-go-day],[data-view],[data-gf]");
    if (!t || t.closest("dialog.viewer")) return;
    if (t.dataset.view) { openViewer(t.dataset.view, t.dataset.set); return; }
    if (t.dataset.gf) { galFilter = t.dataset.gf; route(); return; }
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.goDay) { location.hash = "dia/" + t.dataset.goDay; return; }
    const a = t.dataset.act;
    if (a === "toggle-ex") {
      if (t.tagName !== "INPUT") e.preventDefault();
      toggleEx(t.dataset.l, +t.dataset.i, t.dataset.scope);
      if (t.dataset.scope === "lib") { const out = $("#libout"); if (out) { const open = $$("details.course[open] summary b").map((b) => b.textContent); out.innerHTML = libraryList([...new Set(COURSES.map((c) => c.cat))]); $$("details.course").forEach((d) => { if (open.includes($("summary b", d).textContent)) d.open = true; }); } }
      else route();
    }
    else if (a === "toggle-lab") { toggleLab(t.dataset.k); route(); }
    else if (a === "finish-day") finishDay(+t.dataset.n);
    else if (a === "undo-day") { const n = +t.dataset.n; if (confirm("Desmarcar este dia?")) { delete S.days[n].done; touch("day:" + n); save(); route(); } }
    else if (a === "timer-start") {
      if (T.run) { T.run = false; clearInterval(T.h); t.textContent = "▶ Iniciar"; document.title = "Rabisco OS"; }
      else { if (!T.left) { T.total = T.left = S.timerMin * 60; } T.run = true; clearInterval(T.h); T.h = setInterval(tick, 1000); t.textContent = "⏸ Pausar"; }
    }
    else if (a === "timer-reset") { T.run = false; clearInterval(T.h); T.left = 0; document.title = "Rabisco OS"; route(); }
    else if (a === "roll") { const d = $("#dice"); if (d) d.innerHTML = rollDice(); }
    else if (a === "export") doExport(false);
    else if (a === "export-full") doExport(true);
    else if (a === "login") openLogin(t.dataset.mode);
    else if (a === "sync-now") syncNow(false);
    else if (a === "dev-forget") { delete S.devices[t.dataset.id]; touch("dev:" + t.dataset.id); save(true); route(); }
    else if (a === "logout") { if (confirm("Sair da conta neste aparelho? Seu progresso continua salvo aqui e na conta; é só entrar de novo quando quiser.")) { setAuth(null); syncMsg = ""; route(); } }
    else if (a === "reset") { if (confirm("Isso apaga TODO o progresso deste aparelho. Tem certeza?") && confirm("Último aviso! Fez backup?")) { localStorage.removeItem(STORE_KEY); idbDel("kv", "state").finally(() => location.reload()); } }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note) { const n = t.dataset.note; S.days[n] = Object.assign(S.days[n] || {}, { note: t.value }); touch("day:" + n); clearTimeout(t._h); t._h = setTimeout(() => save(true), 500); }
    else if (t.id === "libq") { libQuery = t.value; clearTimeout(t._h); t._h = setTimeout(() => { $("#libout").innerHTML = libraryList([...new Set(COURSES.map((c) => c.cat))]); }, 200); }
    else if (t.id === "cfg-name") { S.name = t.value.trim(); touch("cfg:name"); save(true); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "tmin") { S.timerMin = +t.value; T.left = 0; T.run = false; clearInterval(T.h); save(true); const l = $("#lcd"); if (l) l.textContent = fmtT(S.timerMin * 60); const b = $('[data-act="timer-start"]'); if (b) b.textContent = "▶ Iniciar"; }
    else if (t.id === "cfg-start" && t.value) { S.startDate = t.value; touch("cfg:startDate"); save(); }
    else if (t.id === "cfg-theme") { S.theme = t.value; applyTheme(); save(true); }
    else if (t.id === "imp" && t.files[0]) doImport(t.files[0]);
    else if (t.dataset.photo && t.files.length) { const fs = [...t.files]; t.value = ""; addPhotos(fs, t.dataset.photo).catch((err) => toast("Erro na imagem: " + (err.message || "formato não suportado"), "⚠️")); }
  });

  function afterRender(name) {
    if (name === "galeria") fillGallery();
    fillThumbs();
    if (T.run) { const b = $('[data-act="timer-start"]'); if (b) b.textContent = "⏸ Pausar"; const l = $("#lcd"); if (l) l.textContent = fmtT(T.left); }
  }
  function applyTheme() {
    const dark = S.theme === "dark" || (S.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

  function clock() { const c = $("#clock"); if (c) c.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }

  /* ---------------------------------------------------------------- boot */
  function boot() {
    applyTheme();
    $("#taskbar").innerHTML = `<button class="start" data-go="hoje">✦ Iniciar</button>` +
      Object.entries(ROUTES).map(([k, r]) => `<button data-go="${k}">${r.ico} ${r.t}</button>`).join("") + `<span class="clock" id="clock"></span>`;
    clock(); setInterval(clock, 15000);
    route();
    checkBadges();
    $(".logo span").textContent = "365 dias de desenho · v" + APP_VERSION;
    // Updates install by themselves: check when the app opens or comes back to the front, then reload
    // into the new version as soon as that won't interrupt anything (not typing, timer stopped).
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      const hadSW = !!navigator.serviceWorker.controller;
      let pending = false;
      const reloadNow = () => {
        if (!pending || isTyping() || T.run) return;
        pending = false;
        try { sessionStorage.setItem("rabisco-updated", "1"); } catch (e) {}
        location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!hadSW) return; pending = true; save(true, true); reloadNow(); });
      setInterval(reloadNow, 15000);
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
        const check = () => { if (document.visibilityState === "visible" && navigator.onLine) reg.update().catch(() => {}); };
        document.addEventListener("visibilitychange", () => { check(); reloadNow(); });
        window.addEventListener("online", check);
        setInterval(check, 30 * 60 * 1000);
      }).catch(() => {});
      try { if (sessionStorage.getItem("rabisco-updated")) { sessionStorage.removeItem("rabisco-updated"); setTimeout(() => toast(`Rabisco OS atualizado para a v${APP_VERSION} ✨`, "💾"), 700); } } catch (e) {}
    }
    // Sync when the app opens, comes back to the front (iPad multitasking), goes to the background, and every 5 min while open.
    window.addEventListener("online", () => syncNow(true));
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" || syncT) syncNow(true); });
    setInterval(() => { if (document.visibilityState === "visible") syncNow(true); }, 5 * 60 * 1000);
    setTimeout(() => syncNow(true), 600);
    // expose for debugging in the console
    window.RabiscoOS = { PLAN, LESSONS, COURSES, state: () => S, missingEx, mergeState, syncKey, fixState, syncNow, dropPhotoCache: () => (PHOTOS = null) };
  }
  boot();
})();
