// QUESTIONS Q-75, Q-78: a person opens the link (…/#<link id>), types its password, and sees the rulebook. Owner
// (19 Oct 2026): made for phones, like a photo profile app: a profile with counts and the values as rings, a grid of days,
// icon tabs for the code, a bottom tab bar, and sheets that slide up. "+ Suggest …" sends one item in the content import
// format (docs/AI-CONTENT-PROMPT.md) with the same link and password; the owner decides in the app. The only calls are the
// server functions view_rulebook and suggest, which check the password; nothing else is readable or writable.
(function () {
  "use strict";
  const cfg = window.RULEBOOK || {};
  const parts = decodeURIComponent((location.hash || "").replace(/^#/, "")).split("/");
  const link = (parts[0] || "").trim();
  const $ = (id) => document.getElementById(id);
  const store = {
    get: () => { try { return sessionStorage.getItem("rb:" + link); } catch (e) { return null; } },
    set: (v) => { try { v == null ? sessionStorage.removeItem("rb:" + link) : sessionStorage.setItem("rb:" + link, v); } catch (e) { } },
  };

  // ---- Words (the app's, 07 / 08) ------------------------------------------------------------------
  const RESULT = { Open: "Open", Done: "Done", Failed: "Failed", Exempt: "Exempt" };
  const KIND = { Punishment: "Punishment", Maintenance: "Maintenance", GraduationCheck: "Graduation check" };
  const STAGES = ["Queued", "New", "Training", "Hardened", "Mastered", "Graduated"];
  const CATEGORIES = [["ExtraChore", "Extra chore"], ["LostPrivilege", "Lost privilege"], ["WrittenReview", "Written review"],
                      ["ExtraTraining", "Extra training"], ["EarlierStart", "Earlier start"], ["Other", "Other"]];
  const CATEGORY = Object.fromEntries(CATEGORIES);
  const LEVELS = ["Identity", "Value", "Principle", "Rule", "Task"];
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const PLACEHOLDERS = ["identity", "value", "principle", "rule", "task", "count", "date"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ---- Icons (one outline family, 24px, 1.75 stroke) -----------------------------------------------
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    plus: '<rect x="3" y="3" width="18" height="18"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
    grid: '<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    check: '<rect x="3" y="3" width="18" height="18"/><path d="m8 12 3 3 5-6"/>',
    book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
    quote: '<path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  };
  const icon = (name) => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + ICON[name] + "</svg>";

  let password = null, profile = {}, days = [], oldest = null, allDays = false;
  let route = { tab: "profile", ptab: "grid" };

  // ---- Small helpers -------------------------------------------------------------------------------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(parent, ...kids) { for (const k of kids) if (k) parent.appendChild(k); return parent; }
  function html(tag, cls, markup) { const e = el(tag, cls); e.innerHTML = markup; return e; }
  function dayName(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  }
  function plural(n, one, many) { return n === 1 ? "1 " + one : n + " " + many; }
  const pct = (f) => Math.round(Math.max(0, Math.min(1, f || 0)) * 100);
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  function ring(p, text, cls) {
    const r = el("span", cls || "ring"); r.style.setProperty("--p", p);
    r.appendChild(el("span", null, text)); return r;
  }
  /// A list row: lead (an element), title, subtitle; opens a sheet.
  function row(lead, title, sub, open) {
    const b = el("button", "row"); b.type = "button";
    add(b, lead, add(el("span", "main"), el("span", "title", title), sub ? el("span", "sub", sub) : null), html("span", "chev", icon("chev")));
    b.addEventListener("click", open);
    return add(el("li"), b);
  }
  function lead(text) { return el("span", "lead", text); }
  function suggestRow(kind, label) {
    return row(html("span", "lead", icon("plus")), "Suggest " + label, "The owner decides whether to add it.", () => openForm(kind));
  }
  function empty(text) { return el("p", "empty", text); }

  // ---- Server --------------------------------------------------------------------------------------
  async function call(fn, body) {
    const res = await fetch(cfg.url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = null;
      try { msg = (await res.json()).message; } catch (e) { }
      const err = new Error(res.status >= 500 ? "server" : (msg || "denied")); err.status = res.status; throw err;
    }
    return res.json();
  }
  const view = (pw, before) => call("view_rulebook", { link: link, link_password: pw, before: before || null });

  async function open(pw) {
    const data = await view(pw);
    password = pw;
    store.set(pw);
    profile = data.profile || {};
    days = data.days || [];
    oldest = days.length ? days[days.length - 1].date : null;
    allDays = days.length < 60;
    document.title = profile.identityName || profile.rulebookName || "Rulebook";
    $("appbar-title").textContent = profile.rulebookName || "Rulebook";
    buildTabbar();
    $("gate").hidden = true; $("nolink").hidden = true; $("app").hidden = false;
    const [tab, ptab] = [parts[1], parts[2]];
    go(SCREENS[tab] ? tab : "profile", ptab);
  }

  // ---- Bottom tab bar (5) --------------------------------------------------------------------------
  const TABS = [["today", "Today", "home"], ["profile", "Profile", "user"], ["suggest", "Suggest", "plus"], ["progress", "Progress", "chart"], ["owed", "Owed", "alert"]];
  function buildTabbar() {
    const bar = $("tabbar"); bar.textContent = "";
    for (const [key, label, ic] of TABS) {
      const b = html("button", null, icon(ic) + "<span>" + label + "</span>");
      b.type = "button"; b.dataset.tab = key;
      b.addEventListener("click", () => key === "suggest" ? openMenu() : go(key));
      bar.appendChild(b);
    }
  }

  function go(tab, ptab) {
    route = { tab: tab, ptab: ptab || route.ptab || "grid" };
    history.replaceState(history.state, "", "#" + link + "/" + route.tab + (route.tab === "profile" ? "/" + route.ptab : ""));
    for (const b of document.querySelectorAll("#tabbar button")) b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false");
    const screen = $("screen"); screen.textContent = "";
    SCREENS[tab](screen);
  }

  // ---- Screens -------------------------------------------------------------------------------------
  const SCREENS = {
    today(screen) {
      const today = days.find((d) => d.date === profile.today) || days[0];
      if (!today) { screen.appendChild(empty("No tasks today.")); return; }
      screen.appendChild(post(today.date, today.summary));
    },

    profile(screen) {
      add(screen, header(), highlights(), profileTabs());
      const body = el("div"); screen.appendChild(body);
      PTABS.find((t) => t[0] === route.ptab)[3](body);
    },

    progress(screen) {
      const box = el("div", "bars");
      box.appendChild(el("p", "muted small", "Share of tasks done in the last 30 days."));
      box.appendChild(bar(profile.identityTitle || "Identity", profile.identityBar));
      for (const v of profile.values || []) box.appendChild(bar(v.name, v.bar));
      add(screen, box, owedBox());
    },

    owed(screen) {
      screen.appendChild(owedBox());
      screen.appendChild(el("div", "section", "Their punishments"));
      const list = el("ul", "rows");
      list.appendChild(suggestRow("punishment", "a punishment"));
      for (const p of profile.punishments || [])
        list.appendChild(row(lead(p.severity[0] + (p.severity === "Major" ? "a" : "")), p.name, [p.severity, CATEGORY[p.category] || p.category, "due " + p.due].join(" · "), () => punishmentSheet(p)));
      screen.appendChild(list);
      if (!(profile.punishments || []).length) screen.appendChild(empty("No punishments yet."));
    },
  };

  function owedBox() {
    const n = profile.owed || 0;
    return add(el("div", "owed"), el("span", null, n === 1 ? "Punishment owed" : "Punishments owed"), el("b", null, String(n)));
  }

  function bar(label, fraction) {
    const b = el("div", "bar");
    add(b, add(el("div", "top"), el("span", null, label), el("span", "muted", pct(fraction) + "%")));
    const track = el("div", "track"), fill = el("div", "fill");
    fill.style.width = pct(fraction) + "%";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", label + ": " + pct(fraction) + "% of tasks done in the last 30 days");
    add(b, add(track, fill));
    return b;
  }

  // ---- Profile -------------------------------------------------------------------------------------
  function header() {
    const p = el("section", "profile");
    const pic = el("div", "avatar");
    const name = (profile.identityName || "").trim();
    if (profile.picture && /^data:image\/(jpeg|png);base64,/.test(profile.picture)) { const img = el("img"); img.src = profile.picture; img.alt = name; pic.appendChild(img); }
    else if (name) pic.textContent = name[0].toUpperCase();
    else pic.innerHTML = icon("user");
    const doneRate = pct(profile.identityBar) + "%";
    const stats = el("div", "stats");
    for (const [n, label] of [[days.length + (allDays ? "" : "+"), "days"], [(profile.rules || []).length, "rules"], [doneRate, "done"]])
      add(stats, add(el("div"), el("b", null, String(n)), el("span", null, label)));
    add(p, add(el("div", "profile-row"), pic, stats));
    const bio = el("div", "bio");
    if (name) bio.appendChild(el("div", "name", name));
    if (profile.identityTitle) bio.appendChild(el("div", null, profile.identityTitle));
    if (profile.statement) bio.appendChild(el("div", "statement", profile.statement));
    p.appendChild(bio);
    const acts = el("div", "profile-actions");
    const s = el("button", "btn primary", "Suggest"); s.type = "button"; s.addEventListener("click", openMenu);
    const pr = el("button", "btn", "Progress"); pr.type = "button"; pr.addEventListener("click", () => go("progress"));
    p.appendChild(add(acts, s, pr));
    return p;
  }

  // the values as rings: the ring is the value's bar
  function highlights() {
    const h = el("div", "highlights");
    for (const v of profile.values || []) {
      const b = el("button", "hl"); b.type = "button";
      b.setAttribute("aria-label", v.name + ", " + pct(v.bar) + "% done");
      add(b, ring(pct(v.bar), pct(v.bar) + "%"), el("em", null, v.name));
      b.addEventListener("click", () => valueSheet(v));
      h.appendChild(b);
    }
    const plus = el("button", "hl"); plus.type = "button"; plus.setAttribute("aria-label", "Suggest a value");
    const r = el("span", "ring"); r.style.setProperty("--p", 0); r.appendChild(html("span", null, icon("plus")));
    add(plus, r, el("em", null, "Suggest"));
    plus.addEventListener("click", () => openForm("value"));
    h.appendChild(plus);
    return h;
  }

  const PTABS = [
    ["grid", "Days", "grid", gridTab],
    ["rules", "Rules", "list", rulesTab],
    ["tasks", "Tasks", "check", tasksTab],
    ["principles", "Principles", "book", principlesTab],
    ["mantras", "Mantras", "quote", mantrasTab],
    ["questions", "Questions", "help", questionsTab],
  ];
  function profileTabs() {
    const t = el("div", "ptabs"); t.setAttribute("role", "tablist");
    for (const [key, label, ic] of PTABS) {
      const b = html("button", null, icon(ic)); b.type = "button";
      b.setAttribute("role", "tab"); b.setAttribute("aria-label", label); b.setAttribute("aria-selected", String(route.ptab === key));
      b.addEventListener("click", () => go("profile", key));
      t.appendChild(b);
    }
    return t;
  }

  // Days: one square per training day, newest first; the dots are its tasks (filled done, red failed)
  function gridTab(body) {
    if (!days.length) { body.appendChild(empty("No days yet.")); return; }
    const g = el("div", "grid");
    for (const d of days) {
      const tasks = d.summary.tasks || [];
      const [, m, dd] = d.date.split("-").map(Number);
      const t = el("button", "tile"); t.type = "button";
      t.setAttribute("aria-label", dayName(d.date) + ", " + tasks.filter((x) => x.result === "Done").length + " of " + tasks.length + " done");
      const dots = el("div", "dots");
      for (const x of tasks) dots.appendChild(el("span", "dot " + x.result));
      add(t, add(el("div"), el("div", "daynum", String(dd)), el("div", "mon", MONTHS[m - 1])), dots);
      if ((d.summary.reflections || []).some((r) => r.answer)) t.appendChild(html("span", "mark", icon("chat")));
      t.addEventListener("click", () => openSheet(dayName(d.date), (b) => b.appendChild(post(d.date, d.summary, true))));
      g.appendChild(t);
    }
    body.appendChild(g);
    if (!allDays) {
      const more = el("button", "btn more", "Show older days"); more.type = "button";
      more.addEventListener("click", async () => {
        more.disabled = true;
        try {
          const older = (await view(password, oldest)).days || [];
          days = days.concat(older);
          if (older.length) oldest = older[older.length - 1].date;
          allDays = older.length < 60;
          go("profile", "grid");
        } catch (e) { more.disabled = false; more.textContent = "Couldn't load. Try again"; }
      });
      body.appendChild(more);
    }
  }

  function rulesTab(body) {
    const list = el("ul", "rows");
    list.appendChild(suggestRow("rule", "a rule"));
    const rules = (profile.rules || []).slice().sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.code.localeCompare(b.code));
    for (const r of rules)
      list.appendChild(row(ring(Math.round(100 * r.level / Math.max(1, r.levels)), r.level + "/" + r.levels, "lead ring"), r.name,
        [r.type, r.stage, r.value].filter(Boolean).join(" · "), () => ruleSheet(r)));
    body.appendChild(list);
    if (!rules.length) body.appendChild(empty("No rules yet."));
  }

  function tasksTab(body) {
    const list = el("ul", "rows");
    list.appendChild(suggestRow("task", "a task"));
    for (const t of profile.tasks || [])
      list.appendChild(row(lead(String(t.rules)), t.name, [t.schedule, "due " + t.due, t.proof].join(" · "), () => taskSheet(t)));
    body.appendChild(list);
    if (!(profile.tasks || []).length) body.appendChild(empty("No tasks yet."));
  }

  function principlesTab(body) {
    const list = el("ul", "rows");
    list.appendChild(suggestRow("principle", "a principle"));
    body.appendChild(list);
    for (const v of profile.values || []) {
      const ps = (profile.principles || []).filter((p) => p.value === v.name);
      if (!ps.length) continue;
      body.appendChild(el("div", "section", v.name));
      const l = el("ul", "rows");
      for (const p of ps) l.appendChild(row(lead(v.name[0]), p.title, p.description, () => principleSheet(p)));
      body.appendChild(l);
    }
    if (!(profile.principles || []).length) body.appendChild(empty("No principles yet."));
  }

  function mantrasTab(body) {
    const list = el("ul", "rows");
    list.appendChild(suggestRow("mantra", "a mantra"));
    for (const m of profile.mantras || [])
      list.appendChild(row(html("span", "lead", icon("quote")), "“" + m.text + "”", m.code, () => openSheet("Mantra", (b) => add(b, add(el("div", "detail"), el("p", null, "“" + m.text + "”"), el("p", "meta", m.code))))));
    body.appendChild(list);
    if (!(profile.mantras || []).length) body.appendChild(empty("No mantras yet."));
  }

  function questionsTab(body) {
    const list = el("ul", "rows");
    list.appendChild(suggestRow("question", "a question"));
    for (const q of profile.questions || [])
      list.appendChild(row(lead(q.level[0]), q.text, [q.level, q.audit ? "Audit" : null, q.link ? "About " + q.link : null].filter(Boolean).join(" · "),
        () => openSheet("Question", (b) => add(b, add(el("div", "detail"), el("p", null, q.text), el("p", "meta", [q.level + " question", q.audit ? "audit" : null, q.link ? "about " + q.link : null, q.code].filter(Boolean).join(" · ")))))));
    body.appendChild(list);
    if (!(profile.questions || []).length) body.appendChild(empty("No questions yet."));
  }

  // ---- Sheets (a day, an item) -----------------------------------------------------------------------
  /// A day as a post: its tasks, then the answered reflections as captions.
  function post(date, summary, inSheet) {
    const box = el("div");
    const tasks = summary.tasks || [];
    if (!inSheet) add(box, add(el("div", "post-head"), el("h3", null, dayName(date)),
                               el("span", "muted small", tasks.filter((t) => t.result === "Done").length + " of " + tasks.length + " done" + (summary.closed ? "" : " · open"))));
    else box.appendChild(el("div", "note", tasks.filter((t) => t.result === "Done").length + " of " + tasks.length + " done" + (summary.closed ? "" : " · the day is still open")));
    if (!tasks.length) box.appendChild(empty("No tasks."));
    for (const t of tasks) {
      const r = el("div", "task");
      add(r, el("div", "due", t.due), el("div", "what", KIND[t.kind] ? KIND[t.kind] + ": " + t.title : t.title), el("span", "badge " + t.result, RESULT[t.result] || t.result));
      const why = [t.reason, t.exempt ? "Excuse: " + t.exempt : null].filter(Boolean).join(" · ");
      if (why) r.appendChild(el("div", "why", why));
      if (t.actions && t.actions.length) r.appendChild(el("div", "acts", t.actions.join(" · ")));
      box.appendChild(r);
    }
    for (const q of summary.reflections || []) if (q.answer) add(box, add(el("div", "caption"), el("div", "q", q.question), el("div", "a", q.answer)));
    return box;
  }

  function ruleSheet(r) {
    openSheet(r.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "meta", [r.code, r.type, r.stage, "level " + r.level + " of " + r.levels].join(" · ")),
          el("p", "meta", [r.value, r.principle].filter(Boolean).join(" › ")), r.reason ? el("p", null, r.reason) : null, el("div", "label", "Ladder"));
      const lad = el("ol", "ladder");
      (r.ladder || [r.task]).forEach((t, i) => { const li = el("li", i + 1 === r.level ? "now" : null, t); lad.appendChild(li); });
      b.appendChild(add(d, lad));
    });
  }
  function taskSheet(t) {
    openSheet(t.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "meta", [t.code, t.schedule, "due " + t.due, t.opens ? "opens " + t.opens : null, t.proof, plural(t.rules, "rule", "rules")].filter(Boolean).join(" · ")),
          el("div", "label", "Actions"));
      const lad = el("ol", "ladder"); for (const a of t.actions) lad.appendChild(el("li", null, a));
      add(d, lad);
      if (t.exceptions) add(d, el("div", "label", "Exceptions"), el("p", null, t.exceptions));
      b.appendChild(d);
    });
  }
  function principleSheet(p) {
    openSheet(p.title, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "meta", p.code + " · " + p.value), el("p", null, p.description || ""));
      b.appendChild(d);
      const rules = (profile.rules || []).filter((r) => r.principle === p.title);
      if (rules.length) {
        b.appendChild(el("div", "section", "Rules"));
        const l = el("ul", "rows");
        for (const r of rules) l.appendChild(row(ring(Math.round(100 * r.level / Math.max(1, r.levels)), r.level + "/" + r.levels, "lead ring"), r.name, r.stage, () => ruleSheet(r)));
        b.appendChild(l);
      }
    });
  }
  function valueSheet(v) {
    openSheet(v.name, (b) => {
      const d = el("div", "detail");
      add(d, bar(v.name, v.bar), v.meaning ? el("p", null, v.meaning) : null);
      b.appendChild(d);
      const ps = (profile.principles || []).filter((p) => p.value === v.name);
      if (ps.length) {
        b.appendChild(el("div", "section", "Principles"));
        const l = el("ul", "rows");
        for (const p of ps) l.appendChild(row(lead(v.name[0]), p.title, p.description, () => principleSheet(p)));
        b.appendChild(l);
      }
    });
  }
  function punishmentSheet(p) {
    openSheet(p.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "meta", [p.code, p.severity, CATEGORY[p.category] || p.category, p.proof, "due " + p.due].join(" · ")));
      if (p.actions.length) { const l = el("ol", "ladder"); for (const a of p.actions) l.appendChild(el("li", null, a)); add(d, el("div", "label", "Actions"), l); }
      b.appendChild(d);
    });
  }

  // A sheet slides up over the screen; the phone's back gesture closes it.
  let sheetOpen = false;
  function openSheet(title, fill, action) {
    $("sheet-title").textContent = title;
    const body = $("sheet-body"); body.textContent = ""; body.scrollTop = 0;
    fill(body);
    const act = $("sheet-action");
    act.hidden = !action; act.disabled = false;
    act.textContent = action ? action.label : "";
    act.onclick = action ? action.run : null;
    $("sheet-close").textContent = action ? "Cancel" : "Close";
    $("sheet").hidden = false;
    if (!sheetOpen) { history.pushState({ sheet: true }, "", location.href); sheetOpen = true; }
    setTimeout(() => { const f = body.querySelector("input, select, textarea") || $("sheet-close"); f.focus({ preventScroll: true }); }, 50);
  }
  function closeSheet() { if (sheetOpen) history.back(); }
  window.addEventListener("popstate", () => { if (sheetOpen) { sheetOpen = false; $("sheet").hidden = true; } });
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) closeSheet(); });

  // ---- Suggest -------------------------------------------------------------------------------------
  const KINDS = [["rule", "Rule", "list"], ["task", "Task", "check"], ["value", "Value", "star"], ["principle", "Principle", "book"],
                 ["mantra", "Mantra", "quote"], ["question", "Question", "help"], ["punishment", "Punishment", "alert"]];
  function openMenu() {
    openSheet("Suggest", (b) => {
      b.appendChild(el("p", "note", "Suggest something for this rulebook. The owner sees it in the app and decides whether to add it."));
      const l = el("ul", "rows");
      for (const [kind, label, ic] of KINDS) l.appendChild(row(html("span", "lead", icon(ic)), label, null, () => openForm(kind)));
      b.appendChild(l);
    });
  }

  function field(labelText, input, help) {
    const f = el("div", "field");
    const id = "f" + Math.random().toString(36).slice(2);
    input.id = id;
    const l = el("label", null, labelText); l.htmlFor = id;
    add(f, l, input);
    if (help) f.appendChild(el("div", "help", help));
    return f;
  }
  function input(max, value) { const i = el("input"); i.type = "text"; if (max) i.maxLength = max; if (value) i.value = value; return i; }
  function area(max) { const t = el("textarea"); if (max) t.maxLength = max; return t; }
  function choose(options, value) {
    const s = el("select");
    for (const o of options) { const [v, label] = Array.isArray(o) ? o : [o, o]; const op = el("option", null, label); op.value = v; s.appendChild(op); }
    if (value != null) s.value = value;
    return s;
  }
  const lines = (t) => t.value.split("\n").map((x) => x.trim()).filter(Boolean);
  function deadlineInput() {
    const wrap = el("div");
    const kind = choose([["end", "End of day"], ["fixed", "At a time"], ["after", "Minutes after start of day"]]);
    const value = input(5); value.hidden = true; value.style.marginTop = "8px";
    kind.addEventListener("change", () => {
      value.hidden = kind.value === "end";
      value.type = kind.value === "fixed" ? "time" : "text";
      value.inputMode = kind.value === "after" ? "numeric" : "text";
      value.placeholder = kind.value === "after" ? "minutes, e.g. 90" : "";
    });
    add(wrap, kind, value);
    wrap.read = () => kind.value === "end" ? "End of day" : kind.value === "after" ? "+" + value.value.trim() : value.value.trim();
    return wrap;
  }
  function timeInput(value) { const i = input(5, value); i.type = "time"; return i; }
  function scheduleInput() {
    const wrap = el("div");
    const freq = choose([["Daily", "Daily"], ["Weekdays", "Weekdays"], ["Every N days", "Every N days"]]);
    const days = el("div", "checks days"); days.hidden = true; days.style.marginTop = "8px";
    const boxes = DAYS.map((d) => { const l = el("label"); const c = el("input"); c.type = "checkbox"; c.checked = true; add(l, c, document.createTextNode(d)); days.appendChild(l); return c; });
    const n = input(2, "2"); n.hidden = true; n.style.marginTop = "8px"; n.inputMode = "numeric";
    freq.addEventListener("change", () => { days.hidden = freq.value !== "Weekdays"; n.hidden = freq.value !== "Every N days"; });
    add(wrap, freq, days, n);
    wrap.read = () => {
      const s = { frequency: freq.value };
      if (freq.value === "Weekdays") s.weekdays = DAYS.filter((_, i) => boxes[i].checked);
      if (freq.value === "Every N days") s.everyNDays = parseInt(n.value, 10) || 0;
      return s;
    };
    return wrap;
  }
  const proofInput = () => choose(["Photo", "Video"]);
  const nonBlank = (v, what) => { if (!v) throw new Error("Write " + what + "."); return v; };

  // Each form: the app editor's fields (07 §6), then read() → the item in the content import format.
  const FORMS = {
    value() {
      const name = input(30), meaning = area(300);
      return { title: "Suggest a value", fields: [field("Name", name), field("Meaning", meaning)],
               read: () => ({ name: nonBlank(name.value.trim(), "a name"), meaning: meaning.value.trim() }) };
    },
    principle() {
      const value = choose((profile.values || []).map((v) => v.name)), t = input(80), d = area(400);
      return { title: "Suggest a principle", fields: [field("Value", value), field("Title", t), field("Description", d)],
               read: () => ({ value: nonBlank(value.value, "a value first; there are none"), title: nonBlank(t.value.trim(), "a title"), description: d.value.trim() }) };
    },
    mantra() {
      const t = area(200);
      return { title: "Suggest a mantra", fields: [field("Mantra", t, "A line said to oneself, e.g. “I keep my word, even to myself.”")],
               read: () => ({ text: nonBlank(t.value.trim(), "the mantra") }) };
    },
    task() {
      const name = input(80), acts = area(), proof = proofInput(), due = deadlineInput(), opens = timeInput(), sched = scheduleInput(), exc = area();
      return { title: "Suggest a task",
               fields: [field("Name", name), field("Actions", acts, "One per line, in the order they are done (1–10)."), field("Proof", proof),
                        field("Deadline", due), field("Opens at (optional)", opens, "The earliest time the proof may be taken."), field("Frequency", sched), field("Exceptions (optional)", exc)],
               read: () => Object.assign({ name: nonBlank(name.value.trim(), "a name"), actions: lines(acts), proof: proof.value, deadline: due.read() },
                                         opens.value.trim() ? { windowStart: opens.value.trim() } : {}, sched.read(),
                                         exc.value.trim() ? { exceptions: exc.value.trim() } : {}) };
    },
    rule() {
      const name = input(80), principle = choose((profile.principles || []).map((p) => [p.title, p.title + " (" + p.value + ")"]));
      const type = choose([["Law", "Law (major punishment)"], ["Standard", "Standard (minor punishment)"], ["Ideal", "Ideal (no punishment)"]], "Standard");
      const reason = area(), ladder = el("div"), levels = [];
      const addLevel = () => {
        const i = levels.length + 1, r = el("div", "level-row");
        const pick = choose([["", "Write a new task…"]].concat((profile.tasks || []).map((t) => [t.name, t.name])));
        const tname = input(80), acts = area(), due = deadlineInput();
        const own = el("div"); add(own, field("Task name", tname), field("Actions", acts, "One per line."), field("Deadline", due));
        pick.addEventListener("change", () => { own.hidden = pick.value !== ""; });
        add(r, field("Level " + i, pick), own);
        levels.push({ read: () => pick.value ? { task: pick.value } : { name: nonBlank(tname.value.trim(), "a name for level " + i + "'s task"), actions: lines(acts), deadline: due.read() } });
        ladder.appendChild(r);
      };
      addLevel();
      const more = el("button", "btn wide", "+ Add level"); more.type = "button";
      more.addEventListener("click", () => { if (levels.length < 10) addLevel(); if (levels.length >= 10) more.hidden = true; });
      const ladderField = el("div", "field"); add(ladderField, el("div", "label", "Ladder"), el("div", "help", "Level 1 is easy enough for a bad day; each level is a step stricter."), ladder, more);
      return { title: "Suggest a rule", fields: [field("Name", name), field("Principle", principle), field("Type", type), ladderField, field("Reason (optional)", reason)],
               read: () => Object.assign({ name: nonBlank(name.value.trim(), "a name"), principle: nonBlank(principle.value, "a principle first; there are none"),
                                           type: type.value, levels: levels.map((l) => l.read()) }, reason.value.trim() ? { reason: reason.value.trim() } : {}) };
    },
    question() {
      const level = choose(LEVELS), text = area(300), audit = el("input"), link = choose([["", "Any"]]);
      audit.type = "checkbox";
      const auditField = el("div", "field"); add(auditField, add(el("label", "check"), audit, document.createTextNode("Audit question (checks a task marked Done)")));
      const linkField = field("About", link);
      const fill = () => {
        const opts = level.value === "Value" ? (profile.values || []).map((v) => v.name)
          : level.value === "Principle" ? (profile.principles || []).map((p) => p.title)
          : level.value === "Rule" ? (profile.rules || []).map((r) => r.name) : [];
        link.textContent = ""; link.appendChild(Object.assign(el("option", null, "Any"), { value: "" }));
        for (const o of opts) link.appendChild(Object.assign(el("option", null, o), { value: o }));
        linkField.hidden = !opts.length; auditField.hidden = level.value !== "Task";
      };
      level.addEventListener("change", fill); fill();
      return { title: "Suggest a question",
               fields: [field("Level", level), field("Question", text, "You can use " + PLACEHOLDERS.map((p) => "{" + p + "}").join(" ")), linkField, auditField],
               read: () => {
                 const t = nonBlank(text.value.trim(), "the question");
                 const bad = (t.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)).filter((x) => !PLACEHOLDERS.includes(x));
                 if (bad.length) throw new Error("Unknown placeholder {" + bad[0] + "}.");
                 return Object.assign({ level: level.value, text: t }, level.value === "Task" && audit.checked ? { audit: true } : {}, link.value ? { link: link.value } : {});
               } };
    },
    punishment() {
      const name = input(80), cat = choose(CATEGORIES), sev = choose(["Minor", "Major", "Severe"]), acts = area(), proof = proofInput(), due = timeInput("21:00");
      return { title: "Suggest a punishment",
               fields: [el("p", "help", "A punishment must never take away or cut sleep, food, water, hygiene, medication or medical care, work or school, or contact with people they depend on, and must cause no pain or injury. The owner confirms this before adding it."),
                        field("Name", name), field("Category", cat), field("Severity", sev), field("Actions", acts, "One per line (0–10)."), field("Proof", proof), field("Deadline time", due)],
               read: () => ({ name: nonBlank(name.value.trim(), "a name"), category: cat.value, severity: sev.value, actions: lines(acts), proof: proof.value, deadline: due.value.trim() }) };
    },
  };

  function openForm(kind) {
    const f = FORMS[kind]();
    const form = el("form"); form.noValidate = true;
    for (const x of f.fields) form.appendChild(x);
    const note = area(1000);
    form.appendChild(field("Note to the owner (optional)", note, "Why you suggest it."));
    const err = el("p", "error"); err.setAttribute("role", "alert");
    form.appendChild(err);
    const send = async () => {
      let item;
      try { item = f.read(); } catch (e) { err.textContent = e.message; err.scrollIntoView({ block: "nearest" }); return; }
      const act = $("sheet-action"); act.disabled = true; act.textContent = "Sending…";
      try {
        await call("suggest", { link: link, link_password: password, kind: kind, item: item, note: note.value.trim() });
        closeSheet();
        toast("Sent. The owner decides whether to add it.");
      } catch (e) {
        err.textContent = e.message === "server" ? "Something went wrong. Try again later." : e.message === "denied" ? "Couldn't send. Try again." : e.message;
        act.disabled = false; act.textContent = "Send";
      }
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); send(); });
    openSheet(f.title, (b) => b.appendChild(form), { label: "Send", run: send });
  }

  // ---- Start ---------------------------------------------------------------------------------------
  $("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    $("gate-error").textContent = "";
    try { await open($("password").value); }
    catch (err) { $("gate-error").textContent = err.message === "server" ? "Something went wrong. Try again later." : "Wrong link or password."; }
    finally { btn.disabled = false; }
  });

  if (!/^[0-9a-f-]{36}$/i.test(link) || !cfg.url) { $("nolink").hidden = false; return; }
  const saved = store.get();
  if (saved) open(saved).catch(() => { store.set(null); $("gate").hidden = false; });
  else $("gate").hidden = false;
})();
