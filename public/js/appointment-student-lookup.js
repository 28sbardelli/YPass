const studentIdInput = document.querySelector('[data-appointment-student-id]');
const studentNameInput = document.querySelector('[data-appointment-student-name]');
const studentWarning = document.querySelector('[data-appointment-student-warning]');
const studentChoice = document.querySelector('[data-appointment-student-choice]');

if (studentIdInput && studentNameInput && studentWarning && studentChoice) {
  let lookupRequest = 0;
  let lookupTimer;

  const lookupStudent = async (lookupBy) => {
    const lookupValue = (lookupBy === 'name' ? studentNameInput : studentIdInput).value.trim();
    const requestId = ++lookupRequest;
    if (lookupBy === 'name') studentIdInput.value = '';
    if (lookupBy === 'id') studentNameInput.value = '';
    studentChoice.replaceChildren();
    studentChoice.hidden = true;
    studentChoice.required = false;
    studentWarning.hidden = true;

    if (!lookupValue) return;

    try {
      const queryKey = lookupBy === 'name' ? 'studentName' : 'studentNumber';
      const response = await fetch(
        `/teacher/appointment/student?${queryKey}=${encodeURIComponent(lookupValue)}`,
        { headers: { Accept: 'application/json' } },
      );
      if (!response.ok) throw new Error('Student lookup failed');
      const { students } = await response.json();
      if (requestId !== lookupRequest) return;
      if (students.length === 1) {
        studentNameInput.value = students[0].studentName;
        studentIdInput.value = students[0].studentNumber;
      } else if (lookupBy === 'name' && students.length > 1) {
        studentNameInput.value = students[0].studentName;
        studentChoice.append(new Option('Select a student ID', ''));
        students.forEach((student) => {
          const option = new Option(student.studentNumber, student.studentNumber);
          studentChoice.append(option);
        });
        studentChoice.hidden = false;
        studentChoice.required = true;
      } else {
        studentWarning.hidden = false;
      }
    } catch {
      if (requestId === lookupRequest) studentWarning.hidden = false;
    }
  };

  studentChoice.addEventListener('change', () => {
    studentIdInput.value = studentChoice.value;
  });
  const scheduleLookup = (lookupBy) => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(() => lookupStudent(lookupBy), 300);
  };

  studentNameInput.addEventListener('input', () => scheduleLookup('name'));
  studentNameInput.addEventListener('change', () => lookupStudent('name'));
  studentIdInput.addEventListener('input', () => scheduleLookup('id'));
  studentIdInput.addEventListener('change', () => lookupStudent('id'));
  if (studentNameInput.value.trim()) lookupStudent('name');
  else if (studentIdInput.value.trim()) lookupStudent('id');
}
