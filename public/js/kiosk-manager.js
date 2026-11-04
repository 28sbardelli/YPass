(function () {
  const managerCode = 'THETIAI4491';
  let buffer = '';
  let clearTimer;

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (buffer.toUpperCase() === managerCode) {
        event.preventDefault();
        window.location.assign('/kiosk/pass?manager=1');
      }
      buffer = '';
      return;
    }
    if (event.key.length !== 1) return;
    buffer += event.key;
    if (buffer.toUpperCase() === managerCode) {
      event.preventDefault();
      window.location.assign('/kiosk/pass?manager=1');
      buffer = '';
      return;
    }
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { buffer = ''; }, 750);
  }, true);

  document.querySelectorAll('[data-manager-search]').forEach((input) => {
    input.addEventListener('input', () => {
      const select = document.getElementById(input.dataset.managerSearch === 'location' ? 'locationId' : 'teacherUserId');
      const query = input.value.trim().toLowerCase();
      Array.from(select.options).forEach((option) => {
        option.hidden = Boolean(query) && !option.textContent.toLowerCase().includes(query);
      });
    });
  });
})();