# Privacy

Noise Floor has no server, no accounts and no tracking. The online version is a set of static files served by GitHub Pages; once loaded, everything happens in your browser.

- **The microphone.** The browser asks before the app may use it. The signal is analysed in small slices as it comes in (what note, what chord, how long it rang) and then dropped. Nothing is sent anywhere.
- **Your recordings.** When a song is played to its end at full speed (rung 3, or a performance), what the microphone heard is recorded so that you can listen back. Two recordings of each song are kept, the first and the latest, in this browser's storage (IndexedDB), at telephone quality. They stay on your computer: **Save as a file** puts one in your downloads folder, and only you can send it on. **Settings → Record takes at full speed** turns recording off; **Erase all progress** forgets them.
- **The diagnostic recording:** **Settings → When something is not heard right → Record** keeps up to 30 seconds of what the app heard and saves it as a sound file to your downloads folder, for you to look at or attach to an issue. It never leaves your computer unless you send it.
- **Your progress and settings** (levels, best scores, the course of your measurements, the days and minutes you played, your plan of when to play, settings, your own songs) are kept in the browser's local storage, on your computer, for this site only. **Settings → Backup** saves them to a file and reads them back; **Erase all progress** deletes them. Clearing the browser's data for the site deletes them too.
- **Your calendar.** **Put it in my calendar** writes a calendar file for your own calendar program; nothing is sent.
- **Progress file.** If you choose one under **Settings → Progress file** (Edge and Chrome on a computer), the app writes your progress into that file after every change and reads it when it is newer. The file is wherever you put it; the app sends it nowhere. The browser keeps only a handle to it.
- **Offline.** The built app keeps its own files in the browser once it has been opened (a service worker), so that it opens without a network. It keeps nothing else.
- **Fonts** are bundled with the app; nothing is loaded from other sites.
- **GitHub Pages**, which serves the online version, may keep ordinary server logs (such as IP addresses) as described in [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Run the app on your own computer (`npm start`) to avoid even that.
