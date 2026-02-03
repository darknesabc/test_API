/***********************
 * Frontend (GitHub Pages)
 * - 로그인: name + parent4 -> Apps Script login -> sessionStorage 저장
 * - 대시보드: 세션 체크 + 출결 요약 카드 로드
 ***********************/

// ====== 설정 ======
const DEMO_MODE = false; // 실전 사용
const SESSION_KEY = "parent_session_v1";

// ✅ Apps Script Web App URL (여기만 수정하면 됨)
const API_BASE = "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

// ====== 유틸 ======
function $(id) { return document.getElementById(id); }

function setSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function getSession() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

// ====== (데모) 로그인 ======
async function demoLogin(name, parent4) {
  if (!name || name.trim().length < 1) throw new Error("이름을 입력하세요.");
  if (!/^\d{4}$/.test(parent4)) throw new Error("부모4자리는 숫자 4자리로 입력하세요.");

  return {
    ok: true,
    studentName: name.trim(),
    seat: "DEMO-SEAT",
    teacher: "DEMO",
    token: "demo-token"
  };
}

// ====== (실전) Apps Script 로그인 ======
async function apiLogin(name, parent4) {
  const res = await fetch(`${API_BASE}?path=login`, {
    method: "POST",
    // Apps Script CORS 프리플라이트 회피
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, parent4 })
  });

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "로그인 실패");

  return {
    studentName: data.studentName,
    seat: data.seat,
    teacher: data.teacher,
    token: data.token
  };
}

/* =========================================================
   로그인 페이지 로직 (index.html)
========================================================= */
(function initLoginPage(){
  const form = $("loginForm");
  if (!form) return;

  const msg = $("msg");

  // 이미 로그인 상태면 대시보드로
  if (getSession()) {
    location.href = "dashboard.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "";

    const name = $("studentName")?.value ?? "";
    const parent4 = $("last4")?.value ?? "";

    try {
      const result = DEMO_MODE ? await demoLogin(name, parent4) : await apiLogin(name, parent4);

      setSession({
        studentName: result.studentName,
        seat: result.seat ?? null,
        teacher: result.teacher ?? null,
        token: result.token,
        createdAt: Date.now()
      });

      location.href = "dashboard.html";
    } catch (err) {
      if (msg) msg.textContent = err?.message ?? String(err);
      else alert(err?.message ?? String(err));
    }
  });
})();

/* =========================================================
   대시보드 로직 (dashboard.html)
========================================================= */
(function initDashboard(){
  const logoutBtn = $("logoutBtn");
  if (!logoutBtn) return;

  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return;
  }

  // 상단 사용자 표시
  const userLine = $("userLine");
  const extra = [session.seat, session.teacher ? `${session.teacher} 담임` : null].filter(Boolean).join(" · ");
  if (userLine) userLine.textContent = extra ? `${session.studentName} (${extra})` : `${session.studentName} 학부모님`;

  // 로그아웃
  logoutBtn.addEventListener("click", () => {
    clearSession();
    location.href = "index.html";
  });

  // ✅ 출결 요약 로드 (추가)
  loadAttendanceSummary(session);
})();

/* =========================================================
   로그인 필요 페이지 가드 (body[data-needs-login="1"])
========================================================= */
(function guardAnyPrivatePage(){
  const needsLogin = document.body?.dataset?.needsLogin === "1";
  if (!needsLogin) return;

  if (!getSession()) location.href = "index.html";
})();

/* =========================================================
   출결 요약 (대시보드 카드)
   - 이번 주: "오늘(서버 todayIso)"가 속한 주(월~일)
   - 미래 날짜는 제외 (d <= today)
   - 결석 카운트: "스케줄 공란 + 결석(3)"만
========================================================= */
function parseIso_(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function mondayOf_(d) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day);
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function attText_(a) {
  const s = String(a ?? "").trim();
  if (s === "1") return "출석";
  if (s === "3") return "결석";
  return "";
}

// ✅ 결석 카운트 조건: 스케줄 공란 + 결석만
function isCountedAbsence_(schedule, statusText) {
  if (statusText !== "결석") return false;
  return String(schedule ?? "").trim() === "";
}

async function loadAttendanceSummary(session) {
  const loading = $("attLoading");
  const error = $("attError");
  const box = $("attSummary");
  const counts = $("attCounts");
  const recent = $("attRecent");

  // dashboard.html에 카드가 없으면 종료
  if (!loading || !error || !box || !counts || !recent) return;

  try {
    loading.textContent = "불러오는 중...";
    error.textContent = "";
    box.style.display = "none";

    const res = await fetch(`${API_BASE}?path=attendance`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "출결 요약 불러오기 실패");

    const dateIso = data.dateIso || [];
    const datesLabel = data.dates || [];
    const rows = data.rows || [];
    const todayIso = data.todayIso || "";

    if (!todayIso || !dateIso.length || !rows.length) {
      loading.textContent = "";
      counts.textContent = "출결 데이터 없음";
      recent.textContent = "";
      box.style.display = "";
      return;
    }

    const today = parseIso_(todayIso);
    today.setHours(0, 0, 0, 0);

    // 이번 주(오늘이 속한 주)
    const weekStart = mondayOf_(today);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    // 이번 주 + 미래 제외 컬럼 인덱스
    const weekIdx = [];
    dateIso.forEach((iso, i) => {
      if (!iso) return;
      const d = parseIso_(iso);
      d.setHours(0, 0, 0, 0);
      if (d >= weekStart && d <= weekEnd && d <= today) weekIdx.push(i);
    });

    let present = 0;
    let absent = 0;
    const absEvents = []; // { idx, period }

    for (const r of rows) {
      const period = r.period || "";
      const cells = r.cells || [];

      for (const i of weekIdx) {
        const cell = cells[i] || {};
        const sched = String(cell.s ?? "").trim();
        const status = attText_(cell.a);

        if (status === "출석") present++;
        if (isCountedAbsence_(sched, status)) {
          absent++;
          absEvents.push({ idx: i, period });
        }
      }
    }

    // 표시
    loading.textContent = "";
    counts.textContent = `이번 주: 출석 ${present} · 결석 ${absent}`;

    // 최근 결석 1건 (원하면 2건으로 쉽게 변경 가능)
    absEvents.sort((a, b) => b.idx - a.idx);
    const top = absEvents[0];

    if (!top) {
      recent.textContent = "최근 결석: 없음";
    } else {
      const label = String(datesLabel[top.idx] ?? "").replace(/\s+/g, "");
      recent.textContent = `최근 결석: ${label} ${top.period}교시`;
    }

    box.style.display = "";
  } catch (e) {
    loading.textContent = "";
    error.textContent = e?.message ?? String(e);
  }
}
