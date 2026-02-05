<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>취침 상세</title>
  <link rel="stylesheet" href="styles.css" />
</head>

<body data-needs-login="1">
  <header class="topbar">
    <div class="topbar-inner">
      <div>
        <div class="top-title">취침 상세</div>
        <div id="titleLine" class="top-sub"></div>
      </div>
      <a class="btn btn-ghost" href="dashboard.html">대시보드</a>
    </div>
  </header>

  <main class="wrap">
    <section class="card">
      <div style="display:flex; gap:12px; justify-content:space-between; align-items:center;">
        <h2 class="card-title" style="margin:0;">취침 기록</h2>

        <select id="days" class="input" style="max-width:140px;">
          <option value="7">최근 7일</option>
          <option value="14">최근 14일</option>
          <option value="30">최근 30일</option>
        </select>
      </div>

      <p id="loading" class="muted" style="margin-top:10px;">불러오는 중...</p>
      <p id="err" class="msg"></p>

      <div style="overflow:auto; border:1px solid rgba(255,255,255,0.08); border-radius:12px; margin-top:10px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead id="thead"></thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>

      <div class="muted" style="margin-top:10px; font-size:12px;">
        * “사유=취침” 기록만 표시합니다. (날짜를 클릭하면 교시별 상세가 펼쳐집니다)
      </div>
    </section>
  </main>

  <script src="script.js"></script>
  <script>
    function fmtKDate(iso){
      if (!iso) return "";
      const [y,m,d] = iso.split("-").map(Number);
      const dt = new Date(y, m-1, d);
      const wd = ["일","월","화","수","목","금","토"][dt.getDay()];
      return `${String(m).padStart(2,"0")}/${String(d).padStart(2,"0")} (${wd})`;
    }

    function safeNum(v, fallback=0){
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }

    function escapeHtml(s){
      return String(s).replace(/[&<>"']/g, (m) => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
      }[m]));
    }

    async function loadSleepDetail(days){
      const raw = sessionStorage.getItem("parent_session_v1");
      const session = raw ? JSON.parse(raw) : null;
      if (!session) return;

      const titleLine = document.getElementById("titleLine");
      titleLine.textContent =
        `${session.studentName} (${session.seat || ""}${session.teacher ? " · " + session.teacher + " 담임" : ""})`;

      const loading = document.getElementById("loading");
      const err = document.getElementById("err");
      const thead = document.getElementById("thead");
      const tbody = document.getElementById("tbody");

      try {
        loading.textContent = "불러오는 중...";
        err.textContent = "";
        thead.innerHTML = "";
        tbody.innerHTML = "";

        const res = await fetch(`${API_BASE}?path=sleep_detail`, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ token: session.token, days })
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "불러오기 실패");

        loading.textContent = "";

        // ✅ 옵션 B: 날짜별 합계 + 펼침 상세
        thead.innerHTML = `
          <tr>
            <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">날짜</th>
            <th style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:right; white-space:nowrap;">총 횟수</th>
          </tr>
        `;

        const groups = Array.isArray(data.groups) ? data.groups : [];
        if (groups.length === 0) {
          tbody.innerHTML = `<tr><td colspan="2" style="padding:10px;">기록이 없습니다.</td></tr>`;
          return;
        }

        // 토글 렌더
        tbody.innerHTML = groups.map((g, idx) => {
          const dateLabel = fmtKDate(g.dateIso);
          const total = safeNum(g.total, 0);
          const details = Array.isArray(g.details) ? g.details : [];
          const detailId = `sleep-detail-${idx}`;

          const detailHtml = details.length ? `
            <div style="padding:10px 12px;">
              <div class="muted" style="font-size:12px; margin-bottom:8px;">교시별 상세</div>
              <div style="overflow:auto; border:1px solid rgba(255,255,255,0.08); border-radius:10px;">
                <table style="width:100%; border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">교시</th>
                      <th style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:left;">사유</th>
                      <th style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); text-align:right;">횟수</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${details.map(d => `
                      <tr>
                        <td style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.06); white-space:nowrap;">${escapeHtml(d.period ?? "-")}</td>
                        <td style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.06);">${escapeHtml(d.reason ?? "취침")}</td>
                        <td style="padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:right; white-space:nowrap;">${safeNum(d.count,0)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            </div>
          ` : `<div style="padding:10px 12px;" class="muted">상세 없음</div>`;

          return `
            <tr class="sleep-date-row" data-target="${detailId}" style="cursor:pointer;">
              <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); white-space:nowrap;">
                ${dateLabel}
                <span class="muted" style="font-size:12px; margin-left:6px;">(클릭)</span>
              </td>
              <td style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.06); text-align:right; white-space:nowrap;">
                ${total}
              </td>
            </tr>
            <tr id="${detailId}" style="display:none;">
              <td colspan="2" style="border-bottom:1px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02);">
                ${detailHtml}
              </td>
            </tr>
          `;
        }).join("");

        // ✅ 토글 이벤트
        tbody.querySelectorAll(".sleep-date-row").forEach(row => {
          row.addEventListener("click", () => {
            const id = row.getAttribute("data-target");
            const panel = document.getElementById(id);
            if (!panel) return;
            panel.style.display = (panel.style.display === "none" || !panel.style.display) ? "" : "none";
          });
        });

      } catch (e) {
        loading.textContent = "";
        err.textContent = e.message || String(e);
      }
    }

    const sel = document.getElementById("days");
    loadSleepDetail(Number(sel.value));
    sel.addEventListener("change", () => loadSleepDetail(Number(sel.value)));
  </script>
</body>
</html>
