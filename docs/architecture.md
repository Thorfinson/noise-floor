# Architecture

A single-page app without a framework: TypeScript, Vite, SVG and canvas drawing, the Web Audio API. There is no server; the build is a set of static files.

## Layout of the code

```
src/main.ts      the router: a table of routes from the address (#/song/scarborough-fair/2) to screens, the main navigation
src/audio        hearing and sounding
  listener.ts      onsets, notes, chords, the string check, muted hits, pitch tracking for the voice
  fft.ts, peaks.ts, yin.ts   spectrum, peak picking, the YIN pitch estimator
  engine.ts        browser audio: the microphone, the metronome, sounds scheduled on the listener's clock (the backing),
                   the drone, recording what was heard, the practice instrument, the model voice
  synth.ts         synthesized guitar, piano and singing voice (for the practice instrument and the tests)
  backing.ts       the soft bass and chords under playing along
  wav.ts           reading and writing sound files, resampling for listening back
src/core         state and measures, without drawing
  skills.ts        measured skill: kinds, thresholds, levels, rusty, due again, the first value of a day, the course of days
  store.ts         settings, skills, history, reviews, favourites, practice time, the week, your plan and own songs (localStorage)
  takes.ts         the recordings of the player, kept in IndexedDB at 16 kHz
  days.ts          local days and weeks
  playalong.ts     playing along with the click: what was on time
  singing.ts       a sung note held, how steady a tone was, the range of a voice, moving a song into it
  i18n.ts          the two languages
  progressfile.ts  your progress in a file of your own choosing, written after every change, read when newer
src/music        what is played
  theory.ts        notes, chords, shapes on the guitar and on the keys
  content.ts       songs, pieces, finger patterns, scales
  songwriting.ts   the short notations songs are written in
  songbook.ts      the guitar's songs (and songs kept privately, from src/music/private)
  pianobook.ts     the piano book, the piano's fingering, songs moved to the keys
  voicebook.ts     the songs a voice can sing
  difficulty.ts    how hard a song or piece is, the current song, a chord's weight
  review.ts        songs that come back at growing gaps, from cold; the repertoire
  exercises.ts     riffs, power-chord versions, the minor pentatonic and licks, picking patterns
  strums.ts        the strumming patterns of the trainer, and which one a song uses
  lyrics.ts        words of the songs to sing, one syllable per note; where a held note is sung twice
  harmony.ts       a second voice a third below a tune
  accompany.ts     a song's words over its chords bar by bar, and the words under the notes of a tune
  rhythms.ts       the rhythms to read, in note values, level by level
  tuning.ts        the capo and the tunings of the guitar; the A it is heard with
  path.ts          the learning path
  labels.ts        skills named as a person would say them
  import.ts        reading a text tab and note names
src/game         the rules of the games, without drawing or audio (testable on their own)
  run.ts           Noise Floor: waves, foes, hits, upgrades, the Mute
  stride.ts        Stepping stones: the walk and its stones
  gesture.ts       the muted-strings gesture that pauses a run
src/screens      one file per screen or family of screens; each is a function (root, params, ctx) => cleanup
  learn.ts         lessons on three rungs (wait, click, full speed), the loop, backing, performance, recordings, by ear,
                   both hands; the chord check
  sing.ts          the voice's range, tones, held tones and songs (words, less help, a second voice)
  session.ts       the plan of the day, the short session, the summary
  ear.ts           by ear: motifs, chords, sung then played; intervals for the voice
  strum.ts         the strumming trainer; rhythm.ts reading rhythm; slur.ts hammer-on and pull-off
  singalong.ts     sing and play: the chords over the words; check.ts the hearing check
  repertoire.ts    the repertoire and the recordings; trends.ts the course over weeks; habit.ts the week and the plan
  tools.ts         the tools page, the metronome, the drone, the chord library; compose.ts your own song, playing freely
src/ui           shared drawings (tab, note strip, staff, fretboard, chord box, keyboard, pitch lane), the painted worlds
                 of the games (scene, watch, trail), the practice instrument, DOM helpers
public           the icon, the web manifest and the service worker that keeps the app's own files for offline use (the page tells it which files the first visit loaded before it was there)
```

## Screens and the session

A screen is a function that fills a root element and returns what cleans it up. The router calls it with the parts of the address; the session calls the same screens one after the other with a `SessionCtx` (the step rail, a label, `next()`), so every exercise works both on its own and as a step of the day. `withIntro(name, screen)` shows the handbook pages a screen needs the first time it is opened.

## The listener

The microphone signal arrives in slices of 128 samples. The listener keeps a short spectrum history and works on three levels:

1. **Onsets:** at every onset it compares the sound just after with the sound just before, so strings that still ring do not confuse it.
2. **What was played:** which note's harmonics explain what appeared (notes), which of the chords the app is waiting for fits (chords, with the benefit of the doubt for the expected ones), whether a string rang, buzzed or was dead (the string check).
3. **Pitch tracking** for the voice and the tuner: YIN every 21 ms, a pitch with its cents and a measure of how clear it was.

Screens tell the listener what they are waiting for (`expected`, `chordCandidates`, the string to check); it reports events (`onNote`, `onChord`, `onString`, `onPitch`, `onOnset`, `onThud`). Thresholds were set against recordings of real instruments and singers: see [How it listens](listening.md).

## The two languages

Every text is written as `L(english, german)` and chosen at the moment it is shown (`src/core/i18n.ts`). Texts kept in constants are functions or getters, so that they follow a change of language without a reload. The language is a setting; at first it follows the browser. Numbers and dates are formatted with `num()` and `dayMonth()`.

## State

`store.ts` keeps everything in one object in `localStorage` under `noise-floor/v1`: settings, skills (`chord:Am`, `pair:Em>Am`, `bar:<song>:<bar>`, `pitch:match`, `ear:motif`, `beat:strum-folk` ...) with their best value, first value of the last day and best value of each day, best scores, recent runs, sessions, progress through songs, the songs that come back (`reviews`), favourites, recently opened songs, minutes played per day, the plan, the player's own count of slips, the index of recordings, your own songs and pieces. A backup is that object as a file. The recordings themselves are in IndexedDB (`noise-floor-takes`), outside the backup.

## Drawing

Lessons and diagrams are SVG built as strings. The games and the pitch lane are canvas: what does not move is painted once and kept, what moves is drawn every frame. The palette is defined once (`src/ui/draw.ts`, `src/styles.css`); nothing switches between light and dark.
