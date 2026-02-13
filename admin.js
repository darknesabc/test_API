/***********************
 * 관리자(Admin) - 학생 검색/상세/상세버튼(출결/취침/이동/교육점수/성적)
 * ✅ Unknown path 방지:
 * - 백엔드 doPost 라우터에 존재하는 path만 호출
 *   attendance, sleep_detail, move_detail, eduscore_detail, grade_exams, grade_detail
 ***********************/

// ✅ 여기에 Apps Script Web App URL(…/exec) 넣기
const API_BASE = "https://script.google.com/macros/s/AKfycbwxYd2tK4nWaBSZRyF0A3_oNES0soDEyWz0N0suAsuZU35QJOSypO2LFC-Z2dpbDyoD/exec";

const ADMIN_SESSION_KEY = "admin_session_v1";

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

  /* =========================================================
     ✅ 관리자 로그인 (버튼 클릭 + Enter)
  ========================================================= */
  async function doAdminLogin() {
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
  }

  // ✅ 로그인 버튼 클릭 유지
  loginBtn.addEventListener("click", doAdminLogin);

  // ✅ Enter로 로그인 (IME/브라우저 차이 대비: keydown + keyup + keypress)
  const enterLogin = (e) => {
    const isEnter = (e.key === "Enter") || (e.keyCode === 13);
    if (!isEnter) return;
    e.preventDefault();
    e.stopPropagation();
    doAdminLogin();
  };
  pwInput.addEventListener("keydown", enterLogin);
  pwInput.addEventListener("keyup", enterLogin);
  pwInput.addEventListener("keypress", enterLogin);

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

      resultList.innerHTML = items.map((it, idx) => {
        const seat = it.seat || "-";
        const name = it.name || "-";
        const studentId = it.studentId || "-";
        const teacher = it.teacher || "";

        return `
          <button class="list-item" data-idx="${idx}" style="text-align:left;">
            <div class="list-title">${escapeHtml(name)} <span style="opacity:.7;">(${escapeHtml(seat)})</span></div>
            <div class="list-sub">학번: ${escapeHtml(studentId)} · 담임: ${escapeHtml(teacher)}</div>
          </button>
        `;
      }).join("");

      // click item => load detail
      resultList.querySelectorAll(".list-item").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = Number(btn.dataset.idx);
          const st = items[idx];
          await loadStudentDetail(st);
        });
      });

    } catch (e) {
      setHint(searchMsg, "네트워크 오류", true);
    } finally {
      searchBtn.disabled = false;
    }
  });

  // ====== load student detail (summary) ======
  async function loadStudentDetail(st) {
    const sess = getAdminSession();
    if (!sess?.adminToken) return;

    const seat = String(st?.seat || "").trim();
    const studentId = String(st?.studentId || "").trim();

    detailSub.textContent = `${st?.name || ""} · ${seat} · ${studentId}`;
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

      renderStudentDetail(data);
    } catch (e) {
      detailBody.innerHTML = `<div style="color:#ff6b6b;">네트워크 오류</div>`;
    }
  }

  // ====== render summary + buttons ======
  function renderStudentDetail(data) {
    const st = data.student || {};
    const sum = data.summary || {};

    const att = sum.attendance || null;
    const slp = sum.sleep || null;
    const mv  = sum.move || null;
    const edu = sum.eduscore || null;
    const grd = sum.grade || null;

    detailBody.innerHTML = `
      <div style="margin-bottom:10px;">
        ${fmtKeyVal("이름", st.studentName || "-")}
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
            ` : "데이터 없음"}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">취침 요약</div>
          <div class="card-sub">
            ${slp && slp.ok ? `
              최근 7일 취침일수: <b>${slp.sleepCount7d ?? 0}</b><br>
              최근 7일 취침횟수: <b>${slp.sleepTotal7d ?? 0}</b>
            ` : "데이터 없음"}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">이동 요약</div>
          <div class="card-sub">
            ${mv && mv.ok ? `
              최근 이동: <b>${escapeHtml(mv.latestText || "-")}</b><br>
              ${escapeHtml(mv.latestDateTime || "")}
            ` : "데이터 없음"}
          </div>
        </section>

        <section class="card" style="padding:14px;">
          <div class="card-title" style="font-size:15px;">교육점수 요약</div>
          <div class="card-sub">
            ${edu && edu.ok ? `
              이번달 누적점수: <b>${edu.monthTotal ?? 0}</b><br>
              최근 항목: <b>${escapeHtml(edu.latestText || "-")}</b><br>
              ${escapeHtml(edu.latestDateTime || "")}
            ` : "데이터 없음"}
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
            ` : "데이터 없음"}
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

  // ====== load detail into detailResult ======
  async function loadDetail(kind) {
    const sess = getAdminSession();
    if (!sess?.adminToken) return;

    if (!window.__lastStudent) {
      detailResult.innerHTML = `<div style="color:#ff6b6b;">학생을 먼저 선택하세요.</div>`;
      return;
    }

    const st = window.__lastStudent; // {seat, studentId, studentName...}
    const seat = st.seat || "";
    const studentId = st.studentId || "";

    detailResult.innerHTML = "불러오는 중…";

    try {
      const token = await issueStudentToken_(seat, studentId);

      // 1) 출결 상세
      if (kind === "attendance") {
        const data = await apiPost("attendance", { token });
        if (!data.ok) return showError(data);

        detailResult.innerHTML = renderAttendanceDetail_(data);
        return;
      }

      // 2) 취침 상세 (기본 30일)
      if (kind === "sleep_detail") {
        const data = await apiPost("sleep_detail", { token, days: 30 });
        if (!data.ok) return showError(data);

        detailResult.innerHTML = renderSleepDetail_(data);
        return;
      }

      // 3) 이동 상세 (기본 30일)
      if (kind === "move_detail") {
        const data = await apiPost("move_detail", { token, days: 30 });
        if (!data.ok) return showError(data);

        detailResult.innerHTML = renderSimpleTable_(
          ["날짜", "시간", "사유", "복귀교시"],
          (data.items || []).map(x => [x.date, x.time, x.reason, x.returnPeriod])
        );
        return;
      }

      // 4) 교육점수 상세 (기본 30일)
      if (kind === "eduscore_detail") {
        const data = await apiPost("eduscore_detail", { token, days: 30 });
        if (!data.ok) return showError(data);

        detailResult.innerHTML = renderSimpleTable_(
          ["날짜", "시간", "사유", "점수"],
          (data.items || []).map(x => [x.date, x.time, x.reason, x.score])
        );
        return;
      }

      // 5) 성적 상세: grade_exams로 최신 exam 구한 뒤 grade_detail
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

  function renderAttendanceDetail_(data) {
    const dates = data.dates || [];
    const rows = data.rows || [];

    if (!dates.length || !rows.length) return "출결 상세 데이터가 없습니다.";

    const showN = Math.min(14, dates.length);

    const idxSorted = dates
      .map((d, i) => ({ i, iso: d.iso || "" }))
      .filter(x => x.iso)
      .sort((a,b) => a.iso.localeCompare(b.iso)); // 오름차순
    const lastIdx = idxSorted.slice(-showN).map(x => x.i);

    const header = ["교시"].concat(lastIdx.map(i => `${dates[i].md}(${dates[i].dow})`));
    const body = rows.map(r => {
      const period = r.period || "";
      const cells = r.cells || [];
      const line = [period].concat(lastIdx.map(i => {
        const c = cells[i] || {};
        const a = String(c.a ?? "").trim();
        const s = String(c.s ?? "").trim();
        return `${s ? s : "-"} / ${a ? a : "-"}`;
      }));
      return line;
    });

    return renderSimpleTable_(header, body);
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
    lines.push(fmtKeyVal("이름", st.name || ""));

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
