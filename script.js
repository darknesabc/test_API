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

  const nameOk = nameInput.value.trim().length > 0;
  const numOk = /^\d{4}$/.test(numberInput.value);

  button.disabled = !(nameOk && numOk);
}

["input", "keyup", "change", "paste"].forEach((evt) => {
  nameInput.addEventListener(evt, validate);
  numberInput.addEventListener(evt, validate);
});

// ✅ 로딩/자동완성 대비: 처음에도 한 번 실행
validate();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 버튼이 눌린다는 건 이미 유효하단 뜻이지만, 안전하게 한 번 더
  validate();
  if (button.disabled) return;

  error.textContent = "";
  button.disabled = true;

  try {
    const res = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        phoneLast4: numberInput.value.trim(),
      }),
    });

    const result = await res.json();

    if (result.ok) {
      localStorage.setItem("username", `${result.seatNumber} ${result.name}`.trim());
      window.location.href = "nextpage.html";
    } else {
      error.textContent = result.message || "일치하는 데이터가 없습니다.";
      button.disabled = false;
    }
  } catch (err) {
    console.error(err);
    error.textContent = "서버 호출 실패(CORS/네트워크)";
    button.disabled = false;
  }
});
