# Testing

```
npm test          # unit tests
npm run e2e       # browser checks in Microsoft Edge
npm run build     # type check and production build
npm run samples   # once: fetch the recordings of real instruments and voices
```

## Unit tests

`npm test` runs the unit tests with Vitest (through `scripts/test.mjs`, which works around a drive-letter quirk on Windows; `npm test -- tests/voice.test.ts` runs one file). They push minutes of synthesized audio through the real listener: notes, chords and strums on a synthesized guitar and piano, a singing voice with scoops, vibrato and breath, a room around them. They also cover the rules of the games, measured skill (its first value of a day, its course, when it is due again), songs that come back and the repertoire, playing with the click, the songbook and the piano book (every song readable, rated, playable and heard right, power chords too), the exercises, the strumming patterns, playing by ear, both hands on the piano and the staff, the words of the songs to sing (as many syllables as notes), the week and the plan, the songs to sing, the learning path and both languages.

Both hands were tested against real piano notes before they were built: a root struck together with its chord was not reliably heard (its partials are the chord's), struck on its own before the chord it was heard as the right key every time; the version for both hands follows that (`tests/hands.test.ts`).

## Tests against real recordings

Synthesized sound is not enough: every real bug the listener had (a peak estimate that blew up next to empty bins, a "rings" threshold guessed far too high, onsets blind to low notes among ringing strings, a chord with one loud key taken for that key, a held sung note rejected because of vibrato) passed the synthetic tests and was found on recordings.

`npm run samples` downloads recordings of real guitars, pianos and singers from where their makers published them (see [CREDITS.md](../CREDITS.md)); they stay in `tests/real/` on your computer and are not part of the repository. `npm run samples -- chords` fetches only the piano chords, `-- voice` only the singers. Tests that need them are skipped until they are there.

Scorecards for tuning the listener:

```
npx vite-node tests/real/bench.ts          # guitars and pianos; ROOM=0.5,0.7 in front puts a simulated room around them
npx vite-node tests/real/voicebench.ts     # each recorded singer: how much was heard, how near, notes judged and held
npx vite-node tests/real/singbench.ts      # the strummed pieces with a singer mixed in, at several loudnesses
npx vite-node tests/real/handsbench.ts     # a bass and a melody key of the piano struck together; a root under a chord
npx vite-node tests/real/legatobench.ts    # slides, and notes joined without a new pluck (hammer-on, pull-off)
```

## Browser checks

`npm run e2e` starts the app, opens it in headless Microsoft Edge and plays to it. Its sections (named in brackets below) run side by side, each in a browser of its own: one at a time for every four processor cores, so that the browsers stay on the click. On sixteen cores the whole run takes a little over four minutes; one after the other, about twelve. `E2E_JOBS=2` sets how many run at once (`1`: one after the other), `E2E_ONLY=2b,3` runs only those sections, and `E2E_TIMES=1` puts the seconds since the start before every check. Each check says its section, as in `PASS  [2p] piano: …`.

1. **Through the microphone path** (1, the tuner 1b, the recordings 1c and 1d), with a synthesized guitar and, when the recordings are there, the recorded guitar and piano fed in as the browser's capture device.
2. **Through the practice instrument** (2 for the guitar, 2p for the piano): the guided session from start to end (with playing by ear before the song), the tuner, the chord check, lessons on all three rungs, the games with their upgrades and the Mute, the handbook, the path, the piano.
3. **The new pages** (2b): the repertoire and a visit from cold, the loop, a performance and its self-rating, the strumming trainer, the tools, the metronome, the chord library, your own song, playing freely, the weeks.
4. **Reading from the instrument, tablets and offline** (2c): at 1440 by 900 the fret numbers and chord names of a lesson are drawn at least 29 to 30 pixels high, the instruction over 40 and the names of the piano's keys at least 19 (measured on the screen, the drawing's scale included); the largest type makes them and the instruction at least a fifth larger and leaves the buttons as they are; the bar under a lesson stays one row in German; a left-handed guitar mirrors the fretboard and the chord picture; at 1024 by 768, 1180 by 820 and 768 by 1024 the start page and the lessons fit without sideways scrolling; favourites in the songs to sing; and the built app, opened once, opens again and plays a lesson after its server has been stopped.
5. **What was still missing after the research round** (2d): the tempo from 25 to 125 %, the settings as a gear, resting the hands (I) and the handbook page on fingertips, a step left out of the plan and the next song chosen among three, words under the notes (K) and the sing-along page with a bar turning green, the capo in the lesson and seven tunings in the tuner, reading rhythm, hammer-on and pull-off, both hands together on the piano, whether coming back keeps the songs, the progress file in the settings, the new stages of the path, phones standing and lying (390 by 844), a lesson played by tapping alone, the hearing check heard right to the end on the guitar and the piano, and a recording of the real guitar loaded into it and checked.
6. **The voice and German** (3): the voice session with the practice voice (intervals, words under the notes), the pitch lane, the songs to sing, and the whole app switched to German and back.

Screenshots go to `tests/e2e/out/`. The test browser is set to English, so the checks read English texts.

Checks pass or fail; whether a person finds their way through a screen they cannot say. `npx vite-node tests/e2e/walk.ts [width] [height]` plays through today's session as a first-time player and saves a picture of every screen to `tests/e2e/out/walk/` (by default 1366 by 650). The pictures have to be looked at.

## Reading a recording

**Settings → When something is not heard right → Record** saves what the app heard. `npm run hear -- <file>` prints what the listener makes of it, moment by moment; options such as `instrument=piano`, `chords=C,F,G`, `expect=E2` or `string=A2` are at the top of `scripts/hear.ts`.

## Continuous integration

GitHub Actions runs the type check, the unit tests and the build on every push and pull request, and the browser checks on Windows with Edge. The tests against real recordings are not part of it: they need the downloads, and several of the recordings' licences do not allow keeping them anywhere but on the computer that fetched them for its own use.
