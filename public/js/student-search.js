(() => {
  const initializeStudentSearch = () => {
    const search = document.querySelector('[data-student-search]');
    const rows = Array.from(document.querySelectorAll('[data-student-name]'));
    if (search && rows.length) {
      search.addEventListener('input', () => {
        const query = search.value.trim().toLocaleLowerCase();
        rows.forEach((row) => {
          const name = row.dataset.studentName.toLocaleLowerCase();
          const studentId = row.dataset.studentId.toLocaleLowerCase();
          row.hidden = !name.includes(query) && !studentId.includes(query);
        });
      });
    }

    const locationSearch = document.querySelector('[data-location-search]');
    const locations = Array.from(document.querySelectorAll('[data-location-name]'));
    if (locationSearch && locations.length) {
      locationSearch.addEventListener('input', () => {
        const query = locationSearch.value.trim().toLocaleLowerCase();
        locations.forEach((location) => {
          location.hidden = !location.dataset.locationName.toLocaleLowerCase().includes(query);
        });
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeStudentSearch, { once: true });
  } else {
    initializeStudentSearch();
  }
})();
