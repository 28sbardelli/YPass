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

    const passSearch = document.querySelector('[data-manager-pass-search]');
    const passes = Array.from(document.querySelectorAll('[data-manager-pass-row]'));
    if (passSearch && passes.length) {
      passSearch.addEventListener('input', () => {
        const query = passSearch.value.trim().toLocaleLowerCase();
        passes.forEach((pass) => {
          const searchableText = [
            pass.dataset.passStudent,
            pass.dataset.passNumber,
            pass.dataset.passOrigin,
            pass.dataset.passDestination,
            pass.dataset.passStatus,
          ]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase();
          pass.hidden = !searchableText.includes(query);
        });
      });
    }

    const appointmentSearch = document.querySelector('[data-manager-appointment-search]');
    const appointments = Array.from(document.querySelectorAll('[data-manager-appointment-row]'));
    if (appointmentSearch && appointments.length) {
      appointmentSearch.addEventListener('input', () => {
        const query = appointmentSearch.value.trim().toLocaleLowerCase();
        appointments.forEach((appointment) => {
          appointment.hidden = !appointment.dataset.appointmentSearchText
            .toLocaleLowerCase()
            .includes(query);
        });
      });
    }

    const userRoleSearch = document.querySelector('[data-user-role-search]');
    const userRoleRows = Array.from(document.querySelectorAll('[data-user-role-row]'));
    if (userRoleSearch && userRoleRows.length) {
      userRoleSearch.addEventListener('input', () => {
        const query = userRoleSearch.value.trim().toLocaleLowerCase();
        userRoleRows.forEach((row) => {
          row.hidden = !row.dataset.userRoleSearchText.toLocaleLowerCase().includes(query);
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
