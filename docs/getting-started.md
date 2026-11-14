# Getting started

## Online or on your computer

The easiest way is the [online version](https://thorfinson.github.io/noise-floor/) in Chrome or Edge on a laptop, a desktop or a tablet. It is the same app; it runs entirely in your browser, and once opened it opens without a network too.

To run it yourself you need [Node.js](https://nodejs.org/) 20 or later:

```
git clone https://github.com/Thorfinson/noise-floor.git
cd noise-floor
npm install
npm start
```

`npm start` opens http://localhost:5173. On Windows a double-click on `Noise Floor.cmd` does the same (it installs what is missing the first time). `npm run build` writes a version you can put on any web server into `dist/`.

## Finding your way

At the top: **Today**, **Songs** (or **Pieces**), **Games**, **Tools**, **Basics** (the handbook) and **Progress**; at the right the gear of the **Settings**, **Guitar**, **Piano** or **Voice**, and **EN** or **DE** (at first the app follows the language of your browser). **Progress** has three tabs: **Path** (the map of stages), **Repertoire** (what you can play, and when it comes back) and **Over the weeks** (the days you played, and a line for each skill). **Tools** has the tuner, a metronome, the chord library, a drone, strumming, playing by ear, playing freely, and your own songs.

## The first session

![Today: the plan for the day](images/today.png)

On the start page, **Today** shows the plan for the day: five or six steps, about a quarter of an hour. Press **Start today's session** (or Space) and allow the microphone. The session leads you through it; each step moves on by itself when its goal is reached (a countdown at the bottom says what comes and when; Esc stays), and **Next step** is always there. A session left half-way is not lost: the start page offers to go on at the step where you stopped. **Only 5 minutes** is the first step and the song; it counts as fully as the whole session. When the day's session is done, the start page says so and shows what was measured today.

**Your own plan.** Under the plan, **Change the plan** puts a box before every step: leave out what you do not need, and it stays out every day until you bring it back. Before you begin a new song, the start page offers it with two others to choose from (of another kind, or one whose chords all ring already), each with what it asks; after a song is done the summary does the same.

The first time a step comes up, a short page of the handbook explains it, with a picture and sometimes something to try while the app listens. All of them are under **Basics** too.

| | Guitar | Piano | Voice |
|---|---|---|---|
| 1 | Tune up | Play one A: the app adopts the piano's pitch | The first time your range; afterwards a held tone to warm up |
| (2) | An old song from cold, when one is due | An old piece from cold, when one is due | An old song from cold, when one is due |
| 2 | Chord check: the chords of today's lines of the song | The finger gym before a tune; the chord check before a piece of chords | Match the tone: five notes sung back |
| 3 | A short game of chord changes | Chord changes, or the finger gym | Intervals |
| 4 | By ear: motifs of the song (or a new strumming pattern) | By ear: motifs of the piece | The voice gym: sung patterns |
| 5 | Two lines of the song you are learning | Two phrases of the piece | Two phrases of the song |
| 6 | The hard chord, last and optional | | |

More about each in [Guitar](guitar.md), [Piano](piano.md) and [Voice](voice.md).

## The week, and a plan

The start page counts the week (Monday to Sunday) against a goal of days, four unless **Settings → Days a week to play** says otherwise, instead of an unbroken chain of days: a day missed undoes nothing. Under it, the week in a line (minutes played, new best values, songs in your repertoire). **When will you play?** makes a plan once ("After dinner, I play for 10 minutes"); a plan tied to a moment of the day helps more than any reminder, and **Put it in my calendar** saves it as a calendar entry every day at that time.

## Before you play

1. Put the laptop or microphone within about a metre of the instrument. For an electric guitar, the microphone needs to hear the amp or the unplugged strings.
2. **Guitar:** the session starts with the tuner. **Piano:** the session starts by measuring the A above middle C, because an old piano is rarely at 440 Hz. **Voice:** the first session finds your range.
3. Beside the level meter at the top right, every screen that listens shows what it heard last ("Heard: Am"): if the app gets something wrong, you see whether it was the hands or the ears.
4. **Once: the hearing check** (**Tools → Hearing check**, or **Settings**): two seconds of quiet, then the six open strings, four chords and a muted hit (on the piano five keys and three chords, with the voice five notes). The app says how many it heard right, how loud your room and your instrument reach the microphone, how far out of tune it is, and what to change; **Save the check as files** puts the recording and a report in your downloads folder, to send to whoever helps. Run it where and as you play, also on a phone or a tablet; or record the same things with another device and load the recording with **Check a recording**.
5. **Reading from the instrument.** In a window of 1440 by 900 or more, the fret numbers and chord names of a lesson are drawn about 30 pixels high, the size display guidelines ask for numbers and names that change and are read at a glance from a metre. If they are too small from where you sit, **Settings → Size of the type** makes them, the instruction and what the app says larger on the screens you play at, while the buttons keep their size so that the music keeps its room; everywhere else the whole page grows. A small window gives the music less room: full screen (F11) helps.
6. If nothing reacts, see [Troubleshooting](troubleshooting.md).

## Without an instrument

**Settings → Show the practice instrument** puts a bar of buttons under every screen that plays for you, into the same listener the microphone feeds: **N** the right note, chord or sung tone, **W** a wrong one, **M** a muted (or too short) one, **B** a buzzing one, **X** a hit on muted strings. It is the way to look around the app, and it is what the browser checks use.

## Keys

| Key | What it does |
|---|---|
| Space | Start the session, a run or a walk; pause and resume |
| 1, 2, 3 | Pick a card, or a rung of a lesson (Learn, With the click, Full speed) |
| ← → | Lines of a lesson, strings of the tuner and of the chord check, pages of the handbook |
| R | Start over |
| H | Hear it: the app plays or sings the line first, on every rung |
| − + | Slower, faster: in steps of 5 % in a lesson |
| L | A loop over the bars on show; **[** **]** take in a bar more. With the voice: less help |
| A, E, V, P, S | In a lesson: backing, by ear, performance, listen back, the staff (piano) |
| T | In a lesson by ear: show the notes. With the voice: a second voice |
| I | In a lesson: rest the hands, the app plays the line and shows it, nothing is measured |
| K | In a lesson of a tune with words: the words under the notes |
| Esc | Stay: stops a countdown to the next step |

## Settings

Language; the size of the type, the capo, the tuning of the guitar and a left-handed guitar; a progress file of your own (Edge and Chrome on a computer: your progress written into a file you choose, for instance in a folder your computers share, and read from it when it is newer there); microphone choice and test; a recording of what the app heard; metronome loudness and sound; loudness of the sounds of the games; days a week to play; recording takes at full speed; the tempo rising by itself in a loop; timing with the click; small barre shapes; menu cards chosen from the instrument; pausing a run by muting the strings; the practice instrument; tuning references for the guitar and the piano; buzz tolerance and how long a string must ring; your vocal range and how near a sung note must be; backup to a file and back; erasing everything.
