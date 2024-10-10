document.getElementById('submit').addEventListener('click', function() {
    const name = document.getElementById('name').value; // 이름 입력 값
    const number = document.getElementById('number').value; // 숫자 입력 값

    const sheetId = '1cTEkCLZyYN1c9qzo2YLHI06ZbCu8_qf42q2CaKyRoo0'; // 시트 ID
    const apiKey = 'AIzaSyDeS-WjQLmzG7yw1_GWu5Tw3HwFxG5hYbk'; // API 키
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:C?key=${apiKey}`; // 자리번호를 가져오기 위해 C열도 포함

    fetch(url)
        .then(response => response.json())
        .then(data => {
            const rows = data.values;
            let matchFound = false;
            let seatNumber = ''; // 자리번호 저장 변수

            if (rows) {
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i][0] === name && rows[i][1] === number) {
                        matchFound = true;
                        seatNumber = rows[i][2]; // 자리번호 저장
                        break;
                    }
                }
            }

            if (matchFound) {
                // 이름과 자리번호를 로컬 스토리지에 저장
                localStorage.setItem('username', `${seatNumber} ${name}`); // 이름 앞에 자리번호 추가

                // 페이지 전환
                window.location.href = 'nextpage.html'; 
            } else {
                alert('일치하는 데이터가 없습니다.');
            }
        })
        .catch(error => console.error('Error fetching data:', error));
});
