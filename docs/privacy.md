# Privacy

Noise Floor has no server, no accounts and no tracking. The online version is a set of static files served by GitHub Pages; once loaded, everything happens in your browser.

- **The microphone.** The browser asks before the app may use it. The signal is analysed in small slices as it comes in (what note, what chord, how long it rang) and then dropped. Nothing is recorded, stored or sent anywhere.
- **The one exception you start yourself:** **Settings → When something is not heard right → Record** keeps up to 30 seconds of what the app heard and saves it as a sound file to your downloads folder, for you to look at or attach to an issue. It never leaves your computer unless you send it.
- **Your progress and settings** (levels, best scores, settings, your own songs) are kept in the browser's local storage, on your computer, for this site only. **Settings → Backup** saves them to a file and reads them back; **Erase all progress** deletes them. Clearing the browser's data for the site deletes them too.
- **Fonts** are bundled with the app; nothing is loaded from other sites.
- **GitHub Pages**, which serves the online version, may keep ordinary server logs (such as IP addresses) as described in [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement). Run the app on your own computer (`npm start`) to avoid even that.
