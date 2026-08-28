export function createRunId(date = new Date(), sequence = 1): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const suffix = String(sequence).padStart(6, '0');

  return `RUN-${year}${month}${day}-${suffix}`;
}

export function createEntityId(prefix: string, date = new Date()): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(
    date.getDate(),
  ).padStart(2, '0')}`;

  return `${prefix}-${stamp}-${random}`;
}
