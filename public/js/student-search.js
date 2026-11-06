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
          const searchableText = [location.dataset.locationName, location.dataset.locationTeacher]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase();
          location.hidden = !searchableText.includes(query);
        });
      });
    }

    const kioskSearch = document.querySelector('[data-kiosk-search]');
    const kiosks = Array.from(document.querySelectorAll('[data-kiosk-name]'));
    if (kioskSearch && kiosks.length) {
      kioskSearch.addEventListener('input', () => {
        const query = kioskSearch.value.trim().toLocaleLowerCase();
        kiosks.forEach((kiosk) => {
          const searchableText = [
            kiosk.dataset.kioskName,
            kiosk.dataset.kioskCode,
            kiosk.dataset.kioskLocation,
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase();
          kiosk.hidden = !searchableText.includes(query);
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
