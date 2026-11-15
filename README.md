# NRK TV (privat) for Samsung Tizen TVs

An unofficial NRK TV client for Samsung Smart TVs (Tizen 4.0+, 2018 models and newer), built on NRK's
public PSAPI. Plain HTML/CSS/JS, with no framework and no build step.

> **Private use only.** The [PSAPI terms of use](https://psapi.nrk.no/documentation/) say NRK's APIs are
> developed for NRK's own use, and forbid using them to make services or apps available to the public.
> Sideload this on your own TV; do not publish it to the Samsung app store or distribute the package.

## Features

- **Forside and Kategorier**: the same sections NRK TV shows to logged-out users (hero, rows, "Mest sett", categories).
- **Series pages** with season tabs, episode lists, "Kommer …" labels for upcoming episodes, and progress bars.
- **Playback** of on-demand programs (HLS via the TV's native player) with:
  - subtitles (WebVTT, on by default, toggled with ▲);
  - resume from where you stopped (stored on the TV);
  - seeking (◀ −10 s, ▶ +30 s, ⏪/⏩ ±60 s; repeated presses add up).
- **Direkte**: NRK1, NRK2, NRK3, NRK Super, the regional NRK1 channels, and NRK Tegnspråk.
- **Søk**: search for series and programs, using the TV's on-screen keyboard.

Not included: NRK login, and with it favourites and "Fortsett å se" synced with NRK. Those need NRK's user
authentication, which is not part of the public API.

## Remote control

| Key | Browsing | Player |
|---|---|---|
| Arrows | Move focus | ◀ ▶ seek, ▲ subtitles on/off, ▼ show progress |
| OK | Open | Play/pause |
| Return | Back (exits from the menu) | Close player |
| ⏯ ⏪ ⏩ ⏹ | – | Play/pause, seek ±60 s, stop |

## Try it in a desktop browser first

PSAPI sends no CORS headers, so a small dev server proxies the API calls (Node 18+, no dependencies):

```bash
node dev/server.js
```

Open http://localhost:8000 in a window of about 1920×1080 and use the arrow keys, Enter and Esc.
Desktop Chrome, Firefox and Edge can't play HLS natively, so in a browser the player loads
[hls.js](https://github.com/video-dev/hls.js) from jsDelivr on demand (the TV plays HLS itself and never
loads it). Geoblocked content and the live channels only play from a Norwegian IP address.

## Install on your Samsung TV

1. **Install Tizen Studio** from https://developer.tizen.org/development/tizen-studio/download.
   In *Package Manager → Extension SDK*, install **Samsung TV Extensions** and **Samsung Certificate Extension**.
   Put `tizen-studio/tools` and `tizen-studio/tools/ide/bin` on your `PATH`.

2. **Turn on Developer Mode on the TV.** Open *Apps*, press `1 2 3 4 5` on the remote, switch
   *Developer mode* on, enter your computer's IP address, and restart the TV (hold the power button).

3. **Connect to the TV** (find its IP under *Settings → General → Network → Network status*):
   ```bash
   sdb connect 192.168.1.50
   ```
   ```bash
   sdb devices
   ```
   Note the device name from the second column, for example `UE55AU7105KXXC`.

4. **Create a Samsung certificate.** Retail TVs only accept apps signed with a Samsung certificate
   tied to the TV's DUID, so the default Tizen certificate is not enough. In Tizen Studio, open
   *Tools → Certificate Manager*, click **+**, choose **Samsung → TV**, create an author certificate,
   sign in with your Samsung account, and create a distributor certificate with the connected TV's
   DUID (filled in automatically while `sdb` is connected). Call the profile `nrk`.

5. **Build, install and start the app:**
   ```bash
   ./build.sh nrk UE55AU7105KXXC
   ```
   The app then appears among your apps as **NRK TV (privat)**. To only build the package, leave out the device name.

Debugging: `tizen run` with Developer Mode lets you attach Chrome DevTools from Tizen Studio
(*Run As → Tizen Web Application (Debug)*), or check console output with `sdb dlog`.

## Project layout

```
config.xml        Tizen manifest (privileges, network access, app ID)
index.html        App shell: side menu, content area, player
css/app.css       1920×1080 TV layout
js/api.js         PSAPI client, image picker, watch progress and preferences (localStorage)
js/nav.js         Remote-control focus navigation (geometry-based) and key handling
js/views.js       Screens: page/front page, categories, series, live, search
js/player.js      Full-screen HLS player, WebVTT subtitles, seeking, resume
js/app.js         Router with back stack and focus restore, Tizen key registration
dev/server.js     Desktop dev server with an NRK API proxy
build.sh          Package (.wgt), sign, install and run on a TV
```

## PSAPI endpoints used

| Purpose | Endpoint |
|---|---|
| Front page / category page | `GET /tv/pages/frontpage`, `GET /tv/pages/{pageId}` |
| List of categories | `GET /tv/pages` |
| Series and seasons | `GET /tv/catalog/series/{seriesId}`, `…/seasons/{seasonId}` |
| Live channels | `GET /tv/live` |
| Search | `GET /search?q=…` |
| Playback (stream URL, subtitles, availability) | `GET /playback/manifest/program/{programId}`, `GET /playback/manifest/channel/{channelId}` |

Full documentation: https://psapi.nrk.no/documentation/

## Compatibility notes

- The JavaScript sticks to ES2017 for the Chromium 56 engine in 2018 TVs: no optional chaining, object spread or
  CSS `inset`. To support 2017 TVs (Tizen 3.0), set `required_version="3.0"` in `config.xml` and test there.
- If a stream refuses to play in the HTML5 `<video>` element on an older model, Samsung's `webapis.avplay`
  API is the fallback to add in `js/player.js`.
