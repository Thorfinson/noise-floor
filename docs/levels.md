# Levels and the path

## Measured skill

Every chord, change, pattern, scale, rhythm and line of a song has a level from 0 to 5, granted only for what the microphone heard. Levels are never earned by time spent, and they never go down. A skill not confirmed for a week is marked rusty, and rusty and low skills come up more often in runs. The rank is the total of all levels.

Beside the best value each skill keeps the first value of the last day it was measured (**last cold try**: practice within a day flatters, the first try of a day is the honest one) and the best value of every day (the course over weeks, under **Progress → Over the weeks**).

| Skill | Measured as | Levels 1 to 5 |
|---|---|---|
| Chord | time from the moment the chord is shown until all its strings rang clean; on the piano until each key and the chord as a whole rang | all clean once, then within 30, 15, 8, 5 seconds |
| Chord change | clean changes a minute | 10, 20, 30, 45, 60 |
| Finger pattern | clean tempo in beats a minute, two notes to the beat | 60, 80, 100, 120, 140 |
| Song bar, piano phrase, sung phrase | share of full speed, played without a slip | 50, 70, 85, 100 %, then 100 % three times |
| Scale (piano, voice) | time until every key rang on, or every note was held | all clean once, then within 30, 16, 10, 7 seconds |
| Keeping the beat | the tempo at which nine of ten stones were in time | 50, 60, 72, 84, 100 |
| Tones sung back | how far off the five notes were on average | within 60, 40, 28, 18, 12 cents |
| A held tone | how much the voice wavered round its own middle | within 40, 28, 20, 14, 9 cents |
| Sung patterns | notes a minute found on pitch | 30, 45, 60, 80, 100 |
| Strumming pattern | the tempo at which nine of ten strokes fell in time, with a chord | 50, 60, 72, 84, 100 |
| By ear | of a round of motifs, chords or intervals, the share found at the first try without help; of a second voice, the share of its notes on pitch | 50, 65, 80, 90, 100 % |

Each instrument measures for itself: C on the piano is another skill than C on the guitar. With the click, a bar counts at the speed of the click when every note in it was on time and nothing else was played. The thresholds live in `src/core/skills.ts`.

## How hard a song is

Every song and piece has one of four levels (easy, moderate, demanding, hard) with the reasons spelled out, worked out from its notes, so songs you add get one too.

- **Guitar, strummed:** points for the hardest chord shape (an awkward open shape 1, a small barre 2, a full barre 3), one more for two or more full barre chords, one for more than three chords and two for more than five, one for a strumming pattern with upstrokes, one when the changes come faster than every two seconds. Picking counts two, a tune one, and their pace up to two more. Up to 1 point is easy, 2 moderate, up to 4 demanding, more is hard. A song is rated by the easiest shapes the app offers (the small F♯m and Bm), so its level does not change when you learn the full barre.
- **Piano:** a tune by what the hand has to do (stay in one five-finger position, move between phrases, move inside them), its black keys, its pace and how many different phrases it has. Chords like the guitar's: the hardest shape (three white keys 0; a black key in the middle or a fourth key 1; a shape that starts on a black key or has two 2; four keys of that kind 3), how many chords, how far the hand jumps, the pattern and the pace.
- **Voice:** how wide the song is (a fifth, an octave, more), its widest leap, notes outside its key, its pace, and how many different phrases it has.

Under each song the list says what it asks of you: which of its chords already ring. Until you open a song yourself, the session works on the easiest one that is not finished; when all of it has been played clean at full speed, the session moves on to the next.

## Songs that come back

What is learned is kept by playing it again, spaced out: within half a year half of the accuracy of a skill that is not played is gone (Tatel et al. 2025), and spacing practice over days is what keeps it. So:

- A song, piece or song to sing played clean at full speed all through joins your **repertoire**. It comes back after 3 days, then 10, 30, 90 and 180, each time **from cold**: two lines at full speed, with no run-up, early in the session. A visit that goes well pushes the next one further out; one that falls apart brings the song back the next day, with the click at 85 %. The visits go round the song two lines at a time.
- **Progress → Repertoire** lists what you can play: since when, its best value, its last cold try, whether it is kept, due or slipped, and when it comes back. From there it can be played from cold or all through at any time, and its recordings heard.
- **Chords** are confirmed again the same way: after one day measured clean a chord is due after two days, then after five, twelve, thirty and sixty. The chord check takes the due ones before the others, the longest waiting first.

## Over the weeks

**Progress → Over the weeks**: the week in four numbers (days played against your goal, minutes played, new best values, songs in your repertoire), the days of the last twelve weeks as a calendar (the darker, the longer), and a small line for each of the six skills measured on most days. Up is always better: a time that falls (seconds for a chord, cents off a note) is drawn falling upwards. Each line has the value of a day on hover, and everything is also there as a table.

## The path

![The path of the guitar as a map](images/path.jpg)

**Path** shows where you are, what you can do and what comes next, as a map: stepping stones over water, one stone for each stage, the wanderer of the rhythm game on the stage you are at, a flame on every stage that is done. Any stone can be picked: under the map its sheet opens with what the stage gives you, how far it is, a button for the next thing to do, and every chord, change or song of it as a tile (done, in work, new, rusty). Nothing is locked. It also says on how many different days something was measured clean, because one good day may be luck.

| | Stages | Beside the path |
|---|---|---|
| Guitar | the eight open chords ring clean; changes at 30 a minute; five songs of each level | the barre ladder; riffs and power chords; the minor pentatonic; picking patterns; strumming patterns; hammer-on and pull-off; reading rhythm; by ear; independent fingers |
| Piano | five fingers in each hand; the first six chords; their changes; five pieces of each level | scales; both hands; both hands together; reading rhythm; by ear; chords with black keys and sevenths |
| Voice | your range measured and tones sung back in tune; sung patterns; five songs of each level | intervals and a second voice; nearer and steadier; the sung scale |

Below the map, everything measured: rank, days played, best scores, and each kind of skill folded away under its name with level, best value and what the next level needs.
