// Danish public holidays for a given year — fixed dates plus the
// Easter-relative ones, computed with the standard "Meeus/Jones/Butcher"
// Gregorian Easter algorithm (no external dependency needed for this).
//
// Post-launch backlog Phase K — cross-checked against Wikipedia's "Public
// holidays in Denmark" article: this is the complete, current list of the
// 10 legally recognized helligdage. Confirmed Store Bededag (Great Prayer
// Day) was abolished effective 2024 (Danish Parliament vote, 28 Feb 2023,
// 95-68) — correctly absent below, not an oversight. Also confirmed
// Christmas Eve (24 Dec) and New Year's Eve (31 Dec) are NOT official
// public holidays in Denmark (despite the retail-closure law covering
// them) — correctly absent too.
export type HolidayDef = { title: string; date: Date };

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function computeEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function getDkHolidays(year: number): HolidayDef[] {
  const easter = computeEasterSunday(year);
  return [
    { title: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)) },
    { title: "Maundy Thursday", date: addDays(easter, -3) },
    { title: "Good Friday", date: addDays(easter, -2) },
    { title: "Easter Sunday", date: easter },
    { title: "Easter Monday", date: addDays(easter, 1) },
    { title: "Ascension Day", date: addDays(easter, 39) },
    { title: "Whit Sunday", date: addDays(easter, 49) },
    { title: "Whit Monday", date: addDays(easter, 50) },
    { title: "Christmas Day", date: new Date(Date.UTC(year, 11, 25)) },
    { title: "Second Day of Christmas", date: new Date(Date.UTC(year, 11, 26)) },
  ];
}
