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

      const dateOrder = Date.parse(left.dataset.sortDate) - Date.parse(right.dataset.sortDate);
      return sortBy === 'date-desc' ? -dateOrder : dateOrder;
    });

    sortedRows.forEach((row) => list.append(row));
  });
});
