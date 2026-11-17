const searchInput = document.querySelector('[data-destination-search]');
const destinationValue = document.querySelector('[data-destination-value]');
const destinationList = document.querySelector('[data-destination-list]');
const destinationOptions = Array.from(document.querySelectorAll('[data-destination-option]'));
const destinationEmpty = document.querySelector('[data-destination-empty]');

if (searchInput && destinationValue && destinationList) {
  const destinationForm = searchInput.closest('form');

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const hasQuery = query.length > 0;
    let matchCount = 0;

    destinationValue.value = '';
    searchInput.setCustomValidity('');

    destinationOptions.forEach((option) => {
      const searchText = option.dataset.searchText.toLocaleLowerCase();
      const matches = hasQuery
        ? searchText.includes(query)
        : option.dataset.defaultLocation === 'true';
      option.hidden = !matches;
      if (matches) matchCount += 1;
    });

    destinationEmpty.hidden = !hasQuery || matchCount > 0;
    destinationList.hidden = false;

    if (hasQuery) {
      const exactMatches = destinationOptions.filter((option) =>
        [option.dataset.locationName, option.dataset.locationTeacher].some(
          (value) => value?.trim().toLocaleLowerCase() === query,
        ),
      );
      if (exactMatches.length === 1) {
        destinationValue.value = exactMatches[0].dataset.locationId;
      }
    }
  });

  destinationOptions.forEach((option) => {
    option.addEventListener('click', () => {
      destinationValue.value = option.dataset.locationId;
      searchInput.value = option.dataset.locationName;
      searchInput.setCustomValidity('');
      destinationList.hidden = true;
      destinationOptions.forEach((item) => {
        const selected = item === option;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    });
  });

  destinationForm?.addEventListener('submit', (event) => {
    if (destinationValue.value) return;

    searchInput.setCustomValidity('Choose a matching location or teacher from the results.');
    event.preventDefault();
    searchInput.reportValidity();
  });
}
