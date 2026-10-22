// Spotify "now playing" widget — client-side PKCE flow, no backend needed.
// Setup (2 min): see README.md → "Spotify setup".
(() => {
  "use strict";

  const CONFIG = window.SPOTIFY_CONFIG || {};
  const CLIENT_ID = (CONFIG.CLIENT_ID || "").trim();

  const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
  const TOKEN_URL = "https://accounts.spotify.com/api/token";
  const NOW_URL = "https://api.spotify.com/v1/me/player/currently-playing";
  const SCOPES = "user-read-currently-playing user-read-playback-state";
  const POLL_MS = 10000; // well under Spotify's rate limits
  const TOKEN_KEY = "card:spotify-token";
  const VERIFIER_KEY = "card:spotify-verifier";

  const el = {
    link: document.getElementById("np"),
    art: document.getElementById("np-art"),
    status: document.getElementById("np-status"),
    track: document.getElementById("np-track"),
    artist: document.getElementById("np-artist"),
  };

  let token = readToken(); // { access, refresh, exp }
  let trackHref = null;

  /* ── tiny state helpers ── */

  function readToken() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); }
    catch { return null; }
  }
  function saveToken() { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); token = null; }

  const isConfigured = () => Boolean(CLIENT_ID) && !/^your/i.test(CLIENT_ID);
  const redirectUri = () => location.origin + location.pathname;

  function b64url(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function challenge(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return b64url(new Uint8Array(digest));
  }

  /* ── auth ── */

  async function startLogin() {
    if (!isConfigured()) {
      alert(
        "Spotify isn't set up yet.\n\n" +
        "1. Create an app at developer.spotify.com/dashboard\n" +
        "2. Add this Redirect URI:\n   " + redirectUri() + "\n" +
        "3. Paste the Client ID into config.js\n\n" +
        "Full steps in README.md."
      );
      return;
    }
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    localStorage.setItem(VERIFIER_KEY, verifier);
    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      scope: SCOPES,
      code_challenge_method: "S256",
      code_challenge: await challenge(verifier),
      redirect_uri: redirectUri(),
    });
    location.assign(AUTHORIZE_URL + "?" + params);
  }

  async function tokenRequest(body) {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("token request failed: " + res.status);
    return res.json();
  }

  async function exchangeCode(code) {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    if (!verifier) throw new Error("missing code verifier");
    const res = await tokenRequest(new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: CLIENT_ID,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
    }));
    localStorage.removeItem(VERIFIER_KEY);
    token = {
      access: res.access_token,
      refresh: res.refresh_token,
      exp: Date.now() + res.expires_in * 1000,
    };
    saveToken();
  }

  async function refresh() {
    if (!token || !token.refresh) { clearToken(); return; }
    try {
      const res = await tokenRequest(new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refresh,
        client_id: CLIENT_ID,
      }));
      token = {
        access: res.access_token,
        refresh: res.refresh_token || token.refresh,
        exp: Date.now() + res.expires_in * 1000,
      };
      saveToken();
    } catch {
      clearToken(); // revoked / invalid — fall back to the idle card
    }
  }

  function ensureFresh() {
    return Date.now() < token.exp - 60000 ? Promise.resolve() : refresh();
  }

  /* ── painting the widget ── */

  function render(state, info) {
    el.link.classList.toggle("playing", state === "playing");
    el.link.classList.toggle("paused", state === "paused");
    el.status.textContent = info.status;
    el.track.textContent = info.track;
    el.artist.textContent = info.artist;
    if (info.href) {
      el.link.href = info.href;
      el.link.target = "_blank";
      el.link.rel = "noopener noreferrer";
    } else {
      el.link.removeAttribute("href");
      el.link.removeAttribute("target");
      el.link.removeAttribute("rel");
    }
  }

  function paintIdle() {
    trackHref = null;
    el.art.style.backgroundImage = "";
    render("", {
      status: "spotify",
      track: isConfigured() ? "Not connected" : "Spotify not configured",
      artist: isConfigured() ? "tap to link account →" : "add client id — see README",
      href: null,
    });
  }

  function paintNothing() {
    trackHref = null;
    el.art.style.backgroundImage = "";
    render("", {
      status: "spotify",
      track: "Nothing playing",
      artist: "start a song →",
      href: null,
    });
  }

  function paint(badge, data) {
    trackHref = (data.item && data.item.external_urls && data.item.external_urls.spotify) || null;
    const playing = Boolean(data.is_playing);
    render(playing ? "playing" : "paused", {
      status: playing ? "now playing" : "paused",
      track: data.item.name,
      artist: data.item.artists.map((a) => a.name).join(", "),
      href: trackHref,
    });
    const image = data.item.album && data.item.album.images && data.item.album.images[0];
    el.art.style.backgroundImage = image ? 'url("' + image.url + '")' : "";
  }

  /* ── polling ── */

  async function poll(retried) {
    if (!token) return; // idle card is already painted
    try {
      await ensureFresh();
      if (!token) { paintIdle(); return; }
      const res = await fetch(NOW_URL, {
        headers: { Authorization: "Bearer " + token.access },
      });
      if (res.status === 401) {
        await refresh();
        if (token && !retried) return poll(true);
        paintIdle();
        return;
      }
      if (res.status === 204 || res.status === 304) { paintNothing(); return; }
      if (!res.ok) { if (res.status === 403) paintNothing(); return; } // 403 = scope issue
      const data = await res.json();
      if (!data || !data.item) { paintNothing(); return; }
      paint("", data);
    } catch (err) {
      // offline / network hiccup — keep whatever was last on display
      console.warn("[spotify]", err);
    }
  }

  /* ── wiring ── */

  // With no track open, tapping the widget starts the login; with a track it deep-links.
  el.link.addEventListener("click", (e) => {
    if (!trackHref) {
      e.preventDefault();
      startLogin();
    }
  });

  (async function init() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code");
    const error = q.get("error");
    if (code || error) history.replaceState(null, "", location.pathname + location.hash);

    if (error) {
      render("", { status: "spotify", track: "Access denied", artist: "authorize to continue →", href: null });
    }
    if (code) {
      try {
        await exchangeCode(code);
      } catch (err) {
        console.warn("[spotify] authorization failed:", err);
        render("", { status: "spotify", track: "Authorization failed", artist: "try again →", href: null });
      }
    }

    if (token) poll();
    else paintIdle();
  })();

  setInterval(() => poll(false), POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll(false);
  });
})();
