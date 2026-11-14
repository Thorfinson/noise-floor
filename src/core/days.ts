/** Days as the player lives them: counted in local time, so that a day ends at midnight where they are. */

export const DAY_MS = 86400000;

/** The number of the local day a moment falls on. */
export const dayOf = (t: number): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / DAY_MS);

/** The first moment of a local day, as a timestamp. */
export const dayStart = (day: number): number => {
  const guess = day * DAY_MS;
  return guess + new Date(guess).getTimezoneOffset() * 60000;
};

/** The local day the week of a day starts on: Monday. */
export const weekOf = (day: number): number => day - ((day + 3) % 7);

/** 0 for Monday up to 6 for Sunday. */
export const weekday = (day: number): number => (day + 3) % 7;
