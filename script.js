/***********************
 * Frontend (GitHub Pages)
 * - 로그인: name + parent4 -> Apps Script login -> sessionStorage 저장
 * - 대시보드: 세션 체크 + 출결 요약(attendance_summary) + 취침 요약(sleep_summary) + 이동 요약(move_summary)
 * - 이동 상세: move_detail (move.html)
 ***********************/

// ====== 설정 ======
const DEMO_MODE = false; // 실전
const SESSION_KEY = "parent_session_v1";

// ✅ Apps Script Web App URL
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
   로그인 필요 페이지 가드
========================================================= */
(function guardAnyPrivatePage(){
  const needsLogin = document.body?.dataset?.needsLogin === "1";
  if (!needsLogin) return;

  if (!getSession()) location.href = "index.html";
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

  const userLine = $("userLine");
  const extra = [session.seat, session.teacher ? `${session.teacher} 담임` : null].filter(Boolean).join(" · ");
  if (userLine) userLine.textContent = extra ? `${session.studentName} (${extra})` : `${session.studentName} 학부모님`;

  logoutBtn.addEventListener("click", () => {
    clearSession();
    location.href = "index.html";
  });

  // ✅ 요약들 로드
  loadAttendanceSummary(session); // ✅ attendance_summary 호출
  loadSleepSummary(session);      // ✅ sleep_summary 호출
  loadMoveSummary(session);       // ✅ move_summary 호출 (추가)
  loadEduScoreSummary(session);   // ✅ 교육점수 요약 (추가)
})();

/* =========================================================
   출결 요약 (대시보드 카드)
   ✅ Apps Script: attendance_summary 사용
========================================================= */
function fmtMdDow_(md, dow) {
  const m = String(md ?? "").trim();
  const d = String(dow ?? "").trim();
  if (!m) return "";
  return d ? `${m}(${d})` : m;
}

async function loadAttendanceSummary(session) {
  const loading = $("attLoading");
  const error = $("attError");
  const box = $("attSummary");
  const counts = $("attCounts");
  const recent = $("attRecent");

  if (!loading || !error || !box || !counts || !recent) return;

  try {
    loading.textContent = "불러오는 중...";
    error.textContent = "";
    box.style.display = "none";

    const res = await fetch(`${API_BASE}?path=attendance_summary`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "출결 요약 불러오기 실패");

    loading.textContent = "";

    const present = Number(data.present ?? 0);
    const absent = Number(data.absent ?? 0);
    const rec = Array.isArray(data.recentAbsences) ? data.recentAbsences : [];

    // ✅ 줄바꿈은 textContent가 아니라 innerHTML로
    counts.innerHTML = `이번 주 출결 요약<br>출석 ${present}회 · 결석 ${absent}회`;

    if (!rec.length) {
      recent.textContent = "최근 결석: 없음";
    } else {
      const items = rec.map(x => `${fmtMdDow_(x.md, x.dow)} ${x.period}교시`);
      recent.textContent = `최근 결석: ${items.join(", ")}`;
    }

    box.style.display = "";
  } catch (e) {
    loading.textContent = "";
    error.textContent = e?.message ?? String(e);
  }
}

/* =========================================================
   ✅ 취침 요약 (대시보드 카드)
========================================================= */
async function loadSleepSummary(session) {
  const loading = $("sleepLoading");
  const error = $("sleepError");
  const box = $("sleepSummary");
  const line = $("sleepLine");

  if (!loading || !error || !box || !line) return;

  try {
    loading.textContent = "불러오는 중...";
    error.textContent = "";
    box.style.display = "none";

    const res = await fetch(`${API_BASE}?path=sleep_summary`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "취침 요약 불러오기 실패");

    const n = Number(data.sleepCount7d ?? 0);

    loading.textContent = "";
    line.textContent = `최근 7일 취침 ${n}회`;
    box.style.display = "";
  } catch (e) {
    loading.textContent = "";
    error.textContent = e?.message ?? String(e);
  }
}

/* =========================================================
   ✅ 이동 요약 (대시보드 카드)
   - 1줄: "최근 이동"
   - 2줄: "02/02 21:51 · 약국 (복귀 6교시)"
========================================================= */
async function loadMoveSummary(session) {
  const loading = $("moveLoading");
  const error = $("moveError");
  const box = $("moveSummary");
  const line = $("moveLine");
  const recent = $("moveRecent");

  if (!loading || !error || !box || !line || !recent) return;

  try {
    loading.textContent = "불러오는 중...";
    error.textContent = "";
    box.style.display = "none";

    const res = await fetch(`${API_BASE}?path=move_summary`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "이동 요약 불러오기 실패");

    loading.textContent = "";

    // yyyy-MM-dd -> MM/DD (이미 MM/DD면 그대로)
    function prettyMD_(iso) {
      iso = String(iso || "").trim();
      if (!iso) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(5).replace("-", "/");
      return iso;
    }

    const md = prettyMD_(data.latestDate);
    const time = String(data.latestTime || "").trim();
    const reasonLine = String(data.latestText || "-").trim();

    // 1줄: 제목
    line.textContent = "최근 이동";

    // 2줄: 값
    recent.textContent = (md && time)
      ? `${md} ${time} · ${reasonLine}`
      : "-";

    box.style.display = "";
  } catch (e) {
    loading.textContent = "";
    error.textContent = e?.message ?? String(e);
  }
}

/* =========================================================
   ✅ 교육점수 요약 (대시보드 카드)
   - Apps Script: eduscore_summary 사용 (백엔드에 이 path 추가 필요)
   - 1줄: "이번 달 교육점수 N점"
   - 2줄: "최근 교육점수: 02/02 21:51 · 지각 (2점)"
========================================================= */
async function loadEduScoreSummary(session) {
  const loading = $("eduScoreLoading");
  const error   = $("eduScoreError");
  const box     = $("eduScoreSummary");
  const line    = $("eduScoreLine");
  const recent  = $("eduScoreRecent");

  // ✅ 대시보드 HTML에 영역이 아직 없으면 조용히 종료
  if (!loading || !error || !box || !line || !recent) return;

  try {
    loading.textContent = "불러오는 중...";
    error.textContent = "";
    box.style.display = "none";

    const res = await fetch(`${API_BASE}?path=eduscore_summary`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "교육점수 요약 불러오기 실패");

    loading.textContent = "";

    const total = Number(data.monthTotal ?? 0);
    line.textContent = `이번 달 교육점수 ${total}점`;

    function prettyMD_(iso) {
      iso = String(iso || "").trim();
      if (!iso) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(5).replace("-", "/");
      return iso;
    }

    const md = prettyMD_(data.latestDate);
    const time = String(data.latestTime || "").trim();
    const latestText = String(data.latestText || "").trim();

    if (md && time && latestText) {
      // "지각 / 2" -> "지각 (2점)"
      const parts = latestText.split("/").map(s => s.trim());
      const reason = parts[0] || "-";
      const score  = parts[1] ? parts[1].replace(/점?$/, "") : "";

      recent.textContent = score
        ? `최근 교육점수: ${md} ${time} · ${reason} (${score}점)`
        : `최근 교육점수: ${md} ${time} · ${reason}`;
    } else {
      recent.textContent = "최근 교육점수: 없음";
    }

    box.style.display = "";
  } catch (e) {
    loading.textContent = "";
    error.textContent = e?.message ?? String(e);
  }
}

/* =========================================================
   ✅ 이동 상세 페이지 (move.html) - 표 + 상단 라인 + 드롭다운
   - Apps Script: move_detail 사용
   - move.html에 아래 ID들이 있어야 함:
     moveUserLine, moveDaysSelect,
     moveDetailLoading, moveDetailError,
     moveDetailTableWrap, moveDetailTbody
========================================================= */
(async function initMoveDetailPage(){
  const userLine = $("moveUserLine");
  const daysSel  = $("moveDaysSelect");
  const loading  = $("moveDetailLoading");
  const error    = $("moveDetailError");
  const wrap     = $("moveDetailTableWrap");
  const tbody    = $("moveDetailTbody");

  // move.html이 아니면 조용히 종료
  if (!loading || !error || !wrap || !tbody || !daysSel) return;

  const session = getSession();
  if (!session) {
    location.href = "index.html";
    return;
  }

  // ✅ 상단 사용자 라인
  if (userLine) {
    const extra = [session.seat, session.teacher ? `${session.teacher} 담임` : null]
      .filter(Boolean).join(" · ");
    userLine.textContent = extra ? `${session.studentName} (${extra})` : session.studentName;
  }

  daysSel.addEventListener("change", () => {
    const days = Number(daysSel.value || 7);
    fetchAndRender(days);
  });

  // ✅ 최초 로드: 기본 7일
  fetchAndRender(Number(daysSel.value || 7));

  async function fetchAndRender(days) {
    try {
      loading.textContent = "불러오는 중...";
      error.textContent = "";
      wrap.style.display = "none";
      tbody.innerHTML = "";

      const res = await fetch(`${API_BASE}?path=move_detail`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: session.token, days })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "이동 상세 불러오기 실패");

      const items = Array.isArray(data.items) ? data.items : [];
      loading.textContent = "";

      if (!items.length) {
        loading.textContent = "이동 기록이 없습니다.";
        return;
      }

      // ✅ 새 컬럼 매핑: 날짜 / 입력시간 / 사유 / 복귀교시
      tbody.innerHTML = items.map(it => {
        const date = String(it.date || "").trim(); // yyyy-MM-dd 또는 02/02
        const time = String(it.time || "").trim(); // HH:mm
        const reason = escapeHtml_(it.reason || "-");

        // ✅ 복귀교시: 백엔드 표준(returnPeriod) 우선, 없으면 score(호환)
        const returnPeriod = escapeHtml_(it.returnPeriod || it.score || "-");

        // ✅ 화면 날짜 포맷: yyyy-MM-dd -> MM/DD
        let prettyDate = date || "-";
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          prettyDate = date.slice(5).replace("-", "/"); // "02/02"
        }

        // ✅ 입력시간이 비어있을 때 dt에서 보정(혹시 옛 데이터 섞일 때)
        let prettyTime = time;
        if (!prettyTime) {
          const dt = String(it.dt || "").trim(); // "yyyy-MM-dd HH:mm" / "02/02 19:19"
          const m = dt.match(/(\d{2}:\d{2})/);
          if (m) prettyTime = m[1];
        }
        if (!prettyTime) prettyTime = "-";

        return `
          <tr>
            <td style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap;">
              ${escapeHtml_(prettyDate)}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap;">
              ${escapeHtml_(prettyTime)}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); font-weight:700;">
              ${reason}
            </td>
            <td style="padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap;">
              ${returnPeriod}
            </td>
          </tr>
        `;
      }).join("");

      wrap.style.display = "";
    } catch (e) {
      loading.textContent = "";
      error.textContent = e?.message ?? String(e);
    }
  }

  // XSS 방지
  function escapeHtml_(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&lt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }
})();
