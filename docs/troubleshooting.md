# Troubleshooting

## Nothing reacts

- **Allow the microphone.** The browser asks the first time; if it was refused, allow it in the site settings (the lock or microphone symbol in the address bar) and reload. Without a microphone the app switches to the practice instrument.
- **The right microphone?** **Settings → Which microphone** lists them once the microphone has been allowed. **Settings → Is it hearing you? → Test the microphone** shows the level and names the note it hears.
- **Close enough?** About a metre from the instrument. For an electric guitar the microphone needs to hear the amp or the unplugged strings.
- **A secure page.** Browsers only open the microphone on `https://` pages and on `localhost`. The online version and `npm start` are both fine; a copy opened from another address over plain `http://` is not.

## It hears the wrong thing

- **Guitar out of tune?** Tune first: the session starts with it. A string far off can be picked by hand in the tuner with ← →.
- **Piano not at 440 Hz?** The piano session measures it; or enter it under **Settings → Piano: pitch of its A**.
- **Clean strings called muted or buzzing?** **Settings → Buzz tolerance** and **How long a string must ring**. The chord check also learns how long your guitar rings.
- **Singing too strict?** **Settings → How near a sung note must be**: 75 cents is kind to a voice that is just starting. Any octave counts.
- **Record it.** **Settings → When something is not heard right → Record** saves up to 30 seconds of exactly what the app heard. `npm run hear -- <file>` prints what the listener makes of it, moment by moment (`instrument=piano`, `chords=C,F,G`, `expect=E2` and more: see the top of `scripts/hear.ts`). Attach the file to an [issue](https://github.com/Thorfinson/noise-floor/issues) and say what you played.

## Timing with the click feels off

Sound takes time from the speakers to the microphone and into the app. **Settings → Timing with the click → Measure now** plays six clicks and times them; without that the app starts from what the browser reports and corrects itself while you play along. Bluetooth speakers and headphones add a lot of delay: wired is better.

## The click is hard to hear

The click is a high tick on purpose, above the range the listener analyses, so it does not matter that the microphone hears it. Turn it up under **Settings → Metronome loudness**, or use headphones and switch **Metronome sound** to the low click.

## Browsers

It is built and tested with Microsoft Edge on Windows; Chrome uses the same engine and should behave the same. Firefox and Safari have the Web Audio API and the microphone too, but are not tested. Phones and tablets are not tested either; the screens are laid out for a laptop or desktop.

## Start over

**Settings → Erase all progress** deletes levels, scores and settings (make a **Backup** first if you might want them back).
