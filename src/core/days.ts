/** Days as the player lives them: counted in local time, so that a day ends at midnight where they are. */

export const DAY_MS = 86400000;

/** The number of the local day a moment falls on. */
export const dayOf = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY_MS);

/**
 * A clock time on a local day ("19:30" on it), as a timestamp. The day's number is its date (read in UTC),
 * and the calendar turns date and time into a moment: adding hours to midnight, or taking the time zone's
 * offset at UTC midnight, is an hour off on a day the clocks change (Auckland, Santiago, Beirut). Where
 * midnight itself is skipped that day, it starts at one.
 */
export const atTime = (day: number, hours: number, minutes = 0): number => {
  const d = new Date(day * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes).getTime();
};

/** The first moment of a local day, as a timestamp. */
export const dayStart = (day: number): number => atTime(day, 0);

/** The local day the week of a day starts on: Monday. */
export const weekOf = (day: number): number => day - ((day + 3) % 7);

/** 0 for Monday up to 6 for Sunday. */
export const weekday = (day: number): number => (day + 3) % 7;
