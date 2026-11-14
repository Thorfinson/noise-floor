# Voice

The voice track was built after comparing how singing apps (Singing Carrots, Yousician, Simply Sing, SingSharp, Vanido, SingTrue) and singing research measure a voice, and takes their common ground. Songs are sung with their words where the words are free of copyright too, otherwise on "la"; words are not judged, only pitch and timing.

## The session

1. **Your range** the first time (`#/range`): glide down to a low note that is still easy and hold it a moment, then up to a high one. Songs are then set two semitones inside it, a little above the middle, because an untrained voice tends to sit low. Measure it again in a few weeks: it grows. The app gives no voice-type label, only where the songs are set. Later sessions start with **a held tone** to warm up (`#/hold`): five seconds on one note, as steady as you can.
2. **An old song, from cold**, when one is due: two phrases, at full speed.
3. **Match the tone** (`#/match`): the app sings a note in a voice-like "oo", you sing it back and hold it until the ring round the dot is full. Five notes from the middle of your voice.
4. **Intervals** (`#/ear`): the app sings a note and names a distance ("a fourth up"), with a song that begins with it ("as at the start of Amazing Grace"); you sing the note that far away and hold it. Steps and thirds first, then fourths, fifths, a minor third down, then the sixth and the octave. T lets you hear the target, but then it counts as helped.
5. **The voice gym:** sung patterns at the lighthouse (a step, a third, do-mi-sol, five notes up and down, thirds), in three keys that suit your voice, the middle one with its third on the middle of your range.
6. **The song** (`#/sing/<id>`): two phrases.

## The pitch lane

![Ode to Joy on the pitch lane: the notes sung so far in green, the one to sing in blue](images/voice.png)

Time runs left to right, pitch bottom to top, one row per semitone, the rows of the black keys a little darker. Each note to sing is a bar at its height, as long as the note lasts, with its syllable in it (or under it, where the bar is too short); your voice is a line and a dot. A ring round the dot fills while you hold a note. A bar the voice lay on turns green; one sung close (between 50 and 100 cents off) turns amber, and is not shown as a failure.

## Words

Thirty-four songs come with their words, each in the language it is sung in: traditional words, and words by poets dead for more than seventy years (Jane Taylor, Sarah Josepha Hale, Friedrich Schiller, Robert Burns, John Newton, John Mason Neale, Thomas Oliphant, James Lord Pierpont, Franz Wiedemann, Hoffmann von Fallersleben, Ernst Anschütz, W. W. Fosdick, Stephen Foster, Patty and Mildred Hill, William Arms Fisher, the Wunderhorn lullaby that Brahms set, the first lines of the Habanera, by Meilhac and Halévy, placed as the score in Wikipedia's article on the aria places them, and Nekrasov's verse of Korobeiniki in Latin letters; no source with these words under the notes of the tune was found, so they are placed by the tune itself, each rhyme on the same turn of it). Where the words have a syllable more than the played melody has notes (When the Saints, Go Tell Aunt Rhody), the sung version repeats the held note for it, as song sheets do. The other nine are themes of instrumental music, which have no words (Für Elise, Swan Lake, Morning Mood …). They are sung in solfège: under each note its name in movable do (do re mi; a tune in minor sits on la, as Kodály teaches it), the same names the voice gym sings, which also trains reading a tune. The same words stand under the notes of the guitar tune or piano piece of the same melody (K in a lesson), and over the chords on the guitar's **Sing and play**. One syllable under each note; a note the syllable before is held over has none. The tests check that every phrase has exactly as many syllables as notes.

## Songs on three rungs

- **1 Learn:** the app waits until it hears each note held. The same note twice needs a new start (a new syllable or a breath). Staying on the note you just sang while you find the next one is waiting, not a slip. **H** sings the phrase for you first.
- **2 With the click:** each note is judged by the middle of what was heard in it, leaving out the first fifth of a second (a voice slides into a note) and the end.
- **3 Full speed:** from the phrase you are at to the end. The take is recorded and kept in this browser, as on the instruments.

**Less help** (key L, or **More → How much help**), once a phrase sits: *the model and the line* (everything); *the line only* (H gives the first note, the rest is yours); *neither* (H gives the first note; the line and your voice are shown once it is sung). Seeing the pitch helps a voice that is learning to find notes, and the gain can fade when the display is gone, so it is taken away step by step.

**A second voice** (key T, or **More → Sing a third below**): the app sings the tune with the click, you sing the voice a third below it, in the key of the song. For headphones only: through speakers the microphone would hear the app instead of you. Measured as a share of its notes found, apart from the tune.

## How it measures

- **Within 50 cents** counts as on the note: the right semitone, as singing studies use. **Settings → How near a sung note must be** offers 35, 50 or 75 cents.
- **By the middle.** A held note counts when the middle of the readings of the last quarter second lies near it and at least half of them lie inside the band. A voice with vibrato swings round its note by half a semitone and more and is heard on it; on recordings of 29 singers this takes 99 of 100 held notes as held, and a note a semitone off about once in a hundred (see [How it listens](listening.md)).
- **Any octave.** A low voice and a high one sing the same songs. A pitch reading that jumps an octave for an instant is a slip of the tracker and is moved back.
- **Call and response.** While the app sings, it does not listen, so its own voice is never taken for yours.

| Measured | As | Levels 1 to 5 |
|---|---|---|
| Tones sung back | how far off the five notes were on average, in cents (at least four of five found) | within 60, 40, 28, 18, 12 cents |
| A held tone | how much the voice wavered round its own middle over five seconds | within 40, 28, 20, 14, 9 cents |
| Sung patterns | notes a minute found on pitch, one after the other | 30, 45, 60, 80, 100 |
| The sung scale | time for eight notes up, each held on pitch | all once, then within 30, 16, 10, 7 seconds |
| A phrase of a song | share of full speed, without a slip | 50, 70, 85, 100 %, then 100 % three times |
| Intervals, a second voice | share found at the first try, or of the notes on pitch | 50, 65, 80, 90, 100 % |

## Games and tools

- **Voice gym** and **Song run** at the lighthouse: the tune of each piece of noise is shown with its notes named in the scale and drawn higher and lower. A note counts once held on pitch for a quarter of a second, in any octave; a note held clearly elsewhere breaks the chain. The Mute at the end is a major scale sung up, one seal for each note.
- **Stepping stones** with the voice: one short sung "ta" on each stone, on a note that changes every bar (do, then mi).
- **Tools → Drone:** a note held under you, with its fifth, to sing a scale against. **Tools → Play freely:** sing phrases of the pentatonic over a drone; the app shows what it heard, without a score.

## The handbook of the voice

Eleven pages in five chapters: standing and breathing, warming up; finding a note, reading the lane, holding a tone; steps and leaps, the beat; intervals and a second voice; your range, looking after your voice. Practise little and often, drink water, and stop when the voice gets hoarse or tired.

## What it cannot tell

How a note is produced (support, strain, registers) is not something a pitch can show. The real voices it was tested with sang their own songs, close to the microphone; how your voice, microphone and room come through is yours to find out.
