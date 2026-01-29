const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbyRokmzeWwYvbuYKp6HYfcQOQnaHD77mYk-W3OIY1Dfrfp4SQ-k_y4UJzm_-kWqXtiP/exec";

const form = document.getElementById("loginForm");
const nameInput = document.getElementById("name");
const numberInput = document.getElementById("number");
const button = document.getElementById("submit");
const error = document.getElementById("error");

function onlyDigits4(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 4);
}

function validate() {
  numberInput.value = onlyDigits4(numberInput.value);
  const ok = nameInput.value.trim().length > 0 && /^\d{4}$/.test(numberInput.value);
  button.disabled = !ok;
}

["input", "keyup", "change", "paste"].forEach((evt) => {
  nameInput.addEventListener(evt, validate);
  numberInput.addEventListener(evt, validate);
});
validate();

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  validate();
  if (button.disabled) return;

  error.textContent = "요청 중...";
  button.disabled = true;

  try {
    const res = await fetchWithTimeout(
      WEBAPP_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          phoneLast4: numberInput.value.trim(),
        }),
      },
      8000
    );

    // 1) HTTP 상태부터 보여주기
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      error.textContent = `서버 응답 오류 (HTTP ${res.status})`;
      console.error("HTTP error body:", text);
      button.disabled = false;
      return;
    }

    // 2) JSON이 아닐 수도 있어서 text로 먼저 받고 파싱
    const raw = await res.text();
    let result;
    try {
      result = JSON.parse(raw);
    } catch (jsonErr) {
      error.textContent = "서버가 JSON이 아닌 응답을 보냈습니다. (콘솔 확인)";
      console.error("Non-JSON response:", raw);
      button.disabled = false;
      return;
    }

    if (result.ok) {
      localStorage.setItem("username", `${result.seatNumber} ${result.name}`.trim());
      error.textContent = "인증 성공! 이동 중...";
      window.location.href = "nextpage.html";
      return;
    }

    error.textContent = result.message || "일치하는 데이터가 없습니다.";
    button.disabled = false;
  } catch (err) {
    console.error(err);
    if (err.name === "AbortError") {
      error.textContent = "서버 응답이 너무 늦습니다(타임아웃).";
    } else {
      error.textContent = "서버 호출 실패(CORS/네트워크).";
    }
    button.disabled = false;
  }
});
