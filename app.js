/* U PLEAT 문의함 — 구글 시트(Apps Script) 뷰어
 * - 홈페이지 문의 폼이 Apps Script로 보낸 내용을 구글 시트 '유플리트' / '세이프유'에 저장 → 이 페이지가 읽어서 표시.
 * - 열람 비밀번호는 브라우저(localStorage/sessionStorage)에만 보관. 저장소에는 비밀번호·문의 데이터 없음.
 * - 제출 내용은 사용자 입력이므로 화면에 넣을 때 항상 textContent 사용(XSS 방지).
 */
(() => {
  "use strict"

  // Apps Script 웹 앱 주소 (배포 후 받은 /exec URL)
  const SHEET_API = ""
  const TABS = [
    { id: "upleat", label: "유플리트" },
    { id: "safeu", label: "세이프유" },
  ]
  // 화면 목록에서 숨기는 시스템 칸 (상세 하단 '시스템 정보'에만 표시)
  const SYSTEM = new Set(["ID", "접수일시", "접수 페이지"])
  const ORDER = ["문의 유형", "회사명", "이름", "업무 이메일", "연락처", "부서", "직책", "내용", "개인정보 수집·이용 동의"]
  const KEY_STORE = "upleat-inquiry-pw"

  const $ = (id) => document.getElementById(id)
  const el = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  // ── 키 보관 ─────────────────────────────
  const store = {
    get() {
      try { return localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || "" } catch { return "" }
    },
    set(k, remember) {
      try {
        localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE)
        ;(remember ? localStorage : sessionStorage).setItem(KEY_STORE, k)
      } catch {}
    },
    clear() { try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE) } catch {} },
  }

  let apiKey = ""
  const state = { tab: "upleat", forms: [], data: {}, loadedAt: null, query: "", selected: null }

  // ── 데이터 ──────────────────────────────
  async function fetchSheet() {
    if (!SHEET_API) {
      const err = new Error("아직 구글 시트 연결 주소가 설정되지 않았습니다.")
      err.status = 0
      throw err
    }
    const res = await fetch(SHEET_API + "?key=" + encodeURIComponent(apiKey), { method: "GET", redirect: "follow" })
    const json = await res.json().catch(() => ({}))
    if (!json.ok) {
      const err = new Error(json.error || "HTTP " + res.status)
      err.status = json.error === "unauthorized" ? 401 : res.status
      throw err
    }
    return json.data || {}
  }

  // 시트 한 줄 → 화면용 객체
  const toSub = (r, i) => {
    const fields = {}
    Object.keys(r).forEach((k) => { if (!SYSTEM.has(k)) fields[k] = r[k] })
    return { id: String(r["ID"] || i), submitted_at: r["접수일시"], site_url: r["접수 페이지"] || "", fields }
  }

  async function load() {
    setBusy(true)
    $("meta").textContent = "불러오는 중…"
    try {
      const data = await fetchSheet()
      state.forms = TABS.map((t) => ({ ...t, form: true }))
      state.data = {}
      TABS.forEach((t) => (state.data[t.id] = (data[t.id] || []).map(toSub)))
      state.loadedAt = new Date()
      renderTabs()
      render()
      return true
    } catch (e) {
      if (e.status === 401) {
        store.clear()
        apiKey = ""
        showGate("비밀번호가 올바르지 않습니다.")
      } else {
        const m = "불러오지 못했습니다. " + e.message
        $("meta").textContent = m
        if (!$("gate").classList.contains("hidden")) $("gate-msg").textContent = m
      }
      return false
    } finally {
      setBusy(false)
    }
  }

  // ── 렌더 ────────────────────────────────
  const fmtDate = (iso) => {
    const d = new Date(iso)
    if (isNaN(d)) return iso || ""
    const p = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const field = (s, k) => {
    const v = s.fields?.[k]
    return v == null || v === "입력없음" ? "" : String(v)
  }
  const fieldEmail = (s) => field(s, "업무 이메일")

  function filtered() {
    const list = state.data[state.tab] || []
    const q = state.query.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) => Object.values(s.fields || {}).some((v) => String(v).toLowerCase().includes(q)))
  }

  function renderTabs() {
    const box = $("tabs")
    box.textContent = ""
    state.forms.forEach((t) => {
      const b = el("button", "tab", t.label)
      b.type = "button"
      b.setAttribute("role", "tab")
      b.setAttribute("aria-selected", String(t.id === state.tab))
      b.setAttribute("aria-controls", "panel")
      b.tabIndex = t.id === state.tab ? 0 : -1
      b.appendChild(el("span", "n", String((state.data[t.id] || []).length)))
      b.addEventListener("click", () => selectTab(t.id))
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
        const i = state.forms.findIndex((x) => x.id === state.tab)
        const n = state.forms[(i + (e.key === "ArrowRight" ? 1 : -1) + state.forms.length) % state.forms.length]
        selectTab(n.id)
        box.querySelector('[aria-selected="true"]')?.focus()
      })
      box.appendChild(b)
    })
  }

  function selectTab(id) {
    state.tab = id
    renderTabs()
    render()
  }

  function render() {
    const tab = state.forms.find((t) => t.id === state.tab)
    const list = filtered()
    const tbody = $("rows")
    tbody.textContent = ""
    list.forEach((s) => {
      const tr = el("tr", "row")
      tr.tabIndex = 0
      if (state.selected === s.id) tr.classList.add("sel")
      const td = (txt, cls) => { const c = el("td", cls); c.textContent = txt; tr.appendChild(c); return c }
      td(fmtDate(s.submitted_at), "date c-date")
      const t = el("td", "c-type"); const type = field(s, "문의 유형"); if (type) t.appendChild(el("span", "pill", type)); tr.appendChild(t)
      // 모바일 카드에선 회사명+이름을 한 줄(c-who)로, 데스크톱에선 두 칸으로
      const who = td(field(s, "회사명"), "c-who")
      who.dataset.full = [field(s, "회사명"), field(s, "이름")].filter(Boolean).join(" · ")
      td(field(s, "이름"), "c-name")
      td(fieldEmail(s), "hide-m c-mail")
      td(field(s, "연락처"), "hide-m c-tel")
      const c = el("td", "hide-m c-msg"); const m = field(s, "내용"); if (m) c.appendChild(el("div", "clip", m)); tr.appendChild(c)
      if (window.matchMedia("(max-width:720px)").matches) who.textContent = who.dataset.full
      tr.addEventListener("click", () => openDetail(s))
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetail(s) } })
      tbody.appendChild(tr)
    })
    const empty = $("empty")
    if (!tab?.form) {
      empty.textContent = "시트를 찾지 못했습니다."
    } else if (!list.length) {
      empty.textContent = state.query ? "검색 결과가 없습니다." : "아직 접수된 문의가 없습니다."
    }
    empty.classList.toggle("hidden", list.length > 0)
    const total = (state.data[state.tab] || []).length
    $("meta").textContent =
      (state.query ? `검색 ${list.length}건 / ` : "") + `총 ${total}건` + (state.loadedAt ? ` · ${fmtDate(state.loadedAt.toISOString())} 기준` : "")
  }

  // ── 상세 ────────────────────────────────
  let lastFocus = null
  function openDetail(s) {
    state.selected = s.id
    lastFocus = document.activeElement
    $("d-title").textContent = [field(s, "회사명"), field(s, "이름")].filter(Boolean).join(" ") || "문의"
    $("d-sub").textContent = fmtDate(s.submitted_at) + (field(s, "문의 유형") ? " · " + field(s, "문의 유형") : "")
    const body = $("d-body")
    body.textContent = ""
    const keys = Object.keys(s.fields || {}).filter((k) => !SYSTEM.has(k))
    keys.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    keys.forEach((k) => {
      const dl = el("dl", "kv")
      dl.appendChild(el("dt", null, k))
      const dd = el("dd")
      const v = String(s.fields[k] ?? "")
      if (/이메일|email/i.test(k) && /^[^\s@]+@[^\s@]+$/.test(v)) {
        const a = el("a", null, v); a.href = "mailto:" + v; dd.appendChild(a)
      } else if (/연락처|phone|tel/i.test(k) && /^[0-9-+ ]{6,}$/.test(v)) {
        const a = el("a", null, v); a.href = "tel:" + v.replace(/[^0-9+]/g, ""); dd.appendChild(a)
      } else dd.textContent = v
      dl.appendChild(dd)
      body.appendChild(dl)
    })
    const sys = ["접수 페이지: " + (s.site_url || "-"), "ID: " + s.id].join("\n")
    body.appendChild(el("div", "sys", sys))
    $("dim").classList.add("on")
    const d = $("drawer")
    d.classList.add("on")
    d.setAttribute("aria-hidden", "false")
    $("d-close").focus()
    render()
  }
  function closeDetail() {
    state.selected = null
    $("dim").classList.remove("on")
    const d = $("drawer")
    d.classList.remove("on")
    d.setAttribute("aria-hidden", "true")
    render()
    lastFocus?.focus?.()
  }

  // ── CSV ─────────────────────────────────
  function exportCSV() {
    const list = filtered()
    if (!list.length) return toast("내보낼 문의가 없습니다.")
    const keys = []
    list.forEach((s) => Object.keys(s.fields || {}).forEach((k) => { if (!SYSTEM.has(k) && !keys.includes(k)) keys.push(k) }))
    keys.sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
    const esc = (v) => {
      let t = String(v ?? "")
      if (/^[=+\-@]/.test(t)) t = "'" + t // 엑셀 수식 주입 방지
      return '"' + t.replace(/"/g, '""') + '"'
    }
    const head = ["접수일시", ...keys, "접수 페이지"]
    const lines = [head.map(esc).join(",")]
    list.forEach((s) => lines.push([fmtDate(s.submitted_at), ...keys.map((k) => s.fields?.[k] ?? ""), s.site_url || ""].map(esc).join(",")))
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const tab = state.forms.find((t) => t.id === state.tab)
    const d = new Date()
    const name = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}_문의_${tab?.label || "export"}.csv`
    const a = el("a")
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 0)
  }

  // ── 화면 전환 ───────────────────────────
  function showGate(msg) {
    $("app").classList.add("hidden")
    $("gate").classList.remove("hidden")
    $("gate-msg").textContent = msg || ""
    $("key").value = ""
    $("key").focus()
  }
  function showApp() {
    $("gate").classList.add("hidden")
    $("app").classList.remove("hidden")
  }
  function setBusy(on) {
    ;["refresh", "csv", "enter"].forEach((id) => ($(id).disabled = on))
    $("enter").textContent = on ? "불러오는 중…" : "불러오기"
  }
  let tt = 0
  function toast(t) {
    const n = $("toast")
    n.textContent = t
    n.classList.add("on")
    clearTimeout(tt)
    tt = setTimeout(() => n.classList.remove("on"), 2200)
  }

  // ── 이벤트 ──────────────────────────────
  $("enter").addEventListener("click", async () => {
    const k = $("key").value.trim()
    if (!k) { $("gate-msg").textContent = "비밀번호를 입력해 주세요."; return }
    apiKey = k
    $("gate-msg").textContent = ""
    store.set(k, $("remember").checked)
    if (await load()) showApp()
  })
  $("key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("enter").click() })
  $("refresh").addEventListener("click", async () => { if (await load()) toast("최신 내역을 불러왔습니다.") })
  $("csv").addEventListener("click", exportCSV)
  $("logout").addEventListener("click", () => { store.clear(); apiKey = ""; state.data = {}; showGate("로그아웃했습니다.") })
  window.matchMedia("(max-width:720px)").addEventListener("change", () => { if (state.loadedAt) render() })
  $("q").addEventListener("input", (e) => { state.query = e.target.value; render() })
  $("dim").addEventListener("click", closeDetail)
  $("d-close").addEventListener("click", closeDetail)
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("drawer").classList.contains("on")) closeDetail() })

  // ── 시작 ────────────────────────────────
  apiKey = store.get()
  if (apiKey) {
    showApp()
    load().then((ok) => { if (!ok && !apiKey) showGate() })
  } else showGate()
})()
