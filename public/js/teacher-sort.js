function parseSortDate(value) {
  const normalized = String(value ?? '').trim();
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return Date.parse(normalized);
}

function compareDates(left, right, newestFirst) {
  const leftDate = parseSortDate(left.dataset.sortDate);
  const rightDate = parseSortDate(right.dataset.sortDate);
  const leftIsValid = Number.isFinite(leftDate);
  const rightIsValid = Number.isFinite(rightDate);

  if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1;
  if (!leftIsValid || leftDate === rightDate) return 0;
  const order = leftDate < rightDate ? -1 : 1;
  return newestFirst ? -order : order;
}

function compareNewestFirst(left, right, originalOrder) {
  return compareDates(left, right, true) || originalOrder.get(left) - originalOrder.get(right);
}

function compareOldestFirst(left, right, originalOrder) {
  return compareDates(left, right, false) || originalOrder.get(left) - originalOrder.get(right);
}

document.querySelectorAll('[data-sort-control]').forEach((control) => {
  const list = document.querySelector(`[data-sort-list="${control.dataset.sortControl}"]`);
  if (!list) return;

  const rows = Array.from(list.children);
  const originalOrder = new Map(rows.map((row, index) => [row, index]));

  control.addEventListener('change', () => {
    const sortBy = control.value;
    const sortedRows = [...rows].sort((left, right) => {
      if (sortBy === 'default') return originalOrder.get(left) - originalOrder.get(right);
      if (sortBy === 'student' || sortBy === 'status') {
        return left.dataset[`sort${sortBy[0].toUpperCase()}${sortBy.slice(1)}`].localeCompare(
          right.dataset[`sort${sortBy[0].toUpperCase()}${sortBy.slice(1)}`],
          undefined,
          { sensitivity: 'base' },
        );
      }

      if (sortBy === 'date-desc') return compareNewestFirst(left, right, originalOrder);
      if (sortBy === 'date-asc') return compareOldestFirst(left, right, originalOrder);
      return 0;
    });

    sortedRows.forEach((row) => list.append(row));
  });
});
