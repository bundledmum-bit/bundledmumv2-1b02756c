export function getLagosDateRange(filter: string, customFrom?: string, customTo?: string) {
  const now = new Date();
  const lagosOffset = 60 * 60 * 1000; // UTC+1

  const toLocalMidnight = (d: Date) => {
    const local = new Date(d.getTime() + lagosOffset);
    local.setUTCHours(0, 0, 0, 0);
    return new Date(local.getTime() - lagosOffset);
  };
  const toLocalEndOfDay = (d: Date) => {
    const local = new Date(d.getTime() + lagosOffset);
    local.setUTCHours(23, 59, 59, 999);
    return new Date(local.getTime() - lagosOffset);
  };

  if (filter === "today") return { from: toLocalMidnight(now), to: toLocalEndOfDay(now) };
  if (filter === "week") {
    const lagosNow = new Date(now.getTime() + lagosOffset);
    const day = lagosNow.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(lagosNow.getTime() + diff * 86400000);
    monday.setUTCHours(0, 0, 0, 0);
    return { from: new Date(monday.getTime() - lagosOffset), to: now };
  }
  if (filter === "month") {
    const lagosNow = new Date(now.getTime() + lagosOffset);
    const firstOfMonth = new Date(Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), 1, 0, 0, 0));
    return { from: new Date(firstOfMonth.getTime() - lagosOffset), to: now };
  }
  if (filter === "custom" && customFrom && customTo) {
    return { from: toLocalMidnight(new Date(customFrom)), to: toLocalEndOfDay(new Date(customTo)) };
  }
  return { from: toLocalMidnight(now), to: toLocalEndOfDay(now) };
}
