// Daily caps apply through ten days. Longer stays buy whole 30-day periods.
export function quote(space, start, end) {
  const hours = Math.max(
    1,
    Math.ceil((Date.parse(end) - Date.parse(start)) / 3600000),
  );
  if (!Number.isFinite(hours)) throw Error("Choose valid dates.");
  const daily = space.daily_rate ?? space.price * 8;
  const monthly = space.monthly_rate ?? space.price * 120;
  if (hours > 240) {
    const months = Math.ceil(hours / 720);
    return {
      total: months * monthly,
      rate: monthly,
      unit: "/ month",
      label: `${months} month${months === 1 ? "" : "s"}`,
      hours,
      mode: "monthly",
    };
  }
  const days = Math.floor(hours / 24),
    remainder = hours % 24;
  const total = days * daily + Math.min(remainder * space.price, daily);
  return {
    total,
    rate: hours >= 24 ? daily : space.price,
    unit: hours >= 24 ? "/ day" : "/ hour",
    label: `${hours} hours`,
    hours,
    mode: hours >= 24 ? "daily" : "hourly",
  };
}
