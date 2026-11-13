# Contributing

Thanks for wanting to help. Noise Floor is a small app without a framework: TypeScript, Vite, SVG and canvas drawing, the Web Audio API. Everything runs in the browser; there is no server.

## Getting started

```
npm install
npm start          # opens http://localhost:5173
npm test           # unit tests (use this, not vitest directly: it fixes a drive-letter quirk on Windows)
npm run build      # type check and production build
npm run e2e        # browser checks in Microsoft Edge, about ten minutes
```

To try things without an instrument, switch on **Settings → Show the practice instrument**: N plays the right note, W a wrong one, M a muted one, B a buzzing one.

## Reports that help most

The app listens to real instruments and voices, and what it hears in your room is the thing nobody else can test. When something is heard wrong, **Settings → When something is not heard right → Record** saves up to 30 seconds of exactly what the app heard. Attach that file to the issue and say what you played or sang. `npm run hear -- <file>` prints what the listener makes of it.

## Rules of the house

- **Real recordings before thresholds.** The listener's thresholds were set against recordings of real guitars, pianos and singers (`npm run samples` fetches them; `npx vite-node tests/real/bench.ts` and `tests/real/voicebench.ts` print scorecards). A change to the listener has to hold up there, not only on synthesized sound.
- **Measured skill.** Levels come from what the microphone heard, never from time spent. A level never goes down.
- **Two languages.** Every text the app shows is written as `L(english, german)` at the moment it is shown (`src/core/i18n.ts`). Texts kept in a constant must be functions or getters, so that they follow a change of language. German uses "du", and the international note names (B, not H).
- **Public domain only.** Songs that come with the app must be free of copyright in the USA and in the EU (composer and lyricist dead for more than 70 years, published before 1931, or traditional). See below for songs you want to keep for yourself.
- **Prose comments.** Comments say what something is for and why, in plain sentences.
- **Checks pass.** `npm test`, `npm run build` and, for anything on screen, `npm run e2e`.

## Adding a song

Songs are written in a short notation in `src/music/songbook.ts` (how it reads is in `src/music/songwriting.ts`); one song is one line:

```ts
strummed('red-river-valley', 'Red River Valley', TRAD, 96, 'folk', '[All] G G G D7 D7 D7 D7 G G G7 C C G D7 G G'),
picked('water-is-wide', 'The Water Is Wide', TRAD, 84, 'roll', '[All] D G D D Bm Em A A D G D Bm G A D D'),
tune('aura-lee', 'Aura Lee', 'George R. Poulton', 84, 1, 'G3 C4 B3 C4 | D4 A3 D4:2 | ...'),
```

Bars are separated by spaces, `G,D` is one bar shared by two chords, `[Verse]` names a part and `x2` repeats it. The app works out the song's level, its piano version (in the key that lies best under the hand) and, for tunes, whether a voice can sing it. Please name the published source you compared it with in the pull request.

## Songs you keep for yourself

A song still under copyright can be kept on your own computer: put a file into `src/music/private/` that exports `SONGS` (written with the same helpers, imported from `../songwriting`) and, if the piano book should leave some of them out, `NOT_FOR_KEYS`. That folder is in `.gitignore`; the app takes in whatever is there, and nothing of it is ever committed.

```ts
// src/music/private/songs.ts
import type { Song } from '../content';
import { strummed } from '../songwriting';

export const SONGS: Song[] = [strummed('my-song', 'My Song', 'Somebody', 100, 'beat', '[All] G C D G')];
```

## Where things are

```
src/audio     the listener (onsets, notes, chords, string check, pitch), FFT, YIN, synthesized instruments, browser audio
src/music     notes and chords, the songbook, the piano book, the songs to sing, difficulty, the learning path
src/core      measured skill, playing with the click, singing measures, settings and history, the two languages
src/game      the rules of a run and of the rhythm game, without drawing or audio
src/screens   the screens: today, session, lessons, chord check, tuner, singing, games, songs, handbook, settings
src/ui        shared drawings (tab, keyboard, chord box, pitch lane), the painted worlds of the games, helpers
tests         unit tests; tests/real the tests against real recordings; tests/e2e the browser checks
scripts       fetching the recordings, reading a recording, the test runner
docs          the guide and how the app listens
```
