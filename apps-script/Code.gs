/**
 * U PLEAT 문의함 — 구글 시트 저장/조회용 Apps Script
 *
 * [설치]
 * 1) 새 구글 시트 → 확장 프로그램 → Apps Script → 이 코드 전체 붙여넣기 → 저장
 * 2) 프로젝트 설정(톱니) → 스크립트 속성 → 추가: VIEW_PASSWORD = (문의함 열람 비밀번호)
 * 3) 배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 / 액세스 권한: 모든 사용자 → 배포 → 권한 허용
 * 4) 나온 웹 앱 URL(https://script.google.com/macros/s/…/exec)을 전달
 *
 * - doPost: 홈페이지 문의 폼이 보낸 내용을 '유플리트' / '세이프유' 시트에 한 줄씩 저장
 * - doGet : ?key=비밀번호 가 맞을 때만 두 시트 내용을 JSON으로 돌려줌 (깃 문의함 페이지가 사용)
 * - 비밀번호는 코드가 아니라 스크립트 속성에만 저장됩니다.
 */

const SHEETS = { upleat: "유플리트", safeu: "세이프유" }
const COLUMNS = ["접수일시", "문의 유형", "회사명", "이름", "업무 이메일", "연락처", "부서", "직책", "내용", "개인정보 수집·이용 동의", "접수 페이지", "ID"]
const MAX_LEN = 5000

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}")
    const form = String(body.form || "")
    if (!SHEETS[form]) return json_({ ok: false, error: "unknown form" })
    const f = body.fields || {}
    // 숨은 함정 칸이 채워져 있으면 봇 → 저장하지 않음
    if (body.trap) return json_({ ok: true })
    const now = new Date()
    const id = Utilities.getUuid().slice(0, 8)
    const row = COLUMNS.map((c) => {
      if (c === "접수일시") return now
      if (c === "접수 페이지") return clean_(body.page)
      if (c === "ID") return id
      return clean_(f[c])
    })
    const lock = LockService.getScriptLock()
    lock.waitLock(10000)
    try {
      sheet_(SHEETS[form]).appendRow(row)
    } finally {
      lock.releaseLock()
    }
    return json_({ ok: true, id: id })
  } catch (err) {
    return json_({ ok: false, error: String(err) })
  }
}

function doGet(e) {
  const pw = PropertiesService.getScriptProperties().getProperty("VIEW_PASSWORD")
  const key = (e && e.parameter && e.parameter.key) || ""
  if (!pw || key !== pw) {
    Utilities.sleep(800) // 비밀번호 무작위 대입 늦추기
    return json_({ ok: false, error: "unauthorized" })
  }
  const out = {}
  Object.keys(SHEETS).forEach((k) => {
    const sh = sheet_(SHEETS[k])
    const values = sh.getDataRange().getValues()
    const head = values.shift() || []
    out[k] = values
      .filter((r) => r.join("") !== "")
      .map((r) => {
        const o = {}
        head.forEach((h, i) => (o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]))
        return o
      })
      .reverse() // 최신이 위로
  })
  return json_({ ok: true, data: out })
}

// 저장할 스프레드시트: 시트에서 연 스크립트면 그 시트, 아니면(단독 스크립트) setup이 만든 시트
function ss_() {
  const active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  const props = PropertiesService.getScriptProperties()
  const id = props.getProperty("SHEET_ID")
  if (id) return SpreadsheetApp.openById(id)
  const created = SpreadsheetApp.create("U PLEAT 문의함")
  props.setProperty("SHEET_ID", created.getId())
  return created
}

function sheet_(name) {
  const ss = ss_()
  let sh = ss.getSheetByName(name)
  if (!sh) {
    sh = ss.insertSheet(name)
    sh.appendRow(COLUMNS)
    sh.setFrozenRows(1)
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight("bold")
    sh.getRange("A:A").setNumberFormat("yyyy.mm.dd hh:mm")
  }
  return sh
}

// 글자 수 제한 + 시트 수식 주입 방지(=, +, -, @ 로 시작하면 ' 붙임)
function clean_(v) {
  let s = v == null ? "" : String(v).slice(0, MAX_LEN)
  if (/^[=+\-@]/.test(s)) s = "'" + s
  return s
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}

// 설치 직후 한 번 실행하면 두 시트(유플리트/세이프유)를 미리 만들어 둡니다.
// 실행 로그에 저장되는 스프레드시트 주소가 찍힙니다.
function setup() {
  Object.values(SHEETS).forEach(sheet_)
  const ss = ss_()
  // 빈 기본 시트(시트1/Sheet1) 정리
  ss.getSheets().forEach((sh) => {
    if (!Object.values(SHEETS).includes(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh)
  })
  Logger.log("저장 위치: " + ss.getUrl())
  Logger.log("탭: " + ss.getSheets().map((s) => s.getName()).join(", "))
}
