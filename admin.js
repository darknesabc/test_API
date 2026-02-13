/***********************
 * Admin Frontend (GitHub Pages)
 * - admin_login -> adminToken 발급 -> sessionStorage 저장
 * - admin_search -> 리스트 렌더
 * - admin_student_detail -> 상세 렌더
 ***********************/

// ====== 설정 ======
const SESSION_KEY_ADMIN = "admin_session_v1";

// ✅ 너의 Apps Script Web App URL (기존 프론트에서 쓰는 것과 동일하게 맞춰줘)
const API_BASE = "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

// ====== 유틸 ======
function $(id) { return document.getElementById(id); }

function setAdminSession(session) {
  sessionStorage.setItem(SESSION_KEY_ADMIN, JSON.stringify(session));
}
function getAdminSession() {
  const raw = sessionStorage.getItem(SESSION_KEY_ADMIN);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}
function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY_ADMIN);
}

async function apiPost(path, body) {
  const url = `${API_BASE}?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch (_) { return { ok: false, error: "서버 응답 파싱 실패", raw: text }; }
}

function setHint(el, msg, isError = false) {
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger, #d33)" : "var(--muted, #667)";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
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

// ====== 렌더 ======
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

    // ✅ button 대신 div(role=button)로: 드래그/선택/포커스 꼬임 방지
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

    const go = () => loadStudentDetail({ seat: it.seat, studentId: it.studentId, name: it.name });

    // ✅ 드래그/텍스트선택이 클릭을 씹는 현상 방지
    row.addEventListener("pointerdown", (e) => {
      e.preventDefault();
    });

    row.addEventListener("click", (e) => {
      e.preventDefault();
      go();
    });

    // 키보드 접근성(Enter/Space)
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });

    box.appendChild(row);
  });
}

function renderDetail(data) {
  const sub = $("detailSub");
  const body = $("detailBody");

  if (!data || !data.ok) {
    sub.textContent = "상세 조회 실패";
    body.innerHTML = `<div class="empty">${escapeHtml(data?.error || "알 수 없는 오류")}</div>`;
    return;
  }

  const student = data.student || {};
  sub.textContent = `${student.studentName || "-"} · ${student.seat || "-"} · ${student.studentId || "-"}`;

  const s = data.summary || {};
  const att = s.attendance || null;
  const sleep = s.sleep || null;
  const move = s.move || null;
  const edu = s.eduscore || null;
  const grade = s.grade || null;

  // 카드형 섹션 렌더(기존 styles.css 톤 유지)
  body.innerHTML = `
    <div class="grid-2" style="gap:10px;">
      ${renderMiniCard("출결(이번주)", att ? `
        <div>출석: <b>${num(att.present)}</b> · 결석: <b>${num(att.absent)}</b></div>
        <div style="opacity:.85; margin-top:6px;">최근 결석: ${renderRecentAbs(att.recentAbsences)}</div>
      ` : `<div class="empty">데이터 없음</div>`)}
      
      ${renderMiniCard("취침(최근7일)", sleep ? `
        <div>기록일수: <b>${num(sleep.sleepCount7d)}</b></div>
        <div style="margin-top:6px;">총 횟수: <b>${num(sleep.sleepTotal7d)}</b></div>
      ` : `<div class="empty">데이터 없음</div>`)}
      
      ${renderMiniCard("이동(최근)", move ? `
        <div style="word-break:break-word;"><b>${escapeHtml(move.latestText || "-")}</b></div>
        <div style="opacity:.85; margin-top:6px;">${escapeHtml(move.latestDateTime || "")}</div>
      ` : `<div class="empty">데이터 없음</div>`)}
      
      ${renderMiniCard("교육점수(이번달)", edu ? `
        <div>합계: <b>${num(edu.monthTotal)}</b>점</div>
        <div style="opacity:.85; margin-top:6px;">최근: ${escapeHtml(edu.latestText || "-")}</div>
      ` : `<div class="empty">데이터 없음</div>`)}
    </div>

    <div style="margin-top:12px;">
      ${renderMiniCard("성적(최신 자동)", grade ? `
        <div style="opacity:.85;">시험: <b>${escapeHtml(grade.sheetName || grade.exam || "-")}</b></div>
        <div style="margin-top:8px; line-height:1.55;">
          국어: <b>${grade?.kor?.raw_total ?? "-"}</b> / 등급 <b>${escapeHtml(grade?.kor?.grade ?? "-")}</b><br>
          수학: <b>${grade?.math?.raw_total ?? "-"}</b> / 등급 <b>${escapeHtml(grade?.math?.grade ?? "-")}</b><br>
          영어: <b>${grade?.eng?.raw ?? "-"}</b> / 등급 <b>${escapeHtml(grade?.eng?.grade ?? "-")}</b><br>
          한국사: <b>${grade?.hist?.raw ?? "-"}</b> / 등급 <b>${escapeHtml(grade?.hist?.grade ?? "-")}</b>
        </div>
      ` : `<div class="empty">성적 데이터를 불러오지 못했거나, 시트가 없습니다.</div>`)}
    </div>
  `;
}

function renderMiniCard(title, html) {
  return `
    <div class="mini-card">
      <div class="mini-title">${escapeHtml(title)}</div>
      <div class="mini-body">${html}</div>
    </div>
  `;
}

function renderRecentAbs(list) {
  if (!Array.isArray(list) || list.length === 0) return "-";
  return list.map(x => `${escapeHtml(x.md)}(${escapeHtml(x.dow)}) ${escapeHtml(x.period)}교시`).join(", ");
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ====== 동작 ======
async function doLogin() {
  const pw = String($("pwInput").value || "").trim();
  setHint($("loginMsg"), "");

  if (!pw) {
    setHint($("loginMsg"), "비밀번호를 입력하세요.", true);
    return;
  }

  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "로그인 중...";

  const res = await apiPost("admin_login", { password: pw });

  $("loginBtn").disabled = false;
  $("loginBtn").textContent = "로그인";

  if (!res.ok) {
    setHint($("loginMsg"), res.error || "로그인 실패", true);
    return;
  }

  setAdminSession({ adminToken: res.adminToken });
  $("pwInput").value = "";
  setHint($("loginMsg"), "");
  showAdminUI();
}

async function doSearch() {
  const session = getAdminSession();
  if (!session?.adminToken) {
    clearAdminSession();
    showLoginUI();
    return;
  }

  const q = String($("qInput").value || "").trim();
  setHint($("searchMsg"), "");

  if (!q) {
    setHint($("searchMsg"), "검색어를 입력하세요.", true);
    return;
  }

  $("searchBtn").disabled = true;
  $("searchBtn").textContent = "검색 중...";

  const res = await apiPost("admin_search", { adminToken: session.adminToken, q });

  $("searchBtn").disabled = false;
  $("searchBtn").textContent = "검색";

  if (!res.ok) {
    // 세션 만료면 로그인으로
    if (String(res.error || "").includes("만료") || String(res.error || "").includes("관리자")) {
      clearAdminSession();
      showLoginUI();
      setHint($("loginMsg"), "관리자 세션이 만료되었습니다. 다시 로그인하세요.", true);
      return;
    }
    setHint($("searchMsg"), res.error || "검색 실패", true);
    return;
  }

  const items = res.items || [];
  renderResults(items);
  setHint($("searchMsg"), `${items.length}명 찾았습니다.`);

  // ✅ 1명만 나오면 자동으로 상세 로드(원하지 않으면 아래 3줄 주석처리)
  if (items.length === 1) {
    loadStudentDetail({ seat: items[0].seat, studentId: items[0].studentId, name: items[0].name });
  }
}

async function loadStudentDetail({ seat, studentId }) {
  const session = getAdminSession();
  if (!session?.adminToken) {
    clearAdminSession();
    showLoginUI();
    return;
  }

  $("detailSub").textContent = "불러오는 중...";
  $("detailBody").innerHTML = `<div class="empty">잠시만요...</div>`;

  const res = await apiPost("admin_student_detail", {
    adminToken: session.adminToken,
    seat: seat || "",
    studentId: studentId || ""
  });

  if (!res.ok) {
    if (String(res.error || "").includes("만료") || String(res.error || "").includes("관리자")) {
      clearAdminSession();
      showLoginUI();
      setHint($("loginMsg"), "관리자 세션이 만료되었습니다. 다시 로그인하세요.", true);
      return;
    }
  }

  renderDetail(res);
}

function doLogout() {
  clearAdminSession();
  $("qInput").value = "";
  $("resultList").innerHTML = "";
  $("detailBody").innerHTML = "";
  showLoginUI();
}

// ====== styles.css에 없는 클래스 보완(있으면 그대로 사용됨) ======
function injectFallbackCss() {
  const css = `
    .input{padding:12px 12px;border-radius:12px;border:1px solid rgba(0,0,0,.12);background:var(--card,#fff);color:inherit;outline:none;}
    .list{display:flex;flex-direction:column;gap:8px;}
    .list-item{border:1px solid rgba(0,0,0,.08);border-radius:14px;padding:12px;cursor:pointer;text-align:left;}
    .list-item:hover{filter:brightness(1.08);}
    .empty{opacity:.75;padding:10px 0;}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    @media (max-width: 900px){.grid-2{grid-template-columns:1fr;}}
    .mini-card{border:1px solid rgba(0,0,0,.08);border-radius:16px;padding:12px;background:rgba(0,0,0,.02);}
    .mini-title{font-weight:800;margin-bottom:8px;}
    .mini-body{font-size:.98rem;}
    .hint{opacity:.8;font-size:.92rem;}

    /* ✅ 결과 클릭/가독성 강제 보정 */
    #resultList{position:relative;z-index:5;}
    .list-item{
      position:relative;
      z-index:10;
      user-select:none;
      -webkit-user-select:none;
      pointer-events:auto;
      background:rgba(255,255,255,.04);
    }
    .list-item *{
      pointer-events:none; /* ✅ 내부 요소가 클릭을 가로채지 않게 */
      user-select:none;
      -webkit-user-select:none;
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}

// ====== init ======
document.addEventListener("DOMContentLoaded", () => {
  injectFallbackCss();

  $("loginBtn").addEventListener("click", doLogin);
  $("pwInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });

  $("searchBtn").addEventListener("click", doSearch);
  $("qInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  $("logoutBtn").addEventListener("click", doLogout);

  // 세션 있으면 바로 관리자 화면
  const s = getAdminSession();
  if (s?.adminToken) showAdminUI();
  else showLoginUI();
});
