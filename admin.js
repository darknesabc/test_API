/***********************
 * Admin Frontend (GitHub Pages)
 *
 * ✅ 변경 핵심
 * - 상세 버튼 클릭 시 학부모 상세 페이지로 이동 ❌
 * - 관리자 페이지 내부에서 admin_*_detail API 호출 후 렌더 ✅
 ***********************/

// ====== 설정 ======
const SESSION_KEY_ADMIN = "admin_session_v1";

// ✅ Apps Script Web App URL (너의 실전 URL 그대로 유지)
const API_BASE =
  "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

// 기본 상세 기간
const DEFAULT_DAYS_SLEEP = 7;
const DEFAULT_DAYS_MOVE = 30;
const DEFAULT_DAYS_EDU = 30;

// ====== 유틸 ======
function $(id) {
  return document.getElementById(id);
}

function setAdminSession(session) {
  sessionStorage.setItem(SESSION_KEY_ADMIN, JSON.stringify(session));
}
function getAdminSession() {
  const raw = sessionStorage.getItem(SESSION_KEY_ADMIN);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}
function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY_ADMIN);
}

async function apiPost(path, body) {
  const url = `${API_BASE}?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return { ok: false, error: "서버 응답 파싱 실패", raw: text };
  }
}

function setHint(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger, #d33)" : "var(--muted, #667)";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ====== UI 제어 ======
function showLoginUI() {
  $("loginCard").style.display = "";
  $("adminArea").style.display = "none";
  $("logoutBtn").style.display = "none";
  $("detailSub").textContent = "학생을 선택하세요.";
  $("detailBody").innerHTML = "";
}

function showAdminUI() {
  $("loginCard").style.display = "none";
  $("adminArea").style.display = "";
  $("logoutBtn").style.display = "";
}

// ====== 상태(현재 선택 학생) ======
let __currentStudentMeta = null; // { seat, studentId, studentName, teacher }

// ====== 렌더: 검색결과 ======
function renderResults(items) {
  const box = $("resultList");
  box.innerHTML = "";

  if (!items || items.length === 0) {
    box.innerHTML = `<div class="empty">검색 결과가 없습니다.</div>`;
    return;
  }

  items.forEach((it) => {
    const seat = escapeHtml(it.seat || "");
    const name = escapeHtml(it.name || "");
    const studentId = escapeHtml(it.studentId || "");
    const teacher = escapeHtml(it.teacher || "");

    const row = document.createElement("div");
    row.className = "list-item";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; align-items:center;">
        <div style="text-align:left;">
          <div style="font-weight:700;">${name || "-"} <span style="font-weight:500; opacity:.75;">(${seat || "-"})</span></div>
          <div style="font-size:.92rem; opacity:.8;">학번: ${studentId || "-"} · 담임: ${teacher || "-"}</div>
        </div>
        <div style="opacity:.65;">›</div>
      </div>
    `;

    const go = () => loadStudentDetail({ seat: it.seat, studentId: it.studentId });

    row.addEventListener("pointerdown", (e) => e.preventDefault());
    row.addEventListener("click", (e) => {
      e.preventDefault();
      go();
    });
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });

    box.appendChild(row);
  });
}

// ====== 렌더: 요약 + 상세버튼 + 상세패널 ======
function renderDetail(data) {
  const sub = $("detailSub");
  const body = $("detailBody");

  __currentStudentMeta = null;

  if (!data || !data.ok) {
    sub.textContent = "상세 조회 실패";
    body.innerHTML = `<div class="empty">${escapeHtml(data?.error || "알 수 없는 오류")}</div>`;
    return;
  }

  const student = data.student || {};
  const seat = String(student.seat || "").trim();
  const studentId = String(student.studentId || "").trim();
  const studentName = String(student.studentName || "").trim();
  const teacher = String(student.teacher || "").trim();

  __currentStudentMeta = { seat, studentId, studentName, teacher };

  sub.textContent = `${studentName || "-"} · ${seat || "-"} · ${studentId || "-"}`;

  const s = data.summary || {};
  const att = s.attendance || null;
  const sleep = s.sleep || null;
  const move = s.move || null;
  const edu = s.eduscore || null;
  const grade = s.grade || null;

  const card = (title, inner) => `
    <div class="mini-card">
      <div class="mini-title">${escapeHtml(title)}</div>
      <div class="mini-body">${inner}</div>
    </div>
  `;

  const attHtml = att && att.ok
    ? `
      <div>이번주 출석: <b>${num(att.present)}</b></div>
      <div>이번주 결석: <b>${num(att.absent)}</b></div>
      <div style="margin-top:6px; opacity:.8;">최근 결석(최대 3)</div>
      <ul style="margin:6px 0 0 18px;">
        ${(att.recentAbsences || []).map(x =>
          `<li>${escapeHtml(x.md)}(${escapeHtml(x.dow)}) ${escapeHtml(x.period)}교시</li>`
        ).join("") || `<li>-</li>`}
      </ul>
    `
    : `<div style="opacity:.8;">요약 없음</div>`;

  const sleepHtml = sleep && sleep.ok
    ? `
      <div>최근 7일 취침일수: <b>${num(sleep.sleepCount7d)}</b></div>
      <div>최근 7일 취침횟수: <b>${num(sleep.sleepTotal7d)}</b></div>
    `
    : `<div style="opacity:.8;">요약 없음</div>`;

  const moveHtml = move && move.ok
    ? `
      <div>최근 이동: <b>${escapeHtml(move.latestText || "-")}</b></div>
      <div style="opacity:.8;">${escapeHtml(move.latestDateTime || "")}</div>
    `
    : `<div style="opacity:.8;">요약 없음</div>`;

  const eduHtml = edu && edu.ok
    ? `
      <div>이번달 누적점수: <b>${num(edu.monthTotal)}</b></div>
      <div>최근 항목: <b>${escapeHtml(edu.latestText || "-")}</b></div>
      <div style="opacity:.8;">${escapeHtml(edu.latestDateTime || "")}</div>
    `
    : `<div style="opacity:.8;">요약 없음</div>`;

  const gradeHtml = grade && grade.ok
    ? `
      <div style="opacity:.85;">(${escapeHtml(grade.sheetName || grade.exam || "")})</div>
      <div>국어: <b>${num(grade.kor?.raw_total)}</b> / 등급 <b>${escapeHtml(grade.kor?.grade)}</b></div>
      <div>수학: <b>${num(grade.math?.raw_total)}</b> / 등급 <b>${escapeHtml(grade.math?.grade)}</b></div>
      <div>영어: <b>${num(grade.eng?.raw)}</b> / 등급 <b>${escapeHtml(grade.eng?.grade)}</b></div>
    `
    : `<div style="opacity:.8;">요약 없음</div>`;

  body.innerHTML = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <button class="btn" id="btnAttDetail">출결 상세</button>
      <button class="btn" id="btnSleepDetail">취침 상세</button>
      <button class="btn" id="btnMoveDetail">이동 상세</button>
      <button class="btn" id="btnEduDetail">교육점수 상세</button>
      <button class="btn" id="btnGradeDetail">성적 상세</button>
    </div>

    <div class="grid-2" style="margin-top:6px;">
      ${card("출결 요약", attHtml)}
      ${card("취침 요약", sleepHtml)}
      ${card("이동 요약", moveHtml)}
      ${card("교육점수 요약", eduHtml)}
      ${card("성적 요약", gradeHtml)}
    </div>

    <div style="margin-top:14px;">
      <div style="font-weight:800; margin-bottom:6px;">상세 결과</div>
      <div id="detailPanel" class="panel">
        <div style="opacity:.8;">상세 버튼을 누르면 여기에 표시됩니다.</div>
      </div>
    </div>
  `;

  // 버튼 바인딩
  $("btnAttDetail").addEventListener("click", () => openAttendanceDetail());
  $("btnSleepDetail").addEventListener("click", () => openSleepDetail());
  $("btnMoveDetail").addEventListener("click", () => openMoveDetail());
  $("btnEduDetail").addEventListener("click", () => openEduDetail());
  $("btnGradeDetail").addEventListener("click", () => openGradeDetail());
}

// ====== 상세 패널 렌더 ======
function renderPanel(html) {
  const p = $("detailPanel");
  if (!p) return;
  p.innerHTML = html;
}

function renderPanelLoading(title) {
  renderPanel(`
    <div style="opacity:.85;">
      <b>${escapeHtml(title || "로딩")}</b> 불러오는 중...
    </div>
  `);
}

function renderPanelError(msg) {
  renderPanel(`<div style="color:var(--danger,#d33);">${escapeHtml(msg || "오류")}</div>`);
}

// ====== 관리자 API 공통 ======
function requireAdminToken() {
  const s = getAdminSession();
  const t = String(s?.adminToken || "").trim();
  if (!t) {
    showLoginUI();
    throw new Error("관리자 세션이 없습니다.");
  }
  return t;
}
function requireStudentMeta() {
  if (!__currentStudentMeta) throw new Error("학생이 선택되지 않았습니다.");
  return __currentStudentMeta;
}

// ====== 상세: 출결 ======
async function openAttendanceDetail() {
  try {
    const adminToken = requireAdminToken();
    const st = requireStudentMeta();

    renderPanelLoading("출결 상세");

    const data = await apiPost("admin_attendance_detail", {
      adminToken,
      studentId: st.studentId,
      seat: st.seat,
    });

    if (!data?.ok) return renderPanelError(data?.error || "출결 상세 실패");

    // data: attendance 상세와 동일 구조 { dates:[{md,dow,iso}], rows:[{period,cells:[{s,a}]}] }
    const dates = data.dates || [];
    const rows = data.rows || [];

    // 헤더 (2줄: M/D, 요일)
    const head1 = dates.map(d => `<th>${escapeHtml(d.md || "")}</th>`).join("");
    const head2 = dates.map(d => `<th style="opacity:.75; font-weight:600;">${escapeHtml(d.dow || "")}</th>`).join("");

    const body = rows.map(r => {
      const tds = (r.cells || []).map(c => {
        const a = String(c.a ?? "").trim();
        const s = String(c.s ?? "").trim();

        // a=1 출석, a=3 결석, 그 외 공백
        let badge = "";
        if (a === "1") badge = `<span class="badge ok">출석</span>`;
        else if (a === "3") badge = `<span class="badge bad">결석</span>`;
        else badge = `<span class="badge">-</span>`;

        const sched = s ? `<div style="opacity:.85; font-size:.85rem; margin-top:2px;">${escapeHtml(s)}</div>` : "";
        return `<td style="text-align:center;">${badge}${sched}</td>`;
      }).join("");

      return `<tr><th style="text-align:center; min-width:64px;">${escapeHtml(r.period || "-")}</th>${tds}</tr>`;
    }).join("");

    renderPanel(`
      <div style="opacity:.85; margin-bottom:8px;">
        <b>${escapeHtml(st.studentName || "")}</b> (${escapeHtml(st.seat || "")}) · 출결 상세
      </div>

      <div style="overflow:auto; border:1px solid rgba(0,0,0,.08); border-radius:12px;">
        <table class="table" style="border-collapse:separate; border-spacing:0; min-width:700px;">
          <thead>
            <tr><th rowspan="2" style="position:sticky; left:0; background:var(--card,#fff); z-index:2;">교시</th>${head1}</tr>
            <tr>${head2}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${dates.length + 1}" style="text-align:center; opacity:.8;">데이터 없음</td></tr>`}</tbody>
        </table>
      </div>
    `);
  } catch (e) {
    renderPanelError(e.message || "출결 상세 오류");
  }
}

// ====== 상세: 취침 ======
async function openSleepDetail() {
  try {
    const adminToken = requireAdminToken();
    const st = requireStudentMeta();

    renderPanelLoading("취침 상세");

    const data = await apiPost("admin_sleep_detail", {
      adminToken,
      studentId: st.studentId,
      seat: st.seat,
      days: DEFAULT_DAYS_SLEEP,
    });

    if (!data?.ok) return renderPanelError(data?.error || "취침 상세 실패");

    // data.groups: [{dateIso,total,details:[{period,reason,count}]}]
    const groups = data.groups || [];

    const html = groups.map(g => {
      const details = (g.details || []).map(d => `
        <div class="rowline">
          <div><b>${escapeHtml(d.period || "-")}</b>교시</div>
          <div style="opacity:.85;">${escapeHtml(d.reason || "취침")}</div>
          <div style="text-align:right;"><b>${num(d.count)}</b></div>
        </div>
      `).join("");

      return `
        <div class="block">
          <div class="block-head">
            <div><b>${escapeHtml(g.dateIso || "")}</b></div>
            <div style="opacity:.85;">합계 <b>${num(g.total)}</b></div>
          </div>
          <div class="block-body">
            ${details || `<div style="opacity:.8;">-</div>`}
          </div>
        </div>
      `;
    }).join("");

    renderPanel(`
      <div style="opacity:.85; margin-bottom:8px;">
        <b>${escapeHtml(st.studentName || "")}</b> (${escapeHtml(st.seat || "")}) · 취침 상세 (최근 ${DEFAULT_DAYS_SLEEP}일)
      </div>
      ${html || `<div style="opacity:.8;">데이터 없음</div>`}
    `);
  } catch (e) {
    renderPanelError(e.message || "취침 상세 오류");
  }
}

// ====== 상세: 이동 ======
async function openMoveDetail() {
  try {
    const adminToken = requireAdminToken();
    const st = requireStudentMeta();

    renderPanelLoading("이동 상세");

    const data = await apiPost("admin_move_detail", {
      adminToken,
      studentId: st.studentId,
      seat: st.seat,
      days: DEFAULT_DAYS_MOVE,
    });

    if (!data?.ok) return renderPanelError(data?.error || "이동 상세 실패");

    const items = data.items || [];

    const rows = items.map(x => `
      <tr>
        <td>${escapeHtml(x.date || "")}</td>
        <td>${escapeHtml(x.time || "")}</td>
        <td>${escapeHtml(x.reason || "")}</td>
        <td style="text-align:center;">${escapeHtml(x.returnPeriod || "")}</td>
      </tr>
    `).join("");

    renderPanel(`
      <div style="opacity:.85; margin-bottom:8px;">
        <b>${escapeHtml(st.studentName || "")}</b> (${escapeHtml(st.seat || "")}) · 이동 상세 (최근 ${DEFAULT_DAYS_MOVE}일)
      </div>

      <div style="overflow:auto; border:1px solid rgba(0,0,0,.08); border-radius:12px;">
        <table class="table" style="min-width:650px;">
          <thead>
            <tr>
              <th>날짜</th>
              <th>시간</th>
              <th>사유</th>
              <th style="text-align:center;">복귀교시</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="4" style="text-align:center; opacity:.8;">데이터 없음</td></tr>`}
          </tbody>
        </table>
      </div>
    `);
  } catch (e) {
    renderPanelError(e.message || "이동 상세 오류");
  }
}

// ====== 상세: 교육점수 ======
async function openEduDetail() {
  try {
    const adminToken = requireAdminToken();
    const st = requireStudentMeta();

    renderPanelLoading("교육점수 상세");

    const data = await apiPost("admin_eduscore_detail", {
      adminToken,
      studentId: st.studentId,
      seat: st.seat,
      days: DEFAULT_DAYS_EDU,
    });

    if (!data?.ok) return renderPanelError(data?.error || "교육점수 상세 실패");

    const items = data.items || [];

    const rows = items.map(x => `
      <tr>
        <td>${escapeHtml(x.date || "")}</td>
        <td>${escapeHtml(x.time || "")}</td>
        <td>${escapeHtml(x.reason || "")}</td>
        <td style="text-align:right;"><b>${num(x.score)}</b></td>
      </tr>
    `).join("");

    renderPanel(`
      <div style="opacity:.85; margin-bottom:8px;">
        <b>${escapeHtml(st.studentName || "")}</b> (${escapeHtml(st.seat || "")}) · 교육점수 상세 (최근 ${DEFAULT_DAYS_EDU}일)
      </div>

      <div style="overflow:auto; border:1px solid rgba(0,0,0,.08); border-radius:12px;">
        <table class="table" style="min-width:650px;">
          <thead>
            <tr>
              <th>날짜</th>
              <th>시간</th>
              <th>사유</th>
              <th style="text-align:right;">점수</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="4" style="text-align:center; opacity:.8;">데이터 없음</td></tr>`}
          </tbody>
        </table>
      </div>
    `);
  } catch (e) {
    renderPanelError(e.message || "교육점수 상세 오류");
  }
}

// ====== 상세: 성적 ======
async function openGradeDetail() {
  try {
    const adminToken = requireAdminToken();
    const st = requireStudentMeta();

    renderPanelLoading("성적 상세");

    // 시험 목록 가져와서 최신 exam 선택
    const ex = await apiPost("admin_grade_exams", { adminToken });
    if (!ex?.ok) return renderPanelError(ex?.error || "시험 목록 불러오기 실패");

    const items = ex.items || [];
    const latestExam = items.length ? String(items[items.length - 1].exam || "").trim() : "";

    const data = await apiPost("admin_grade_detail", {
      adminToken,
      studentId: st.studentId,
      seat: st.seat,
      exam: latestExam, // 없으면 백엔드가 자동으로 최신 선택하도록 되어있음
    });

    if (!data?.ok) return renderPanelError(data?.error || "성적 상세 실패");

    const sheetName = data.sheetName || data.exam || "";
    const student = data.student || {};
    const sub = data.subjects || {};

    const kv = (k, v) => `
      <div class="kv">
        <div class="k">${escapeHtml(k)}</div>
        <div class="v">${escapeHtml(v)}</div>
      </div>
    `;

    const scoreLine = (title, obj, type) => {
      if (!obj) return `<div class="subj"><b>${escapeHtml(title)}</b>: -</div>`;

      if (type === "kor" || type === "math") {
        return `
          <div class="subj">
            <div style="font-weight:800;">${escapeHtml(title)} <span style="opacity:.8;">(${escapeHtml(obj.choice || "-")})</span></div>
            <div style="opacity:.9;">원점수: <b>${num(obj.raw_total)}</b> · 표준: <b>${num(obj.std)}</b> · 백분위: <b>${num(obj.pct)}</b> · 등급: <b>${escapeHtml(obj.grade)}</b></div>
          </div>
        `;
      }

      if (type === "simple") {
        return `
          <div class="subj">
            <div style="font-weight:800;">${escapeHtml(title)}</div>
            <div style="opacity:.9;">원점수: <b>${num(obj.raw)}</b> · 등급: <b>${escapeHtml(obj.grade)}</b></div>
          </div>
        `;
      }

      if (type === "tam") {
        return `
          <div class="subj">
            <div style="font-weight:800;">${escapeHtml(title)} <span style="opacity:.8;">(${escapeHtml(obj.name || "-")})</span></div>
            <div style="opacity:.9;">원점수: <b>${num(obj.raw)}</b></div>
          </div>
        `;
      }

      return `<div class="subj"><b>${escapeHtml(title)}</b>: -</div>`;
    };

    renderPanel(`
      <div style="opacity:.85; margin-bottom:8px;">
        <b>${escapeHtml(st.studentName || "")}</b> (${escapeHtml(st.seat || "")}) · 성적 상세
        <span style="opacity:.8;">(${escapeHtml(sheetName)})</span>
      </div>

      <div class="panelbox">
        ${kv("학교", `${student.schoolName || ""} (${student.schoolCode || ""})`)}
        ${kv("학번", student.studentId || "")}
        ${kv("반/번호", `${student.classNo || ""}반 ${student.number || ""}번`)}
        ${kv("응시지역", student.examArea || "")}
      </div>

      <div style="margin-top:10px;">
        ${scoreLine("국어", sub.kor, "kor")}
        ${scoreLine("수학", sub.math, "math")}
        ${scoreLine("영어", sub.eng, "simple")}
        ${scoreLine("한국사", sub.hist, "simple")}
        ${scoreLine("탐구1", sub.tam1, "tam")}
        ${scoreLine("탐구2", sub.tam2, "tam")}
      </div>

      <div style="opacity:.75; margin-top:10px; font-size:.92rem;">
        ※ 기대값(예상 표준/백분위/등급)이 필요하면 백엔드가 이미 내려주고 있으니, 원하면 표시도 추가해줄게.
      </div>
    `);
  } catch (e) {
    renderPanelError(e.message || "성적 상세 오류");
  }
}

// ====== 로드: 학생 요약(기존 admin_student_detail 사용) ======
async function loadStudentDetail({ seat, studentId }) {
  const adminToken = requireAdminToken();

  $("detailSub").textContent = "불러오는 중...";
  $("detailBody").innerHTML = "";

  const data = await apiPost("admin_student_detail", {
    adminToken,
    seat: seat || "",
    studentId: studentId || "",
  });

  renderDetail(data);
}

// ====== 검색 ======
async function doSearch() {
  try {
    const adminToken = requireAdminToken();
    const q = String($("qInput").value || "").trim();
    if (!q) {
      setHint($("searchMsg"), "검색어를 입력하세요.", true);
      renderResults([]);
      return;
    }

    setHint($("searchMsg"), "검색 중...");
    const res = await apiPost("admin_search", { adminToken, q });

    if (!res?.ok) {
      setHint($("searchMsg"), res?.error || "검색 실패", true);
      renderResults([]);
      return;
    }

    setHint($("searchMsg"), `결과 ${res.items?.length || 0}건`);
    renderResults(res.items || []);
  } catch (e) {
    setHint($("searchMsg"), e.message || "검색 오류", true);
  }
}

// ====== 로그인 ======
async function doAdminLogin() {
  const pw = String($("pwInput").value || "").trim();
  if (!pw) return setHint($("loginMsg"), "비밀번호를 입력하세요.", true);

  setHint($("loginMsg"), "로그인 중...");
  const res = await apiPost("admin_login", { password: pw });

  if (!res?.ok) {
    setHint($("loginMsg"), res?.error || "로그인 실패", true);
    return;
  }

  setAdminSession({ adminToken: res.adminToken });
  setHint($("loginMsg"), "");
  showAdminUI();
}

// ====== 초기화 ======
function bindEvents() {
  $("loginBtn").addEventListener("click", doAdminLogin);
  $("pwInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doAdminLogin();
  });

  $("searchBtn").addEventListener("click", doSearch);
  $("qInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  $("logoutBtn").addEventListener("click", () => {
    clearAdminSession();
    showLoginUI();
    setHint($("loginMsg"), "로그아웃되었습니다.");
  });
}

function boot() {
  bindEvents();

  const s = getAdminSession();
  if (s?.adminToken) {
    showAdminUI();
  } else {
    showLoginUI();
  }
}

boot();

/***********************
 * ✅ admin 페이지 전용 간단 CSS 클래스가 styles.css에 없을 수도 있어서
 *    최소한의 스타일을 JS에서 추가(없어도 동작은 함)
 ***********************/
(function injectTinyStyles() {
  const css = `
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  @media (max-width: 920px){ .grid-2{ grid-template-columns:1fr; } }

  .list { display:flex; flex-direction:column; gap:10px; }
  .list-item { padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; background:var(--card,#fff); cursor:pointer; }
  .list-item:hover { box-shadow:0 6px 18px rgba(0,0,0,.06); }

  .empty { padding:12px; opacity:.8; }

  .mini-card { padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; background:var(--card,#fff); }
  .mini-title { font-weight:800; margin-bottom:6px; }
  .mini-body { opacity:.95; }

  .panel { padding:12px 14px; border:1px solid rgba(0,0,0,.08); border-radius:14px; background:rgba(0,0,0,.02); }

  .badge { display:inline-block; padding:4px 8px; border-radius:999px; font-size:.82rem; border:1px solid rgba(0,0,0,.12); background:#fff; }
  .badge.ok { border-color: rgba(0,128,0,.22); }
  .badge.bad { border-color: rgba(200,0,0,.22); }

  .table { width:100%; }
  .table th,.table td { padding:10px 8px; border-bottom:1px solid rgba(0,0,0,.06); }

  .block { border:1px solid rgba(0,0,0,.08); border-radius:14px; background:var(--card,#fff); margin-bottom:10px; overflow:hidden; }
  .block-head { display:flex; justify-content:space-between; padding:10px 12px; background:rgba(0,0,0,.02); }
  .block-body { padding:8px 12px; display:flex; flex-direction:column; gap:6px; }
  .rowline { display:grid; grid-template-columns: 80px 1fr 60px; gap:10px; align-items:center; padding:6px 0; border-bottom:1px dashed rgba(0,0,0,.08); }
  .rowline:last-child { border-bottom:none; }

  .panelbox { display:grid; grid-template-columns:1fr 1fr; gap:10px; border:1px solid rgba(0,0,0,.08); background:var(--card,#fff); border-radius:14px; padding:12px; }
  @media (max-width: 720px){ .panelbox{ grid-template-columns:1fr; } }
  .kv { display:flex; justify-content:space-between; gap:10px; }
  .kv .k{ opacity:.75; }
  .kv .v{ font-weight:700; text-align:right; }

  .subj { padding:10px 12px; border:1px solid rgba(0,0,0,.08); border-radius:14px; background:var(--card,#fff); margin-bottom:10px; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
})();
