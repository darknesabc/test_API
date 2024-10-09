document.getElementById('submit').addEventListener('click', function() {
    const name = document.getElementById('name').value;
    const number = document.getElementById('number').value;

    if (name && number.length === 4) {
        alert(`이름: ${name}, 숫자: ${number}`);
    } else {
        alert('이름과 4자리 숫자를 입력하세요.');
    }
});
