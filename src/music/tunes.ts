/**
 * The tunes of songs of chords that have no words in the app, laid over their bars: what is sung over the
 * chords, so that a song can be heard before it is learned. A song with words gets its tune from the voice
 * book instead (sheet() in accompany.ts); tuneOf() there asks both.
 */
import type { Song } from './content';
import type { SungNote } from './accompany';

/** The tune of a song of chords, in note units of its bars from the first bar (an upbeat lies before 0), in the key of its chords; null when none is written. */
export function tuneNotes(_song: Song): SungNote[] | null {
  return null;
}
