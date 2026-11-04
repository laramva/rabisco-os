/* Rabisco OS — 365 dias de prática guiada (offline-first, sem servidor). */
(() => {
  "use strict";

  const COURSE_URL = "https://app.ilustraacademy.com/courses/c/";
  const LESSON_URL = "https://app.ilustraacademy.com/courses/l/";
  const STORE_KEY = "rabisco-os-v1";
  const TOTAL_DAYS = 365;

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
  const LAB = window.LAB || { modules: [] };
  const TIPS = window.TIPS || [];

  const LIGHT_RE = /^(boas[ -]vindas|boas vindas ao curso|materiais|materiais e exerc[ií]cios|exerc[ií]cios e materiais|exerc[ií]cios|apostila.*|certificado.*|projeto de conclus.*|projeto de conclusão e certificado|ordem dos treinamentos|recursos da plataforma|introdu[cç][aã]o)$/i;

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
  // Two tracks run side by side: A = fundamentos/personagens, B = cor/técnica/mentorias.
  // Every 7th day is a challenge (every 28th a boss), day 365 is the grand finale.
  function buildPlan() {
    const byPlanOrder = (a, b) => (a.course.po - b.course.po) || (a.idx - b.idx);
    const A = LESSONS.filter((l) => l.course.track !== "B").sort(byPlanOrder);
    const B = LESSONS.filter((l) => l.course.track === "B").sort(byPlanOrder);
    const seq = [];
    let ia = 0, ib = 0;
    while (ia < A.length || ib < B.length) {
      const fa = A.length ? ia / A.length : 1, fb = B.length ? ib / B.length : 1;
      if (ib >= B.length || (ia < A.length && fa <= fb)) seq.push(A[ia++]); else seq.push(B[ib++]);
    }
    const w = (l) => (l.light ? 0.5 : 1);
    const special = new Set();
    for (let d = 7; d < TOTAL_DAYS; d += 7) special.add(d);
    special.add(TOTAL_DAYS);
    const lessonDays = [];
    for (let d = 1; d <= TOTAL_DAYS; d++) if (!special.has(d)) lessonDays.push(d);
    const totalW = seq.reduce((s, l) => s + w(l), 0);
    const days = {};
    let k = 0, acc = 0;
    lessonDays.forEach((d, i) => {
      const target = ((i + 1) * totalW) / lessonDays.length;
      const list = [];
      while (k < seq.length && (list.length === 0 || acc + w(seq[k]) <= target + 0.26) && (list.length < 3 || i === lessonDays.length - 1)) {
        acc += w(seq[k]);
        list.push(seq[k++]);
      }
      if (i === lessonDays.length - 1) while (k < seq.length) list.push(seq[k++]);
      days[d] = { n: d, type: "lesson", lessons: list };
    });
    let week = 0;
    for (const d of [...special].sort((a, b) => a - b)) {
      if (d === TOTAL_DAYS) { days[d] = { n: d, type: "final", ch: window.FINALE }; continue; }
      week++;
      const ch = CHALLENGES[(week - 1) % Math.max(1, CHALLENGES.length)];
      days[d] = { n: d, type: week % 4 === 0 ? "boss" : "week", week, ch };
    }
    // remember which plan day each lesson lives on
    Object.values(days).forEach((D) => (D.lessons || []).forEach((l) => (l.day = D.n)));
    // the lessons of the previous 6 days feed the weekly challenge
    Object.values(days).forEach((D) => {
      if (D.type === "week" || D.type === "boss") {
        D.recap = [];
        for (let x = D.n - 6; x < D.n; x++) if (days[x] && days[x].lessons) D.recap.push(...days[x].lessons);
      }
    });
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
  });

  let S = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { console.warn(e); }
    return defaultState();
  }
  function save(silent) {
    S.updatedAt = new Date().toISOString();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast("Não consegui salvar no navegador: " + e.message, "⚠️"); }
    idbPut("kv", "state", S).catch(() => {});
    if (!silent) renderChips();
    scheduleAutoSync();
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
        if (Object.keys(mirror.days || {}).length > Object.keys(S.days || {}).length) { S = Object.assign(defaultState(), mirror); save(true); route(); }
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
    S.xp += n;
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
  const trackName = (t) => (t === "B" ? "Trilha Cor & Técnica" : "Trilha Fundamentos & Personagens");
  const exMinutes = (l) => (l.light ? 8 : 15);

  function renderChips() {
    const lv = level();
    $("#chips").innerHTML = `
      <span class="chip fire" title="Streak atual">🔥 ${streak()} dia(s)</span>
      <span class="chip ice" title="Cristais de gelo: protegem sua streak se você perder um dia">❄️ ${S.freezes}</span>
      <span class="chip xp" title="${esc(lv.name)}">⭐ Nv ${lv.i} · ${S.xp} XP</span>
      <span class="chip" title="Dias concluídos">📅 ${doneCount()}/365</span>`;
  }

  /* ---------------------------------------------------------------- routes */
  const ROUTES = {
    hoje: { ico: "☀️", t: "Hoje", r: viewToday },
    trilha: { ico: "🗺️", t: "Trilha 365", r: viewMap },
    biblioteca: { ico: "📚", t: "Biblioteca", r: viewLibrary },
    lab: { ico: "👾", t: "Lab Cósmico", r: viewLab },
    desafios: { ico: "🏆", t: "Conquistas", r: viewBadges },
    galeria: { ico: "🖼️", t: "Galeria", r: viewGallery },
    config: { ico: "💾", t: "Backup", r: viewConfig },
  };
  function route() {
    const [name, arg] = (location.hash.slice(1) || "hoje").split("/");
    const main = $("#main");
    $$(".taskbar [data-go]").forEach((b) => b.setAttribute("aria-current", b.dataset.go === name || (name === "dia" && b.dataset.go === "trilha") ? "page" : "false"));
    if (name === "dia") main.innerHTML = viewDay(+arg || currentDay());
    else main.innerHTML = (ROUTES[name] || ROUTES.hoje).r(arg);
    renderChips();
    afterRender(name);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }
  window.addEventListener("hashchange", route);

  /* ---------------------------------------------------------------- views: today */
  function viewToday() {
    applyFreezes();
    const n = currentDay();
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
            ${dayBody(n)}
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
        </div>
      </div>`;
  }
  function lessonCard(l, scope) {
    return `<article class="lesson ${l.course.track === "B" ? "track-b" : ""} ${l.light ? "light" : ""}">
      <header>
        <div class="lt"><b>${esc(l.title)}</b><span>${esc(l.course.title)}${l.mod && l.mod !== l.title ? " › " + esc(l.mod) : ""} · aula ${l.n}/${l.course.count}</span></div>
        <a class="btn sm" href="${l.url}" target="_blank" rel="noopener">▶ Abrir aula</a>
      </header>
      <div class="muted" style="padding:8px 12px 0;font-size:13px">Assista a aula (ou revise) e faça <b>1 dos 2 exercícios</b>. Fez os dois? Ganha bônus ⚡</div>
      ${exBlock(l, 0, 0, scope)}${exBlock(l, 1, 0, scope)}
    </article>`;
  }

  function challengeBody(D) {
    const ch = D.ch || { t: "Desafio", d: "", steps: [] };
    const recap = D.recap && D.recap.length ? `<details style="margin-top:12px"><summary class="mono">📼 Aulas da semana para revisar (${D.recap.length})</summary><ul class="clean">${D.recap.map((l) => `<li>• <a href="${l.url}" target="_blank" rel="noopener">${esc(l.title)}</a> <span class="muted">— ${esc(l.course.title)}</span></li>`).join("")}</ul></details>` : "";
    return `<div class="lesson ${D.type === "boss" ? "track-b" : "light"}">
      <header><div class="lt"><b>${esc(ch.t)}</b><span>${D.type === "boss" ? "Boss do mês · vale 100 XP" : D.type === "final" ? "Grande final · vale 365 XP" : "Desafio semanal · vale 50 XP"}</span></div></header>
      <div style="padding:12px">
        <p>${esc(ch.d)}</p>
        ${ch.steps && ch.steps.length ? `<ol>${ch.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        ${ch.tip ? `<div class="tip" style="font-size:13.5px;background:var(--butter);border-left:4px solid var(--butter-2);padding:6px 10px">💡 ${esc(ch.tip)}</div>` : ""}
        ${ch.ref ? `<p class="muted" style="margin-top:8px;font-size:13px">🔎 Referência: ${ch.ref}</p>` : ""}
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
        <label class="btn sm pink">📸 Foto do desenho<input type="file" accept="image/*" data-photo="${n}" hidden></label>
        <a class="btn sm" href="#dia/${Math.max(1, n - 1)}">◀ Dia ${Math.max(1, n - 1)}</a>
        <a class="btn sm" href="#dia/${Math.min(365, n + 1)}">Dia ${Math.min(365, n + 1)} ▶</a>
      </div>`;
  }

  function viewDay(n) {
    n = Math.min(TOTAL_DAYS, Math.max(1, n));
    const D = PLAN[n];
    return win(`Dia_${String(n).padStart(3, "0")}.exe`, `
      <div class="hero"><div class="daynum">${n}<small>de 365</small></div>
      <div class="info"><div class="kicker">${D.type === "lesson" ? trackName(D.lessons[0].course.track) : "Dia especial"}</div><h1>${dayTitle(D)}</h1><div>${dayTags(D)}</div></div></div>
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
  function viewMap() {
    const cur = currentDay();
    let html = "";
    for (let m = 0; m < 13; m++) {
      const from = m * 28 + 1, to = Math.min(TOTAL_DAYS, from + 27);
      if (from > TOTAL_DAYS) break;
      const cells = [];
      for (let d = from; d <= to; d++) {
        const D = PLAN[d];
        const cls = [D.type === "week" ? "wk" : D.type === "boss" ? "boss" : D.type === "final" ? "final" : "", isDayDone(d) ? "done" : "", d === cur ? "cur" : ""].join(" ");
        const ttl = D.type === "lesson" ? D.lessons.map((l) => l.title).join(" + ") : (D.ch && D.ch.t) || "";
        cells.push(`<button class="${cls}" data-go-day="${d}" title="Dia ${d}: ${esc(ttl)}">${D.type === "boss" ? "👹" : D.type === "week" ? "★" : D.type === "final" ? "👑" : d}</button>`);
      }
      const done = Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(isDayDone).length;
      html += `<h3 style="margin-top:${m ? 18 : 0}px">Ciclo ${m + 1} <span class="muted mono">· dias ${from}–${to} · ${done}/${to - from + 1}</span></h3><div class="map">${cells.join("")}</div>`;
    }
    return win("Trilha_365.map", `
      <p>Cada quadradinho é um dia (~30 min). A trilha alterna <b>Fundamentos & Personagens</b> com <b>Cor, Técnica & Mentorias</b>, cobrindo <b>todas as ${LESSONS.length} aulas</b> dos ${COURSES.length} cursos. A cada 7 dias tem um desafio ★, e a cada 4 semanas um Boss 👹.</p>
      ${prog(doneCount(), 365, `${doneCount()} de 365 dias`)}
      <div class="legend"><span><i style="background:var(--paper)"></i>aula</span><span><i style="background:var(--lilac)"></i>desafio</span><span><i style="background:var(--pink-2)"></i>boss</span><span><i style="background:var(--ok)"></i>feito</span><span><i style="outline:3px solid var(--hot)"></i>próximo</span></div>
      <hr class="hr">${html}`, { icon: "🗺️", menu: ["Mapa", "Ciclos", "Legenda"], status: [`Próximo: dia ${cur}`, `${LESSONS.length} aulas`, `${COURSES.length} cursos`] });
  }

  /* ---------------------------------------------------------------- views: library */
  let libQuery = "";
  function viewLibrary() {
    const cats = [...new Set(COURSES.map((c) => c.cat))];
    const total = LESSONS.length, withEx = LESSONS.filter((l) => l.ex.length === 2).length;
    const doneEx = Object.values(S.ex).reduce((s, e) => s + (e[0] ? 1 : 0) + (e[1] ? 1 : 0), 0);
    return win("Biblioteca.dir", `
      <p>Todos os cursos, módulos e aulas da Ilustra Academy, cada aula com <b>2 exercícios</b> e o link direto pra ela. Marque aqui o que já praticou fora da trilha também.</p>
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
            <a href="${l.url}" target="_blank" rel="noopener">▶ aula</a> <a href="#dia/${l.day}">· dia ${l.day}</a></div>
            <ol>${l.ex.map((x, i) => `<li class="${e[i] ? "done" : ""}"><label><input type="checkbox" data-act="toggle-ex" data-l="${l.id}" data-i="${i}" data-scope="lib" ${e[i] ? "checked" : ""}> <b>${esc(x[0])}</b></label> — ${esc(x[1])}${x[2] ? ` <i class="muted">💡 ${esc(x[2])}</i>` : ""}</li>`).join("")}</ol></div>`;
        }
        return `<details class="course" ${q ? "open" : ""}><summary><b>${esc(c.title)}</b><span class="tag ${c.track === "B" ? "pink" : "lilac"}">${c.count} aulas</span><span style="min-width:120px;flex:0 0 140px">${prog(p.done, p.total)}</span><a class="btn sm" href="${COURSE_URL + c.id}" target="_blank" rel="noopener">abrir curso</a></summary>
          <div class="cbody">${c.desc ? `<p class="muted">${esc(c.desc)}</p>` : ""}${rows}</div></details>`;
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
        <div><div class="meta">Experimento ${i + 1} · ~${e[3] || 30} min</div><h4>${esc(e[0])}</h4><p>${esc(e[1])}</p>${e[2] ? `<div class="tip">💡 ${esc(e[2])}</div>` : ""}</div></div>`;
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
      <p>Os desafios usam o que você praticou na semana e puxam pro seu universo: criaturas, sci-fi, cyberpunk e magia cósmica.</p>
      <ul class="clean">${chList.map((D) => `<li>${isDayDone(D.n) ? "✅" : D.type === "boss" ? "👹" : D.type === "final" ? "👑" : "★"} <a href="#dia/${D.n}">Dia ${D.n} — ${esc((D.ch && D.ch.t) || "")}</a></li>`).join("")}</ul>`, { icon: "★" });
  }

  /* ---------------------------------------------------------------- views: gallery */
  function viewGallery() {
    return win("Galeria_da_Evolucao", `
      <p>Guarde uma foto do desenho de cada dia. Fica <b>salvo só no seu aparelho</b> (offline) e entra no backup completo. Ver o dia 1 do lado do dia 100 é o melhor remédio contra a falta de motivação.</p>
      <div class="btn-row" style="margin-bottom:14px"><label class="btn pink">📸 Adicionar desenho<input type="file" accept="image/*" multiple data-photo="free" hidden></label>
      <label class="btn lilac">🧷 Adicionar referência ao moodboard<input type="file" accept="image/*" multiple data-photo="mood" hidden></label></div>
      <h3>Meus desenhos</h3><div class="gal" id="gal-art"><p class="muted">Carregando...</p></div>
      <h3 style="margin-top:20px">Moodboard (suas referências)</h3><p class="muted" style="font-size:13px">Suba aqui as referências que você ama (as do Pinterest, por exemplo). Elas aparecem só pra você.</p><div class="gal" id="gal-mood"></div>
    `, { icon: "🖼️" });
  }
  async function fillGallery() {
    const all = (await idbAll("photos").catch(() => [])).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    S._photoCount = all.filter((p) => p.kind !== "mood").length;
    const card = (p) => `<div class="shot"><img src="${p.data}" alt="${esc(p.label || "")}" loading="lazy"><div><span>${p.day ? `dia ${p.day}` : fmtDate(p.date)}</span><button class="btn sm" data-act="del-photo" data-id="${p.id}" title="Apagar">×</button></div></div>`;
    const art = all.filter((p) => p.kind !== "mood"), mood = all.filter((p) => p.kind === "mood");
    if ($("#gal-art")) $("#gal-art").innerHTML = art.length ? art.map(card).join("") : `<div class="drop">Nenhum desenho ainda. O dia 1 te espera ✏️</div>`;
    if ($("#gal-mood")) $("#gal-mood").innerHTML = mood.length ? mood.map(card).join("") : `<div class="drop">Moodboard vazio 🧷</div>`;
  }
  async function addPhotos(files, tag) {
    for (const f of files) {
      const data = await shrink(f, 1400);
      const kind = tag === "mood" ? "mood" : "art";
      const day = /^\d+$/.test(tag) ? +tag : null;
      await idbPut("photos", null, { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), kind, day, date: todayISO(), ts: Date.now(), label: f.name, data });
    }
    await fillGallery().catch(() => {});
    if (tag !== "mood") { const all = await idbAll("photos"); S._photoCount = all.filter((p) => p.kind !== "mood").length; checkBadges(); save(); }
    toast(tag === "mood" ? "Referência salva no moodboard 🧷" : "Desenho guardado na galeria 📸", "🖼️");
  }
  function shrink(file, max) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = rej;
        img.src = fr.result;
      };
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------- views: config / backup / sync */
  function viewConfig() {
    const g = S.gist || {};
    return `<div class="grid g2">
      ${win("Perfil.ini", `
        <label class="field">Seu nome (aparece na saudação)<input type="text" id="cfg-name" value="${esc(S.name)}" maxlength="40"></label>
        <label class="field">Data de início da trilha<input type="date" id="cfg-start" value="${esc(S.startDate)}"></label>
        <label class="field">Tema<select id="cfg-theme"><option value="auto" ${S.theme === "auto" ? "selected" : ""}>Automático</option><option value="light" ${S.theme === "light" ? "selected" : ""}>Claro pastel</option><option value="dark" ${S.theme === "dark" ? "selected" : ""}>Escuro neon</option></select></label>
        <p class="muted" style="font-size:13px">A trilha não “pula” dias: se você faltar, o próximo dia continua te esperando. A streak conta dias do calendário em que você praticou.</p>`, { icon: "⚙️" })}
      ${win("Backup.dsk", `
        <p>Tudo fica salvo <b>no seu aparelho</b> (funciona offline). Faça backup de vez em quando:</p>
        <div class="btn-row"><button class="btn mint" data-act="export">💾 Baixar backup (progresso)</button><button class="btn" data-act="export-full">💾 Backup completo (+ fotos)</button>
        <label class="btn butter">📂 Restaurar backup<input type="file" accept=".json,application/json" id="imp" hidden></label></div>
        <p class="muted" style="font-size:13px;margin-top:10px">Dica: guarde o arquivo no Google Drive/iCloud. Pra passar pra outro aparelho, é só abrir o site lá e restaurar.</p>`, { icon: "💾" })}
      ${win("Sync_GitHub.net", `
        <p>Sincronize automaticamente entre celular, tablet e computador usando um <b>Gist secreto</b> da sua conta GitHub (grátis).</p>
        <ol style="font-size:13.5px"><li>No GitHub: Settings → Developer settings → Personal access tokens → <i>Fine-grained</i> ou <i>classic</i> com permissão <b>gist</b>.</li><li>Cole o token abaixo (fica salvo só neste aparelho).</li><li>Clique em “Enviar”. No outro aparelho, cole o mesmo token e o ID do gist e clique em “Baixar”.</li></ol>
        <label class="field">Token do GitHub (permissão gist)<input type="password" id="gist-token" value="${esc(g.token || "")}" autocomplete="off"></label>
        <label class="field">ID do Gist (preenchido automaticamente no 1º envio)<input type="text" id="gist-id" value="${esc(g.id || "")}"></label>
        <div class="btn-row"><button class="btn lilac" data-act="gist-push">⬆ Enviar</button><button class="btn" data-act="gist-pull">⬇ Baixar</button></div>
        <p class="muted" style="font-size:13px;margin-top:8px">${g.lastSync ? "Última sincronização: " + new Date(g.lastSync).toLocaleString("pt-BR") : "Ainda não sincronizado."} Com token salvo, o envio é automático após cada dia concluído. As fotos não vão pro Gist (só no backup completo).</p>`, { icon: "🌐" })}
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
    const payload = { app: "rabisco-os", v: 1, exportedAt: new Date().toISOString(), state: S };
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
      S = Object.assign(defaultState(), data.state);
      if (keepGist && keepGist.token && !(S.gist && S.gist.token)) S.gist = keepGist;
      for (const p of data.photos || []) await idbPut("photos", null, p);
      save(); route(); toast("Backup restaurado ✔", "📂");
    } catch (e) { toast("Não consegui restaurar: " + e.message, "⚠️"); }
  }

  // GitHub Gist sync (the token never leaves this device except to api.github.com).
  const GIST_FILE = "rabisco-os-progresso.json";
  function syncPayload() { const c = JSON.parse(JSON.stringify(S)); c.gist = { id: S.gist.id }; return JSON.stringify({ app: "rabisco-os", v: 1, state: c }); }
  async function gistPush(quiet) {
    const g = S.gist; if (!g.token) { if (!quiet) toast("Cole seu token do GitHub primeiro.", "🔑"); return; }
    const body = { description: "Rabisco OS — progresso (sync)", files: { [GIST_FILE]: { content: syncPayload() } } };
    const url = g.id ? `https://api.github.com/gists/${g.id}` : "https://api.github.com/gists";
    const r = await fetch(url, { method: g.id ? "PATCH" : "POST", headers: { Authorization: `Bearer ${g.token}`, Accept: "application/vnd.github+json" }, body: JSON.stringify(g.id ? body : Object.assign(body, { public: false })) });
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    const j = await r.json();
    S.gist.id = j.id; S.gist.lastSync = new Date().toISOString(); save(true);
    if (!quiet) { toast("Progresso enviado pro seu Gist ⬆", "🌐"); route(); }
  }
  async function gistPull() {
    const g = S.gist; if (!g.token || !g.id) return toast("Preencha token e ID do Gist.", "🔑");
    const r = await fetch(`https://api.github.com/gists/${g.id}`, { headers: { Authorization: `Bearer ${g.token}`, Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    const j = await r.json();
    const f = j.files && j.files[GIST_FILE];
    if (!f) throw new Error("gist sem o arquivo de progresso");
    const content = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    const data = JSON.parse(content);
    const remote = data.state;
    if ((remote.updatedAt || "") < (S.updatedAt || "") && !confirm("O progresso deste aparelho parece mais novo que o do Gist. Substituir mesmo assim?")) return;
    const keep = S.gist;
    S = Object.assign(defaultState(), remote, { gist: Object.assign({}, keep, { lastSync: new Date().toISOString() }) });
    save(true); route(); toast("Progresso baixado do Gist ⬇", "🌐");
  }
  let syncT = null;
  function scheduleAutoSync() {
    if (!S.gist || !S.gist.token || !S.gist.id || !navigator.onLine) return;
    clearTimeout(syncT);
    syncT = setTimeout(() => gistPush(true).catch(() => {}), 4000);
  }

  /* ---------------------------------------------------------------- actions */
  function toggleEx(lid, i, scope) {
    const e = S.ex[lid] || [false, false];
    e[i] = !e[i];
    S.ex[lid] = e;
    if (e[i]) {
      const L = LESSON_BY_ID[lid];
      logActivity(L ? exMinutes(L) : 15);
      const h = new Date().getHours(); if (h >= 23) S._night = true; if (h < 7) S._early = true;
      addXP(e[0] && e[1] ? 15 : 10, e[0] && e[1] ? "modo turbo ⚡" : "exercício feito");
    }
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
    logActivity(D.type === "lesson" ? 1 : 30);
    addXP(D.type === "final" ? 365 : D.type === "boss" ? 100 : D.type === "week" ? 50 : 20, D.type === "lesson" ? `dia ${n} concluído` : "desafio vencido!");
    const st = streak();
    if (st > prevStreak && st % 7 === 0 && S.freezes < 3) { S.freezes++; setTimeout(() => toast("Streak de " + st + " dias! Ganhou 1 cristal de gelo ❄️", "❄️"), 1200); }
    save(); checkBadges(); confetti();
    if (n === TOTAL_DAYS) setTimeout(() => modal("👑 365 DIAS!", `<p style="font-size:18px">Você completou a trilha inteira. Um ano de desenho, todo dia. Compare o desenho do dia 1 com o de hoje na Galeria. Isso é real, foi você que fez. 🌞🌙⭐</p>`), 800);
    route();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-go],[data-go-day]");
    if (!t) return;
    if (t.dataset.go) { location.hash = t.dataset.go; return; }
    if (t.dataset.goDay) { location.hash = "dia/" + t.dataset.goDay; return; }
    const a = t.dataset.act;
    if (a === "toggle-ex") {
      if (t.tagName !== "INPUT") e.preventDefault();
      toggleEx(t.dataset.l, +t.dataset.i, t.dataset.scope);
      if (t.dataset.scope === "lib") { const out = $("#libout"); if (out) { const open = $$("details.course[open] summary b").map((b) => b.textContent); out.innerHTML = libraryList([...new Set(COURSES.map((c) => c.cat))]); $$("details.course").forEach((d) => { if (open.includes($("summary b", d).textContent)) d.open = true; }); } }
      else route();
    }
    else if (a === "toggle-lab") { const k = t.dataset.k; if (S.lab[k]) delete S.lab[k]; else { S.lab[k] = todayISO(); logActivity(30); addXP(15, "experimento do Lab"); } save(); checkBadges(); route(); }
    else if (a === "finish-day") finishDay(+t.dataset.n);
    else if (a === "undo-day") { const n = +t.dataset.n; if (confirm("Desmarcar este dia?")) { delete S.days[n].done; save(); route(); } }
    else if (a === "timer-start") {
      if (T.run) { T.run = false; clearInterval(T.h); t.textContent = "▶ Iniciar"; document.title = "Rabisco OS"; }
      else { if (!T.left) { T.total = T.left = S.timerMin * 60; } T.run = true; clearInterval(T.h); T.h = setInterval(tick, 1000); t.textContent = "⏸ Pausar"; }
    }
    else if (a === "timer-reset") { T.run = false; clearInterval(T.h); T.left = 0; document.title = "Rabisco OS"; route(); }
    else if (a === "roll") { const d = $("#dice"); if (d) d.innerHTML = rollDice(); }
    else if (a === "export") doExport(false);
    else if (a === "export-full") doExport(true);
    else if (a === "gist-push") { S.gist.token = $("#gist-token").value.trim(); S.gist.id = $("#gist-id").value.trim(); save(true); gistPush().catch((err) => toast("Falha no envio: " + err.message, "⚠️")); }
    else if (a === "gist-pull") { S.gist.token = $("#gist-token").value.trim(); S.gist.id = $("#gist-id").value.trim(); save(true); gistPull().catch((err) => toast("Falha ao baixar: " + err.message, "⚠️")); }
    else if (a === "del-photo") { if (confirm("Apagar esta imagem?")) idbDel("photos", t.dataset.id).then(fillGallery); }
    else if (a === "reset") { if (confirm("Isso apaga TODO o progresso deste aparelho. Tem certeza?") && confirm("Último aviso! Fez backup?")) { localStorage.removeItem(STORE_KEY); idbDel("kv", "state").finally(() => location.reload()); } }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note) { const n = t.dataset.note; S.days[n] = Object.assign(S.days[n] || {}, { note: t.value }); clearTimeout(t._h); t._h = setTimeout(() => save(true), 500); }
    else if (t.id === "libq") { libQuery = t.value; clearTimeout(t._h); t._h = setTimeout(() => { $("#libout").innerHTML = libraryList([...new Set(COURSES.map((c) => c.cat))]); }, 200); }
    else if (t.id === "cfg-name") { S.name = t.value.trim(); save(true); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "tmin") { S.timerMin = +t.value; T.left = 0; T.run = false; clearInterval(T.h); save(true); const l = $("#lcd"); if (l) l.textContent = fmtT(S.timerMin * 60); const b = $('[data-act="timer-start"]'); if (b) b.textContent = "▶ Iniciar"; }
    else if (t.id === "cfg-start" && t.value) { S.startDate = t.value; save(); }
    else if (t.id === "cfg-theme") { S.theme = t.value; applyTheme(); save(true); }
    else if (t.id === "imp" && t.files[0]) doImport(t.files[0]);
    else if (t.dataset.photo && t.files.length) addPhotos([...t.files], t.dataset.photo).catch((err) => toast("Erro na imagem: " + err.message, "⚠️"));
  });

  function afterRender(name) {
    if (name === "galeria") fillGallery();
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
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
    window.addEventListener("online", scheduleAutoSync);
    // expose for debugging in the console
    window.RabiscoOS = { PLAN, LESSONS, COURSES, state: () => S, missingEx };
  }
  boot();
})();
