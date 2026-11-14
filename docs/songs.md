# Songs

## What comes with the app

Every song and piece is in the public domain, in the USA and in the EU: traditional songs, spirituals, carols and hymns, the songs of Stephen Foster and James Lord Pierpont, and the music of Bach, Beethoven, Mozart, Grieg, Tchaikovsky, Dvořák, Joplin and others. Words come only with songs whose words are free of copyright too (thirty-four of the songs to sing, see [Voice](voice.md#words)); no other lyrics are stored.

| | How many | Levels (easy / moderate / demanding / hard) |
|---|---|---|
| Guitar songbook | 69 songs, 6 of them also in power chords | 21 / 21 / 17 / 10 |
| Guitar exercises | 13: four riffs, the minor pentatonic and three licks, five picking patterns | |
| Piano book | 110 pieces, a basic version of each piece of broken chords (23), a version for both hands of the pieces of chords (21) and one for both hands together of the tunes (48) | 20 / 24 / 40 / 26 |
| Songs to sing | 43, 34 of them with words, the nine instrumental themes in solfège | 10 / 14 / 10 / 9 |

- **Guitar:** chords to strum, from two open chords on the beat (Skip to My Lou, Tom Dooley) over a pattern with upstrokes (Whiskey in the Jar, Loch Lomond) to barre chords (Wade in the Water, Jacob's Ladder); picking patterns over chords (Scarborough Fair, Greensleeves, The Water Is Wide, Danny Boy, Shenandoah, the Canon in D); and tunes on single strings (Greensleeves, the Bourrée in E minor, the Entertainer). Keys are chosen for the open chords of the guitar, or for barre chords on the harder levels.
- **Piano:** tunes for one hand, from Hot Cross Buns and Hänschen klein over Joy to the World to Für Elise; eighteen demanding pieces taken from published scores (the Rondo alla turca, Bach's first Invention, the Sonata facile, Paganini's 24th Caprice, Spring from the Four Seasons ...), the right hand's top voice; and every chord song of the songbook, struck or broken, in the key that lies best under the hand.
- **Voice:** the tunes of the piano book that a voice can sing: within an octave and a half, no leap wider than a sixth, not faster than a voice can follow. Each is moved into your range.

Tunes were compared note for note with published notation, chord charts with tune books, hymnals and published chord sheets, and every song's public-domain status was checked (see [How it listens](listening.md#how-the-songs-were-checked)).

The list (**Songs**, or **Pieces** on the piano) is sorted easiest first, with a filter by level and kind and a search by title, author or chord. **Show** picks out your favourites (the star on each row), the ones played lately (latest first), the ones that need work (begun, not done), the ones **playable now** (every chord rings for you already) and the ones **one chord short**; above the list stands the chord that would open most songs, with a way to learn it. The one you open goes into today's session.

## The notation

Songs are written in `src/music/songbook.ts`, one line each, in the notations of `src/music/songwriting.ts`:

```ts
strummed(id, title, by, bpm, pattern, chart)   // chords strummed in a pattern
picked(id, title, by, bpm, pattern, chart)     // chords picked in a pattern
tune(id, title, by, bpm, beat, notes)          // a melody, one note at a time
```

- **Chart:** bars separated by spaces; `G,D` is one bar shared by two chords; `%` repeats the bar before; `[Verse]` names the part that starts there; `x2` plays the part so many times.
- **Strumming patterns:** `beat`, `half`, `folk`, `pop`, `waltz`, `lilt`, `six`, `roll`, `chug` (eight down, for power chords) (one character per half beat: D down, U up, `.` the hand passes without touching).
- **Picking patterns:** `roll`, `waltz`, `three`, `four`, `eight`, `travis` (b is the bass string of the chord, t the string the thumb alternates to, 1 2 3 the fingers).
- **Notes:** with their octave (`E4`, `F#3`, `Bb3`), `:2` makes one twice as long, `|` ends a bar; written as string and fret (`e/7`, `A/2+e/7` for two at once) a note stays where it is put.

From one line the app works out the song's level, its piano version and, for a tune, whether a voice can sing it.

## Adding a song

To the app, for everybody: add a line to `src/music/songbook.ts` and open a pull request that names the published source you compared it with (see [Contributing](../CONTRIBUTING.md)). The song must be in the public domain in the USA and the EU.

For yourself only: **Tools → Your own song** makes a chord progression of your own into a song (on the piano, a piece of chords); **Songs → Add a song from a tab** on the guitar, **Add a melody of your own** on the piano or with the voice. It is kept in your browser.

The exercises are in `src/music/exercises.ts`, the words of the songs to sing in `src/music/lyrics.ts` (one syllable per note, checked by the tests).

## Songs you keep for yourself

A song still under copyright can be kept on your own computer as part of the songbook: put a file into `src/music/private/` that exports `SONGS`, written with the same helpers. That folder is in `.gitignore`, so it is never committed; the app takes in whatever is there.

```ts
// src/music/private/songs.ts
import type { Song } from '../content';
import { strummed } from '../songwriting';

export const SONGS: Song[] = [strummed('my-song', 'My Song', 'Somebody', 100, 'beat', '[All] G C D G')];

/** optional: songs the piano book should leave to the guitar */
export const NOT_FOR_KEYS: string[] = [];
```
