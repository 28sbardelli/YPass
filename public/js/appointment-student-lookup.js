const studentIdInput = document.querySelector('[data-appointment-student-id]');
const studentNameInput = document.querySelector('[data-appointment-student-name]');
const studentWarning = document.querySelector('[data-appointment-student-warning]');

if (studentIdInput && studentNameInput && studentWarning) {
  let lookupRequest = 0;

  const lookupStudent = async () => {
    const studentNumber = studentIdInput.value.trim();
    const requestId = ++lookupRequest;
    studentNameInput.value = '';
    studentWarning.hidden = true;

    if (!studentNumber) return;

    try {
      const response = await fetch(
        `/teacher/appointment/student?studentNumber=${encodeURIComponent(studentNumber)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('Student lookup failed');
      const { student } = await response.json();
      if (requestId !== lookupRequest) return;
      if (student) {
        studentNameInput.value = student.studentName;
      } else {
        studentWarning.hidden = false;
      }
    } catch {
      if (requestId === lookupRequest) studentWarning.hidden = false;
    }
  };

  studentIdInput.addEventListener('change', lookupStudent);
  studentIdInput.addEventListener('blur', lookupStudent);
  studentIdInput.addEventListener('input', lookupStudent);
}
