document.getElementById('submit').addEventListener('click', function() {
    const name = document.getElementById('name').value; // 이름 입력 값
    const number = document.getElementById('number').value; // 숫자 입력 값

    // Google Sheets API 호출 (URL 및 API 키는 당신의 것으로 교체해야 함)
    const sheetId = '1cTEkCLZyYN1c9qzo2YLHI06ZbCu8_qf42q2CaKyRoo0'; // 시트 ID
    const apiKey = 'AIzaSyDeS-WjQLmzG7yw1_GWu5Tw3HwFxG5hYbk'; // API 키
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:B?key=${apiKey}`;

    fetch(url) // Google Sheets API에서 데이터 가져오기
        .then(response => response.json())
        .then(data => {
            const rows = data.values; // 시트의 데이터 행
            let matchFound = false; // 매칭 여부 변수

            if (rows) {
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i][0] === name && rows[i][1] === number) { // 이름과 숫자 비교
                        matchFound = true; // 매칭됨
                        break; // 반복문 종료
                    }
                }
            }

            if (matchFound) {
                // 페이지 전환
                window.location.href = 'nextpage.html'; // 전환할 페이지의 URL로 교체하세요
            } else {
                alert('일치하는 데이터가 없습니다.'); // 매칭 실패 시 경고 메시지
            }
        })
        .catch(error => console.error('Error fetching data:', error)); // 에러 처리
});
