const searchInput = document.querySelector('[data-destination-search]');
const destinationValue = document.querySelector('[data-destination-value]');
const destinationList = document.querySelector('[data-destination-list]');
const destinationOptions = Array.from(document.querySelectorAll('[data-destination-option]'));
const destinationEmpty = document.querySelector('[data-destination-empty]');

if (searchInput && destinationValue && destinationList) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const hasQuery = query.length > 0;
    let matchCount = 0;

    destinationOptions.forEach((option) => {
      const matches =
        hasQuery && option.dataset.locationName.toLocaleLowerCase().startsWith(query);
      option.hidden = !matches;
      if (matches) matchCount += 1;
    });

    destinationEmpty.hidden = !hasQuery || matchCount > 0;
    destinationList.hidden = !hasQuery;
  });

  destinationOptions.forEach((option) => {
    option.addEventListener('click', () => {
      destinationValue.value = option.dataset.locationId;
      searchInput.value = option.dataset.locationName;
      destinationList.hidden = true;
      destinationOptions.forEach((item) => {
        const selected = item === option;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
      });
    });
  });
}
