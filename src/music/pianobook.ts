/**
 * The piano book: what there is to play on the piano besides the four pieces the app began with.
 *
 * Tunes for one hand, one key at a time: old songs and themes that belong to everybody, written here for
 * the keys around middle C, and the tunes of the songbook, moved to where they lie well on the keyboard.
 * Every tune gets its fingering worked out (see `fingering`).
 *
 * And the songs of the songbook as chords: the same chords in the same bars as on the guitar, played with
 * the right hand. Where the guitar strums on the beat, the piano strikes the chord as a whole; where the
 * guitar has a pattern, the piano breaks the chord into its keys, one after the other. Of a song that is
 * still under copyright that is all there is here, as in the songbook: its name and its chords in order.
 */
import { L } from '../core/i18n';
import { PRIVATE_NOT_FOR_KEYS } from './songbook';
import { SONGS, tabMidi, type PianoNote, type PianoPiece, type Song } from './content';
import { isBlackKey, keyWeight, pianoChord, transposed, whiteStep } from './theory';

const TRAD = 'Traditional';

/**
 * Tunes written for the piano: [id, title, by, clicks a minute, note units per click, the notes].
 * Each was compared note for note with published notation (the scores in Wikipedia's articles, Mutopia,
 * the ABC collections of abcnotation.com, lieder-archiv.de); where a song has several common versions,
 * this is one of them.
 * Notes carry their octave ("E4", "F#4", "Bb3"), ":2" makes one twice as long, "|" is a bar line and "//"
 * ends a phrase. A phrase may begin before the bar line with an upbeat; the click then falls on the bar line.
 */
const TUNES: [string, string, string, number, number, string][] = [
  ['hot-cross-buns', 'Hot Cross Buns', TRAD, 96, 1, 'E4 D4 C4:2 | E4 D4 C4:2 // C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 | E4 D4 C4:2'],
  ['mary-lamb', 'Mary Had a Little Lamb', TRAD, 100, 1, 'E4 D4 C4 D4 | E4 E4 E4:2 // D4 D4 D4:2 | E4 G4 G4:2 // E4 D4 C4 D4 | E4 E4 E4 E4 // D4 D4 E4 D4 | C4:4'],
  ['au-clair', 'Au clair de la lune', TRAD, 96, 1, 'C4 C4 C4 D4 | E4:2 D4:2 // C4 E4 D4 D4 | C4:4 // C4 C4 C4 D4 | E4:2 D4:2 // C4 E4 D4 D4 | C4:4 // D4 D4 D4 D4 | A3:2 A3:2 // D4 C4 B3 A3 | G3:4 // C4 C4 C4 D4 | E4:2 D4:2 // C4 E4 D4 D4 | C4:4'],
  ['haenschen-klein', 'Hänschen klein (Lightly Row)', TRAD, 100, 1, 'G4 E4 E4:2 | F4 D4 D4:2 // C4 D4 E4 F4 | G4 G4 G4:2 // G4 E4 E4:2 | F4 D4 D4:2 // C4 E4 G4 G4 | C4:4 // D4 D4 D4 D4 | D4 E4 F4:2 // E4 E4 E4 E4 | E4 F4 G4:2 // G4 E4 E4:2 | F4 D4 D4:2 // C4 E4 G4 G4 | C4:4'],
  ['go-tell-aunt-rhody', 'Go Tell Aunt Rhody', TRAD, 96, 1, 'E4:2 E4 D4 | C4:2 C4:2 // D4:2 D4 F4 | E4 D4 C4:2 // G4:2 G4 F4 | E4:2 E4:2 // D4 C4 D4 E4 | C4:4'],
  ['alle-meine-entchen', 'Alle meine Entchen', TRAD, 92, 1, 'C4 D4 E4 F4 | G4:2 G4:2 // A4 A4 A4 A4 | G4:4 // A4 A4 A4 A4 | G4:4 // F4 F4 F4 F4 | E4:2 E4:2 // G4 G4 G4 G4 | C4:4'],
  ['kuckuck', 'Kuckuck, Kuckuck, ruft’s aus dem Wald', TRAD, 108, 1, 'G4 E4:2 | G4 E4:2 // D4 C4 D4 | C4:3 // D4 D4 E4 | F4:2 D4 // E4 E4 F4 | G4:2 E4 // G4:2 E4 | G4:2 E4 // F4 E4 D4 | C4:3'],
  ['frere-jacques', 'Frère Jacques (Bruder Jakob)', TRAD, 100, 1, 'C4 D4 E4 C4 | C4 D4 E4 C4 // E4 F4 G4:2 | E4 F4 G4:2 // G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 // C4 G3 C4:2 | C4 G3 C4:2'],
  ['jingle-bells', 'Jingle Bells', 'James Lord Pierpont', 112, 1, 'E4 E4 E4:2 | E4 E4 E4:2 // E4 G4 C4:1.5 D4:.5 | E4:4 // F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 // E4 D4 D4 E4 | D4:2 G4:2 // E4 E4 E4:2 | E4 E4 E4:2 // E4 G4 C4:1.5 D4:.5 | E4:4 // F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 // G4 G4 F4 D4 | C4:4'],
  ['london-bridge', 'London Bridge', TRAD, 104, 1, 'G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 // D4 E4 F4:2 | E4 F4 G4:2 // G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 // D4:2 G4:2 | E4 C4:3'],
  ['fuchs', 'Fuchs, du hast die Gans gestohlen', TRAD, 100, 1, 'C4 D4 E4 F4 | G4 G4 G4 G4 // A4 F4 C5 A4 | G4:4 // A4 F4 C5 A4 | G4:4 // G4 F4 F4 F4 | F4 E4 E4 E4 // E4 D4 E4 D4 | C4 E4 G4:2 // G4 F4 F4 F4 | F4 E4 E4 E4 // E4 D4 E4 D4 | C4:4'],
  ['skip-to-my-lou', 'Skip to My Lou', TRAD, 108, 1, 'E4:2 C4:2 | E4 E4:.5 E4:.5 G4:2 // D4:2 B3:2 | D4 D4:.5 D4:.5 F4:2 // E4:2 C4:2 | E4 E4:.5 E4:.5 G4:2 // D4 E4:.5 F4:.5 E4 D4 | C4:2 C4:2'],
  ['sur-le-pont', 'Sur le pont d’Avignon', TRAD, 108, 1, 'C4 C4 C4:2 | D4 D4 D4:2 // E4 F4 G4 C4 | B3 C4 D4 G3 // C4 C4 C4:2 | D4 D4 D4:2 // E4 F4 G4 C4 | D4 B3 C4:2'],
  ['old-macdonald', 'Old MacDonald Had a Farm', TRAD, 108, 1, 'C4 C4 C4 G3 | A3 A3 G3:2 // E4 E4 D4 D4 | C4:3 G3 // C4 C4 C4 G3 | A3 A3 G3:2 // E4 E4 D4 D4 | C4:3 // G3:.5 G3:.5 | C4 C4 C4 G3:.5 G3:.5 | C4 C4 C4:2 // C4:.5 C4:.5 C4 C4:.5 C4:.5 C4 | C4:.5 C4:.5 C4:.5 C4:.5 C4 C4 // C4 C4 C4 G3 | A3 A3 G3:2 // E4 E4 D4 D4 | C4:4'],
  ['yankee-doodle', 'Yankee Doodle', TRAD, 112, 1, 'C4 C4 D4 E4 | C4 E4 D4 G3 // C4 C4 D4 E4 | C4:2 B3:2 // C4 C4 D4 E4 | F4 E4 D4 C4 // B3 G3 A3 B3 | C4:2 C4:2'],
  ['row-your-boat', 'Row, Row, Row Your Boat', TRAD, 66, 3, 'C4:3 C4:3 | C4:2 D4 E4:3 // E4:2 D4 E4:2 F4 | G4:6 // C5 C5 C5 G4 G4 G4 | E4 E4 E4 C4 C4 C4 // G4:2 F4 E4:2 D4 | C4:6'],
  ['lieber-augustin', 'O du lieber Augustin', TRAD, 126, 1, 'G4:1.5 A4:.5 G4:.5 F4:.5 | E4 C4 C4 // D4 G3 G3 | E4 C4 C4 // G4:1.5 A4:.5 G4:.5 F4:.5 | E4 C4 C4 // D4 G3 G3 | C4:3 // D4 G3 G3 | E4 C4 C4 // D4 G3 G3 | E4 C4 C4 // G4:1.5 A4:.5 G4:.5 F4:.5 | E4 C4 C4 // D4 G3 G3 | C4:3'],
  ['alouette', 'Alouette', 'French-Canadian folk song', 108, 1, 'C4:1.5 D4:.5 E4 E4 | D4:.5 C4:.5 D4:.5 E4:.5 C4 G3 // C4:1.5 D4:.5 E4 E4 | D4:.5 C4:.5 D4:.5 E4:.5 C4:2'],
  ['good-king-wenceslas', 'Good King Wenceslas', 'Piae Cantiones, 1582', 108, 1, 'C4 C4 C4 D4 | C4 C4 G3:2 // A3 G3 A3 B3 | C4:2 C4:2 // C4 C4 C4 D4 | C4 C4 G3:2 // A3 G3 A3 B3 | C4:2 C4:2 // G4 F4 E4 D4 | E4 D4 C4:2 // A3 G3 A3 B3 | C4:2 C4:2 // G3 G3 A3 B3 | C4 C4 D4:2 // G4 F4 E4 D4 | C4:2 F4:2 | C4:4'],
  ['surprise', 'Surprise Symphony (theme)', 'Joseph Haydn', 100, 1, 'C4 C4 E4 E4 | G4 G4 E4:2 // F4 F4 D4 D4 | B3 B3 G3:2 // C4 C4 E4 E4 | G4 G4 E4:2 // C5 C5 F#4 F#4 | G4:2 G3:2'],
  ['deck-the-halls', 'Deck the Halls', 'Welsh carol', 108, 1, 'G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 // D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5 | C4 B3 C4:2 // G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 // D4:.5 E4:.5 F4:.5 D4:.5 E4:1.5 D4:.5 | C4 B3 C4:2 // D4:1.5 E4:.5 F4 D4 | E4:1.5 F4:.5 G4 D4 // E4:.5 F#4:.5 G4 A4:.5 B4:.5 C5 | B4 A4 G4:2 // G4:1.5 F4:.5 E4 D4 | C4 D4 E4 C4 // A4:.5 A4:.5 A4:.5 A4:.5 G4:1.5 F4:.5 | E4 D4 C4:2'],
  ['joy-to-the-world', 'Joy to the World', 'Lowell Mason, after Handel', 92, 1, 'C5 B4:.75 A4:.25 | G4:1.5 F4:.5 | E4 D4 | C4:1.5 // G4:.5 | A4:1.5 A4:.5 | B4:1.5 B4:.5 | C5:1.5 // C5:.5 | C5:.5 B4:.5 A4:.5 G4:.5 | G4:.75 F4:.25 E4:.5 // C5:.5 | C5:.5 B4:.5 A4:.5 G4:.5 | G4:.75 F4:.25 E4:.5 // E4:.5 | E4:.5 E4:.5 E4:.5 E4:.25 F4:.25 | G4:1.5 // F4:.25 E4:.25 | D4:.5 D4:.5 D4:.5 D4:.25 E4:.25 | F4:1.5 // E4:.25 D4:.25 | C4:.5 C5 A4:.5 | G4:.75 F4:.25 E4:.5 F4:.5 | E4 D4 | C4:2'],
  ['canon-in-d', 'Canon in D (theme)', 'Johann Pachelbel', 56, 2, 'F#5:2 E5:2 | D5:2 C#5:2 // B4:2 A4:2 | B4:2 C#5:2 // D5:2 C#5:2 | B4:2 A4:2 // G4:2 F#4:2 | G4:2 E4:2 // D4 F#4 A4 G4 | F#4 D4 F#4 E4 // D4 B3 D4 A4 | G4 B4 A4 G4'],
  ['kleine-nachtmusik', 'Eine kleine Nachtmusik (opening)', 'Wolfgang Amadeus Mozart', 126, 2, 'G4:3 D4 G4:3 D4 | G4 D4 G4 B4 D5:4 // C5:3 A4 C5:3 A4 | C5 A4 F#4 A4 D4:4'],
  // Taken from published scores as text (Mutopia's LilyPond files, ABC from the Musica Viva collection),
  // converted by script and compared with a second source where there was one. Right hand, top voice,
  // ornaments left out, rests added to the note before them; the Clementi, the Arabesque, Spring and the
  // Marche militaire an octave down. From Wikipedia's scores: the Hungarian Dance (all eight bars the score
  // has), the Habanera (its first phrase) and the melody staff of a piano arrangement of Boccherini's Minuet.
  // From tune books: the William Tell march (Hamilton, 1844, put back into Rossini's E major) and Handel's
  // Hornpipe. The Ecossaise back in E flat, as the transcriber notes it was.
  ['rondo-alla-turca', 'Rondo alla turca (Turkish March)', 'Wolfgang Amadeus Mozart', 116, 4, 'B4 A4 G#4 A4 | C5:4 D5 C5 B4 C5 | E5:4 // F5 E5 D#5 E5 | B5 A5 G#5 A5 B5 A5 G#5 A5 // C6:4 A5:2 C6:2 | B5:2 A5:2 G5:2 A5:2 // B5:2 A5:2 G5:2 A5:2 | B5:2 A5:2 G5:2 F#5:2 | E5:4'],
  ['bach-invention-1', 'Invention No. 1 in C major', 'Johann Sebastian Bach', 72, 4, 'C4 D4 E4 F4 D4 E4 C4 G4:2 C5:2 B4:2 C5:2 | // D5 G4 A4 B4 C5 A4 B4 G4 D5:2 G5:2 F5:2 G5:2 | // E5 A5 G5 F5 E5 G5 F5 A5 G5 F5 E5 D5 C5 E5 D5 F5 | // E5 D5 C5 B4 A4 C5 B4 D5 C5 B4 A4 G4 F#4 A4 G4 B4 | // A4:2 D4:2 C5:3 D5 B4 A4 G4 F#4 E4 G4 F#4 A4 | // G4 B4 A4 C5 B4 D5 C5 E5 D5 B4:.5 C5:.5 D5 G5 B4:2 A4 G4'],
  ['sonata-facile', 'Sonata facile (K. 545), first movement', 'Wolfgang Amadeus Mozart', 112, 4, 'C5:8 E5:4 G5:4 | B4:6 C5 D5 C5:8 // A5:8 G5:4 C6:4 | G5:4 F5:2 E5 F5 E5:8 // A4:2 B4 C5 D5 E5 F5 G5 A5 G5 F5 E5 D5 C5 B4 A4 // G4:2 A4 B4 C5 D5 E5 F5 G5 F5 E5 D5 C5 B4 A4 G4 // F4:2 G4 A4 B4 C5 D5 E5 F5 E5 D5 C5 B4 A4 G4 F4 // E4:2 F4 G4 A4 B4 C5 D5 E5 D5 C5 B4 A4 G4 F4 E4 // D4:2 E4 F4 G4 A4 B4 C#5 D5 A4 B4 C#5 D5 E5 F5 G5 // A5 B5 C6 B5 A5 G5 F5 E5 F5 G5 A5 G5 F5 E5 D5 C5 // B4:2 G5:2 E5:2 C5:2 D5:2 G5:2 E5:2 C5:2 | D5:4 G5:4 G4:8'],
  ['clementi-sonatina-1', 'Sonatina in C, Op. 36 No. 1', 'Muzio Clementi', 76, 4, 'C4:2 E4 C4 G3:2 G3:2 | C4:2 E4 C4 G3:2 G4:2 // F4 E4 D4 C4 B3 C4 B3 C4 | D4 C4 B3 A3 G3:4 // C4:2 E4 C4 G3:2 G3:2 | E4:2 G4 E4 C4:2 E4 C4 // D4 B3 C4 A3 B3 G3 A3 F#3 // G3 A3 B3 C4 D4 E4 F#4 G4 | A3:2 A4:2 A4:2 A4:2 // B3 C4 D4 E4 F#4 G4 A4 B4 | C4:2 C5:2 C5:2 C5:2 // D4 G4 B4 D5 C5 B4 A4 G4 // F#4 E4 G4 F#4 A4 G4 F#4 E4 // E4 D4 C4 B3 D4 C4 B3 A3 | G3:8'],
  ['minuet-g-minor', 'Minuet in G minor', 'Christian Petzold', 120, 2, 'Bb5:2 A5:2 G5:2 | A5:2 D5:2 D5:2 | G5:2 G4 A4 Bb4 C5 | D5:6 // Eb5:2 F5 Eb5 D5 C5 | D5:2 Eb5 D5 C5 Bb4 // C5:2 D5 C5 Bb4 C5 | A4:6 // Bb5:2 A5:2 G5:2 | A5:2 D5:2 D5:2 | G5:2 G4 A4 Bb4 C5 | D5:6 // F5:2 G5 F5 Eb5 D5 | Eb5:2 F5 Eb5 D5 C5 | D5:2 G5:2 C5:2 | Bb4:6'],
  ['musette-d-major', 'Musette in D major', 'Johann Sebastian Bach (attributed)', 104, 4, 'A5:4 G5 F#5 E5 D5 | A5:4 G5 F#5 E5 D5 // F#4 G4 A4:2 G4:2 F#4:2 | E4:2 A4:2 F#4:2 D4:2 // A5:4 G5 F#5 E5 D5 | A5:4 G5 F#5 E5 D5 // F#4 G4 A4:2 G4:2 F#4:2 | E4:2 A4:2 D4:4'],
  ['burgmuller-arabesque', 'Arabesque, Op. 100 No. 2', 'Friedrich Burgmüller', 112, 4, 'A3 B3 C4 B3 A3:4 | A3 B3 C4 D4 E4:4 // D4 E4 F4 G4 A4:4 | A4 B4 C5 D5 E5:6 // E4:2 E4:2 F4:2 | D4:4 D4:6 // G4:2 D4:2 E4:2 | C4:4 E4:4'],
  ['wild-horseman', 'The Wild Horseman (Wilder Reiter)', 'Robert Schumann', 96, 3, 'E4 | A4 E4 A4 C5 A4 C5 | E5 C5 F5 E5 C5 A4 // B4 G#4 C5 B4 G#4 E4 | A4 E4 C5 B4:2 // E4 | A4 E4 A4 C5 A4 C5 | E5 C5 F5 E5 C5 A4 // B4 G#4 C5 B4 G#4 E4 | A4 E4 G#4 A4:2'],
  ['paganini-caprice-24', 'Caprice No. 24 (theme)', 'Niccolò Paganini', 96, 4, 'A4:3 A4 A4 C5 B4 A4 | E5:3 E4 E4 G#4 F#4 E4 // A4:3 A4 A4 C5 B4 A4 | E5:4 E4:4 // A5:3 A5 A5 Bb5 A5 G5 | F5:3 D5 D5 F5 E5 D5 // G5:3 G5 G5 A5 G5 F5 | E5:3 C5 C5 E5 D5 C5 // F5:3 B4 B4 D5 C5 B4 | E5:3 A4 A4 C5 B4 A4 // F4:3 D#5 E4 E5 D5 B4 | A4:4 A3:4'],
  ['beethoven-sonatina-g', 'Sonatina in G major (Moderato)', 'Ludwig van Beethoven (attributed)', 100, 2, 'G4:4 A4 G4 A4 B4 | G4:2 G5 D5 D5 B4 B4 G4 // C5:4 B4 A4 B4 C5 | A4:2 D5 E5 D5 B4 C5 A4 // G4:4 A4 G4 A4 B4 | C5:4 E5 D5 E5 F#5 // G5 D5 E5 C5 B4 D5 C5 A4 | A4:4 G4:4'],
  ['hungarian-dance-5', 'Hungarian Dance No. 5', 'Johannes Brahms', 108, 4, 'C#4:6 F#4:2 | A4:6 F#4:2 | E#4:6 F#4 G#4 | F#4:8 // D4:6 E4 F#4 | C#4:8 | B3 A3 A3 G#3 G#3:3 C#4 | F#3:8'],
  ['habanera', 'Habanera (L’amour est un oiseau rebelle)', 'Georges Bizet', 72, 6, 'D5:3 C#5:3 | C5:2 C5:2 C5:2 B4:3 Bb4:3 | A4:3 A4:1.5 // A4:1.5 G#4:3 G4:3 | F4 G4 F4 E4:1.5 F4:1.5 G4:3 F4:3 | E4:3'],
  ['william-tell', 'William Tell Overture (finale)', 'Gioachino Rossini', 112, 4, 'B4 B4 | B4:2 B4 B4 B4:2 B4 B4 | E5:2 F#5:2 G#5:2 // B4 B4 | B4:2 B4 B4 E5:2 G#5:2 | F#5:2 D#5:2 B4:2 // B4 B4 | B4:2 B4 B4 B4:2 B4 B4 | E5:2 F#5:2 G#5:2 E5:1.5 G#5:.5 // B5:3 B5 B5 A5 G#5 F#5 | E5:2 G#5:2 E5:2'],
  ['vivaldi-spring', 'Spring (The Four Seasons)', 'Antonio Vivaldi', 100, 4, 'E4:2 | G#4:2 G#4:2 G#4:2 F#4 E4 B4:6 B4 A4 // G#4:2 G#4:2 G#4:2 F#4 E4 B4:6 B4 A4 // G#4:2 A4 B4 A4:2 G#4:2 F#4:2 D#4:2 B3:2 // E4:2 | G#4:2 G#4:2 G#4:2 F#4 E4 B4:6 B4 A4 // G#4:2 G#4:2 G#4:2 F#4 E4 B4:6 B4 A4 // G#4:2 A4 B4 A4:2 G#4:2 F#4:6 // E4:2 | B4:2 A4 G#4 A4:2 B4:2 C#5:2 B4:4 // E4:2 | B4:2 A4 G#4 A4:2 B4:2 C#5:2 B4:4 // E4:2 | C#5:2 B4:4 A4:2 G#4:2 F#4 E4 F#4:4 | E4:6'],
  ['boccherini-minuet', 'Minuet (String Quintet in E, Op. 11 No. 5)', 'Luigi Boccherini', 100, 4, 'A5 G#5 A5 B5 | A5:2 A4:4 C#5:4 E5:2 | E5:2 D5:2 D5:4 // D5 C#5 D5 E5 | D5:2 E4:4 B4:4 D5:2 | D5:2 C#5:2 C#5:4 // A5:3 F#5 | E5:2 D#5:2 D#5:2 D#5:2 A5:3 F#5 | E5:2 D#5:2 D#5:2 D#5:2 // A5:3 F#5 | G#5:2 E5:2 C#5:2 A5:2 F#5:4 | E5:4 E4:4'],
  ['handel-hornpipe', 'Alla Hornpipe (Water Music)', 'George Frideric Handel', 72, 4, 'A4:4 D5:4 E5:4 | F#5:2 D5:4 E5:2 F#5:2 D5:2 // E5:2 A5:4 E5:2 F#5:2 E5 D5 | E5:2 A5:4 E5:2 F#5:2 E5 D5 // E5:2 A4:4 A5:2 A5:2 A5:2 | A5:2 G5 F#5 G5:2 G5:2 G5:2 G5:2 // G5:2 F#5 E5 F#5:2 A5:2 A5:2 A5:2 | A5:2 G5 F#5 G5:2 G5:2 G5:2 G5:2 // G5:6 A5:2 F#5:2 E5:2 | F#5:2 G5:2 E5:6 D5:2 | D5:12'],
  ['beethoven-ecossaise', 'Ecossaise in E flat, WoO 86', 'Ludwig van Beethoven', 112, 2, 'Eb4 Eb4 | G4:2 G4 G4 | Bb4:2 Bb4 Bb4 | Eb5:2 Eb5 Eb5 | Bb4:4 // G4 Bb4 Ab4 G4 | Eb4 G4 F4 Eb4 | F4:2 F4 G4 | F4:2 // Eb4 Eb4 | G4:2 G4 G4 | Bb4:2 Bb4 Bb4 | Eb5:2 Eb5 Eb5 | Bb4:4 // G4 Bb4 Ab4 G4 | Eb4 G4 F4 Eb4 | F4:2 F4 G4 | Eb4:2'],
  ['marche-militaire', 'Marche militaire No. 1', 'Franz Schubert', 112, 4, 'A4:4 G4:2 F#4:2 | E4:4 F#4:2 E4:2 | D4:4 E4:2 F#4:2 | A3:3 B3 A3:4 // A4:4 G4:2 F#4:2 | B4:4 A4:2 F#4:2 | G4:2 A4 G4 F#4:2 G4 F#4 // E4 E4 F#4 G4 A4 B4 C#5 D5'],
];

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The most common value of a list, or 0 for an empty one. */
function mode(values: number[]): number {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

/** Reads a tune written for the piano: its phrases, the length of its bars, and the upbeat of each phrase. */
function read(id: string, text: string): { phrases: PianoNote[][]; leads: number[]; bar: number } {
  const phrases: PianoNote[][] = [[]];
  const firsts: (number | null)[] = [null];
  const bars: number[] = [];
  let u = 0;
  let since = -1;
  for (const tok of text.trim().split(/\s+/)) {
    if (tok === '//') {
      phrases.push([]);
      firsts.push(null);
      u = 0;
      since = -1;
    } else if (tok === '|') {
      if (firsts[firsts.length - 1] === null) firsts[firsts.length - 1] = u;
      else bars.push(u - since);
      since = u;
    } else {
      const m = /^([A-G])([#b]?)(\d)(?::([\d.]+))?$/.exec(tok);
      if (!m) throw new Error(`${id}: cannot read the note ${tok}`);
      const len = m[4] ? Number(m[4]) : 1;
      phrases[phrases.length - 1].push({ midi: NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1), ...(len !== 1 ? { len } : {}) });
      u += len;
    }
  }
  const bar = mode(bars.length ? bars : firsts.filter((f): f is number => f !== null));
  // what stands before the first bar line of a phrase is an upbeat when it is shorter than a bar
  return { phrases, bar, leads: firsts.map((f) => (f !== null && f < bar - 1e-6 ? f : 0)) };
}

/** Comfortable and possible distances in semitones between two fingers of the right hand, the lower finger first. */
const SPAN: Record<string, [number, number, number]> = {
  '12': [1, 4, 8],
  '13': [3, 5, 10],
  '14': [5, 7, 11],
  '15': [7, 9, 13],
  '23': [1, 2, 4],
  '24': [3, 4, 6],
  '25': [5, 7, 8],
  '34': [1, 2, 3],
  '35': [3, 4, 6],
  '45': [1, 2, 4],
};

/** Where the thumb would lie if the hand lay over five neighbouring white keys with finger g on key m. */
const handAt = (m: number, g: number): number => whiteStep(m) - (g - 1);

/** What it costs the hand to go from key p under finger f to key q under finger g. */
function step(p: number, f: number, q: number, g: number): number {
  const dist = Math.abs(q - p);
  // the same key again with another finger: only when nothing else will do
  if (dist === 0) return f === g ? 0 : 3.5;
  // the same finger on another key: a hop
  if (f === g) return 4 + dist * 0.5;
  const up = q > p;
  const low = up ? f : g;
  const high = up ? g : f;
  // a hand that stays where it lies is easiest: every white key it shifts by costs a little
  const shift = 0.35 * Math.min(4, Math.abs(handAt(q, g) - handAt(p, f)));
  if (low < high) {
    // the hand lies as it is built: the lower finger on the lower key
    const [lo, hi, max] = SPAN[`${low}${high}`];
    if (dist < lo) return shift + (lo - dist) * 1.2;
    if (dist <= hi) return shift;
    if (dist <= max) return shift + (dist - hi) * 0.8;
    // further than the hand can open it is a leap: the hand lets go and lands anew, whatever the distance
    return shift + Math.min((max - hi) * 0.8 + (dist - max) * 3, 4.5);
  }
  // a crossing: the thumb passes under on the way up, or a finger crosses over the thumb on the way down.
  // The thumb is then the finger on the higher key.
  const thumbKey = up ? q : p;
  if (high === 1 && low >= 2 && low <= 4 && dist <= 4) return 2 + (low === 4 ? 0.5 : low === 2 ? 0.4 : 0) + (isBlackKey(thumbKey) ? 3 : 0) + Math.max(0, dist - 2);
  return 9 + dist;
}

/** What a finger costs on a key by itself: the short thumb and little finger do not like black keys. */
const place = (q: number, g: number): number => (isBlackKey(q) ? (g === 1 ? 2.5 : g === 5 ? 1 : 0) : 0) + (g === 4 ? 0.1 : 0);

/**
 * Fingering for the right hand, for notes played one after the other: the fingers that ask least of the
 * hand, found by trying every finger on every note. A finger keeps its key while the tune stays under the
 * hand; the thumb passes under after the second, third or fourth finger when the tune goes on upward (the
 * C major scale comes out as 1 2 3 1 2 3 4 5). Between two phrases the hand may move at less cost.
 */
export function fingering(phrases: number[][]): number[][] {
  const notes = phrases.flat();
  if (!notes.length) return phrases.map(() => []);
  const starts = new Set<number>();
  let n = 0;
  for (const p of phrases) {
    starts.add(n);
    n += p.length;
  }
  const cost: number[][] = [];
  const from: number[][] = [];
  notes.forEach((q, i) => {
    cost.push([]);
    from.push([]);
    for (let g = 1; g <= 5; g++) {
      if (i === 0) {
        cost[i][g] = place(q, g);
        from[i][g] = 0;
        continue;
      }
      let best = Infinity;
      let who = 1;
      for (let f = 1; f <= 5; f++) {
        const move = step(notes[i - 1], f, q, g);
        // at the start of a phrase the hand has had time to move
        const c = cost[i - 1][f] + (starts.has(i) ? Math.min(move, 1) : move);
        if (c < best) {
          best = c;
          who = f;
        }
      }
      cost[i][g] = best + place(q, g);
      from[i][g] = who;
    }
  });
  const out: number[] = new Array(notes.length);
  let g = 1;
  for (let f = 2; f <= 5; f++) if (cost[notes.length - 1][f] < cost[notes.length - 1][g]) g = f;
  for (let i = notes.length - 1; i >= 0; i--) {
    out[i] = g;
    g = from[i][g];
  }
  let k = 0;
  return phrases.map((p) => p.map(() => out[k++]));
}

const fingered = (phrases: PianoNote[][]): PianoNote[][] => {
  const fg = fingering(phrases.map((p) => p.map((x) => x.midi)));
  return phrases.map((p, i) => p.map((x, k) => ({ ...x, fg: fg[i][k] })));
};

/** A tune written for the piano. */
function tune([id, title, by, bpm, beat, text]: (typeof TUNES)[number]): PianoPiece {
  const { phrases, leads, bar } = read(id, text);
  return { id, title, by, kind: 'melody', hand: 'right hand', noteDur: 60 / bpm / beat, beat, count: Math.round(bar / beat) === 3 ? 3 : 4, bar, ...(leads.some((l) => l > 0) ? { leads } : {}), phrases: fingered(phrases) };
}

/**
 * A tune of the songbook on the piano: the same notes, moved to the key with the fewest black keys (unless
 * the title names its key) and to the octaves around middle C, and cut into phrases of about eight notes.
 */
function fromTune(song: Song): PianoPiece {
  const bars = song.bars.map((b) => b.notes.map((x): PianoNote => ({ midi: Math.max(tabMidi(x), ...(x.more ?? []).map(tabMidi)), ...(x.len && x.len !== 1 ? { len: x.len } : {}) })));
  const all = bars.flat();
  const blacks = (t: number): number => all.filter((x) => isBlackKey(x.midi + t)).length;
  let shift = 0;
  if (!/ in [A-G]/.test(song.title)) for (const t of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]) if (blacks(t) < blacks(shift)) shift = t;
  // the octave in which the tune lies nearest to the G above middle C, and not below the F under it
  const lo = Math.min(...all.map((x) => x.midi)) + shift;
  const hi = Math.max(...all.map((x) => x.midi)) + shift;
  let octave = 0;
  for (const k of [12, 24, -12]) if (lo + k >= 53 && Math.abs((lo + hi) / 2 + k - 67) < Math.abs((lo + hi) / 2 + octave - 67)) octave = k;
  const total = (b: PianoNote[]): number => b.reduce((sum, x) => sum + (x.len ?? 1), 0);
  const bar = mode(bars.map(total));
  const upbeat = total(bars[0]) < bar - 1e-6;
  // whole bars, as many as make six notes or more, and not more than eleven where that can be helped
  const phrases: PianoNote[][] = [[]];
  bars.forEach((b, i) => {
    const cur = phrases[phrases.length - 1];
    const lead = upbeat && i === 1;
    if (!lead && (cur.length >= 6 || (cur.length >= 4 && cur.length + b.length > 11))) phrases.push([...b]);
    else cur.push(...b);
  });
  if (phrases.length > 1 && phrases[phrases.length - 1].length < 3) phrases.splice(phrases.length - 2, 2, [...phrases[phrases.length - 2], ...phrases[phrases.length - 1]]);
  const moved = phrases.map((p) => p.map((x) => ({ ...x, midi: x.midi + shift + octave })));
  return {
    id: `${song.id}~keys`,
    title: song.title,
    by: song.by,
    kind: 'melody',
    hand: 'right hand',
    noteDur: song.noteDur,
    beat: song.beat,
    count: Math.round(bar / song.beat) === 3 ? 3 : 4,
    bar,
    ...(upbeat ? { leads: phrases.map((_, i) => (i === 0 ? total(bars[0]) : 0)) } : {}),
    phrases: fingered(moved),
  };
}

/**
 * A chord broken into single keys, so many of them: up and back for six, bottom, top, middle, top for
 * eight (the pattern piano teachers call Alberti), otherwise straight up. A chord of three keys takes the
 * key an octave above its lowest for the top of the six.
 */
function broken(id: string, n: number): PianoNote[] {
  const c = pianoChord(id);
  const [a, b, d] = c.midis;
  const four = c.midis.length > 3;
  const top = four ? c.midis[3] : a + 12;
  // each entry: key, finger
  const lay: [number, number][] =
    n >= 8
      ? four
        ? [[a, 1], [d, 3], [b, 2], [top, 5], [a, 1], [d, 3], [b, 2], [top, 5]]
        : [[a, 1], [d, 5], [b, 3], [d, 5], [a, 1], [d, 5], [b, 3], [d, 5]]
      : n >= 6
        ? [[a, 1], [b, 2], [d, 3], [top, 5], [d, 3], [b, 2]]
        : n === 4
          ? four
            ? [[a, 1], [b, 2], [d, 3], [top, 5]]
            : [[a, 1], [b, 3], [d, 5], [b, 3]]
          : n === 3
            ? four
              ? [[a, 1], [b, 2], [top, 5]]
              : [[a, 1], [b, 3], [d, 5]]
            : n === 2
              ? [[a, 1], [four ? top : d, 5]]
              : [[a, 1]];
  return lay.slice(0, n).map(([midi, fg], i) => ({ midi, fg, ...(i === 0 ? { over: c.id } : {}) }));
}

/** The chords of a bar with the share of the bar each has, from the bar as the guitar plays it. */
function barChords(song: Song, b: number): string[] {
  const bar = song.bars[b];
  const strums = bar.notes.map((x) => x.strum).filter((c): c is string => !!c);
  const ids = strums.length ? strums.filter((c, i) => i === 0 || c !== strums[i - 1]) : bar.chord ? [bar.chord] : [];
  return ids;
}

/** Above this many clicks a minute a strummed song is struck as whole chords on the piano; below, its chords are broken. */
const LIVELY = 104;
/**
 * The same chord is not asked for again sooner than this many seconds at full speed: quicker than that it
 * is hammering, and the app's own practice piano cannot be heard doing it.
 */
const CALM = 0.45;

/**
 * Whole chords that would follow each other too quickly are struck less often: two hits of the same chord
 * become one that lasts as long as both, and in a bar of three the chord is struck once.
 */
function calm(notes: PianoNote[], noteDur: number): PianoNote[] {
  if (!notes.length || Math.min(...notes.map((n) => n.len ?? 1)) * noteDur >= CALM) return notes;
  const whole = notes.every((n) => n.chord === notes[0].chord) && notes.length % 2 === 1;
  if (whole) return [{ ...notes[0], len: notes.reduce((sum, n) => sum + (n.len ?? 1), 0) }];
  const out: PianoNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const next = notes[i + 1];
    if (next && next.chord === notes[i].chord) out.push({ ...notes[i], len: (notes[i].len ?? 1) + (next.len ?? 1) }), i++;
    else out.push(notes[i]);
  }
  return out;
}

/**
 * The key a song is played in on the piano: the one in which its chords ask least of the hand (most of all
 * white keys), and of several such the one nearest to the guitar's. Given as semitones up from the guitar's key.
 */
export function pianoKey(chords: string[]): number {
  const cost = (t: number): number => chords.reduce((sum, c) => sum + keyWeight(transposed(c, t)), 0);
  let best = 0;
  for (const t of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]) if (cost(t) < cost(best)) best = t;
  return best;
}

/**
 * A song of chords on the piano. Struck as a whole where the guitar strums on the beat or the song is
 * lively (`basic` asks for that in any case: one chord on every click); broken into keys where the guitar
 * has a pattern and the song is calm.
 */
export function fromChords(guitar: Song, basic: boolean): PianoPiece | null {
  if (!guitar.bars.every((b) => b.chord)) return null;
  const used = [...new Set(guitar.bars.flatMap((b) => [b.chord!, ...b.notes.map((x) => x.strum).filter((c): c is string => !!c)]))];
  // a piece that names its key in its title stays in it
  const shift = / in [A-G]/.test(guitar.title) ? 0 : pianoKey(used);
  const move = (c: string): string => transposed(c, shift);
  const song: Song = { ...guitar, bars: guitar.bars.map((b) => ({ ...b, chord: move(b.chord!), notes: b.notes.map((x) => (x.strum ? { ...x, strum: move(x.strum) } : x)) })) };
  const units = (b: number): number => song.bars[b].notes.reduce((sum, x) => sum + (x.len ?? 1), 0);
  const strummed = song.bars.some((b) => b.notes.some((x) => x.strum));
  const plain = strummed && !song.bars.some((b) => b.notes.some((x) => x.up));
  // a pattern with every beat in it becomes four slow keys, one that pushes ahead of the beat eight quick ones
  const first = song.bars[0].notes;
  let at = 0;
  const startsOf = first.map((x) => {
    const s = at;
    at += x.len ?? 1;
    return s;
  });
  const total0 = units(0);
  const onEveryBeat = Array.from({ length: Math.round(total0 / song.beat) }, (_, k) => k * song.beat).every((u) => startsOf.includes(u));
  // a lively song with a pattern that keeps the beat is struck as whole chords; one that pushes ahead of the beat keeps its motion
  const lively = strummed && !plain && onEveryBeat && 60 / (song.noteDur * song.beat) >= LIVELY;
  if (basic && (plain || lively)) return null;
  const block = basic || plain;
  const onClicks = basic || lively;
  const made: { notes: PianoNote[]; part?: string }[] = [];
  song.bars.forEach((bar, b) => {
    const total = units(b);
    let notes: PianoNote[];
    if (block && !basic) {
      // the hits of the guitar, each one the whole chord
      notes = bar.notes.map((x) => ({ midi: pianoChord(x.strum!).midis[0], chord: pianoChord(x.strum!).id, ...(x.len && x.len !== 1 ? { len: x.len } : {}) }));
    } else if (onClicks) {
      const chords = barChords(song, b);
      const clicks = Math.max(1, Math.round(total / song.beat));
      notes = Array.from({ length: clicks }, (_, k) => {
        const id = pianoChord(chords[Math.min(chords.length - 1, Math.floor((k * chords.length) / clicks))]).id;
        return { midi: pianoChord(id).midis[0], chord: id, ...(song.beat !== 1 ? { len: song.beat } : {}) };
      });
    } else if (strummed) {
      const chords = barChords(song, b);
      // four keys to the bar where the pattern keeps every beat, eight where it does not; three or six in a bar of three
      const perBar = total === 6 ? (song.beat === 3 ? 6 : 3) : onEveryBeat ? 4 : 8;
      const each = Math.max(2, Math.floor(perBar / chords.length));
      const len = total / (each * chords.length);
      notes = chords.flatMap((c) => broken(c, each).map((x) => ({ ...x, ...(len !== 1 ? { len } : {}) })));
    } else {
      // a picked bar: as many keys as the guitar plucks strings
      notes = broken(bar.chord!, bar.notes.length).map((x) => ({ ...x }));
    }
    made.push({ notes: block || onClicks ? calm(notes, song.noteDur) : notes, part: bar.part });
  });
  // a bar of the song that the guitar plays as two (a picked bar shared by two chords) stays as it is: two short bars
  const perBar = made.reduce((sum, m) => sum + m.notes.length, 0) / made.length;
  const per = perBar <= 3 ? 4 : perBar <= 8 ? 2 : 1;
  const phrases: PianoNote[][] = [];
  const parts: (string | undefined)[] = [];
  let open = 0;
  for (const m of made) {
    if (!phrases.length || open >= per || m.part) {
      phrases.push([]);
      parts.push(m.part);
      open = 0;
    }
    phrases[phrases.length - 1].push(...m.notes);
    open++;
  }
  const bar = mode(song.bars.map((_, b) => units(b)));
  return {
    id: `${song.id}~keys${basic ? '-basic' : ''}`,
    get title() {
      return basic ? L(`${song.title} · basic version`, `${song.title} · einfache Fassung`) : song.title;
    },
    by: song.by,
    kind: block || onClicks ? 'chords' : 'broken',
    ...(basic ? { of: `${song.id}~keys` } : {}),
    ...(shift ? { guitar: used } : {}),
    hand: 'right hand',
    noteDur: song.noteDur,
    beat: song.beat,
    count: Math.round(bar / song.beat) === 3 ? 3 : 4,
    bar,
    ...(parts.some(Boolean) ? { parts } : {}),
    phrases,
  };
}

/**
 * Tunes of the songbook that are not taken over: the ones the piano has in a version of its own already,
 * and one that is written for the open strings of the guitar and does not lie under one hand.
 */
const HAS_OWN = new Set(['fur-elise-guitar', 'ode-guitar', 'amazing-grace', 'romanza']);
/**
 * Songs the piano book leaves to the guitar. An exercise for the barre of the guitar; and songs that on the
 * piano ask the same of the hand as another song of the same level (the same chords, struck or broken the
 * same way), of which the book keeps one, so that its four levels hold as many pieces each. On the guitar
 * they are all there.
 */
export const NOT_FOR_KEYS = new Set(['four-chords', 'scarborough-fair', ...PRIVATE_NOT_FOR_KEYS]);

let book: PianoPiece[] | null = null;

/** Everything in the piano book. Made when it is first asked for. */
export function pianoBook(): PianoPiece[] {
  if (book) return book;
  const made: PianoPiece[] = TUNES.map(tune);
  for (const song of SONGS) {
    if (HAS_OWN.has(song.id) || NOT_FOR_KEYS.has(song.id) || song.guitarOnly) continue;
    if (song.bars.every((b) => !b.chord && b.notes.every((x) => !x.strum))) made.push(fromTune(song));
    else for (const basic of [false, true]) {
      const piece = fromChords(song, basic);
      if (piece) made.push(piece);
    }
  }
  book = made;
  return made;
}
