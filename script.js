const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxBqEYlBC1OHGTvbOhaRM8kNm7_45dkaIKFmi40biJz7iznXVmJfnmG8mLohznvC-ni/exec";

const form = document.getElementById("loginForm");
const nameInput = document.getElementById("name");
const numberInput = document.getElementById("number");
const button = document.getElementById("submit");
const error = document.getElementById("error");

function onlyDigits4(v) {
  return v.replace(/\D/g, "").slice(0, 4);
}

function validate() {
  numberInput.value = onlyDigits4(numberInput.value);
  const ok =
    nameInput.value.trim().length > 0 &&
    /^\d{4}$/.test(numberInput.value);
  button.disabled = !ok;
}

nameInput.addEventListener("input", validate);
numberInput.addEventListener("input", validate);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
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
      // ✅ 기존 방식 그대로: "좌석 이름" 저장
      localStorage.setItem(
        "username",
        `${result.seatNumber} ${result.name}`.trim()
      );

      // 페이지 이동
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
