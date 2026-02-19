/***********************
 * Frontend (GitHub Pages)
 * - 로그인: name + parent4 -> Apps Script login -> sessionStorage 저장
 * - 대시보드: 세션 체크 + 출결/취침/이동/교육점수 요약 및 공지 슬라이드
 * - ✅ 추가: 비밀번호 변경 (update_password) 팝업 및 통신 로직
 ***********************/

// ====== 설정 ======
const DEMO_MODE = false; // 실전 모드
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

// ✅ 안전 유틸
function safeNum_(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function safeText_(v, fallback = "-") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

/* =========================================================
   ✅ 비밀번호 변경 팝업 제어 (신규 통합)
========================================================= */
function openPwModal() {
  const modal = $("pwModal");
  if (!modal) return;
  modal.style.display = "";
  $("pwMsg").textContent = "";
  $("newPwInput").value = "";
  document.body.style.overflow = "hidden"; // 배경 스크롤 방지
}

function closePwModal() {
  const modal = $("pwModal");
  if (!modal) return;
  modal.style.display = "none";
  document.body.style.overflow = "";
}

// 비밀번호 변경 초기화 로직
(function initPwChangeLogic() {
  document.addEventListener("DOMContentLoaded", () => {
    const changeBtn = $("pwChangeBtn");
    const submitBtn = $("pwSubmitBtn");
    if (!changeBtn || !submitBtn) return;

    changeBtn.onclick = openPwModal;

    submitBtn.onclick = async () => {
      const newPw = $("newPwInput").value.trim();
      const msg = $("pwMsg");
      const session = getSession();

      if (!/^\d{4,10}$/.test(newPw)) {
        msg.style.color = "#ff6b6b";
        msg.textContent = "숫자 4~10자리로 입력하세요.";
        return;
      }

      submitBtn.disabled = true;
      msg.style.color = "var(--muted)";
      msg.textContent = "변경 처리 중...";

      try {
        const res = await fetch(`${API_BASE}?path=update_password`, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ token: session.token, newPw: newPw })
        });
        const data = await res.json();

        if (data.ok) {
          alert("비밀번호가 성공적으로 변경되었습니다. 다시 로그인해 주세요.");
          clearSession();
          location.href = "index.html";
        } else {
          msg.style.color = "#ff6b6b";
          msg.textContent = data.error || "변경 실패";
        }
      } catch (e) {
        msg.style.color = "#ff6b6b";
        msg.textContent = "네트워크 오류가 발생했습니다.";
      } finally {
        submitBtn.disabled = false;
      }
    };
  });
})();

/* =========================================================
   ✅ 선택과목 축약 표시(학부모용 성적 표)
========================================================= */
const __CHOICE_ABBR_ALIASES = {
  "언매": ["언매", "언어와매체", "언어와 매체"],
  "화작": ["화작", "화법과작문", "화법과 작문"],
  "미적": ["미적", "미적분"],
  "확통": ["확통", "확률과통계", "확률과 통계"],
  "기하": ["기하"],
  "생윤": ["생윤", "생활과윤리", "생활과 윤리"],
  "윤사": ["윤사", "윤리와사상", "윤리와 사상"],
  "한지": ["한지", "한국지리", "한국 지리"],
  "세지": ["세지", "세계지리", "세계 지리"],
  "동사": ["동사", "동아시아사", "동아시아 사"],
  "세사": ["세사", "세계사", "세계 사"],
  "경제": ["경제"],
  "정법": ["정법", "정치와법", "정치와 법"],
  "사문": ["사문", "사회문화", "사회 문화"],
  "물1": ["물1", "물I", "물Ⅰ", "물리학1", "물리학I", "물리학Ⅰ"],
  "물2": ["물2", "물II", "물Ⅱ", "물리학2", "물리학II", "물리학Ⅱ"],
  "화1": ["화1", "화I", "화Ⅰ", "화학1", "화학I", "화학Ⅰ"],
  "화2": ["화2", "화II", "화Ⅱ", "화학2", "화학II", "화학Ⅱ"],
  "생1": ["생1", "생I", "생Ⅰ", "생명과학1", "생명과학I", "생명과학Ⅰ"],
  "생2": ["생2", "생II", "생Ⅱ", "생명과학2", "생명과학II", "생명과학Ⅱ"],
  "지1": ["지1", "지I", "지Ⅰ", "지구과학1", "지구과학I", "지구과학Ⅰ"],
  "지2": ["지2", "지II", "지Ⅱ", "지구과학2", "지구과학II", "지구과학Ⅱ"],
};

const __CHOICE_ABBR_LOOKUP = (() => {
  const map = new Map();
  const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "").replace(/[·ㆍ]/g, "");
  for (const [abbr, aliases] of Object.entries(__CHOICE_ABBR_ALIASES)) {
    for (const a of aliases) map.set(norm(a), abbr);
  }
  return { map, norm };
})();

function shortenChoiceName_(name) {
  const raw = String(name ?? "").trim();
  if (!raw || raw === "-") return "-";
  const key = __CHOICE_ABBR_LOOKUP.norm(raw);
  return __CHOICE_ABBR_LOOKUP.map.get(key) || raw;
}

/* =========================================================
   ✅ 공지 상태 및 설정
========================================================= */
var __noticeItems = [];
var __noticeIndex = 0;
var __noticeTimer = null;
var __NOTICE_AUTOPLAY_MS = 6000;
var __noticeBound = false;
var __noticeGlobalBound = false;
var __noticeModalOpen = false;
var __noticeSuppressClickUntil = 0;
var __noticeModalSwipeBound = false;

/* =========================================================
   ✅ UI 보정 (select UI 깨짐 방지)
========================================================= */
function fixSelectUi_() {
  const sel = $("gradeExamSelect");
  if (!sel) return;
  sel.classList.add("select-ghost");
  sel.classList.remove("btn", "btn-ghost", "btn-mini");
  sel.style.padding = "";
}

/* =========================================================
   ====== 로그인 로직 ======
========================================================= */
async function demoLogin(name, parent4) {
  if (!name || name.trim().length < 1) throw new Error("이름을 입력하세요.");
  return { studentName: name.trim(), seat: "DEMO-SEAT", teacher: "DEMO", token: "demo-token", studentId: "DEMO-ID" };
}

async function apiLogin(name, parent4) {
  const res = await fetch(`${API_BASE}?path=login`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, parent4 })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "로그인 실패");
  return data;
}

(function initLoginPage(){
  const form = $("loginForm");
  if (!form) return;
  const msg = $("msg");
  if (getSession()) { location.href = "dashboard.html"; return; }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (msg) msg.textContent = "";
    const name = $("studentName")?.value ?? "";
    const parent4 = $("last4")?.value ?? "";
    try {
      const result = DEMO_MODE ? await demoLogin(name, parent4) : await apiLogin(name, parent4);
      setSession({ ...result, createdAt: Date.now() });
      location.href = "dashboard.html";
    } catch (err) {
      if (msg) msg.textContent = err.message;
    }
  });
})();

/* =========================================================
   대시보드 초기화 및 데이터 로드
========================================================= */
(function initDashboard(){
  const logoutBtn = $("logoutBtn");
  if (!logoutBtn) return;
  const session = getSession();
  if (!session) { location.href = "index.html"; return; }

  fixSelectUi_();
  const userLine = $("userLine");
  const extra = [session.seat, session.teacher ? `${session.teacher} 담임` : null].filter(Boolean).join(" · ");
  if (userLine) userLine.textContent = extra ? `${session.studentName} (${extra})` : `${session.studentName} 학부모님`;

  logoutBtn.addEventListener("click", () => {
    clearSession();
    location.href = "index.html";
  });

  loadAttendanceSummary(session);
  loadSleepSummary(session);
  loadMoveSummary(session);
  loadEduScoreSummary(session);
  loadGradeSummary(session);
  loadNoticeList(session);
})();

/* =========================================================
   각 카드별 데이터 로더 (전체 유지)
========================================================= */
async function loadAttendanceSummary(session) {
  const loading = $("attLoading"), box = $("attSummary"), counts = $("attCounts"), recent = $("attRecent");
  if (!loading || !box) return;
  try {
    const res = await fetch(`${API_BASE}?path=attendance_summary`, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();
    if (!data.ok) throw new Error();
    counts.innerHTML = `이번 주 출결 요약<br>출석 ${data.present ?? 0}회 · 결석 ${data.absent ?? 0}회`;
    const rec = data.recentAbsences || [];
    recent.textContent = rec.length ? `최근 결석: ${rec.map(x=>`${x.md}(${x.dow}) ${x.period}교시`).join(", ")}` : "최근 결석: 없음";
    loading.style.display = "none"; box.style.display = "";
  } catch (e) { loading.textContent = "불러오기 실패"; }
}

async function loadSleepSummary(session) {
  const loading = $("sleepLoading"), box = $("sleepSummary"), line = $("sleepLine");
  if (!loading || !box) return;
  try {
    const res = await fetch(`${API_BASE}?path=sleep_summary`, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();
    line.textContent = `최근 7일 취침 ${data.sleepTotal7d || data.sleepCount7d || 0}회`;
    loading.style.display = "none"; box.style.display = "";
  } catch (e) { loading.textContent = "오류"; }
}

async function loadMoveSummary(session) {
  const loading = $("moveLoading"), box = $("moveSummary"), line = $("moveLine"), recent = $("moveRecent");
  if (!loading || !box) return;
  try {
    const res = await fetch(`${API_BASE}?path=move_summary`, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();
    const md = data.latestDate ? data.latestDate.slice(5).replace("-","/") : "";
    line.textContent = "최근 이동";
    recent.textContent = md ? `${md} ${data.latestTime || ""} · ${data.latestText || "-"}` : "-";
    loading.style.display = "none"; box.style.display = "";
  } catch (e) { loading.textContent = "오류"; }
}

async function loadEduScoreSummary(session) {
  const loading = $("eduScoreLoading"), box = $("eduScoreSummary"), line = $("eduScoreLine"), recent = $("eduScoreRecent");
  if (!loading || !box) return;
  try {
    const res = await fetch(`${API_BASE}?path=eduscore_summary`, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();
    line.textContent = `이번 달 교육점수 ${data.monthTotal ?? 0}점`;
    const md = data.latestDate ? data.latestDate.slice(5).replace("-","/") : "";
    recent.textContent = md ? `최근: ${md} · ${data.latestText || "-"}` : "기록 없음";
    loading.style.display = "none"; box.style.display = "";
  } catch (e) { loading.textContent = "오류"; }
}

/* =========================================================
   성적 표 렌더링 (전체 유지)
========================================================= */
async function loadGradeSummary(session) {
  const sel = $("gradeExamSelect"), wrap = $("gradeTableWrap"), tbody = $("gradeTbody");
  if (!sel || !wrap) return;
  sel.onchange = () => fetchAndRender();
  fetchAndRender();

  async function fetchAndRender() {
    try {
      tbody.innerHTML = "";
      const res = await fetch(`${API_BASE}?path=grade_summary`, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: session.token, exam: sel.value || "mar" })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      const rows = buildGradeTableRows_(data);
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06);">${r.label}</td>
          <td>${r.kor}</td><td>${r.math}</td><td>${r.eng}</td><td>${r.hist}</td><td>${r.tam1}</td><td>${r.tam2}</td>
        </tr>`).join("");
      wrap.style.display = "";
    } catch (e) { wrap.style.display = "none"; }
  }
}

function buildGradeTableRows_(data) {
  const k = data.kor || {}, m = data.math || {}, e = data.eng || {}, h = data.hist || {}, t1 = data.tam1 || {}, t2 = data.tam2 || {};
  const f = (v) => v ? String(v) : "-";
  return [
    { label: "선택과목", kor: shortenChoiceName_(f(k.choice)), math: shortenChoiceName_(f(m.choice)), eng: "-", hist: "-", tam1: shortenChoiceName_(f(t1.name)), tam2: shortenChoiceName_(f(t2.name)) },
    { label: "원점수", kor: f(k.raw_total), math: f(m.raw_total), eng: f(e.raw), hist: f(h.raw), tam1: f(t1.raw), tam2: f(t2.raw) },
    { label: "표준점수", kor: f(k.std), math: f(m.std), eng: "-", hist: "-", tam1: f(t1.expected_std), tam2: f(t2.expected_std) },
    { label: "백분위", kor: f(k.pct), math: f(m.pct), eng: "-", hist: "-", tam1: f(t1.expected_pct), tam2: f(t2.expected_pct) },
    { label: "등급", kor: f(k.grade), math: f(m.grade), eng: f(e.grade), hist: f(h.grade), tam1: f(t1.expected_grade), tam2: f(t2.expected_grade) },
  ];
}

/* =========================================================
   공지사항 시스템 (슬라이드, 모달, 스와이프 전체 유지)
========================================================= */
async function loadNoticeList(session) {
  const sliderWrap = $("noticeSwipeArea"), titleEl = $("noticeTitle"), prevEl = $("noticePreview");
  if (!sliderWrap) return;
  try {
    const res = await fetch(`${API_BASE}?path=notice_list`, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: session.token })
    });
    const data = await res.json();
    __noticeItems = normalizeNoticeItems_(data.items || []);
    if (!__noticeItems.length) { titleEl.textContent = "공지사항이 없습니다."; return; }
    initNoticeInteractions_();
    renderNoticeCard_();
    if (__noticeItems.length >= 2) startNoticeAutoplay_();
  } catch (e) { titleEl.textContent = "공지 로드 실패"; }
}

function initNoticeInteractions_() {
  if (__noticeBound) return; __noticeBound = true;
  $("noticeOpenBtn").onclick = () => openNoticeModal_(__noticeItems[__noticeIndex]);
  $("noticeModalClose").onclick = () => closeNoticeModal_();
  
  // 스와이프 로직
  let startX = 0;
  const area = $("noticeSwipeArea");
  area.ontouchstart = (e) => { startX = e.touches[0].clientX; stopNoticeAutoplay_(); };
  area.ontouchend = (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 50) setNoticeIndex_(__noticeIndex + (dx > 0 ? -1 : 1));
    restartNoticeAutoplay_();
  };
}

function normalizeNoticeItems_(items) {
  return items.map(it => ({
    title: it.title || "공지",
    bodyText: it.body || "",
    bodyHtml: it.body_html || it.body || "",
    created: it.at || "",
    link: it.link || "",
    images: it.images || []
  }));
}

function setNoticeIndex_(next) {
  const n = __noticeItems.length;
  __noticeIndex = (next % n + n) % n;
  renderNoticeCard_();
}

function renderNoticeCard_() {
  const it = __noticeItems[__noticeIndex];
  $("noticeTitle").textContent = it.title;
  $("noticePreview").textContent = it.bodyText.slice(0, 100) + (it.bodyText.length > 100 ? "..." : "");
}

function startNoticeAutoplay_() {
  if (__noticeTimer) return;
  __noticeTimer = setInterval(() => setNoticeIndex_(__noticeIndex + 1), __NOTICE_AUTOPLAY_MS);
}
function stopNoticeAutoplay_() { clearInterval(__noticeTimer); __noticeTimer = null; }
function restartNoticeAutoplay_() { stopNoticeAutoplay_(); startNoticeAutoplay_(); }

function openNoticeModal_(it) {
  __noticeModalOpen = true; stopNoticeAutoplay_();
  $("noticeModalTitle").textContent = it.title;
  $("noticeModalBody").innerHTML = it.bodyHtml;
  const linkWrap = $("noticeModalLinkWrap"), linkEl = $("noticeModalLink");
  if (it.link) { linkWrap.style.display = ""; linkEl.href = it.link; linkEl.textContent = it.link; }
  else linkWrap.style.display = "none";
  $("noticeModal").style.display = "";
}

function closeNoticeModal_() {
  $("noticeModal").style.display = "none";
  __noticeModalOpen = false; restartNoticeAutoplay_();
}

/* =========================================================
   각 상세 페이지 초기화 로직 (전체 유지)
========================================================= */
async function initMoveDetailPage(){
  const tbody = $("moveDetailTbody");
  if (!tbody) return;
  const session = getSession();
  const res = await fetch(`${API_BASE}?path=move_detail`, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: session.token, days: 30 })
  });
  const data = await res.json();
  tbody.innerHTML = (data.items || []).map(it => `
    <tr>
      <td>${it.date.slice(5)}</td><td>${it.time}</td><td>${it.reason}</td><td>${it.returnPeriod || "-"}</td>
    </tr>`).join("");
}

async function initEduScoreDetailPage(){
  const tbody = $("eduDetailTbody");
  if (!tbody) return;
  const session = getSession();
  const res = await fetch(`${API_BASE}?path=eduscore_detail`, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: session.token, days: 30 })
  });
  const data = await res.json();
  tbody.innerHTML = (data.items || []).map(it => `
    <tr>
      <td>${it.date.slice(5)}</td><td>${it.time}</td><td>${it.reason}</td><td>${it.score}점</td>
    </tr>`).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  if (location.pathname.includes("move.html")) initMoveDetailPage();
  if (location.pathname.includes("eduscore.html")) initEduScoreDetailPage();
});

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
