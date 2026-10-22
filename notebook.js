// The notebook: opens panel (b)'s sticky note into a scrollable, editable
// notebook dialog. Words "ink in" as you scroll; edits auto-save locally.
(() => {
  "use strict";

  const KEY = "card:note-v1";
  const teaser = document.getElementById("note-teaser");
  const backdrop = document.getElementById("nb");
  const page = document.getElementById("nb-page");
  const body = document.getElementById("nb-body");
  const editBtn = document.getElementById("nb-edit");
  const restoreBtn = document.getElementById("nb-restore");
  const closeBtn = document.getElementById("nb-close");
  const chip = document.getElementById("nb-save");
  const countEl = document.getElementById("nb-count");
  if (!teaser || !backdrop || !page || !body) return; // markup not present

  const ORIGINAL = body.innerHTML;
  let words = [];
  let litIdx = -1;
  let hlIdx = -1;
  let offs = null; // Float64Array: [top, bottom] per word, relative to body top
  let saveTimer = 0;
  let queued = false;
  let openState = false;

  /* ── content ── */

  function loadContent() {
    let html = null;
    try { html = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
    body.innerHTML = (html && typeof html.html === "string") ? html.html : ORIGINAL;
  }

  // Strip rendering debris before saving/re-splitting (spans from the last
  // open). Replace with ALL children — firstChild alone would silently drop
  // anything typed inside a span.
  function unwrapSpans() {
    for (const s of body.querySelectorAll("span.w")) s.replaceWith(...s.childNodes);
    body.normalize();
  }

  // Wrap every word in a span so scrolling can ink it in.
  function splitWords() {
    unwrapSpans();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        for (let p = n.parentElement; p && p !== body; p = p.parentElement) {
          if (/^(CODE|PRE)$/.test(p.tagName) || p.classList.contains("no-split")) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        return /[^\s]/.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const texts = [];
    for (let n; (n = walker.nextNode());) texts.push(n);
    for (const t of texts) {
      const frag = document.createDocumentFragment();
      for (const part of t.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const s = document.createElement("span");
        s.className = "w";
        s.append(part);
        frag.append(s);
      }
      t.replaceWith(frag);
    }
    words = [...body.querySelectorAll("span.w")];
    if (countEl) countEl.textContent = `${words.length} words`;
  }

  /* ── scroll-linked highlighting ── */

  function measure() {
    const base = body.getBoundingClientRect().top;
    offs = new Float64Array(words.length * 2);
    for (let i = 0; i < words.length; i++) {
      const r = words[i].getBoundingClientRect();
      offs[i * 2] = r.top - base;       // page-scroll-independent
      offs[i * 2 + 1] = r.bottom - base;
    }
  }

  function mark() {
    if (!offs || !words.length) return;
    const base = body.getBoundingClientRect().top;
    const focal = page.getBoundingClientRect().top + Math.min(page.clientHeight * 0.42, 300);
    // last word whose top edge sits above the reading line
    let lo = 0, hi = words.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (base + offs[mid * 2] < focal) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    if (idx > litIdx) for (let i = litIdx + 1; i <= idx; i++) words[i].classList.add("lit");
    else for (let i = litIdx; i > idx; i--) words[i].classList.remove("lit");
    litIdx = idx;
    // the word sitting exactly on the reading line gets the marker sweep
    let h = -1;
    if (idx >= 0) h = (base + offs[idx * 2 + 1] > focal) ? idx : (idx + 1 < words.length ? idx + 1 : -1);
    if (h !== hlIdx) {
      if (hlIdx >= 0 && words[hlIdx]) words[hlIdx].classList.remove("hl");
      if (h >= 0 && words[h]) words[h].classList.add("hl");
      hlIdx = h;
    }
  }

  page.addEventListener("scroll", () => {
    if (queued || !openState) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mark(); });
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (openState) { measure(); mark(); }
  });

  /* ── open / close ── */

  function open() {
    clearTimeout(saveTimer); // don't let an in-flight save capture a half-swapped body
    loadContent();
    splitWords();
    setEdit(false);
    litIdx = -1; hlIdx = -1;
    page.scrollTop = 0;
    openState = true;
    backdrop.classList.add("open");
    backdrop.setAttribute("aria-hidden", "false");
    teaser.setAttribute("aria-expanded", "true");
    setChip("note loaded · auto-save on");
    document.addEventListener("keydown", onKey);
    closeBtn.focus({ preventScroll: true });
    // measure before + after the pop-in transition settles
    measure(); mark();
    setTimeout(() => { if (openState) { measure(); mark(); } }, 420);
  }

  function close() {
    clearTimeout(saveTimer);
    saveNow(); // belt + braces; the debounce may not have fired yet
    setEdit(false);
    openState = false;
    backdrop.classList.remove("open");
    backdrop.setAttribute("aria-hidden", "true");
    teaser.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKey);
    teaser.focus({ preventScroll: true });
  }

  function onKey(e) { if (e.key === "Escape") close(); }

  teaser.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("pointerdown", (e) => { if (e.target === backdrop) close(); });

  /* ── edit mode + persistence ── */

  let editMode = false;
  function setEdit(on) {
    editMode = on;
    body.setAttribute("contenteditable", on ? "true" : "false");
    body.classList.toggle("editing", on);
    editBtn.textContent = on ? "✓ done" : "✎ write";
    if (on) {
      body.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNodeContents(body);
      r.collapse(false); // caret to the very end, like picking up the pen where you left off
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      setChip("write away — it auto-saves");
    }
  }

  function saveNow() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ html: body.innerHTML, t: Date.now() }));
      setChip("saved ✓");
    } catch {
      setChip("save failed — storage full?");
    }
  }

  body.addEventListener("input", () => {
    if (!openState || !editMode) return; // only real typing autosaves, not DOM swaps
    clearTimeout(saveTimer);
    setChip("saving…");
    saveTimer = setTimeout(() => {
      saveNow();
      measure(); mark();
      countEl.textContent = `${words.length} words`;
    }, 700);
  });

  editBtn.addEventListener("click", () => setEdit(!editMode));

  restoreBtn.addEventListener("click", () => {
    if (!confirm("Restore the original note? Your edits will be erased.")) return;
    setEdit(false); // leave the editable context before touching innerHTML
    clearTimeout(saveTimer);
    localStorage.removeItem(KEY);
    loadContent();
    splitWords();
    saveNow();
    measure(); mark();
    setChip("original note restored");
  });

  /* ── chrome ── */

  function setChip(text) { if (chip) chip.textContent = text; }
})();
