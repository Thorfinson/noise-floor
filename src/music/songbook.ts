/**
 * The songbook: the songs the app brings along, all of them free of copyright: traditional songs, hymns
 * and spirituals, songs of the nineteenth century (Foster, Pierpont ...), and the tunes of Bach, Beethoven,
 * Grieg and others. Chord songs are written as they are commonly sung and played, in keys chosen for the
 * open chords of the guitar; tunes were compared note for note with published notation (the scores in
 * Wikipedia's articles, Mutopia, the ABC collections of abcnotation.com); rests are not written, the note
 * before is made longer. How the notations read is in songwriting.ts.
 *
 * Songs of your own that may not be published (a song still under copyright, say) go into a file in
 * src/music/private/ that exports `SONGS` (and, if the piano book is to leave some of them out,
 * `NOT_FOR_KEYS`). That folder is not part of the repository; the app takes in whatever is there.
 */
import type { Song } from './content';
import { picked, strummed, TRAD, tune } from './songwriting';

/** Songs kept on this computer only: every file in ./private that exports SONGS. */
const own = import.meta.glob<{ SONGS?: Song[]; NOT_FOR_KEYS?: string[] }>('./private/*.ts', { eager: true });
export const PRIVATE_SONGS: Song[] = Object.values(own).flatMap((m) => m.SONGS ?? []);
export const PRIVATE_NOT_FOR_KEYS: string[] = Object.values(own).flatMap((m) => m.NOT_FOR_KEYS ?? []);

/** Easiest first within each group; the order of difficulty the app shows is worked out from the songs themselves. */
export const PUBLIC_SONGBOOK: Song[] = [

  // ───────── two and three open chords, strummed on the beat or with a first pattern
  strummed('tom-dooley', 'Tom Dooley', TRAD, 100, 'beat', '[All] D D D D D D A7 A7 A7 A7 A7 A7 A7 A7 D D'),

  // ───────── tunes on single strings, slow
  tune('aura-lee', 'Aura Lee', 'George R. Poulton', 84, 1, 'G3 C4 B3 C4 | D4 A3 D4:2 | C4 B3 A3 B3 | C4:4 | G3 C4 B3 C4 | D4 A3 D4:2 | C4 B3 A3 B3 | C4:4 | E4 E4 E4:2 | E4 E4 E4:2 | E4 D4 C4 D4 | E4:4 | E4 E4 F4 E4 | D4 A3 D4:1.5 D4:0.5 | C4 B3 E4:1.5 D4:0.5 | C4:4'),
  tune('when-the-saints', 'When the Saints Go Marching In', TRAD, 96, 1, 'C4 E4 F4 | G4:5 C4 E4 F4 | G4:5 C4 E4 F4 | G4:2 E4:2 | C4:2 E4:2 | D4:5 E4 E4 D4 | C4:3 C4 | E4:2 G4:2 | G4 F4:5 E4 F4 | G4:2 E4:2 | C4:2 D4:2 | C4:4'),
  tune('auld-lang-syne', 'Auld Lang Syne', TRAD, 84, 2, 'E3:2 | A3:3 A3 A3:2 C#4:2 | B3:3 A3 B3:2 C#4:2 | A3:3 A3 C#4:2 E4:2 | F#4:6 F#4:2 | E4:3 C#4 C#4:2 A3:2 | B3:3 A3 B3:2 C#4:2 | A3:3 F#3 F#3:2 E3:2 | A3:6'),
  tune('happy-birthday', 'Happy Birthday to You', 'Patty and Mildred Hill', 92, 2, 'G3:1.5 G3:0.5 | A3:2 G3:2 C4:2 | B3:4 G3:1.5 G3:0.5 | A3:2 G3:2 D4:2 | C4:4 G3:1.5 G3:0.5 | G4:2 E4:2 C4:2 | B3:2 A3:2 F4:1.5 F4:0.5 | E4:2 C4:2 D4:2 | C4:4'),
  tune('silent-night', 'Silent Night', 'Franz Xaver Gruber', 100, 2, 'A3:3 B3 A3:2 | F#3:6 | A3:3 B3 A3:2 | F#3:6 | E4:4 E4:2 | C#4:6 | D4:4 D4:2 | A3:6 | B3:4 B3:2 | D4:3 C#4 B3:2 | A3:3 B3 A3:2 | F#3:6 | B3:4 B3:2 | D4:3 C#4 B3:2 | A3:3 B3 A3:2 | F#3:6 | E4:4 E4:2 | G4:3 E4 C#4:2 | D4:6 | F#4:6 | D4:3 A3 F#3:2 | A3:3 G3 E3:2 | D3:6'),
  tune('goin-home', "Largo from the New World Symphony (Goin' Home)", 'Antonín Dvořák', 60, 2, 'E4:3 G4 G4:4 | E4:3 D4 C4:4 | D4:3 E4 G4:3 E4 | D4:8 | E4:3 G4 G4:4 | E4:3 D4 C4:4 | D4:2 E4:2 D4:3 C4 | C4:8'),
  tune('brahms-lullaby', 'Lullaby (Wiegenlied)', 'Johannes Brahms', 84, 2, 'B3 B3 | D4:3 B3 B3:2 | D4:4 B3 D4 | G4:2 F#4:3 E4 | E4:2 D4:2 A3 B3 | C4:2 A3:2 A3 B3 | C4:4 A3 C4 | F#4 E4 D4:2 F#4:2 | G4:6'),

  // ───────── four and five open chords, or a first pattern with upstrokes over quick changes
  // the F chord comes in, strummed on the beat

  // ───────── tunes at a walking pace and quicker
  tune('oh-susanna', 'Oh! Susanna', 'Stephen Foster', 100, 2, 'A3 B3 | C#4:2 E4:2 E4:3 F#4 | E4:2 C#4:2 A3:3 B3 | C#4:2 C#4:2 B3:2 A3:2 | B3:6 A3 B3 | C#4:2 E4:2 E4:3 F#4 | E4:2 C#4:2 A3:3 B3 | C#4:2 C#4:2 B3:2 B3:2 | A3:8 | D4:4 D4:4 | F#4:2 F#4:4 F#4:2 | E4:2 E4:2 C#4:2 A3:2 | B3:6 A3 B3 | C#4:2 E4:2 E4:3 F#4 | E4:2 C#4:2 A3:3 B3 | C#4:2 C#4:2 B3:2 B3:2 | A3:8'),
  tune('drunken-sailor', 'Drunken Sailor', TRAD, 96, 4, 'D4:2 D4 D4 D4:2 D4 D4 | D4:2 G3:2 Bb3:2 D4:2 | C4:2 C4 C4 C4:2 C4 C4 | C4:2 F3:2 A3:2 C4:2 | D4:2 D4 D4 D4:2 D4 D4 | D4:2 E4:2 F4:2 G4:2 | F4:2 D4:2 C4:2 A3:2 | G3:4 G3:4 | D4:4 D4:3 D4 | D4:2 G3:2 Bb3:2 D4:2 | C4:4 C4:3 C4 | C4:2 F3:2 A3:2 C4:2 | D4:4 D4:3 D4 | D4:2 E4:2 F4:2 G4:2 | F4:2 D4:2 C4:2 A3:2 | G3:4 G3:4'),
  tune('korobeiniki', 'Korobeiniki', 'Russian folk song', 120, 2, 'B3:2 F#3 G3 A3:2 G3 F#3 | E3:2 E3 G3 B3:2 A3 G3 | F#3:3 G3 A3:2 B3:2 | G3:2 E3:2 E3:4 | A3:3 C4 E4:2 D4 C4 | B3:3 G3 B3:2 A3 G3 | F#3:2 F#3 G3 A3:2 B3:2 | G3:2 E3:2 E3:4'),
  tune('minuet-in-g', 'Minuet in G', 'Christian Petzold', 104, 2, 'D4:2 G3 A3 B3 C4 | D4:2 G3:2 G3:2 | E4:2 C4 D4 E4 F#4 | G4:2 G3:2 G3:2 | C4:2 D4 C4 B3 A3 | B3:2 C4 B3 A3 G3 | F#3:2 G3 A3 B3 G3 | A3:6 | D4:2 G3 A3 B3 C4 | D4:2 G3:2 G3:2 | E4:2 C4 D4 E4 F#4 | G4:2 G3:2 G3:2 | C4:2 D4 C4 B3 A3 | B3:2 C4 B3 A3 G3 | A3:2 B3 A3 G3 F#3 | G3:6'),
  tune('fur-elise-guitar', 'Für Elise (theme)', 'Ludwig van Beethoven', 120, 2, 'E4 D#4 | E4 D#4 E4 B3 D4 C4 | A3:3 C3 E3 A3 | B3:3 E3 G#3 B3 | C4:3 E3 E4 D#4 | E4 D#4 E4 B3 D4 C4 | A3:3 C3 E3 A3 | B3:3 E3 C4 B3 | A3:6'),
  tune('mountain-king', 'In the Hall of the Mountain King', 'Edvard Grieg', 108, 2, 'E3 F#3 G3 A3 B3 G3 B3:2 | A#3 F#3 A#3:2 A3 F3 A3:2 | E3 F#3 G3 A3 B3 G3 B3 E4 | D4 B3 G3 B3 D4:4 | B3 C#4 D#4 E4 F#4 D#4 F#4:2 | G4 D#4 G4:2 F#4 D#4 F#4:2 | B3 C#4 D#4 E4 F#4 D#4 F#4:2 | G4 D#4 G4:2 F#4:4'),
  tune('swan-lake', 'Swan Lake (theme)', 'Pyotr Ilyich Tchaikovsky', 80, 2, 'B3:4 E3 F#3 G3 A3 | B3:3 G3 B3:3 G3 | B3:3 E3 G3 E3 C3 G3 | E3:5 A3 G3 F#3 | B3:4 E3 F#3 G3 A3 | B3:3 G3 B3:3 G3 | B3:3 E3 G3 E3 C3 G3 | E3:8'),
  tune('morning-mood', 'Morning Mood', 'Edvard Grieg', 66, 3, 'E4 C#4 B3 A3 B3 C#4 | E4 C#4 B3 A3 B3:0.5 C#4:0.5 B3:0.5 C#4:0.5 | E4 C#4 E4 F#4 C#4 F#4 | E4 C#4 B3 A3:3 | E4 C#4 B3 A3 B3 C#4 | E4 C#4 B3 A3 B3:0.5 C#4:0.5 B3:0.5 C#4:0.5 | E4 C#4 E4 F#4 C#4 F#4 | E4 C#4 B3 A3:3'),
  tune('la-cucaracha', 'La Cucaracha', 'Mexican folk song', 116, 2, 'E3 E3 E3 | A3:3 C#4:2 E3 E3 E3 | A3:3 C#4:7 | A3 A3 G#3 G#3 F#3 F#3 | E3:5 E3 E3 E3 | G#3:3 B3:2 E3 E3 E3 | G#3:3 B3:7 | E4 F#4 E4 D4 C#4 B3 | A3:4'),
  tune('bourree-in-e-minor', 'Bourrée in E minor', 'Johann Sebastian Bach', 112, 2, 'E4 F#4 | G4:2 F#4 E4 D#4:2 E4 F#4 | B3:2 C#4 D#4 E4:2 D4 C4 | B3:2 A3 G3 F#3:2 G3 A3 | B3 A3 G3 F#3 E3:2 E4 F#4 | G4:2 F#4 E4 D#4:2 E4 F#4 | B3:2 C#4 D#4 E4:2 D4 C4 | B3:2 A3 G3 F#3:3 G3 | G3:6'),
  tune('the-entertainer', 'The Entertainer', 'Scott Joplin', 80, 4, 'D3 D#3 | E3 C4:2 E3 C4:2 E3 C4:6 C4 D4 D#4 | E4 C4 D4 E4:2 B3 D4:2 | C4:6 D3 D#3 | E3 C4:2 E3 C4:2 E3 C4:7 A3 G3 | F#3 A3 C4 E4:2 D4 C4 A3 | D4:6'),
  tune('jesu-joy', "Jesu, Joy of Man's Desiring", 'Johann Sebastian Bach', 72, 3, 'G3 A3 B3 D4 C4 C4 E4 D4 | D4 G4 F#4 G4 D4 B3 G3 A3 B3 | C4 D4 E4 D4 C4 B3 A3 B3 G3 | F#3 G3 A3 D3 F#3 A3 C4 B3 A3 | B3 G3:8'),
  tune('greensleeves', 'Greensleeves', TRAD, 96, 3, 'A3 | C4:2 D4 E4:1.5 F#4:0.5 E4 | D4:2 B3 G3:1.5 A3:0.5 B3 | C4:2 A3 A3:1.5 G#3:0.5 A3 | B3:2 G#3 E3:2 A3 | C4:2 D4 E4:1.5 F#4:0.5 E4 | D4:2 B3 G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 G#3:1.5 F#3:0.5 G#3 | A3:6 | G4:3 G4:1.5 F#4:0.5 E4 | D4:2 B3 G3:1.5 A3:0.5 B3 | C4:2 A3 A3:1.5 G#3:0.5 A3 | B3:2 G#3 E3:3 | G4:3 G4:1.5 F#4:0.5 E4 | D4:2 B3 G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 G#3:1.5 F#3:0.5 G#3 | A3:6'),

  // ───────── the F chord with a pattern, many chords, a first full barre, and picking
  picked('scarborough-fair', 'Scarborough Fair', TRAD, 100, 'three', '[All] Am Am G Am C Am D Am Am C C G Am G G Am'),
  tune('can-can', 'Can-can', 'Jacques Offenbach', 120, 2, 'C4:4 D4 F4 E4 D4 | G4:2 G4:2 G4 A4 E4 F4 | D4:2 D4:2 D4 F4 E4 D4 | C4 C5 B4 A4 G4 F4 E4 D4 | C4:4 D4 F4 E4 D4 | G4:2 G4:2 G4 A4 E4 F4 | D4:2 D4:2 D4 F4 E4 D4 | C4 G4 D4 E4 C4:4'),

  // ───────── barre chords one after the other, many chords at speed, and picking over hard shapes
  picked('canon-in-d', 'Canon in D', 'Johann Pachelbel', 60, 'eight', '[All] D A Bm F#m G D G A x2'),
  // ───────── songs to strum and to pick, all of them old enough to belong to everybody
  strummed('skip-to-my-lou', 'Skip to My Lou', TRAD, 112, 'beat', '[All] D D A7 A7 D D A7 D x2'),
  strummed('whole-world', "He's Got the Whole World in His Hands", 'Spiritual', 100, 'beat', '[All] C C G7 G7 C C G7 C x2'),
  strummed('down-in-the-valley', 'Down in the Valley', TRAD, 96, 'waltz', '[All] G G G G D7 D7 D7 D7 D7 D7 G G x2'),
  strummed('clementine', 'Oh My Darling, Clementine', 'Percy Montrose', 100, 'waltz', '[Verse] G G G D7 D7 G D7 G [Chorus] G G G D7 D7 G D7 G'),
  strummed('go-tell-it', 'Go Tell It on the Mountain', 'Spiritual', 100, 'folk', '[Chorus] G G C G D7 D7 G D7 G G C G G D7 G G'),
  strummed('camptown-races', 'Camptown Races', 'Stephen Foster', 112, 'beat', '[Verse] D D A7 A7 D D A7 D [Chorus] D D G D D D A7 D'),
  strummed('swing-low', 'Swing Low, Sweet Chariot', 'Spiritual', 80, 'beat', '[Chorus] D G,D D A7 D G,D D,A7 D x2'),
  strummed('joshua', 'Joshua Fit the Battle of Jericho', 'Spiritual', 108, 'beat', '[Chorus] Dm Dm A7 Dm Dm Dm A7 Dm x2'),
  strummed('saints-chords', 'When the Saints Go Marching In (chords)', TRAD, 112, 'folk', '[All] G G G G G G D D G G7 C C G D G G'),
  strummed('sweet-betsy', 'Sweet Betsy from Pike', TRAD, 104, 'waltz', '[All] C G7 C C C C G7 G7 C C F C C G7 G7 C [Chorus] C G7 G7 C'),
  strummed('home-on-the-range', 'Home on the Range', 'Daniel E. Kelley', 100, 'lilt', '[Verse] G G C C G A7 D7 D7 G G C C G D7 G G [Chorus] G D7 G G G A7 D7 D7 G G C C G D7 G G'),
  strummed('red-river-valley', 'Red River Valley', TRAD, 96, 'folk', '[All] G G G G G G D7 D7 G G7 C C G D7 G G'),
  strummed('my-bonnie', 'My Bonnie Lies over the Ocean', TRAD, 100, 'lilt', '[Verse] G C G G G A7 D7 D7 G C G G C D7 G G [Chorus] G G C C D7 D7 G G G G C C D7 D7 G G'),
  strummed('down-by-the-riverside', 'Down by the Riverside', 'Spiritual', 112, 'folk', '[Verse] G G G G D7 D7 G G G G G G D7 D7 G G [Chorus] C C G G D7 D7 G G C C G G D7 D7 G G'),
  strummed('auld-lang-syne-chords', 'Auld Lang Syne (chords)', TRAD, 84, 'folk', '[All] G D G C G D C,D G x2'),
  strummed('jingle-bells-chords', 'Jingle Bells (chords)', 'James Lord Pierpont', 120, 'folk', '[Verse] G G G C C D D7 G G G G C C D D7 G [Chorus] G G G G C G A7 D7 G G G G C G D7 G'),
  strummed('whiskey-in-the-jar', 'Whiskey in the Jar', TRAD, 116, 'folk', '[Verse] G G Em Em C C G G G G Em Em C C G Em [Chorus] D D G G C C G,D G'),
  strummed('wild-rover', 'The Wild Rover', TRAD, 100, 'lilt', '[Verse] G G G C C G D7 D7 G G x2 [Chorus] D D D7 D7 G G C C G G C C G D7 G G'),
  strummed('loch-lomond', 'Loch Lomond', TRAD, 84, 'folk', '[Verse] G D7,C G C,G C,G Am,C G,C D,G [Chorus] G D7,C G C,G C,G Am,C G,C D,G'),
  strummed('sloop-john-b', 'Sloop John B', 'Bahamian folk song', 110, 'folk', '[Verse] G G G G G G D D G G7 C C G D7 G G'),
  strummed('korobeiniki-chords', 'Korobeiniki (chords)', 'Russian folk song', 120, 'folk', '[All] B7 Em B7 Em Am Em B7 Em x2'),
  strummed('wayfaring-stranger', 'Wayfaring Stranger', TRAD, 80, 'folk', '[Verse] Em Em Am Em Em Am Am B7 Em Em Am Em Em B7 Em Em [Chorus] Em C C G G C C B7 Em Em Am Em Em B7 Em Em'),
  strummed('battle-hymn', 'Battle Hymn of the Republic', 'William Steffe', 112, 'folk', '[Verse] G G G G C C G G G G Em Em A7 D7 G G [Chorus] G G G G C C G G G G Em Em A7 D7 G G'),
  strummed('oh-susanna-chords', 'Oh! Susanna (chords)', 'Stephen Foster', 112, 'folk', '[Verse] C C C G7 C C C,G7 C [Chorus] F F C G7 C C C,G7 C'),
  strummed('la-cucaracha-chords', 'La Cucaracha (chords)', 'Mexican folk song', 132, 'pop', '[All] C C C G7 G7 G7 G7 C C C C G7 G7 G7 G7 C'),
  strummed('banks-of-the-ohio', 'Banks of the Ohio', TRAD, 100, 'folk', '[Verse] C C G7 G7 G7 G7 C C C C7 F F C G7 C C'),
  strummed('frankie-and-johnny', 'Frankie and Johnny', TRAD, 108, 'pop', '[All] C C C C F F F C G7 G7 C C x2'),
  strummed('silent-night-chords', 'Silent Night (chords)', 'Franz Xaver Gruber', 92, 'waltz', '[All] C C C C G7 G7 C C F F C C F F C C G7 G7 C Am C G7 C C'),
  strummed('careless-love', 'Careless Love', TRAD, 96, 'folk', '[All] C G7 C C C C G G C C7 F Fm C G7 C C x2'),
  strummed('when-johnny', 'When Johnny Comes Marching Home', 'Patrick Gilmore', 112, 'roll', '[All] Bm Bm D D Bm Bm F# F# Bm A Bm F# Bm,A G,F# Bm Bm x2'),
  strummed('drunken-sailor-chords', 'Drunken Sailor (chords)', TRAD, 132, 'pop', '[All] Bm Bm A A Bm Bm A Bm x2'),
  strummed('god-rest-ye', 'God Rest Ye Merry, Gentlemen', 'English carol', 120, 'folk', '[Verse] Em Em C B7 Em Em C B7 Am G Em D [Refrain] G B7 Em D G B7 Em Em'),
  strummed('nobody-knows', "Nobody Knows the Trouble I've Seen", 'Spiritual', 88, 'folk', '[Chorus] F,Bb F F,Bb C7 F,Bb F F,C7 F x2'),
  strummed('wade-in-the-water', 'Wade in the Water', 'Spiritual', 112, 'pop', '[Chorus] Gm Gm D7 Gm Gm Gm Gm D7,Gm x2'),
  strummed('go-down-moses', 'Go Down, Moses', 'Spiritual', 92, 'folk', '[Verse] Gm Gm D7 Gm Gm Gm D7 Gm [Chorus] Gm Cm Gm Gm Cm Gm D7 Gm'),
  strummed('jacobs-ladder', "Jacob's Ladder", 'Spiritual', 96, 'folk', '[All] F F Bb F F Dm F,C7 F x2'),
  strummed('what-a-friend', 'What a Friend We Have in Jesus', 'Charles C. Converse', 96, 'folk', '[All] F Bb F C7 F Bb F,C7 F C F Dm,Bb C7 F Bb F,C7 F'),
  picked('greensleeves-chords', 'Greensleeves (chords)', TRAD, 96, 'waltz', '[Verse] Am C G Em Am Am E E Am C G Em Am E Am Am [Chorus] C C G Em Am Am E E C C G Em Am E Am Am'),
  picked('water-is-wide', 'The Water Is Wide', TRAD, 84, 'roll', '[All] D G D D Bm Bm A A D G D Bm A A D D'),
  picked('danny-boy', 'Danny Boy (Londonderry Air)', TRAD, 72, 'travis', '[Verse] C C7 F C Am D7 G7 G7 C C7 F Fm C G7 C C [Chorus] C F,G7 C G7 C F,A7 D7 G7 C F C,Am F,G7 C G7 C C'),
  picked('shenandoah', 'Shenandoah', TRAD, 76, 'travis', '[All] F F F F Bb Bb F F Bb Bb Bb Bb F Dm Am F Bb C7 F F'),
];

/** Every song of the songbook: the public ones, and those kept privately on this computer. */
export const SONGBOOK: Song[] = [...PUBLIC_SONGBOOK, ...PRIVATE_SONGS];
