/***********************
 * 관리자(Admin) - 학생 검색/상세/상세버튼(출결/취침/이동/교육점수/성적)
 *
 * ✅ 추가(요약 자동 로드)
 * - 학생 선택 시 admin_issue_token으로 token 발급 후
 *   attendance_summary / sleep_summary / move_summary / eduscore_summary / grade_exams+grade_detail
 *   를 자동 호출하여 summary를 채움
 *
 * ✅ 추가(캐시/속도 최적화)
 * - 학생별 요약(summary) 캐시: seat|studentId
 * - 캐시가 있으면 즉시 표시 후, 백그라운드로 최신값 갱신
 * - TTL 기본 5분
 ***********************/

// ✅ 여기에 Apps Script Web App URL(…/exec) 넣기
const API_BASE = "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

/** =========================
 * ✅ 출결(관리자) - 학부모 출결 상세와 동일한 "이동 기록 반영" 로직
 * - 스케줄 공란인 교시는 move_detail(이동) 사유로 채워서 표시/집계 기준을 동일하게 맞춤
 * ========================= */
const PERIODS_ATT_ = [
  { p: 1, start: "08:00", end: "08:30" },
  { p: 2, start: "08:50", end: "10:10" },
  { p: 3, start: "10:30", end: "12:00" },
  { p: 4, start: "13:10", end: "14:30" },
  { p: 5, start: "14:50", end: "15:50" },
  { p: 6, start: "16:10", end: "17:30" },
  { p: 7, start: "18:40", end: "20:10" },
  { p: 8, start: "20:30", end: "22:00" },
];

function hhmmToMin_(t) {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

function inferStartPeriodByTime_(timeHHMM) {
  const t = hhmmToMin_(timeHHMM);
  if (!Number.isFinite(t)) return 0;

  for (let i = 0; i < PERIODS_ATT_.length; i++) {
    const cur = PERIODS_ATT_[i];
    const s = hhmmToMin_(cur.start);
    const e = hhmmToMin_(cur.end);

    if (t >= s && t <= e) return cur.p;

    const next = PERIODS_ATT_[i + 1];
    if (next) {
      const ns = hhmmToMin_(next.start);
      if (t > e && t < ns) return next.p;
    }
  }
  return 0;
}

// moveMap[iso][period] = reason
function buildMoveMapFromItems_(items) {
  const map = {};
  const arr = Array.isArray(items) ? items : [];
  for (const it of arr) {
    const iso = String(it?.date || "").trim();
    if (!iso) continue;

    const time = String(it?.time || "").trim();           // "HH:MM"
    const reason = String(it?.reason || "").trim();
    const rp = parseInt(String(it?.returnPeriod || "").trim(), 10) || 0;

    if (!reason || rp <= 0) continue;

    const sp = inferStartPeriodByTime_(time); // 0이면 추정불가
    const from = sp > 0 ? sp : Math.max(1, rp - 1);
    const to = rp;
    const start = (from <= to) ? from : Math.max(1, rp - 1);

    map[iso] = map[iso] || {};
    for (let p = start; p <= to; p++) {
      map[iso][p] = reason;
    }
  }
  return map;
}


const ADMIN_SESSION_KEY = "admin_session_v1";

// ====== 캐시 설정 ======
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000; // ✅ 5분 (원하면 조절)
const SUMMARY_CACHE_KEY = "admin_summary_cache_v1"; // localStorage 저장 키

// ====== DOM ======
const $ = (id) => document.getElementById(id);

// ====== session ======
function setAdminSession(s) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(s));
}
function getAdminSession() {
  const raw = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}
function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

// ====== fetch helper ======
async function apiPost(path, body) {
  const url = `${API_BASE}?path=${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body || {})
  });
  return await res.json();
}

// ====== UI helpers ======
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function fmtKeyVal(label, value) {
  return `<div style="display:flex; gap:8px; margin:2px 0;">
    <div style="min-width:90px; opacity:.8;">${escapeHtml(label)}</div>
    <div style="font-weight:600;">${escapeHtml(value)}</div>
  </div>`;
}
function setHint(el, msg, isError=false) {
  el.innerHTML = msg ? `<span style="color:${isError ? "#ff6b6b" : "inherit"}">${escapeHtml(msg)}</span>` : "";
}

/** ✅ 어떤 키로 오든 안전하게 값 뽑기 */
function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

// ====== 요약 캐시(메모리 + localStorage) ======
const __memSummaryCache = new Map();

function makeStudentKey(seat, studentId) {
  return `${String(seat || "").trim()}|${String(studentId || "").trim()}`;
}

function loadLocalCache_() {
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (_) {
    return {};
  }
}

function saveLocalCache_(obj) {
  try {
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(obj || {}));
  } catch (_) {}
}

function getSummaryCache(key) {
  const now = Date.now();

  // 1) 메모리 캐시
  const mem = __memSummaryCache.get(key);
  if (mem && mem.expireAt > now && mem.summary) return mem.summary;

  // 2) localStorage 캐시
  const store = loadLocalCache_();
  const it = store[key];
  if (it && it.expireAt > now && it.summary) {
    __memSummaryCache.set(key, it);
    return it.summary;
  }
  return null;
}

function setSummaryCache(key, summary) {
  const now = Date.now();
  const pack = {
    expireAt: now + SUMMARY_CACHE_TTL_MS,
    summary
  };
  __memSummaryCache.set(key, pack);

  const store = loadLocalCache_();
  store[key] = pack;

  // 너무 커지는 것 방지: 만료된 것 정리
  for (const k of Object.keys(store)) {
    if (!store[k] || store[k].expireAt <= now) delete store[k];
  }
  saveLocalCache_(store);
}

// ====== init ======
document.addEventListener("DOMContentLoaded", () => {
  // elements
  const loginCard = $("loginCard");
  const adminArea = $("adminArea");

  const pwInput = $("pwInput");
  const loginBtn = $("loginBtn");
  const loginMsg = $("loginMsg");
  const logoutBtn = $("logoutBtn");

  const qInput = $("qInput");
  const searchBtn = $("searchBtn");
  const searchMsg = $("searchMsg");
  const resultList = $("resultList");

  const detailSub = $("detailSub");
  const detailBody = $("detailBody");
  const detailResult = $("detailResult");

  // restore session
  const sess = getAdminSession();
  if (sess?.adminToken) {
    loginCard.style.display = "none";
    adminArea.style.display = "block";
    logoutBtn.style.display = "inline-flex";
  }

  // ✅ 로그인 Enter 지원
  pwInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });

  // login
  loginBtn.addEventListener("click", async () => {
    const pw = String(pwInput.value || "").trim();
    if (!pw) return setHint(loginMsg, "비밀번호를 입력하세요.", true);

    loginBtn.disabled = true;
    setHint(loginMsg, "로그인 중…");

    try {
      const data = await apiPost("admin_login", { password: pw });
      if (!data.ok) {
        setHint(loginMsg, data.error || "로그인 실패", true);
        return;
      }
      setAdminSession({ adminToken: data.adminToken });
      setHint(loginMsg, "로그인 성공");

      loginCard.style.display = "none";
      adminArea.style.display = "block";
      logoutBtn.style.display = "inline-flex";
    } catch (e) {
      setHint(loginMsg, "네트워크 오류", true);
    } finally {
      loginBtn.disabled = false;
    }
  });

  // logout
  logoutBtn.addEventListener("click", () => {
    clearAdminSession();
    location.reload();
  });

  // search (enter)
  qInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchBtn.click();
  });

  // search
  searchBtn.addEventListener("click", async () => {
    const sess = getAdminSession();
    if (!sess?.adminToken) return setHint(searchMsg, "관리자 로그인이 필요합니다.", true);

    const q = String(qInput.value || "").trim();
    if (!q) return setHint(searchMsg, "검색어를 입력하세요.", true);

    searchBtn.disabled = true;
    setHint(searchMsg, "검색 중…");
    resultList.innerHTML = "";

    // reset detail
    detailSub.textContent = "학생을 선택하세요.";
    detailBody.innerHTML = "";
    detailResult.innerHTML = "";
    window.__lastStudent = null;

    try {
      const data = await apiPost("admin_search", { adminToken: sess.adminToken, q });
      if (!data.ok) {
        setHint(searchMsg, data.error || "검색 실패", true);
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        setHint(searchMsg, "검색 결과가 없습니다.");
        return;
      }

      setHint(searchMsg, `검색 결과 ${items.length}명`);

      // ✅ 검색 결과: (좌석 · 이름 · 담임)
      resultList.innerHTML = items.map((it, idx) => {
        const seat = pick(it, ["seat","좌석"], "-");
        const name = pick(it, ["name","studentName","이름"], "-");
        const teacher = pick(it, ["teacher","담임"], "-");

        return `
          <button class="list-item" data-idx="${idx}"
            style="
              width:100%;
              text-align:left;
              border:1px solid rgba(255,255,255,.10);
              background: rgba(10,15,25,.55);
              color: inherit;
              padding: 12px 14px;
              border-radius: 12px;
              cursor: pointer;
              display:flex;
              align-items:center;
              gap:10px;
              transition: transform .08s ease, background .15s ease, border-color .15s ease;
              margin: 8px 0;
            "
          >
            <span style="opacity:.9; font-weight:700;">${escapeHtml(seat)}</span>
            <span style="opacity:.95;">${escapeHtml(name)}</span>
            <span style="opacity:.7;">·</span>
            <span style="opacity:.85;">담임 ${escapeHtml(teacher)}</span>
          </button>
        `;
      }).join("");

      // hover + click
      resultList.querySelectorAll(".list-item").forEach(btn => {
        btn.addEventListener("mouseover", () => {
          btn.style.background = "rgba(20,30,50,.65)";
          btn.style.borderColor = "rgba(255,255,255,.16)";
        });
        btn.addEventListener("mouseout", () => {
          btn.style.background = "rgba(10,15,25,.55)";
          btn.style.borderColor = "rgba(255,255,255,.10)";
          btn.style.transform = "scale(1)";
        });
        btn.addEventListener("mousedown", () => { btn.style.transform = "scale(0.99)"; });
        btn.addEventListener("mouseup", () => { btn.style.transform = "scale(1)"; });

        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.idx);
          const st = items[idx];
          await loadStudentDetail(st);
        });
      });

      // ✅ 결과가 1명이면 자동 선택
      if (items.length === 1) {
        await loadStudentDetail(items[0]);
      }

    } catch (e) {
      setHint(searchMsg, "네트워크 오류", true);
    } finally {
      searchBtn.disabled = false;
    }
  });

  // ====== issue token for student (admin_issue_token) ======
  async function issueStudentToken_(seat, studentId) {
    const sess = getAdminSession();
    const data = await apiPost("admin_issue_token", {
      adminToken: sess.adminToken,
      seat,
      studentId
    });
    if (!data.ok) throw new Error(data.error || "token 발급 실패");
    return data.token;
  }

  // ====== ✅ 요약 로드 (네 API 경로들 기준) ======
  async function loadSummariesForStudent_(seat, studentId) {
    const summary = {};
    const token = await issueStudentToken_(seat, studentId);

    const [att, slp, mv, edu] = await Promise.allSettled([
      apiPost("attendance_summary", { token }),
      apiPost("sleep_summary", { token }),
      apiPost("move_summary", { token }),
      apiPost("eduscore_summary", { token }),
    ]);

    summary.attendance = (att.status === "fulfilled") ? att.value : { ok:false, error:String(att.reason || "") };
    summary.sleep      = (slp.status === "fulfilled") ? slp.value : { ok:false, error:String(slp.reason || "") };
    summary.move       = (mv.status === "fulfilled")  ? mv.value  : { ok:false, error:String(mv.reason || "") };
    summary.eduscore   = (edu.status === "fulfilled") ? edu.value : { ok:false, error:String(edu.reason || "") };

    // 성적 요약
    try {
      const exams = await apiPost("grade_exams", { token });
      if (exams.ok && Array.isArray(exams.items) && exams.items.length) {
        const lastExam = exams.items[exams.items.length - 1].exam;
        const gd = await apiPost("grade_detail", { token, exam: lastExam });
        summary.grade = gd.ok ? {
          ok: true,
          sheetName: gd.sheetName,
          kor: gd.subjects?.kor,
          math: gd.subjects?.math,
          eng: gd.subjects?.eng,
        } : { ok:false, error: gd.error || "grade_detail 실패" };
      } else {
        summary.grade = { ok:false, error:"시험 목록 없음" };
      }
    } catch (e) {
      summary.grade = { ok:false, error: e?.message || "성적 오류" };
    }

    return summary;
  }

  // ====== load student detail (summary) ======
  // ✅ 갱신 중인 학생 추적(클릭 연타 시 이전 요청 결과가 덮어씌우는 것 방지)
  let __activeStudentKey = "";

  async function loadStudentDetail(st) {
    const sess = getAdminSession();
    if (!sess?.adminToken) return;

    const seat = String(pick(st, ["seat","좌석"], "")).trim();
    const studentId = String(pick(st, ["studentId","학번"], "")).trim();
    const name = String(pick(st, ["name","studentName","이름"], "")).trim();

    const key = makeStudentKey(seat, studentId);
    __activeStudentKey = key;

    detailSub.textContent = `${name} · ${seat} · ${studentId}`.trim();
    detailBody.innerHTML = "불러오는 중…";
    detailResult.innerHTML = "";

    try {
      const data = await apiPost("admin_student_detail", {
        adminToken: sess.adminToken,
        seat,
        studentId
      });

      if (!data.ok) {
        detailBody.innerHTML = `<div style="color:#ff6b6b;">${escapeHtml(data.error || "상세 조회 실패")}</div>`;
        return;
      }

      // 기본정보 렌더
      data.summary = data.summary || {};
      renderStudentDetail(data);

      // ✅ 1) 캐시가 있으면 즉시 표시(초고속)
      const cached = getSummaryCache(key);
      if (cached) {
        data.summary = cached;
        renderStudentDetail(data);

        // ✅ 2) 동시에 백그라운드로 최신값 갱신(조용히)
        (async () => {
          try {
            const fresh = await loadSummariesForStudent_(seat, studentId);
            // 클릭이 다른 학생으로 넘어갔으면 반영 X
            if (__activeStudentKey !== key) return;
            setSummaryCache(key, fresh || {});
            data.summary = fresh || {};
            renderStudentDetail(data);
          } catch (_) {}
        })();

        return; // 캐시 있으면 여기서 끝(백그라운드 갱신만)
      }

      // ✅ 캐시가 없으면 로딩 표시 후 실제 호출
      data.summary = { __loading: true };
      renderStudentDetail(data);

      try {
        const summary = await loadSummariesForStudent_(seat, studentId);
        // 클릭이 다른 학생으로 넘어갔으면 반영 X
        if (__activeStudentKey !== key) return;

        setSummaryCache(key, summary || {});
        data.summary = summary || {};
        renderStudentDetail(data);
      } catch (_) {
        if (__activeStudentKey !== key) return;
        data.summary = {};
        renderStudentDetail(data);
      }

    } catch (e) {
      detailBody.innerHTML = `<div style="color:#ff6b6b;">네트워크 오류</div>`;
    }
  }

  // ====== render summary + buttons ======
  function renderStudentDetail(data) {
    const st = data.student || {};
    const sum = data.summary || {};
    const loading = !!sum.__loading;

    const att = sum.attendance || null;
    const slp = sum.sleep || null;
    const mv  = sum.move || null;
    const edu = sum.eduscore || null;
    const grd = sum.grade || null;

    detailBody.innerHTML = `
      <div style="margin-bottom:10px;">
        ${fmtKeyVal("이름", st.studentName || st.name || "-")}
        ${fmtKeyVal("좌석", st.seat || "-")}
        ${fmtKeyVal("학번", st.studentId || "-")}
        ${fmtKeyVal("담임", st.teacher || "-")}
      </div>

      <div style="display:flex; gap:10px; flex-wrap:wrap; margin:12px 0;">
        <button class="btn" id="btnAttDetail">출결 상세</button>
        <button class="btn" id="btnSleepDetail">취침 상세</button>
        <button class="btn" id="btnMoveDetail">이동 상세</button>
        <button class="btn" id="btnEduDetail">교육점수 상세</button>
        <button class="btn" id="btnGradeDetail">성적 상세</button>
      </div>

      <div class="grid-2" style="margin-top:10px;">
        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">출결 요약</div>
          <div class="card-sub">
            ${att && att.ok ? `
              이번주 출석: <b>${att.present ?? 0}</b><br>
              이번주 결석: <b>${att.absent ?? 0}</b><br>
              최근 결석(최대 3): ${
                Array.isArray(att.recentAbsences) && att.recentAbsences.length
                  ? `<ul style="margin:6px 0 0 18px;">${
                      att.recentAbsences.map(x => `<li>${escapeHtml(x.md)}(${escapeHtml(x.dow)}) ${escapeHtml(x.period)}교시</li>`).join("")
                    }</ul>`
                  : "없음"
              }
            ` : (loading ? "불러오는 중…" : "데이터 없음")}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">취침 요약</div>
          <div class="card-sub">
            ${slp && slp.ok ? `
              최근 7일 취침일수: <b>${slp.sleepCount7d ?? 0}</b><br>
              최근 7일 취침횟수: <b>${slp.sleepTotal7d ?? 0}</b>
            ` : (loading ? "불러오는 중…" : "데이터 없음")}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">이동 요약</div>
          <div class="card-sub">
            ${mv && mv.ok ? `
              최근 이동: <b>${escapeHtml(mv.latestText || "-")}</b><br>
              ${escapeHtml(mv.latestDateTime || "")}
            ` : (loading ? "불러오는 중…" : "데이터 없음")}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">교육점수 요약</div>
          <div class="card-sub">
            ${edu && edu.ok ? `
              이번달 누적점수: <b>${edu.monthTotal ?? 0}</b><br>
              최근 항목: <b>${escapeHtml(edu.latestText || "-")}</b><br>
              ${escapeHtml(edu.latestDateTime || "")}
            ` : (loading ? "불러오는 중…" : "데이터 없음")}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">성적 요약</div>
          <div class="card-sub">
            ${grd && grd.ok ? `
              (${escapeHtml(grd.sheetName || "")})<br>
              국어: <b>${grd.kor?.raw_total ?? grd.kor?.raw ?? "-"}</b> / 등급 <b>${grd.kor?.grade ?? "-"}</b><br>
              수학: <b>${grd.math?.raw_total ?? grd.math?.raw ?? "-"}</b> / 등급 <b>${grd.math?.grade ?? "-"}</b><br>
              영어: <b>${grd.eng?.raw ?? "-"}</b> / 등급 <b>${grd.eng?.grade ?? "-"}</b>
            ` : (loading ? "불러오는 중…" : "데이터 없음")}
          </div>
        </section>
      </div>
    `;

    // bind detail buttons
    $("btnAttDetail").addEventListener("click", () => loadDetail("attendance"));
    $("btnSleepDetail").addEventListener("click", () => loadDetail("sleep_detail"));
    $("btnMoveDetail").addEventListener("click", () => loadDetail("move_detail"));
    $("btnEduDetail").addEventListener("click", () => loadDetail("eduscore_detail"));
    $("btnGradeDetail").addEventListener("click", () => loadDetail("grade_detail"));
  }

  // ====== load detail into detailResult ======
  async function loadDetail(kind) {
    const sess = getAdminSession();
    if (!sess?.adminToken) return;

    if (!window.__lastStudent) {
      detailResult.innerHTML = `<div style="color:#ff6b6b;">학생을 먼저 선택하세요.</div>`;
      return;
    }

    const st = window.__lastStudent;
    const seat = st.seat || "";
    const studentId = st.studentId || "";

    detailResult.innerHTML = "불러오는 중…";

    try {
      const token = await issueStudentToken_(seat, studentId);

      if (kind === "attendance") {
        // ✅ 학부모 출결 상세와 동일 기준을 위해 이동(move_detail)도 함께 조회해서 스케줄 공란을 채웁니다.
        const [att, mv] = await Promise.all([
          apiPost("attendance", { token }),
          apiPost("move_detail", { token, days: 14 }),
        ]);

        if (!att.ok) return showError(att);
        const moveMap = (mv && mv.ok) ? buildMoveMapFromItems_(mv.items) : {};

        detailResult.innerHTML = renderAttendanceDetail_(att, moveMap);
        return;
      }

      if (kind === "sleep_detail") {
        const data = await apiPost("sleep_detail", { token, days: 30 });
        if (!data.ok) return showError(data);
        detailResult.innerHTML = renderSleepDetail_(data);
        return;
      }

      if (kind === "move_detail") {
        const data = await apiPost("move_detail", { token, days: 30 });
        if (!data.ok) return showError(data);
        detailResult.innerHTML = renderSimpleTable_(
          ["날짜", "시간", "사유", "복귀교시"],
          (data.items || []).map(x => [x.date, x.time, x.reason, x.returnPeriod])
        );
        return;
      }

      if (kind === "eduscore_detail") {
        const data = await apiPost("eduscore_detail", { token, days: 30 });
        if (!data.ok) return showError(data);
        detailResult.innerHTML = renderSimpleTable_(
          ["날짜", "시간", "사유", "점수"],
          (data.items || []).map(x => [x.date, x.time, x.reason, x.score])
        );
        return;
      }

      if (kind === "grade_detail") {
        const exams = await apiPost("grade_exams", { token });
        if (!exams.ok) return showError(exams);

        const items = Array.isArray(exams.items) ? exams.items : [];
        if (!items.length) {
          detailResult.innerHTML = "성적 시험 목록이 없습니다.";
          return;
        }

        const lastExam = items[items.length - 1].exam;
        const gd = await apiPost("grade_detail", { token, exam: lastExam });
        if (!gd.ok) return showError(gd);

        detailResult.innerHTML = renderGradeDetail_(gd);
        return;
      }

      detailResult.innerHTML = `<div style="color:#ff6b6b;">지원하지 않는 상세 종류</div>`;
    } catch (e) {
      detailResult.innerHTML = `<div style="color:#ff6b6b;">${escapeHtml(e.message || "오류")}</div>`;
    }
  }

  function showError(data) {
    detailResult.innerHTML = `<div style="color:#ff6b6b;">${escapeHtml(data.error || "오류")}</div>`;
  }

  // ====== renderers ======
  function renderSimpleTable_(headers, rows) {
    const th = headers.map(h => `<th style="text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.08);">${escapeHtml(h)}</th>`).join("");
    const tr = rows.map(r => `
      <tr>
        ${r.map(c => `<td style="padding:8px; border-bottom:1px solid rgba(255,255,255,.06);">${escapeHtml(c)}</td>`).join("")}
      </tr>
    `).join("");

    return `
      <div style="overflow:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead><tr>${th}</tr></thead>
          <tbody>${tr || `<tr><td style="padding:10px; opacity:.8;" colspan="${headers.length}">데이터 없음</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

 function renderAttendanceDetail_(data, moveMap) {
  const dates = data.dates || [];
  const rows = data.rows || [];
  if (!dates.length || !rows.length) return "출결 상세 데이터가 없습니다.";

  const showN = Math.min(14, dates.length);

  // 날짜 정렬 후 최근 N일만
  const idxSorted = dates
    .map((d, i) => ({ i, iso: d.iso || "" }))
    .filter(x => x.iso)
    .sort((a,b) => a.iso.localeCompare(b.iso));

  const lastIdx = idxSorted.slice(-showN).map(x => x.i);

function mapAttendance_(val) {
  const t = String(val ?? "").trim();
  if (t === "1") return "출석";
  if (t === "3") return "결석";
  if (t === "2") return "지각";   // 혹시 쓰면 대비용
  if (t === "4") return "조퇴";   // 혹시 쓰면 대비용
  return t || "-";               // 이미 문자면 그대로
}
   
  // ✅ 출결 값에 따른 셀 스타일
  function statusStyle_(val) {
    const t0 = String(val || "").trim();
    const t = (t0 === "1") ? "출석" : (t0 === "3") ? "결석" : t0;
    if (!t || t === "-" ) return "opacity:.55;";
    if (t.includes("출석")) return "background: rgba(46, 204, 113, .22);";
    if (t.includes("결석")) return "background: rgba(231, 76, 60, .22);";
    if (t.includes("지각")) return "background: rgba(241, 196, 15, .22);";
    if (t.includes("조퇴")) return "background: rgba(155, 89, 182, .22);";
    if (t.includes("외출")) return "background: rgba(52, 152, 219, .22);";
    return "background: rgba(255,255,255,.06);";
  }

  // ====== 헤더(2줄) 만들기 ======
  // 1줄: 날짜(각 날짜 colspan=2)
  const thTop = `
    <th rowspan="2" style="position:sticky; left:0; z-index:3; background:rgba(8,12,20,.92); padding:10px; border-bottom:1px solid rgba(255,255,255,.10); width:60px;">
      교시
    </th>
    ${lastIdx.map(i => `
      <th colspan="2" style="text-align:center; padding:10px; border-bottom:1px solid rgba(255,255,255,.10);">
        ${escapeHtml(`${dates[i].md}(${dates[i].dow})`)}
      </th>
    `).join("")}
  `;

  // 2줄: 스케줄/출결 반복
  const thSub = lastIdx.map(() => `
    <th style="text-align:left; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.08); opacity:.85;">스케줄</th>
    <th style="text-align:left; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.08); opacity:.85;">출/결</th>
  `).join("");

  // ====== 바디 ======
  const bodyTr = rows.map(r => {
    const period = r.period || "";
    const cells = r.cells || [];

    const tds = lastIdx.map(i => {
      const c = cells[i] || {};
      const sRaw = String(c.s ?? "").trim();  // 스케줄(원본)
      const iso = String((dates[i] && dates[i].iso) || "").trim();
      const mvReason = (moveMap && moveMap[iso] && moveMap[iso][r.period]) ? String(moveMap[iso][r.period]) : "";
      const s = sRaw || mvReason; // ✅ 스케줄 공란이면 이동 사유로 채움
      const aRaw = String(c.a ?? "").trim();   // 원본(1/3 등)
      const aText = mapAttendance_(aRaw);      // 표시용(출석/결석)

      return `
        <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap;">
          ${escapeHtml(s || "-")}
        </td>
        <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,.06); white-space:nowrap; ${statusStyle_(aText)}">
          ${escapeHtml(aText)}
        </td>
      `;
    }).join("");

    return `
      <tr>
        <td style="position:sticky; left:0; z-index:2; background:rgba(8,12,20,.92); padding:10px; border-bottom:1px solid rgba(255,255,255,.06); font-weight:700;">
          ${escapeHtml(period)}
        </td>
        ${tds}
      </tr>
    `;
  }).join("");

  // ====== 최종 테이블 ======
  return `
    <div style="overflow:auto; border-radius:14px; border:1px solid rgba(255,255,255,.08);">
      <table style="width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:14px;">
        <thead style="background: rgba(255,255,255,.03);">
          <tr>${thTop}</tr>
          <tr>${thSub}</tr>
        </thead>
        <tbody>
          ${bodyTr || `<tr><td style="padding:12px; opacity:.8;" colspan="${1 + lastIdx.length*2}">데이터 없음</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

  function renderSleepDetail_(data) {
    const groups = data.groups || [];
    if (!groups.length) return "취침 상세 데이터가 없습니다.";

    const rows = [];
    groups.forEach(g => {
      const dateIso = g.dateIso || "";
      const total = g.total ?? 0;
      const details = Array.isArray(g.details) ? g.details : [];
      if (!details.length) {
        rows.push([dateIso, "", "취침", total]);
      } else {
        details.forEach(d => {
          rows.push([dateIso, d.period || "-", d.reason || "취침", d.count ?? 0]);
        });
      }
    });

    return renderSimpleTable_(["날짜", "교시", "사유", "횟수"], rows);
  }

  function renderGradeDetail_(gd) {
    const st = gd.student || {};
    const s = gd.subjects || {};
    const lines = [];

    lines.push(`<div style="margin-bottom:10px;"><b>${escapeHtml(gd.sheetName || "")}</b> (${escapeHtml(gd.exam || "")})</div>`);
    lines.push(fmtKeyVal("좌석", st.seat || ""));
    lines.push(fmtKeyVal("학번", st.studentId || ""));
    lines.push(fmtKeyVal("이름", st.name || st.studentName || ""));

    const rows = [
      ["국어", s.kor?.raw_total ?? s.kor?.raw ?? "", s.kor?.std ?? "", s.kor?.pct ?? "", s.kor?.grade ?? ""],
      ["수학", s.math?.raw_total ?? s.math?.raw ?? "", s.math?.std ?? "", s.math?.pct ?? "", s.math?.grade ?? ""],
      ["영어", s.eng?.raw ?? "", "", "", s.eng?.grade ?? ""],
      ["한국사", s.hist?.raw ?? "", "", "", s.hist?.grade ?? ""],
      [s.tam1?.name || "탐구1", s.tam1?.raw ?? "", s.tam1?.expected_std ?? "", s.tam1?.expected_pct ?? "", s.tam1?.expected_grade ?? ""],
      [s.tam2?.name || "탐구2", s.tam2?.raw ?? "", s.tam2?.expected_std ?? "", s.tam2?.expected_pct ?? "", s.tam2?.expected_grade ?? ""],
    ];

    return `
      <div>${lines.join("")}</div>
      <div style="margin-top:12px;">
        ${renderSimpleTable_(["과목", "원점수", "표준", "백분위", "등급"], rows)}
      </div>
    `;
  }

  // ====== 마지막 선택 학생 저장(버튼 상세용) ======
  const _origRender = renderStudentDetail;
  renderStudentDetail = function(data){
    window.__lastStudent = {
      seat: data?.student?.seat || "",
      studentId: data?.student?.studentId || "",
      studentName: data?.student?.studentName || "",
      teacher: data?.student?.teacher || ""
    };
    _origRender(data);
  };
});



