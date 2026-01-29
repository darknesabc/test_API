// ====== 설정 ======
const DEMO_MODE = true; // 지금은 "틀" 단계라 true. 나중에 Apps Script 붙이면 false.
const SESSION_KEY = "parent_session_v1";

// 나중에 Apps Script를 붙일 때 여기만 바꾸면 됨
const API_BASE = ""; // 예: "https://script.google.com/macros/s/XXXX/exec"

// ====== 공통 유틸 ======
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

function onPage(name, fn) {
  if (location.pathname.endsWith(name)) fn();
}

// ====== (데모) 로그인 검증 ======
async function demoLogin(name, last4) {
  // 데모에서는 "입력 형식만" 체크하고 통과시킴
  if (!name || name.trim().length < 1) throw new Error("이름을 입력하세요.");
  if (!/^\d{4}$/.test(last4)) throw new Error("뒤 4자리를 숫자 4자리로 입력하세요.");

  // 실제로는 여기서 서버 토큰/학생ID가 내려올 예정
  return {
    ok: true,
    studentName: name.trim(),
    // studentId: "5-1D30" 같은 값은 나중에 서버에서 받아오는 걸 권장
    studentId: null,
    token: "demo-token"
  };
}

// ====== (실전용) Apps Script 로그인 ======
async function apiLogin(name, last4) {
  const res = await fetch(`${API_BASE}?path=login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, last4 })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "로그인 실패");
  return { ok: true, token: data.token, studentName: name.trim() };
}

// ====== 로그인 페이지 ======
onPage("index.html", () => {
  const form = $("loginForm");
  const msg = $("msg");

  // 이미 로그인 상태면 대시보드로
  if (getSession()) {
    location.href = "dashboard.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";

    const name = $("studentName").value;
    const last4 = $("last4").value;

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
      msg.textContent = err?.message ?? String(err);
    }
  });
});

// ====== 대시보드 페이지 ======
onPage("dashboard.html", () => {
  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return;
  }

  const userLine = $("userLine");
  userLine.textContent = `${session.studentName} 학부모님`;

  $("logoutBtn").addEventListener("click", () => {
    clearSession();
    location.href = "index.html";
  });
});

// ====== (선택) 상세 페이지들 가드용 ======
// attendance.html, grades.html 같은 페이지에도 app.js를 붙이면
// 로그인 안 했을 때 index로 자동 이동하게 만들 수 있음.
["attendance.html", "grades.html"].forEach((p) => {
  onPage(p, () => {
    if (!getSession()) location.href = "index.html";
  });
});
