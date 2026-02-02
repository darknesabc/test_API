// ====== 설정 ======
// ====== 설정 ======
const DEMO_MODE = false;  // 실제 시트 로그인 사용
const SESSION_KEY = "parent_session_v1";

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
async function demoLogin(name, last4) {
  if (!name || name.trim().length < 1) throw new Error("이름을 입력하세요.");
  if (!/^\d{4}$/.test(last4)) throw new Error("뒤 4자리를 숫자 4자리로 입력하세요.");

  return {
    ok: true,
    studentName: name.trim(),
    studentId: null,
    token: "demo-token"
  };
}

// ====== (실전) Apps Script 로그인 ======
async function apiLogin(name, parent4) {
  const res = await fetch(`${API_BASE}?path=login`, {
    method: "POST",
    // Apps Script CORS 프리플라이트 회피
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, parent4 }) // ★ 키 이름: parent4
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

// ====== 로그인 페이지 로직: loginForm이 있으면 실행 ======
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
    const last4 = $("last4")?.value ?? "";

    try {
      const result = DEMO_MODE ? await demoLogin(name, last4) : await apiLogin(name, last4);

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

// ====== 대시보드 로직: logoutBtn이 있으면 실행 ======
(function initDashboard(){
  const logoutBtn = $("logoutBtn");
  if (!logoutBtn) return;

  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return;
  }

  const userLine = $("userLine");
  const extra = [session.seat, session.teacher ? `${session.teacher} 담임` : null].filter(Boolean).join(" · ");
if (userLine) userLine.textContent = extra ? `${session.studentName} (${extra})` : `${session.studentName} 학부모님`;


  logoutBtn.addEventListener("click", () => {
    clearSession();
    location.href = "index.html";
  });
})();

// ====== 상세 페이지 가드(선택): 페이지에 app.js만 붙이면 자동 적용 ======
(function guardAnyPrivatePage(){
  // 이 id가 있으면 "로그인 필요 페이지"라고 판단
  const needsLogin = document.body?.dataset?.needsLogin === "1";
  if (!needsLogin) return;

  if (!getSession()) location.href = "index.html";
})();



