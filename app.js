// QUESTIONS Q-75, Q-78: a person opens the link (…/#<link id>), types its password, and sees the rulebook. Owner
// (19 Oct 2026): made for phones, like a photo profile app: a profile (picture, name, title, statement, values), a grid of days,
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

  // ---- Icons (one outline family, 24px, 1.75 stroke) -----------------------------------------------
  const ICON = {
    home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    plus: '<rect x="3" y="3" width="18" height="18"/><path d="M12 8v8M8 12h8"/>',
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
  /// "Monday 19 October" for headlines; "MON" style datelines come from CSS small caps.
  function longDay(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  }
  /// The day's first answered reflection, if any.
  const answerOf = (summary) => (summary.reflections || []).find((r) => r.answer);
  function plural(n, one, many) { return n === 1 ? "1 " + one : n + " " + many; }
  function toast(text) {
    const t = $("toast"); t.textContent = text; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
  }
  /// A list row: lead (an element), title, subtitle; opens a sheet.
  function row(lead, title, sub, open) {
    const b = el("button", "row"); b.type = "button";
    add(b, lead || null, add(el("span", "main"), el("span", "title", title), sub ? el("span", "sub", sub) : null));
    b.addEventListener("click", open);
    return add(el("li"), b);
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

  // ---- Bottom tab bar: three (owner, minimalism review) --------------------------------------------
  const TABS = [["profile", "Profile", "user"], ["today", "Today", "home"], ["suggest", "Suggest", "plus"]];
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
    route = { tab: tab, ptab: ptab || route.ptab || "days" };
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
      // a mantra closes the page, one per day in turn
      const ms = profile.mantras || [];
      if (ms.length) {
        const n = Number(today.date.replace(/-/g, "")) % ms.length;
        screen.appendChild(el("blockquote", "pull", "“" + ms[n].text + "”"));
      }
    },

    profile(screen) {
      add(screen, header(), profileTabs());
      const body = el("div"); screen.appendChild(body);
      (PTABS.find((t) => t[0] === route.ptab) || PTABS[0])[2](body);
    },
  };

  // ---- Profile -------------------------------------------------------------------------------------
  function header() {
    const p = el("section", "profile");
    const pic = el("div", "avatar");
    const name = (profile.identityName || "").trim();
    if (profile.picture && /^data:image\/(jpeg|png);base64,/.test(profile.picture)) { const img = el("img"); img.src = profile.picture; img.alt = name; pic.appendChild(img); }
    else if (name) pic.textContent = name[0].toUpperCase();
    else pic.innerHTML = icon("user");
    // owner: the text sits beside the picture and is no taller than it; no counts, no owed line, values as
    // "Order · Health · Focus". The statement takes the lines left; tapping the text shows all of it.
    const bio = el("button", "bio"); bio.type = "button";
    if (name) bio.appendChild(el("div", "name", name));
    if (profile.identityTitle) bio.appendChild(el("div", null, profile.identityTitle));
    if (profile.statement) bio.appendChild(el("div", "statement", profile.statement));
    const values = (profile.values || []).map((v) => v.name).join(" · ");
    if (values) bio.appendChild(el("div", "values", values));
    add(p, add(el("div", "profile-row"), pic, bio));
    bio.addEventListener("click", () => openSheet(name || profile.rulebookName || "Identity", (b) => {
      const d = el("div", "detail");
      add(d, profile.identityTitle ? el("p", null, profile.identityTitle) : null, profile.statement ? el("p", null, profile.statement) : null,
          values ? el("p", "values", values) : null);
      b.appendChild(d);
    }));
    requestAnimationFrame(() => fitBio(bio));
    return p;
  }

  // the statement gets the whole lines left within the picture's height
  function fitBio(bio) {
    const st = bio.querySelector(".statement");
    if (!st) return;
    const line = parseFloat(getComputedStyle(st).lineHeight) || 18;
    const others = [...bio.children].filter((c) => c !== st).reduce((h, c) => h + c.getBoundingClientRect().height, 0);
    const lines = Math.max(0, Math.floor((bio.clientHeight - others) / line));
    st.style.webkitLineClamp = String(lines);
    st.hidden = lines === 0;
  }

  const PTABS = [["days", "Days", gridTab], ["rules", "Rules", rulesTab], ["more", "More", moreTab]];
  function profileTabs() {
    const t = el("div", "ptabs"); t.setAttribute("role", "tablist");
    for (const [key, label] of PTABS) {
      const b = el("button", null, label); b.type = "button";
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(route.ptab === key));
      b.addEventListener("click", () => go("profile", key));
      t.appendChild(b);
    }
    return t;
  }

  // Days: one plain square per training day, newest first; no date or bar on the grid (owner). The day's date and how
  // it went are in its sheet and in each tile's accessible name; photos fill the squares with step 2.
  function gridTab(body) {
    if (!days.length) { body.appendChild(empty("No days yet.")); return; }
    const g = el("div", "grid");
    for (const d of days) {
      const tasks = d.summary.tasks || [];
      const done = tasks.filter((x) => x.result === "Done").length;
      const t = el("button", "tile"); t.type = "button";
      t.setAttribute("aria-label", dayName(d.date) + ", " + done + " of " + tasks.length + " done");
      const a = answerOf(d.summary);
      if (a) { t.classList.add("quoted"); t.appendChild(el("span", "q", "“" + a.answer + "”")); }
      t.addEventListener("click", () => openSheet(dayName(d.date), (b) => b.appendChild(post(d.date, d.summary, true))));
      g.appendChild(t);
    }
    body.appendChild(g);
    if (!allDays) {
      const more = el("button", "btn more", "Older days"); more.type = "button";
      more.addEventListener("click", async () => {
        more.disabled = true;
        try {
          const older = (await view(password, oldest)).days || [];
          days = days.concat(older);
          if (older.length) oldest = older[older.length - 1].date;
          allDays = older.length < 60;
          go("profile", "days");
        } catch (e) { more.disabled = false; more.textContent = "Couldn't load. Try again"; }
      });
      body.appendChild(more);
    }
  }

  function ruleRow(r) { return row(null, r.name, [r.type, r.stage, "level " + r.level + " of " + r.levels, r.value].filter(Boolean).join(" · "), () => ruleSheet(r)); }

  function rulesTab(body) {
    const rules = (profile.rules || []).slice().sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || a.code.localeCompare(b.code));
    if (!rules.length) { body.appendChild(empty("No rules yet.")); return; }
    body.appendChild(add(el("ul", "rows"), ...rules.map(ruleRow)));
  }

  // More: the rest of the code, one row each, opening its list
  function moreTab(body) {
    const n = (k) => (profile[k] || []).length;
    body.appendChild(add(el("ul", "rows"),
      row(null, "Tasks", plural(n("tasks"), "task", "tasks"), () => listSheet("Tasks", tasksList)),
      row(null, "Principles", plural(n("principles"), "principle", "principles"), () => listSheet("Principles", principlesList)),
      row(null, "Mantras", plural(n("mantras"), "mantra", "mantras"), () => listSheet("Mantras", mantrasList)),
      row(null, "Questions", plural(n("questions"), "question", "questions"), () => listSheet("Questions", questionsList)),
      row(null, "Punishments", plural(n("punishments"), "punishment", "punishments"), punishmentsSheet)));
  }

  function listSheet(title, fill) { openSheet(title, (b) => fill(b)); }

  function tasksList(body) {
    if (!(profile.tasks || []).length) { body.appendChild(empty("No tasks yet.")); return; }
    body.appendChild(add(el("ul", "rows"), ...profile.tasks.map((t) => row(null, t.name, [t.schedule, "due " + t.due, t.proof].join(" · "), () => taskSheet(t)))));
  }
  function principlesList(body) {
    if (!(profile.principles || []).length) { body.appendChild(empty("No principles yet.")); return; }
    for (const v of profile.values || []) {
      const ps = (profile.principles || []).filter((p) => p.value === v.name);
      if (!ps.length) continue;
      body.appendChild(el("div", "section", v.name));
      body.appendChild(add(el("ul", "rows"), ...ps.map((p) => row(null, p.title, p.description, () => principleSheet(p)))));
    }
  }
  function mantrasList(body) {
    if (!(profile.mantras || []).length) { body.appendChild(empty("No mantras yet.")); return; }
    for (const m of profile.mantras) body.appendChild(el("blockquote", "pull", "“" + m.text + "”"));
  }
  function questionsList(body) {
    if (!(profile.questions || []).length) { body.appendChild(empty("No questions yet.")); return; }
    body.appendChild(add(el("ul", "rows"), ...profile.questions.map((q) =>
      add(el("li"), add(el("div", "plain"), el("div", null, q.text), el("div", "sub", [q.level, q.audit ? "audit" : null, q.link ? "about " + q.link : null].filter(Boolean).join(" · ")))))));
  }
  function punishmentsSheet() {
    openSheet("Punishments", (b) => {
      if (profile.owed > 0) b.appendChild(el("p", "meta-line", plural(profile.owed, "punishment owed", "punishments owed")));
      if (!(profile.punishments || []).length) { b.appendChild(empty("No punishments yet.")); return; }
      b.appendChild(add(el("ul", "rows"), ...profile.punishments.map((p) =>
        row(null, p.name, [p.severity, CATEGORY[p.category] || p.category, "due " + p.due].join(" · "), () => punishmentSheet(p)))));
    });
  }

  // ---- Sheets (a day, an item) -----------------------------------------------------------------------
  /// A day as a post: one line for how it went, its tasks, then the answered reflections as captions.
  function post(date, summary, inSheet) {
    const box = el("div");
    const tasks = summary.tasks || [];
    const done = tasks.filter((t) => t.result === "Done").length;
    const line = done + " of " + tasks.length + " done" + (summary.closed ? "" : ", the day is open");
    if (!inSheet) add(box, add(el("header", "masthead"), el("p", "dateline", longDay(date)), el("h2", "headline", line)));
    else box.appendChild(el("p", "dateline pad", line));
    if (!tasks.length) box.appendChild(empty("No tasks."));
    for (const t of tasks) {
      const r = el("div", "task");
      add(r, el("div", "due", t.due), el("div", "what", KIND[t.kind] ? KIND[t.kind] + ": " + t.title : t.title), el("span", "result " + t.result, RESULT[t.result] || t.result));
      // the routine reason ("Due today.") says nothing; the others say why this task is here
      const why = [t.reason === "Due today." ? null : t.reason, t.exempt ? "Excuse: " + t.exempt : null].filter(Boolean).join(" · ");
      if (why) r.appendChild(el("div", "why", why));
      if (t.actions && t.actions.length) r.appendChild(el("div", "acts", t.actions.join(" · ")));
      box.appendChild(r);
    }
    for (const q of summary.reflections || []) if (q.answer) add(box, add(el("figure", "caption"), el("blockquote", null, "“" + q.answer + "”"), el("figcaption", null, q.question)));
    return box;
  }

  function ruleSheet(r) {
    openSheet(r.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "dateline", [r.type, r.stage, "level " + r.level + " of " + r.levels].join(" · ")),
          el("p", "meta", [r.value, r.principle].filter(Boolean).join(" › ")), r.reason ? el("p", "lede", r.reason) : null, el("div", "dateline", "Ladder"));
      const lad = el("ol", "ladder");
      (r.ladder || [r.task]).forEach((t, i) => { const li = el("li", i + 1 === r.level ? "now" : null, t); lad.appendChild(li); });
      b.appendChild(add(d, lad));
    });
  }
  function taskSheet(t) {
    openSheet(t.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "dateline", [t.schedule, "due " + t.due, t.opens ? "opens " + t.opens : null, t.proof].filter(Boolean).join(" · ")));
      const lad = el("ol", "ladder"); for (const a of t.actions) lad.appendChild(el("li", null, a));
      add(d, lad);
      if (t.exceptions) add(d, el("div", "dateline", "Exceptions"), el("p", null, t.exceptions));
      b.appendChild(d);
    });
  }
  function principleSheet(p) {
    openSheet(p.title, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "dateline", p.value), el("p", "lede", p.description || ""));
      b.appendChild(d);
      const rules = (profile.rules || []).filter((r) => r.principle === p.title);
      if (rules.length) {
        b.appendChild(el("div", "section", "Rules"));
        const l = el("ul", "rows");
        for (const r of rules) l.appendChild(ruleRow(r));
        b.appendChild(l);
      }
    });
  }
  function punishmentSheet(p) {
    openSheet(p.name, (b) => {
      const d = el("div", "detail");
      add(d, el("p", "dateline", [p.severity, CATEGORY[p.category] || p.category, p.proof, "due " + p.due].join(" · ")));
      if (p.actions.length) { const l = el("ol", "ladder"); for (const a of p.actions) l.appendChild(el("li", null, a)); add(d, l); }
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
    // a form starts in its first field; anything else focuses the sheet itself, for screen readers, without a ring
    setTimeout(() => { const f = body.querySelector("input, select, textarea") || document.querySelector(".sheet"); f.focus({ preventScroll: true }); }, 50);
  }
  function closeSheet() { if (sheetOpen) history.back(); }
  window.addEventListener("popstate", () => { if (sheetOpen) { sheetOpen = false; $("sheet").hidden = true; } });
  $("sheet-close").addEventListener("click", closeSheet);
  $("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetOpen) closeSheet(); });

  // ---- Suggest -------------------------------------------------------------------------------------
  const KINDS = [["rule", "A rule"], ["task", "A task"], ["value", "A value"], ["principle", "A principle"],
                 ["mantra", "A mantra"], ["question", "A question"], ["punishment", "A punishment"]];
  function openMenu() {
    openSheet("Suggest", (b) => {
      const l = el("ul", "rows");
      for (const [kind, label] of KINDS) l.appendChild(row(null, label, null, () => openForm(kind)));
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
      return { title: "Suggest a mantra", fields: [field("Mantra", t)],
               read: () => ({ text: nonBlank(t.value.trim(), "the mantra") }) };
    },
    task() {
      const name = input(80), acts = area(), proof = proofInput(), due = deadlineInput(), opens = timeInput(), sched = scheduleInput(), exc = area();
      return { title: "Suggest a task",
               fields: [field("Name", name), field("Actions", acts, "One per line."), field("Proof", proof),
                        field("Deadline", due), field("Opens at (optional)", opens), field("Frequency", sched), field("Exceptions (optional)", exc)],
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
      const ladderField = el("div", "field"); add(ladderField, el("div", "label", "Ladder"), ladder, more);
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
    form.appendChild(field("Note (optional)", note));
    const err = el("p", "error"); err.setAttribute("role", "alert");
    form.appendChild(err);
    const send = async () => {
      let item;
      try { item = f.read(); } catch (e) { err.textContent = e.message; err.scrollIntoView({ block: "nearest" }); return; }
      const act = $("sheet-action"); act.disabled = true; act.textContent = "Sending…";
      try {
        await call("suggest", { link: link, link_password: password, kind: kind, item: item, note: note.value.trim() });
        closeSheet();
        toast("Sent.");
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
