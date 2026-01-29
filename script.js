// ====== 설정 ======
const DEMO_MODE = true;          // 지금은 데모 로그인
const SESSION_KEY = "parent_session_v1";

// 나중에 Apps Script 붙일 때만 사용
const API_BASE = ""; // 예: "https://script.google.com/macros/s/XXXX/exec"

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
async function apiLogin(name, last4) {
  const res = await fetch(`${API_BASE}?path=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, last4 })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "로그인 실패");
  return { ok: true, token: data.token, studentName: name.trim(), studentId: data.studentId ?? null };
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
        studentId: result.studentId ?? null,
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
  if (userLine) userLine.textContent = `${session.studentName} 학부모님`;

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
