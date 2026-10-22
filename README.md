# Personal flip-card site

A single-page personal site: a near-black card on a white page.

- **Front** — avatar, name, matric number, current-subject note, and live Spotify
  "now playing" with a spinning disc (spins faster while a track plays, freezes on pause).
- **Back** — taps/clicks flip the card to a menu: *About Me*, *Last Note I Wrote*, *Portfolio*.

No build step, no dependencies, no backend.

## Files

| file | purpose |
| --- | --- |
| `index.html` | all content — name, matric, notes, links (search for `⭐ EDIT`) |
| `styles.css` | all styling — fonts/colors in `:root` |
| `script.js` | card flip + back-panel menu |
| `spotify.js` | now-playing widget (PKCE auth + 10 s polling) |
| `config.js` | your Spotify client ID |
| `assets/avatar.svg` | placeholder avatar — swap in a square photo |

## Run it

Any static server works:

```
python -m http.server 5500
```

Then open <http://127.0.0.1:5500/>. (VS Code's Live Server on port 5500 works the same.)

Opening `index.html` directly via `file://` renders fine, but Spotify login needs
http(s), so use a server when you want the widget live.

## Spotify setup (~2 minutes)

The card calls Spotify's Web API straight from the browser using the
[PKCE flow](https://developer.spotify.com/documentation/web-api/tutorials/code-flow) —
no client secret, no backend.

1. Log in at <https://developer.spotify.com/dashboard> → **Create app**.
   - App name: anything (e.g. `personal-card`).
   - **Redirect URI**: `http://127.0.0.1:5500/index.html` — must match the address bar
     exactly (scheme, port, path).
   - Under "Which API/SDKs", tick **Web API**.
2. Copy the app's **Client ID** into `config.js`.
3. Restart the server, open the site, and tap the widget at the bottom of the card
   ("tap to link account →"). Approve the playback-read scopes.
4. The widget now shows your current track, album art on the disc, and links to the song.
   The token is cached in `localStorage` and auto-refreshes while it stays valid.

Revoke access any time: Spotify Account → Settings → Security → remove the app.

## Deploying

Host anywhere static (GitHub Pages, Netlify, Vercel). Add your final URL — e.g.
`https://you.github.io/index.html` — as a second Redirect URI in the dashboard.
`config.js` needs no changes: the redirect is derived from the page URL automatically.

## Customize

- Personal text: `index.html`, sections marked `⭐ EDIT`.
- The notebook (panel b → "Last Note I Wrote"): content lives in `index.html` (`#nb-body`); edits made on the page auto-save to that browser's `localStorage` ("↺ original" resets).
- Colors & fonts: `styles.css`, the `:root` block.
- Poll rate: `POLL_MS` in `spotify.js`.

## Troubleshooting

- **"Invalid redirect URI" on Spotify's login page** — the dashboard entry and your
  address bar differ (http vs https, wrong port, path mismatch). Make them identical.
- **Widget stuck on "Not connected"** — check the console for `[spotify]` warnings;
  clear cached tokens via DevTools → Application → Local storage.
- **Disc keeps spinning but nothing updates** — Spotify returns 204 when nothing is
  playing; the widget shows "Nothing playing" and resumes by itself.
