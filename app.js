/* U PLEAT 문의함 — Web3Forms Submissions API 뷰어
 * - API 키는 브라우저(localStorage/sessionStorage)에만 보관. 저장소·서버에는 아무것도 남지 않음.
 * - 탭: 폼 Access Key(form_id) 기준으로 유플리트 / 세이프유 분리.
 * - 제출 내용은 사용자 입력이므로 화면에 넣을 때 항상 textContent 사용(XSS 방지).
 */
(() => {
  "use strict"

  const API = "https://api.web3forms.com/v1"
  const TABS = [
    { id: "upleat", label: "유플리트", formId: "3fa30200-b6f4-45f1-977a-051c4496a023", match: /유플리트|upleat|main/i },
    { id: "safeu", label: "세이프유", formId: "d8ae0c60-0f48-47dc-90be-93afc86a744e", match: /세이프유|safe\s*u/i },
  ]
  // 화면 목록에서 숨기는 시스템 칸 (상세 하단 '시스템 정보'에만 표시)
  const SYSTEM = new Set(["access_key", "subject", "from_name", "replyto", "sender", "botcheck", "h-captcha-response", "g-recaptcha-response", "redirect"])
  const ORDER = ["문의 유형", "회사명", "이름", "업무 이메일", "연락처", "부서", "직책", "내용", "개인정보 수집·이용 동의"]
  const KEY_STORE = "upleat-inquiry-key"
  const MAX_PAGES = 30 // 100건 × 30 = 최대 3,000건

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

  // ── API ─────────────────────────────────
  async function call(path) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(API + path, { headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" } })
      if (res.status === 429) {
        const wait = Math.min(10, Number(res.headers.get("Retry-After")) || 2)
        await new Promise((r) => setTimeout(r, wait * 1000))
        continue
      }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(json?.error?.message || "HTTP " + res.status)
        err.status = res.status
        throw err
      }
      return json
    }
    throw new Error("요청이 많아 잠시 후 다시 시도해 주세요.")
  }

  async function fetchAll(formId) {
    const out = []
    let cursor = ""
    for (let i = 0; i < MAX_PAGES; i++) {
      const q = "?form_id=" + encodeURIComponent(formId) + "&limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "")
      const r = await call("/submissions" + q)
      out.push(...(r.data || []))
      if (!r.has_more || !r.next_cursor) break
      cursor = r.next_cursor
    }
    return out
  }

  // 탭 ↔ 폼 연결: form_id가 Access Key와 같으면 그걸, 아니면 폼 이름으로
  function resolveTabs(forms) {
    const used = new Set()
    const tabs = TABS.map((t) => {
      let f = forms.find((x) => x.form_id === t.formId) || forms.find((x) => !used.has(x.form_id) && t.match.test(x.form_name || ""))
      if (f) used.add(f.form_id)
      return { ...t, form: f || null }
    })
    // 연결 안 된 폼도 숨기지 않고 탭으로 보여줌
    forms.filter((f) => !used.has(f.form_id)).forEach((f) => tabs.push({ id: "f_" + f.form_id, label: f.form_name || "기타 폼", form: f }))
    return tabs
  }

  async function load() {
    setBusy(true)
    $("meta").textContent = "불러오는 중…"
    try {
      const forms = (await call("/forms")).data || []
      state.forms = resolveTabs(forms)
      const results = await Promise.all(state.forms.map((t) => (t.form ? fetchAll(t.form.form_id) : Promise.resolve([]))))
      state.data = {}
      state.forms.forEach((t, i) => (state.data[t.id] = results[i]))
      state.loadedAt = new Date()
      if (!state.forms.some((t) => t.id === state.tab)) state.tab = state.forms[0]?.id || "upleat"
      renderTabs()
      render()
      return true
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        store.clear()
        showGate(e.status === 403 ? "이 키로는 문의 내역을 읽을 수 없습니다. 읽기 권한(Pro)이 있는 키인지 확인해 주세요." : "API 키가 올바르지 않습니다.")
      } else {
        const m = "불러오지 못했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요. (" + e.message + ")"
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
  const fieldEmail = (s) => field(s, "업무 이메일") || field(s, "email") || field(s, "replyto")

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
      empty.textContent = "연결된 폼을 찾지 못했습니다. Web3Forms 대시보드의 폼 이름이나 Access Key를 확인해 주세요."
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
    const sys = [
      "제목: " + (s.fields?.subject || "-"),
      "접수 페이지: " + (s.site_url || "-"),
      "IP: " + (s.ip_address || "-"),
      "브라우저: " + (s.user_agent || "-"),
      "ID: " + s.id,
    ].join("\n")
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
    if (!k) { $("gate-msg").textContent = "API 키를 입력해 주세요."; return }
    apiKey = k
    $("gate-msg").textContent = ""
    store.set(k, $("remember").checked)
    if (await load()) showApp()
  })
  $("key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("enter").click() })
  $("refresh").addEventListener("click", async () => { if (await load()) toast("최신 내역을 불러왔습니다.") })
  $("csv").addEventListener("click", exportCSV)
  $("logout").addEventListener("click", () => { store.clear(); apiKey = ""; state.data = {}; showGate("키를 지웠습니다.") })
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
