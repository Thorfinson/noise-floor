# Credits

Noise Floor is MIT-licensed (see [LICENSE](LICENSE)). What it uses from others, and what it was tested with:

## Fonts

- **IBM Plex Sans** and **IBM Plex Mono** by IBM, SIL Open Font License 1.1, bundled through the `@fontsource` packages.

## Music

Every song and piece the app brings along is in the public domain: traditional songs, spirituals, carols and hymns, the songs of Stephen Foster and James Lord Pierpont, and the music of Bach, Beethoven, Mozart, Grieg, Tchaikovsky, Dvořák, Joplin and others. The app stores no lyrics, only titles, credits, chords and melodies.

The tunes were compared note for note with published notation; eighteen demanding piano pieces were taken from published scores as text:

- [The Mutopia Project](https://www.mutopiaproject.org/): LilyPond files of public-domain works (Rondo alla turca, Sonata facile, Clementi's Sonatina Op. 36 No. 1, Burgmüller's Arabesque, Schumann's Wild Horseman, Paganini's Caprice No. 24, Vivaldi's Spring, Schubert's Marche militaire and others).
- The **Musica Viva** ABC collection, and the ABC tunes of [abcnotation.com](https://abcnotation.com/).
- The scores in Wikipedia's articles (the Hungarian Dance No. 5, the Habanera, Boccherini's Minuet).
- Nineteenth-century tune books (the William Tell march after Hamilton, 1844; Handel's Hornpipe).

Only the notes of these public-domain works are used (the right hand's top voice, ornaments left out), not any edition's layout or text.

The chord charts of the traditional songs, spirituals, carols and hymns were checked against published tune books and songbooks: the ABC tune books collected on [abcnotation.com](https://abcnotation.com/) (among them P. G. Hardy's session, song and Christmas tune books), the songbooks of [Wikibooks](https://de.wikibooks.org/wiki/Liederbuch), [hymnary.org](https://hymnary.org/), [Music for Music Teachers](https://www.music-for-music-teachers.com/) and [traditionalmusic.co.uk](https://www.traditionalmusic.co.uk/).

## Recordings the listener is tested with

These are **not part of the repository**; `npm run samples` downloads them from where their makers published them, and they stay on the computer that fetched them. Several of the licences do not allow passing them on.

| Recordings | By | Licence |
|---|---|---|
| Musical Instrument Samples: a classical guitar and a grand piano, note by note | University of Iowa Electronic Music Studios ([MIS](https://theremin.music.uiowa.edu/MIS.html)) | freely available |
| IDMT-SMT-Guitar: three electric guitars (plain, muted and dead notes), and six pieces strummed on an acoustic guitar in a room | Fraunhofer IDMT, C. Kehling et al. ([Zenodo 7544110](https://zenodo.org/records/7544110)) | CC BY-NC-ND 4.0 |
| MAPS, sub-base ENSTDkAm: chords on an upright piano in a room | V. Emiya, N. Bertin, B. David, R. Badeau, Télécom Paris ([Zenodo 18160555](https://zenodo.org/records/18160555)) | CC BY-NC-SA 2.0 |
| Piano chords played by hand | J. Osmalskyj et al., University of Liège ("Neural networks for musical chords recognition", JIM 2012) | published as publicly available, without a licence |
| Six chords on a grand piano (ZappaMidiPF), C major on an out-of-tune piano (DoMpiano.wav), six chords in a row (Opus33) | Wikimedia Commons | CC BY-SA 4.0, CC0, public domain |
| Vocadito: 40 excerpts of solo singing with annotated pitch and notes | R. M. Bittner, K. Pasalo, J. J. Bosch, G. Meseguer-Brocal, D. Rubinstein ([Zenodo 5578807](https://zenodo.org/records/5578807)) | CC BY 4.0 |

## Research

The learning design and the way the voice is measured draw on published work, among others: P. Q. Pfordresher and S. Brown (2007), "Poor-pitch singing in the absence of tone deafness"; S. Dalla Bella et al. (2007), "Singing proficiency in the general population"; the Seattle Singing Accuracy Protocol (Demorest, Pfordresher et al.); Berglin, Pfordresher and Demorest (2022) on visual feedback; Hutchins and Peretz (2012) on vocal pitch matching; A. de Cheveigné and H. Kawahara (2002), "YIN, a fundamental frequency estimator for speech and music".
