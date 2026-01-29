document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault(); // 기본 제출 동작 방지

    const name = document.getElementById('name').value.trim();
    const number = document.getElementById('number').value.trim();
    const errorElement = document.getElementById('error');

    // 마스터 계정 확인
    if (name === 'admin' && number === '1234') {
        window.location.href = 'admin-dashboard.html'; // 관리자 대시보드로 리디렉션
        return;
    }

    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/199CxKW0EHGTVHMwDIEmNJ5LsOcPxyFUtQv52osl7jTY/values/명렬!A:N?key=AIzaSyDeS-WjQLmzG7yw1_GWu5Tw3HwFxG5hYbk`);
        const data = await response.json();

        console.log(data); // 데이터 확인

        const rows = data.values || [];
        
        let matched = false;

        // 이름과 번호가 매칭되는지 확인
        for (const row of rows) {
            const sheetName = row[2]; // 이름 (C열)
            const sheetNumber = row[13]; // 번호 (N열)

            // N열의 오른쪽 4자리 확인
            const rightmostFourDigits = sheetNumber ? sheetNumber.toString().slice(-4) : ""; // N열이 정의되지 않았을 경우 방지

            console.log(`Checking: ${sheetName} (input: ${name}), ${rightmostFourDigits} (input: ${number})`); // 디버깅 메시지

            // 이름과 오른쪽 4자리 번호 비교
            if (sheetName === name && rightmostFourDigits === number) {
                matched = true;

                // 매칭된 학생 정보를 저장
                localStorage.setItem('studentName', name);
                localStorage.setItem('studentNumber', rightmostFourDigits);
                
                // 학생의 추가 정보도 저장
                localStorage.setItem('studentSeatNumber', row[0]); // A열 자리번호
                localStorage.setItem('teacher', row[1]); // B열 담임
                localStorage.setItem('studentGrade', row[7]); // H열 학년
                localStorage.setItem('studentID', row[3]); // D열 학번
                localStorage.setItem('studentClass', row[4]); // E열 반
                localStorage.setItem('studentGender', row[5]); // F열 성별
                localStorage.setItem('studentSchool', row[6]); // G열 학교
                localStorage.setItem('studentContact', row[12]); // M열 학생연락처
                localStorage.setItem('parentContact', row[13]); // N열 학부모연락처

                break;
            }
        }

        if (matched) {
            // 로그인 성공 후 student-dashboard.html로 리디렉션
            window.location.href = 'student-dashboard.html';
        } else {
            errorElement.textContent = "이름과 번호가 일치하지 않습니다.";
        }
    } catch (error) {
        console.error("Error fetching data: ", error);
        errorElement.textContent = "데이터를 불러오는 중 오류가 발생했습니다.";
    }
});
