const searchInput = document.querySelector('[data-destination-search]');
const destinationSelect = document.querySelector('[data-destination-select]');

if (searchInput && destinationSelect) {
  const options = Array.from(destinationSelect.options);

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLocaleLowerCase();

    options.forEach((option) => {
      if (!option.value) return;
      option.hidden = !option.textContent.trim().toLocaleLowerCase().includes(query);
    });

    if (destinationSelect.selectedOptions[0]?.hidden) {
      destinationSelect.value = '';
    }
  });
}