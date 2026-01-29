function doGet() {
  // index.html 파일을 웹페이지로 보여줌
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("학생 확인");
}

// 학생 인증(명렬: A=이름, B=폰뒤4, C=좌석)
function checkStudent(name, phoneLast4) {
  name = String(name || "").trim();
  phoneLast4 = String(phoneLast4 || "").trim();

  if (!name || !/^\d{4}$/.test(phoneLast4)) {
    return { ok: false, message: "이름/뒤4자리 형식 확인" };
  }

  const sheet = SpreadsheetApp
    .openById("1cTEkCLZyYN1c9qzo2YLHI06ZbCu8_qf42q2CaKyRoo0")
    .getSheetByName("명렬");

  if (!sheet) return { ok: false, message: "시트 없음" };

  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) { // 1행 헤더 가정
    const rowName = String(rows[i][0] || "").trim();   // A
    const rowLast4 = String(rows[i][1] || "").trim();  // B
    const seat = String(rows[i][2] || "").trim();      // C

    if (rowName === name && rowLast4 === phoneLast4) {
      return { ok: true, name: rowName, seatNumber: seat };
    }
  }

  return { ok: false, message: "일치하는 데이터가 없습니다." };
}
