(function () {
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