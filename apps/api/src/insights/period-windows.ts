/** Monday 00:00 UTC of the week containing `d`. */
export function startOfUtcWeek(d: Date) {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff),
  );
}

/** Sunday 23:59:59.999 UTC of the week containing `d`. */
export function endOfUtcWeek(d: Date) {
  const start = startOfUtcWeek(d);
  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + 6,
      23,
      59,
      59,
      999,
    ),
  );
}

export function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
