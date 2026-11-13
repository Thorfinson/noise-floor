# Testing

```
npm test          # unit tests
npm run e2e       # browser checks in Microsoft Edge
npm run build     # type check and production build
npm run samples   # once: fetch the recordings of real instruments and voices
```

## Unit tests

`npm test` runs the unit tests with Vitest (through `scripts/test.mjs`, which works around a drive-letter quirk on Windows; `npm test -- tests/voice.test.ts` runs one file). They push minutes of synthesized audio through the real listener: notes, chords and strums on a synthesized guitar and piano, a singing voice with scoops, vibrato and breath, a room around them. They also cover the rules of the games, measured skill, playing with the click, the songbook and the piano book (every song readable, rated, playable and heard right), the songs to sing, the learning path and both languages.

## Tests against real recordings

Synthesized sound is not enough: every real bug the listener had (a peak estimate that blew up next to empty bins, a "rings" threshold guessed far too high, onsets blind to low notes among ringing strings, a chord with one loud key taken for that key, a held sung note rejected because of vibrato) passed the synthetic tests and was found on recordings.

`npm run samples` downloads recordings of real guitars, pianos and singers from where their makers published them (see [CREDITS.md](../CREDITS.md)); they stay in `tests/real/` on your computer and are not part of the repository. `npm run samples -- chords` fetches only the piano chords, `-- voice` only the singers. Tests that need them are skipped until they are there.

Scorecards for tuning the listener:

```
npx vite-node tests/real/bench.ts          # guitars and pianos; ROOM=0.5,0.7 in front puts a simulated room around them
npx vite-node tests/real/voicebench.ts     # each recorded singer: how much was heard, how near, notes judged and held
```

## Browser checks

`npm run e2e` starts the app, opens it in headless Microsoft Edge and plays to it, in about ten minutes:

1. **Through the microphone path**, with a synthesized guitar and, when the recordings are there, the recorded guitar and piano fed in as the browser's capture device.
2. **Through the practice instrument**: the guided session from start to end, the tuner, the chord check, lessons on all three rungs, the games with their upgrades and the Mute, the handbook, the path, the piano.
3. **The voice and German**: the voice session with the practice voice, the pitch lane, the songs to sing, and the whole app switched to German and back.

Screenshots go to `tests/e2e/out/`. The test browser is set to English, so the checks read English texts.

Checks pass or fail; whether a person finds their way through a screen they cannot say. `npx vite-node tests/e2e/walk.ts [width] [height]` plays through today's session as a first-time player and saves a picture of every screen to `tests/e2e/out/walk/` (by default 1366 by 650). The pictures have to be looked at.

## Reading a recording

**Settings → When something is not heard right → Record** saves what the app heard. `npm run hear -- <file>` prints what the listener makes of it, moment by moment; options such as `instrument=piano`, `chords=C,F,G`, `expect=E2` or `string=A2` are at the top of `scripts/hear.ts`.

## Continuous integration

GitHub Actions runs the type check, the unit tests and the build on every push and pull request, and the browser checks on Windows with Edge. The tests against real recordings are not part of it: they need the downloads, and several of the recordings' licences do not allow keeping them anywhere but on the computer that fetched them for its own use.
