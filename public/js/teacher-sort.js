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

const passStatusPriority = new Map([
  ['pending_approval', 0],
  ['active', 1],
  ['cancelled', 2],
]);

function compareStatuses(left, right, isPassList) {
  const leftStatus = left.dataset.sortStatus;
  const rightStatus = right.dataset.sortStatus;
  if (!isPassList) return leftStatus.localeCompare(rightStatus, undefined, { sensitivity: 'base' });

  const leftPriority = passStatusPriority.get(leftStatus);
  const rightPriority = passStatusPriority.get(rightStatus);
  if (leftPriority !== undefined || rightPriority !== undefined) {
    if (leftPriority === undefined) return 1;
    if (rightPriority === undefined) return -1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  }

  return leftStatus.localeCompare(rightStatus, undefined, { sensitivity: 'base' });
}

const sortStateByList = new Map();

document.querySelectorAll('[data-sort-control][data-sort-value]').forEach((control) => {
  const listName = control.dataset.sortControl;
  const list = document.querySelector(`[data-sort-list="${listName}"]`);
  if (!list) return;

  if (!sortStateByList.has(listName)) {
    const rows = Array.from(list.children);
    sortStateByList.set(listName, {
      rows,
      originalOrder: new Map(rows.map((row, index) => [row, index])),
    });
  }
  const { rows, originalOrder } = sortStateByList.get(listName);

  const applySort = () => {
    document
      .querySelectorAll(`[data-sort-control="${listName}"][data-sort-value]`)
      .forEach((button) => button.setAttribute('aria-pressed', String(button === control)));

    const sortBy = control.dataset.sortValue;
    const sortedRows = [...rows].sort((left, right) => {
      if (sortBy === 'default') return originalOrder.get(left) - originalOrder.get(right);
      if (sortBy === 'status') {
        return compareStatuses(left, right, listName === 'passes');
      }
      if (sortBy === 'student') {
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
  };

  control.addEventListener('click', applySort);
  if (control.getAttribute('aria-pressed') === 'true') applySort();
});

document.querySelectorAll('[data-filter-control][data-filter-value]').forEach((control) => {
  const filterName = control.dataset.filterControl;
  const list = document.querySelector(`[data-sort-list="${filterName}"]`);
  if (!list) return;

  const rows = Array.from(list.children);
  control.addEventListener('click', () => {
    document
      .querySelectorAll(`[data-filter-control="${filterName}"][data-filter-value]`)
      .forEach((button) => button.setAttribute('aria-pressed', String(button === control)));

    const status = control.dataset.filterValue;
    rows.forEach((row) => {
      row.hidden = status !== 'all' && row.dataset.sortStatus !== status;
    });
  });
});
