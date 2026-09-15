// ==UserScript==
// @name         ytx
// @namespace    ytx.local
// @version      0.2.0
// @description  YouTube und YouTube Music anpassen: Anzeige, Look, Layout, Verhalten, Filter, Features, lokale Musik-Empfehlungen
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      musicbrainz.org
// @connect      ws.audioscrobbler.com
// @connect      localhost
// @grant        unsafeWindow
// @sandbox      JavaScript
// @inject-into  page
// @noframes
// @homepageURL  https://github.com/jakobus744/youtube_plugin
// @supportURL   https://github.com/jakobus744/youtube_plugin/issues
// @updateURL    https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js
// @downloadURL  https://raw.githubusercontent.com/jakobus744/youtube_plugin/main/dist/ytx.user.js
// ==/UserScript==

(() => {
  // package.json
  var package_default = {
    name: "ytx",
    version: "0.2.0",
    description: "YouTube und YouTube Music anpassen: Anzeige, Look, Layout, Verhalten, Filter, Features, lokale Musik-Empfehlungen",
    private: true,
    type: "module",
    scripts: {
      build: "node build.mjs",
      dev: "node build.mjs --watch",
      serve: "node tools/serve.mjs",
      test: 'node --test "tests/*.test.mjs"'
    },
    devDependencies: {
      esbuild: "^0.25.0"
    }
  };

  // src/core/bridge.js
  var pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : globalThis;
  function dataOf(el) {
    if (!el) return null;
    try {
      return el.polymerController?.data ?? el.__data?.data ?? el.data ?? null;
    } catch {
      return null;
    }
  }
  function player() {
    const p = document.getElementById("movie_player");
    return p && typeof p.getPlayerResponse === "function" ? p : null;
  }
  function pick(obj, path) {
    if (obj == null) return void 0;
    let cur = obj;
    for (const part of path.replace(/\[(\d+)\]/g, ".$1").split(".")) {
      if (part === "") continue;
      if (cur == null) return void 0;
      cur = cur[part];
    }
    return cur;
  }
  function pickAny(obj, paths) {
    for (const p of paths) {
      let v;
      if (typeof p === "function") {
        try {
          v = p(obj);
        } catch {
          v = void 0;
        }
      } else {
        v = pick(obj, p);
      }
      if (v !== void 0 && v !== null && v !== "") return v;
    }
    return void 0;
  }
  function runsText(t) {
    if (!t) return "";
    if (typeof t === "string") return t;
    if (t.simpleText) return t.simpleText;
    if (t.content) return t.content;
    if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join("");
    return "";
  }
  function capabilities() {
    const host2 = document.documentElement.getAttribute("data-ytx-site") === "music" ? "ytmusic-app" : "ytd-app";
    const app = document.querySelector(host2);
    return {
      polymerData: !!(app && (dataOf(app) || app.polymerController?.store)),
      appFound: !!app,
      playerApi: !!player(),
      gmStorage: typeof GM_getValue === "function" && typeof GM_setValue === "function",
      gmClipboard: typeof GM_setClipboard === "function",
      trustedTypes: !!pageWindow.trustedTypes,
      unsafeWindow: typeof unsafeWindow !== "undefined"
    };
  }

  // src/core/lifecycle.js
  var disposers = [];
  function onDispose(fn) {
    disposers.push(fn);
    return fn;
  }
  function listen(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    return onDispose(() => target.removeEventListener(type, fn, opts));
  }
  function disposeAll() {
    while (disposers.length) {
      const fn = disposers.pop();
      try {
        fn();
      } catch (e) {
        console.warn("[ytx] dispose", e);
      }
    }
  }

  // src/core/log.js
  var MAX = 100;
  var entries = [];
  var counts = /* @__PURE__ */ new Map();
  function stringify(x) {
    if (x instanceof Error) return x.message;
    if (typeof x === "string") return x;
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }
  function push(level, args) {
    const msg = args.map(stringify).join(" ");
    const last2 = entries[entries.length - 1];
    if (last2 && last2.msg === msg && last2.level === level) {
      last2.n++;
      last2.t = Date.now();
    } else {
      entries.push({ t: Date.now(), level, msg, n: 1 });
      if (entries.length > MAX) entries.shift();
    }
    counts.set(level, (counts.get(level) || 0) + 1);
    if (level === "error") console.error("[ytx]", ...args);
    else if (level === "warn") console.warn("[ytx]", ...args);
  }
  var log = {
    info: (...a) => push("info", a),
    warn: (...a) => push("warn", a),
    error: (...a) => push("error", a),
    entries: () => entries.slice(),
    count: (level) => counts.get(level) || 0
  };

  // src/core/site.js
  var host = typeof location !== "undefined" ? location.hostname : "";
  var SITE_ID = host === "music.youtube.com" ? "music" : "youtube";

  // src/registry/shared.js
  var SH = ["show", "hide"];
  var SDH = ["show", "dim", "hide"];
  var SDC = ["show", "dim", "collapse"];
  var SDCH = ["show", "dim", "collapse", "hide"];
  var MODE_LABELS = { show: "Normal", dim: "Dimmen", collapse: "Einklappen", hide: "Aus" };
  var attrName = (id) => `data-ytx-d-${id.replace(/\./g, "-")}`;

  // src/registry/youtube/targets.js
  var GROUPS = [
    "Seitenleiste",
    "Kopfzeile",
    "Startseite",
    "Videoseite · Bereiche",
    "Videoseite · Buttons",
    "Player",
    "Thumbnails",
    "Suche",
    "Kanal",
    "Abo-Feed",
    "Playlist"
  ];
  var targets = [
    // seitenleiste
    {
      id: "guide.shorts",
      label: "Shorts-Eintrag",
      group: "Seitenleiste",
      modes: SH,
      sel: ['[data-ytx-guide="shorts"]', 'ytd-guide-entry-renderer:has(a[title="Shorts"])', 'ytd-mini-guide-entry-renderer[aria-label="Shorts"]']
    },
    {
      id: "guide.explore",
      label: "Entdecken (Trends, Musik, Gaming …)",
      group: "Seitenleiste",
      modes: SH,
      sel: ['[data-ytx-guide-section="explore"]']
    },
    {
      id: "guide.moreYT",
      label: "Mehr von YouTube",
      group: "Seitenleiste",
      modes: SH,
      sel: ['[data-ytx-guide-section="more"]']
    },
    {
      id: "guide.subs",
      label: "Abo-Liste",
      group: "Seitenleiste",
      modes: SDCH,
      sel: ['[data-ytx-guide-section="subscriptions"]']
    },
    {
      id: "guide.you",
      label: "Mein YouTube / Playlists",
      group: "Seitenleiste",
      modes: SDCH,
      sel: ['[data-ytx-guide-section="you"]']
    },
    {
      id: "guide.footer",
      label: "Fußzeile (Impressum, Links)",
      group: "Seitenleiste",
      modes: SH,
      sel: ["ytd-guide-renderer #footer", "ytd-guide-signin-promo-renderer"]
    },
    {
      id: "guide.all",
      label: "Seitenleiste komplett",
      group: "Seitenleiste",
      radical: true,
      modes: SH,
      sel: ["tp-yt-app-drawer#guide", "ytd-mini-guide-renderer", "ytd-masthead #guide-button"],
      css: { hide: (p) => `${p} ytd-page-manager { margin-left: 0 !important; }` },
      note: "Navigation dann nur noch über Logo und Suche"
    },
    // kopfzeile
    {
      id: "top.create",
      label: "Erstellen-Button",
      group: "Kopfzeile",
      modes: SH,
      sel: ['ytd-masthead [data-ytx-top="create"]', 'ytd-masthead ytd-button-renderer:has(a[href*="upload"])', 'ytd-masthead #buttons ytd-topbar-menu-button-renderer:has(yt-icon[icon="yt-icons:video_call"])']
    },
    {
      id: "top.notifications",
      label: "Benachrichtigungen",
      group: "Kopfzeile",
      modes: SDH,
      sel: ["ytd-masthead ytd-notification-topbar-button-renderer", 'ytd-masthead [data-ytx-top="notifications"]']
    },
    {
      id: "top.voice",
      core: true,
      label: "Sprachsuche",
      group: "Kopfzeile",
      modes: SH,
      sel: ["ytd-masthead #voice-search-button"]
    },
    {
      id: "top.countryCode",
      label: "Ländercode am Logo",
      group: "Kopfzeile",
      modes: SH,
      sel: ["ytd-masthead #country-code"]
    },
    // startseite
    {
      id: "home.shortsShelf",
      label: "Shorts-Regal",
      group: "Startseite",
      pages: ["home"],
      modes: SDCH,
      sel: [
        "ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])",
        'ytd-rich-section-renderer:has(a[href^="/shorts/"])',
        "ytd-reel-shelf-renderer",
        'grid-shelf-view-model:has(a[href^="/shorts/"])'
      ]
    },
    {
      id: "home.chips",
      label: "Filterleiste (Alle, Musik, Live …)",
      group: "Startseite",
      pages: ["home"],
      modes: SH,
      sel: ['ytd-browse[page-subtype="home"] ytd-feed-filter-chip-bar-renderer', 'ytd-browse[page-subtype="home"] #chips-wrapper'],
      css: { hide: (p) => `${p} ytd-browse[page-subtype="home"] ytd-rich-grid-renderer { --ytd-rich-grid-chips-bar-height: 0px !important; }` }
    },
    {
      id: "home.shelves",
      label: "Themen-Regale (Mixe, News, Empfehlungen)",
      group: "Startseite",
      pages: ["home"],
      modes: SDCH,
      sel: ["ytd-rich-section-renderer:has(ytd-rich-shelf-renderer:not([is-shorts]))", "ytd-rich-section-renderer:has(ytd-statement-banner-renderer)"],
      note: "Mixe und News lassen sich sprachunabhängig nicht sicher trennen"
    },
    {
      id: "home.banner",
      label: "Werbebanner & Promo-Kacheln",
      group: "Startseite",
      pages: ["home"],
      modes: SH,
      sel: ["ytd-rich-item-renderer:has(ytd-ad-slot-renderer)", "ytd-ad-slot-renderer", "#masthead-ad", "ytd-banner-promo-renderer", "ytd-brand-video-singleton-renderer", "ytd-rich-section-renderer:has(ytd-inline-survey-renderer)"],
      note: "Blendet nur Container aus, blockiert keine Anfragen"
    },
    {
      id: "home.feedAll",
      label: "Startseiten-Feed komplett",
      group: "Startseite",
      pages: ["home"],
      radical: true,
      modes: SDH,
      sel: ['ytd-browse[page-subtype="home"] ytd-rich-grid-renderer', 'ytd-browse[page-subtype="home"] ytd-two-column-browse-results-renderer'],
      note: "Sinnvoll zusammen mit Verhalten › Startseite umleiten"
    },
    // videoseite bereiche
    {
      id: "watch.sidebar",
      core: true,
      label: "Empfehlungen neben dem Video",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDCH,
      sel: ["ytd-watch-flexy #related"],
      note: "Einklappen/Aus lässt Chat und Playlist stehen"
    },
    {
      id: "watch.comments",
      core: true,
      label: "Kommentare",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDCH,
      sel: ["ytd-watch-flexy ytd-comments#comments"]
    },
    {
      id: "watch.description",
      core: true,
      label: "Beschreibung",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDC,
      sel: ["ytd-watch-metadata #bottom-row"]
    },
    {
      id: "watch.shortsShelf",
      label: "Shorts-Regal in Empfehlungen",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDCH,
      sel: ["ytd-watch-flexy #related ytd-reel-shelf-renderer", "ytd-watch-flexy #related grid-shelf-view-model", 'ytd-watch-flexy #related ytd-rich-section-renderer:has(a[href^="/shorts/"])']
    },
    {
      id: "watch.merch",
      label: "Merch, Tickets, Spenden",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDCH,
      sel: ["ytd-watch-flexy ytd-merch-shelf-renderer", "ytd-watch-flexy #ticket-shelf", "ytd-watch-flexy ytd-ticket-shelf-renderer", "ytd-watch-flexy #donation-shelf:not(:empty)", "ytd-watch-flexy ytd-donation-shelf-renderer"]
    },
    {
      id: "watch.ads",
      label: "Werbe-Kacheln in Empfehlungen",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SH,
      sel: ["ytd-watch-flexy #related ytd-ad-slot-renderer", "ytd-watch-flexy #player-ads", 'ytd-watch-flexy ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]'],
      note: "Nur Container, keine Player-Werbung"
    },
    {
      id: "watch.ambient",
      label: "Ambient-Glow hinter dem Player",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SH,
      sel: ["ytd-watch-flexy #cinematics", "ytd-watch-flexy #cinematics-container"]
    },
    {
      id: "watch.playlistPanel",
      label: "Playlist-Panel",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDC,
      sel: ["ytd-watch-flexy ytd-playlist-panel-renderer#playlist:not([hidden])"]
    },
    {
      id: "watch.chat",
      label: "Live-Chat",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SDCH,
      sel: ["ytd-watch-flexy #chat-container:has(ytd-live-chat-frame)", "ytd-watch-flexy ytd-live-chat-frame"]
    },
    {
      id: "watch.infoCards",
      label: "Infokarten in der Beschreibung",
      group: "Videoseite · Bereiche",
      pages: ["watch"],
      modes: SH,
      sel: ["ytd-watch-metadata ytd-video-description-infocards-section-renderer", "ytd-watch-metadata ytd-horizontal-card-list-renderer"]
    },
    {
      id: "watch.miniplayer",
      label: "Miniplayer",
      group: "Videoseite · Bereiche",
      modes: SH,
      sel: ["ytd-miniplayer", "ytd-app > ytd-miniplayer"]
    },
    // videoseite buttons
    {
      id: "watch.btn.like",
      core: true,
      label: "Like / Dislike",
      group: "Videoseite · Buttons",
      pages: ["watch"],
      modes: SDH,
      sel: ['ytd-watch-metadata [data-ytx-btn="like"]']
    },
    {
      id: "watch.btn.likeCount",
      label: "Like-Zahl",
      group: "Videoseite · Buttons",
      pages: ["watch"],
      modes: SH,
      sel: ['ytd-watch-metadata like-button-view-model [class*="ButtonTextContent"]', 'ytd-watch-metadata like-button-view-model [class*="button-text-content"]']
    },
    { id: "watch.btn.share", core: true, label: "Teilen", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="share"]'] },
    { id: "watch.btn.save", label: "Speichern", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="save"]'] },
    { id: "watch.btn.download", label: "Herunterladen", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="download"]'] },
    { id: "watch.btn.clip", label: "Clip", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="clip"]'] },
    { id: "watch.btn.thanks", label: "Super Thanks", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="thanks"]'] },
    { id: "watch.btn.ask", label: "KI-Fragen", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ['ytd-watch-metadata [data-ytx-btn="ask"]'] },
    { id: "watch.btn.join", label: "Kanalmitglied werden", group: "Videoseite · Buttons", pages: ["watch"], modes: SH, sel: ["ytd-watch-metadata #sponsor-button"] },
    { id: "watch.btn.subscribe", core: true, label: "Abonnieren", group: "Videoseite · Buttons", pages: ["watch"], modes: SDH, sel: ["ytd-watch-metadata #subscribe-button"] },
    { id: "watch.btn.more", core: true, label: "Menü ⋯", group: "Videoseite · Buttons", pages: ["watch"], radical: true, modes: SH, sel: ["ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape#button-shape", "ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button#button"] },
    // player
    {
      id: "player.endscreen",
      label: "Endbildschirm-Kacheln",
      group: "Player",
      pages: ["watch"],
      modes: SDH,
      sel: ["#movie_player .ytp-ce-element", "#movie_player .ytp-endscreen-content", "#movie_player .html5-endscreen", "#movie_player .ytp-fullscreen-grid"]
    },
    { id: "player.cards", label: "Infokarten-Teaser", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-cards-teaser", "#movie_player .ytp-cards-button", "#movie_player .iv-drawer"] },
    { id: "player.pauseOverlay", label: "„Weitere Videos“ beim Pausieren", group: "Player", modes: SH, sel: ["#movie_player .ytp-pause-overlay", "#movie_player .ytp-pause-overlay-container"] },
    { id: "player.paidPromo", label: "Hinweis bezahlte Werbung", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-paid-content-overlay"] },
    { id: "player.watermark", label: "Kanal-Wasserzeichen", group: "Player", pages: ["watch"], modes: SDH, sel: ["#movie_player .iv-branding", "#movie_player .branding-img-container", "#movie_player .ytp-branding"] },
    { id: "player.btn.autoplay", core: true, label: "Autoplay-Schalter", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-autonav-toggle", "#movie_player button:has(> .ytp-autonav-toggle-button-container)", "#movie_player .ytp-autonav-toggle-button-container"] },
    { id: "player.btn.miniplayer", label: "Miniplayer-Button", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-miniplayer-button"] },
    { id: "player.btn.cast", core: true, label: "Cast-Button", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-remote-button"] },
    { id: "player.btn.next", core: true, label: "Nächstes Video", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-next-button"] },
    { id: "player.btn.theater", core: true, label: "Kinomodus-Button", group: "Player", pages: ["watch"], modes: SH, sel: ["#movie_player .ytp-size-button"] },
    // thumbnails
    {
      id: "thumb.image",
      label: "Thumbnails",
      group: "Thumbnails",
      radical: true,
      modes: SDH,
      dim: "grayscale",
      sel: [
        "ytd-thumbnail:not(ytd-playlist-panel-video-renderer ytd-thumbnail)",
        "yt-thumbnail-view-model",
        "ytd-playlist-thumbnail",
        "ytd-playlist-video-thumbnail-renderer"
      ],
      note: "Dimmen = Graustufen bis Hover. Aus = nur Titel"
    },
    {
      id: "thumb.hoverPreview",
      label: "Vorschau beim Hovern",
      group: "Thumbnails",
      modes: SH,
      sel: ["ytd-video-preview", "#video-preview", "ytd-moving-thumbnail-renderer", "#mouseover-overlay", "yt-thumbnail-view-model animated-thumbnail-overlay-view-model"]
    },
    {
      id: "thumb.badges",
      label: "Neu- und Qualitäts-Badges",
      group: "Thumbnails",
      modes: SH,
      sel: ["ytd-badge-supported-renderer.video-badge", "yt-content-metadata-view-model badge-shape"]
    },
    // suche
    {
      id: "search.shorts",
      label: "Shorts in Ergebnissen",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ['ytd-search grid-shelf-view-model:has(a[href^="/shorts/"])', "ytd-search ytd-reel-shelf-renderer", 'ytd-search ytd-video-renderer:has(a[href^="/shorts/"])', 'ytd-search yt-lockup-view-model:has(a[href^="/shorts/"])']
    },
    {
      id: "search.peopleAlsoSearch",
      label: "„Leute suchen auch nach“",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ["ytd-search ytd-horizontal-card-list-renderer", "ytd-search ytd-search-refinement-card-renderer"]
    },
    {
      id: "search.shelves",
      label: "Eingestreute Regale",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ["ytd-search ytd-shelf-renderer", 'ytd-search grid-shelf-view-model:not(:has(a[href^="/shorts/"]))']
    },
    {
      id: "search.mixes",
      label: "Mixe / Playlists in Ergebnissen",
      group: "Suche",
      pages: ["search"],
      modes: SDH,
      sel: ['ytd-search ytd-item-section-renderer yt-lockup-view-model:has(a[href*="start_radio=1"])', "ytd-search ytd-radio-renderer", "ytd-search ytd-playlist-renderer"]
    },
    {
      id: "search.ads",
      label: "Werbung in Ergebnissen",
      group: "Suche",
      pages: ["search"],
      modes: SH,
      sel: ["ytd-search ytd-ad-slot-renderer", "ytd-search ytd-promoted-sparkles-web-renderer", "ytd-search ytd-promoted-video-renderer"]
    },
    // kanal
    {
      id: "channel.shortsTab",
      label: "Shorts-Tab",
      group: "Kanal",
      pages: ["channel"],
      modes: SH,
      sel: ['[data-ytx-tab="shorts"]']
    },
    {
      id: "channel.postsTab",
      label: "Beiträge-Tab",
      group: "Kanal",
      pages: ["channel"],
      modes: SH,
      sel: ['[data-ytx-tab="posts"]']
    },
    {
      id: "channel.shortsShelf",
      label: "Shorts-Regal auf Startseite des Kanals",
      group: "Kanal",
      pages: ["channel"],
      modes: SDCH,
      sel: ['ytd-browse[page-subtype="channels"] ytd-item-section-renderer:has(ytd-reel-shelf-renderer)', 'ytd-browse[page-subtype="channels"] ytd-item-section-renderer:has(grid-shelf-view-model a[href^="/shorts/"])', 'ytd-browse[page-subtype="channels"] ytd-rich-section-renderer:has(a[href^="/shorts/"])']
    },
    {
      id: "channel.trailer",
      label: "Kanal-Trailer",
      group: "Kanal",
      pages: ["channel"],
      modes: SDCH,
      sel: ['ytd-browse[page-subtype="channels"] ytd-channel-video-player-renderer']
    },
    // abo feed
    {
      id: "subs.shorts",
      label: "Shorts im Abo-Feed",
      group: "Abo-Feed",
      pages: ["subscriptions"],
      modes: SDCH,
      sel: ['ytd-browse[page-subtype="subscriptions"] ytd-rich-section-renderer:has(a[href^="/shorts/"])', 'ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has(a[href^="/shorts/"])', 'ytd-browse[page-subtype="subscriptions"] ytd-reel-shelf-renderer']
    },
    {
      id: "subs.live",
      label: "Live und Premieren im Abo-Feed",
      group: "Abo-Feed",
      pages: ["subscriptions"],
      modes: SDH,
      sel: ['ytd-browse[page-subtype="subscriptions"] ytd-rich-item-renderer:has([data-ytx-live])']
    },
    // playlist
    {
      id: "playlist.sidebarInfo",
      label: "Playlist-Beschreibung / Kopf",
      group: "Playlist",
      pages: ["playlist"],
      modes: SDC,
      sel: ['ytd-browse[page-subtype="playlist"] ytd-playlist-header-renderer', 'ytd-browse[page-subtype="playlist"] yt-page-header-renderer']
    }
  ];
  var targetById = Object.fromEntries(targets.map((t) => [t.id, t]));

  // src/registry/youtube/anchors.js
  var anchors = {
    "top.buttons": {
      label: "Kopfzeile rechts",
      sel: ["ytd-masthead #end #buttons", "ytd-masthead #buttons", "#masthead #end"]
    },
    "watch.actions": {
      label: "Aktionsleiste unter dem Video (vor ⋯)",
      // eigene buttons vor den menue knopf, nie in youtubes button listen
      sel: [
        "ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape#button-shape",
        "ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button#button",
        "ytd-watch-metadata #actions ytd-menu-renderer > :last-child"
      ]
    },
    "watch.titleRow": {
      label: "Unter dem Videotitel",
      sel: ["ytd-watch-metadata #title", "ytd-watch-metadata #above-the-fold #title"]
    },
    "transcript.panelHeader": {
      label: "Kopf des Transkript-Panels",
      visibleOnly: true,
      sel: [
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] ytd-engagement-panel-title-header-renderer #title-container',
        'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] ytd-engagement-panel-title-header-renderer #title-container'
      ]
    },
    "player.timeDisplay": {
      label: "Zeitanzeige im Player",
      sel: ["#movie_player .ytp-time-display .ytp-time-contents", "#movie_player .ytp-time-display"]
    },
    "player.rightControls": {
      label: "Player-Buttons rechts",
      sel: ["#movie_player .ytp-right-controls-left", "#movie_player .ytp-right-controls"]
    },
    "playlist.header": {
      label: "Playlist-Kopf Statistik",
      sel: [
        'ytd-browse[page-subtype="playlist"] ytd-playlist-byline-renderer',
        'ytd-browse[page-subtype="playlist"] yt-page-header-view-model yt-content-metadata-view-model',
        'ytd-browse[page-subtype="playlist"] ytd-playlist-header-renderer .metadata-stats',
        'ytd-browse[page-subtype="playlist"] #header'
      ]
    },
    "watch.playlistHeader": {
      label: "Playlist-Panel Kopf",
      sel: ["ytd-watch-flexy ytd-playlist-panel-renderer#playlist #header-description", "ytd-watch-flexy ytd-playlist-panel-renderer#playlist #header-contents"]
    }
  };

  // src/core/dom.js
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === void 0 || v === null || v === false) continue;
        if (k === "class") el.className = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k === "text") el.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === "value" && "value" in el) el.value = v;
        else if (k === "checked" || k === "selected" || k === "disabled") el[k] = !!v;
        else el.setAttribute(k, v === true ? "" : String(v));
      }
    }
    appendChildren(el, children);
    return el;
  }
  function appendChildren(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === void 0 || c === null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  function clear(el) {
    while (el.firstChild) el.firstChild.remove();
    return el;
  }
  function qs(sel, root = document) {
    try {
      return root.querySelector(sel);
    } catch {
      return null;
    }
  }
  function qsa(sel, root = document) {
    try {
      return Array.from(root.querySelectorAll(sel));
    } catch {
      return [];
    }
  }
  function qsFirst(list, root = document) {
    for (const s of list) {
      const el = qs(s, root);
      if (el) return el;
    }
    return null;
  }
  function isVisible(el) {
    return !!(el && el.isConnected && el.getClientRects().length);
  }
  function validSelector(sel) {
    try {
      document.createDocumentFragment().querySelector(sel);
      return true;
    } catch {
      return false;
    }
  }
  function whenBody(fn) {
    if (document.body) return fn();
    const mo = new MutationObserver(() => {
      if (document.body) {
        mo.disconnect();
        fn();
      }
    });
    mo.observe(document.documentElement, { childList: true });
  }

  // src/registry/youtube/tags.js
  var BUTTON_ICONS = [
    [/SHARE/, "share"],
    [/PLAYLIST_ADD|SAVE/, "save"],
    [/DOWNLOAD/, "download"],
    [/CONTENT_CUT|CLIP/, "clip"],
    [/MONEY_HEART|THANKS/, "thanks"],
    [/SPARK/, "ask"],
    [/FLAG/, "report"],
    [/LIKE/, "like"]
  ];
  function iconOf(item) {
    if (!item) return "";
    const key = Object.keys(item)[0] || "";
    const v = item[key] || {};
    if (key === "segmentedLikeDislikeButtonViewModel" || key === "segmentedLikeDislikeButtonRenderer") return "LIKE";
    if (key === "downloadButtonRenderer") return "DOWNLOAD";
    return v.iconName || v.icon?.iconType || v.buttonViewModel?.iconName || v.defaultIcon?.iconType || key;
  }
  function buttonName(item) {
    const icon = String(iconOf(item));
    for (const [re, name] of BUTTON_ICONS) if (re.test(icon)) return name;
    return `icon-${icon.toLowerCase()}`;
  }
  function tagButtons(menu) {
    const d = dataOf(menu);
    if (!d) return 0;
    let n = 0;
    const top2 = qsa(":scope > #top-level-buttons-computed > *", menu);
    const topData = d.topLevelButtons || [];
    if (top2.length === topData.length) {
      top2.forEach((el, i) => {
        const name = buttonName(topData[i]);
        if (el.getAttribute("data-ytx-btn") !== name) el.setAttribute("data-ytx-btn", name);
        n++;
      });
    }
    const flex = qsa(":scope > #flexible-item-buttons > *", menu);
    const flexData = (d.flexibleItems || []).map((f) => f.menuFlexibleItemRenderer?.topLevelButton);
    if (flex.length === flexData.length) {
      flex.forEach((el, i) => {
        const name = buttonName(flexData[i]);
        if (el.getAttribute("data-ytx-btn") !== name) el.setAttribute("data-ytx-btn", name);
        n++;
      });
    } else {
      for (const el of flex) if (el.tagName === "YTD-DOWNLOAD-BUTTON-RENDERER") el.setAttribute("data-ytx-btn", "download");
    }
    return n;
  }
  var SECTION_RULES = [
    ["more", /PREMIUM|STUDIO|YOUTUBE_MUSIC|YOUTUBE_KIDS|UNPLUGGED|YOUTUBE_RED/],
    ["settings", /SETTINGS|FLAG|HELP|FEEDBACK/],
    ["you", /ACCOUNT_CIRCLE|WATCH_HISTORY|PLAYLISTS|WATCH_LATER|LIKE|VIDEO_LIBRARY|MY_VIDEOS|OFFLINE_DOWNLOAD|CONTENT_CUT|PURCHASE/],
    ["explore", /TRENDING|FIRE|SHOPPING|MUSIC|GAMING|NEWS|SPORTS|LIVE|MOVIE|FASHION|PODCAST|COURSE|LEARNING|EXPLORE/],
    ["main", /TAB_HOME|TAB_SHORTS|TAB_SUBSCRIPTIONS/]
  ];
  function entryIcon(item) {
    const k = Object.keys(item || {})[0];
    const r = item?.[k] || {};
    return { key: k, icon: r.icon?.iconType || "", browseId: r.navigationEndpoint?.browseEndpoint?.browseId || "", reel: !!r.navigationEndpoint?.reelWatchEndpoint };
  }
  function classifySection(d) {
    const items = d?.items || [];
    const score = /* @__PURE__ */ new Map();
    for (const it of items) {
      const e = entryIcon(it);
      if (e.key === "guideCollapsibleSectionEntryRenderer" || /^UC/.test(e.browseId)) {
        score.set("subscriptions", (score.get("subscriptions") || 0) + 1);
        continue;
      }
      for (const [name, re] of SECTION_RULES) {
        if (re.test(e.icon)) {
          score.set(name, (score.get(name) || 0) + 1);
          break;
        }
      }
    }
    let best = null;
    let max = 0;
    for (const [k, v] of score) if (v > max) [best, max] = [k, v];
    return best;
  }
  var tagRules = [
    {
      id: "watch.buttons",
      core: true,
      label: "Buttons der Aktionsleiste",
      pages: ["watch"],
      run() {
        let n = 0;
        for (const menu of qsa("ytd-watch-metadata #actions ytd-menu-renderer")) n += tagButtons(menu);
        return n;
      }
    },
    {
      id: "guide.entries",
      label: "Seitenleisten-Einträge",
      run() {
        let n = 0;
        for (const el of qsa("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer")) {
          const d = dataOf(el);
          if (!d) continue;
          const icon = d.icon?.iconType || "";
          const name = /SHORTS/.test(icon) || d.navigationEndpoint?.reelWatchEndpoint ? "shorts" : /SUBSCRIPTIONS/.test(icon) ? "subscriptions" : /TAB_HOME/.test(icon) ? "home" : null;
          if (name && el.getAttribute("data-ytx-guide") !== name) el.setAttribute("data-ytx-guide", name);
          if (name) n++;
        }
        for (const el of qsa("ytd-guide-renderer #sections > ytd-guide-section-renderer, ytd-guide-renderer #sections > ytd-guide-collapsible-section-entry-renderer")) {
          const d = dataOf(el);
          const kind = el.tagName === "YTD-GUIDE-COLLAPSIBLE-SECTION-ENTRY-RENDERER" ? "subscriptions" : classifySection(d);
          if (kind && el.getAttribute("data-ytx-guide-section") !== kind) el.setAttribute("data-ytx-guide-section", kind);
          if (kind) n++;
        }
        for (const el of qsa("ytd-guide-renderer #sections > ytd-guide-subscriptions-section-renderer")) {
          el.setAttribute("data-ytx-guide-section", "subscriptions");
          n++;
        }
        return n;
      }
    },
    {
      id: "top.buttons",
      label: "Kopfzeilen-Buttons",
      run() {
        let n = 0;
        for (const el of qsa("ytd-masthead #buttons > *")) {
          const d = dataOf(el);
          const icon = String(d?.icon?.iconType || pick(d, "buttonRenderer.icon.iconType") || "");
          const name = /VIDEO_CALL|UPLOAD|ADD/.test(icon) ? "create" : /NOTIFICATION/.test(icon) || el.tagName === "YTD-NOTIFICATION-TOPBAR-BUTTON-RENDERER" ? "notifications" : null;
          if (name) {
            el.setAttribute("data-ytx-top", name);
            n++;
          }
        }
        return n;
      }
    },
    {
      id: "channel.tabs",
      label: "Kanal-Tabs",
      pages: ["channel"],
      run() {
        let n = 0;
        const browse = document.querySelector('ytd-browse[page-subtype="channels"]');
        const d = dataOf(browse);
        const tabs = pick(d, "contents.twoColumnBrowseResultsRenderer.tabs") || [];
        const urls = tabs.map((t) => pick(t, "tabRenderer.endpoint.commandMetadata.webCommandMetadata.url") || pick(t, "expandableTabRenderer.endpoint.commandMetadata.webCommandMetadata.url") || "");
        const els = qsa('ytd-browse[page-subtype="channels"] yt-tab-group-shape yt-tab-shape, ytd-browse[page-subtype="channels"] tp-yt-paper-tab');
        if (els.length && els.length <= urls.length) {
          els.forEach((el, i) => {
            const url = urls[i] || "";
            const name = /\/shorts$/.test(url) ? "shorts" : /\/(posts|community)$/.test(url) ? "posts" : /\/videos$/.test(url) ? "videos" : /\/streams$/.test(url) ? "streams" : null;
            if (name) {
              el.setAttribute("data-ytx-tab", name);
              n++;
            }
          });
        }
        return n;
      }
    },
    {
      id: "cards.live",
      label: "Live-Markierung auf Kacheln",
      run() {
        let n = 0;
        for (const b of qsa('badge-shape[class*="Live"], ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"], ytd-badge-supported-renderer .badge-style-type-live-now-alternate')) {
          const card = b.closest("ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer");
          if (card && !card.hasAttribute("data-ytx-live")) {
            card.setAttribute("data-ytx-live", "");
            n++;
          }
        }
        return n;
      }
    }
  ];

  // src/registry/youtube/look.js
  var TOKEN = (name) => `--yt-sys-color-baseline--${name}`;
  var TOKEN_SCOPE = "html:root:root, html:root:root [dark], html:root:root [light]";
  var LOOK_GROUPS = ["Farben", "Dichte", "Typografie", "Thumbnails", "Buttons", "Allgemein"];
  var colorControls = [
    { id: "bg", label: "Hintergrund", tokens: [TOKEN("base-background"), "--yt-spec-base-background"], extra: (v) => `ytd-app, #masthead-container, ytd-masthead, #background.ytd-masthead, tp-yt-app-drawer #contentContainer, ytd-mini-guide-renderer { background-color: ${v} !important; }` },
    { id: "raised", label: "Flächen & Karten", tokens: [TOKEN("raised-background"), "--yt-spec-raised-background"] },
    { id: "menu", label: "Menüs & Dialoge", tokens: [TOKEN("menu-background"), "--yt-spec-menu-background"] },
    { id: "text", label: "Text", tokens: [TOKEN("text-primary"), "--yt-spec-text-primary"] },
    { id: "textSecondary", label: "Text gedimmt", tokens: [TOKEN("text-secondary"), "--yt-spec-text-secondary"] },
    { id: "accent", label: "Akzent & Links", tokens: [TOKEN("call-to-action"), TOKEN("call-to-action-hover"), "--yt-spec-call-to-action"] },
    { id: "outline", label: "Rahmen & Trenner", tokens: [TOKEN("outline"), TOKEN("outline-opaque"), "--yt-spec-10-percent-layer"] },
    {
      id: "progress",
      label: "Fortschrittsbalken",
      tokens: [],
      extra: (v) => `#movie_player .ytp-play-progress, #movie_player .ytp-swatch-background-color, ytd-thumbnail-overlay-resume-playback-renderer #progress, [class*="ProgressBarSegment"] { background: ${v} !important; } #movie_player .ytp-scrubber-button { background: ${v} !important; }`
    }
  ];
  function searchboxCss(colors) {
    const surface = colors.raised || colors.bg;
    if (!surface) return "";
    const border = colors.outline || surface;
    const menu = colors.menu || surface;
    const text = colors.text;
    const text2 = colors.textSecondary || text;
    const accent = colors.accent || border;
    const out = [
      `.ytSearchboxComponentInputBox, .ytSearchboxComponentInputBoxDark { background-color: ${surface} !important; border-color: ${border} !important; }`,
      `.ytSearchboxComponentInputBoxDark.ytSearchboxComponentInputBoxHasFocus, .ytSearchboxComponentInputBoxHasFocus { border-color: ${accent} !important; }`,
      `.ytSearchboxComponentSearchButton, .ytSearchboxComponentSearchButtonDark { background-color: ${surface} !important; border-color: ${border} !important; }`,
      `.ytSearchboxComponentSearchButton:hover, .ytSearchboxComponentSearchButtonDark:hover { background-color: ${border} !important; }`,
      `.ytSearchboxComponentSuggestionsContainer, .ytSearchboxComponentSuggestionsContainerDark, .ytSearchboxComponentSuggestionsContainerUnified, .ytSearchboxComponentSuggestionsContainerShowMoreButtonContainer, .ytSearchboxComponentInputContainerIsFocused { background-color: ${menu} !important; }`
    ];
    if (text) out.push(`.ytSearchboxComponentHostDark, .ytSearchboxComponentHost, .ytSearchboxComponentInput { color: ${text} !important; }`);
    if (text2) out.push(`.ytSearchboxComponentSuggestionsHeader, .ytSearchboxComponentReportButton { color: ${text2} !important; }`);
    return out.join("\n");
  }
  function cardTextCss(colors) {
    const text = colors.text;
    const text2 = colors.textSecondary || text;
    const out = [];
    if (text) out.push(`.ytLockupMetadataViewModelTitle, .ytLockupMetadataViewModelTitle * { color: ${text} !important; }`);
    if (text2)
      out.push(
        `.ytContentMetadataViewModelMetadataText, .ytContentMetadataViewModelMetadataText *, .ytAvatarStackViewModelAvatarStackText, .ytAvatarStackViewModelAvatarStackText *, a.ytAttributedStringLink { color: ${text2} !important; }`
      );
    return out.join("\n");
  }
  var themes = [
    { id: "", label: "YouTube (unverändert)", values: {} },
    { id: "oled", label: "OLED Schwarz", values: { bg: "#000000", raised: "#0e0e0e", menu: "#161616", text: "#ededed", textSecondary: "#9a9a9a", accent: "#5aa9ff", outline: "#262626", progress: "#e53935" } },
    { id: "nord", label: "Nord", values: { bg: "#2e3440", raised: "#3b4252", menu: "#434c5e", text: "#eceff4", textSecondary: "#a9b1c1", accent: "#88c0d0", outline: "#4c566a", progress: "#88c0d0" } },
    { id: "gruvbox", label: "Gruvbox", values: { bg: "#282828", raised: "#3c3836", menu: "#504945", text: "#ebdbb2", textSecondary: "#a89984", accent: "#fabd2f", outline: "#504945", progress: "#fe8019" } },
    { id: "dracula", label: "Dracula", values: { bg: "#282a36", raised: "#343746", menu: "#3e4153", text: "#f8f8f2", textSecondary: "#a4a8c0", accent: "#bd93f9", outline: "#44475a", progress: "#ff79c6" } },
    { id: "solarized", label: "Solarized Dark", values: { bg: "#002b36", raised: "#073642", menu: "#0b4452", text: "#eee8d5", textSecondary: "#93a1a1", accent: "#2aa198", outline: "#0f4b59", progress: "#cb4b16" } }
  ];
  var RICH_GRID = "ytd-rich-grid-renderer";
  var CARD_TITLES = '#video-title, yt-lockup-metadata-view-model h3, yt-lockup-metadata-view-model h3 a, [class*="LockupMetadataViewModelTitle"]';
  var controls = [
    // dichte
    {
      id: "columns",
      label: "Spalten im Raster",
      group: "Dichte",
      type: "range",
      min: 1,
      max: 8,
      step: 1,
      placeholder: 4,
      css: (v) => `${RICH_GRID} { --ytd-rich-grid-items-per-row: ${v} !important; --ytd-rich-grid-posts-per-row: ${v} !important; --ytd-rich-grid-slim-items-per-row: ${Math.max(v, 2)} !important; --ytd-rich-grid-game-cards-per-row: ${v} !important; }`
    },
    {
      id: "gap",
      label: "Abstand zwischen Kacheln",
      group: "Dichte",
      type: "range",
      min: 0,
      max: 40,
      step: 2,
      unit: "px",
      placeholder: 16,
      css: (v) => `${RICH_GRID} { --ytd-rich-grid-item-margin: ${v}px !important; --ytd-rich-grid-row-margin: ${v}px !important; } ytd-rich-item-renderer[rendered-from-rich-grid] { margin-bottom: ${v * 1.5}px !important; }`
    },
    {
      id: "contentWidth",
      label: "Maximale Inhaltsbreite",
      group: "Dichte",
      type: "range",
      min: 800,
      max: 2600,
      step: 50,
      unit: "px",
      placeholder: 1800,
      css: (v) => `ytd-browse[page-subtype="home"] ytd-rich-grid-renderer, ytd-browse[page-subtype="subscriptions"] ytd-rich-grid-renderer, ytd-search ytd-two-column-search-results-renderer { max-width: ${v}px !important; margin-inline: auto !important; }`
    },
    {
      id: "playerWidth",
      label: "Maximale Playerbreite",
      group: "Dichte",
      type: "range",
      min: 640,
      max: 2600,
      step: 20,
      unit: "px",
      placeholder: 1280,
      css: (v) => `:root { --ytx-player-max-w: ${v}px; } ytd-watch-flexy { --ytd-watch-flexy-max-player-width: ${v}px !important; }`
    },
    {
      id: "radius",
      label: "Ecken-Rundung",
      group: "Dichte",
      type: "range",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      placeholder: 12,
      css: (v) => `ytd-thumbnail a#thumbnail, ytd-thumbnail yt-image img, ytd-thumbnail #thumbnail, yt-thumbnail-view-model, yt-thumbnail-view-model img, [class*="ThumbnailViewModelImage"], ytd-playlist-thumbnail, ytd-watch-flexy[rounded-player] #ytd-player, ytd-watch-flexy[rounded-player-large] #ytd-player, #cinematics canvas { border-radius: ${v}px !important; }`
    },
    // typografie
    {
      id: "font",
      label: "Schrift",
      group: "Typografie",
      type: "select",
      options: [
        ["", "YouTube (Roboto)"],
        ['system-ui, -apple-system, "Segoe UI", sans-serif', "System"],
        ["Inter, system-ui, sans-serif", "Inter (falls installiert)"],
        ['"Segoe UI", system-ui, sans-serif', "Segoe UI"],
        ['Georgia, "Times New Roman", serif', "Serif"],
        ['"JetBrains Mono", Consolas, monospace', "Monospace"]
      ],
      css: (v) => `ytd-app, ytd-app *:not(yt-icon):not(svg):not(path), tp-yt-paper-dialog, ytd-popup-container * { font-family: ${v} !important; }`
    },
    {
      id: "titleSize",
      label: "Titelgröße Kacheln",
      group: "Typografie",
      type: "range",
      min: 11,
      max: 24,
      step: 1,
      unit: "px",
      placeholder: 16,
      css: (v) => `${CARD_TITLES} { font-size: ${v}px !important; line-height: 1.35 !important; }`
    },
    {
      id: "titleLines",
      label: "Titelzeilen",
      group: "Typografie",
      type: "range",
      min: 1,
      max: 5,
      step: 1,
      placeholder: 2,
      css: (v) => `${CARD_TITLES}, ${CARD_TITLES} span { -webkit-line-clamp: ${v} !important; line-clamp: ${v} !important; max-height: none !important; }`
    },
    {
      id: "titleWeight",
      label: "Titelstärke",
      group: "Typografie",
      type: "select",
      options: [["", "YouTube"], ["400", "Normal"], ["500", "Mittel"], ["600", "Halbfett"], ["700", "Fett"]],
      css: (v) => `${CARD_TITLES} { font-weight: ${v} !important; }`
    },
    {
      id: "metaSize",
      label: "Kanal & Aufrufe",
      group: "Typografie",
      type: "range",
      min: 10,
      max: 18,
      step: 1,
      unit: "px",
      placeholder: 14,
      css: (v) => `#metadata-line, ytd-video-meta-block #metadata, ytd-channel-name #text, yt-content-metadata-view-model, yt-content-metadata-view-model span { font-size: ${v}px !important; line-height: 1.4 !important; }`
    },
    {
      id: "watchTitleSize",
      label: "Videotitel auf Videoseite",
      group: "Typografie",
      type: "range",
      min: 14,
      max: 32,
      step: 1,
      unit: "px",
      placeholder: 20,
      css: (v) => `ytd-watch-metadata #title h1, ytd-watch-metadata #title h1 yt-formatted-string { font-size: ${v}px !important; line-height: 1.3 !important; }`
    },
    // thumbnails
    {
      id: "listThumbWidth",
      label: "Thumbnail-Breite in Listen",
      group: "Thumbnails",
      type: "range",
      min: 100,
      max: 500,
      step: 10,
      unit: "px",
      placeholder: 360,
      css: (v) => `ytd-search ytd-video-renderer ytd-thumbnail, ytd-search yt-lockup-view-model a[class*="ContentImage"], ytd-watch-next-secondary-results-renderer yt-lockup-view-model a[class*="ContentImage"], ytd-compact-video-renderer ytd-thumbnail, ytd-browse[page-subtype="playlist"] yt-lockup-view-model a[class*="ContentImage"], ytd-playlist-video-renderer ytd-thumbnail { width: ${v}px !important; min-width: ${v}px !important; max-width: ${v}px !important; flex: none !important; }`
    },
    // buttons
    {
      id: "actionsScale",
      label: "Größe Aktionsleiste",
      group: "Buttons",
      type: "range",
      min: 60,
      max: 150,
      step: 5,
      unit: "%",
      placeholder: 100,
      css: (v) => `ytd-watch-metadata #actions { zoom: ${v / 100} !important; }`
    },
    // allgemein
    {
      id: "dimOpacity",
      label: "Stärke von „Dimmen“",
      group: "Allgemein",
      type: "range",
      min: 5,
      max: 80,
      step: 5,
      unit: "%",
      placeholder: 30,
      css: (v) => `:root { --ytx-dim-opacity: ${v / 100}; }`
    },
    {
      id: "motion",
      label: "Animationen",
      group: "Allgemein",
      type: "select",
      options: [["", "Normal"], ["reduced", "Reduziert"], ["off", "Aus"]],
      css: (v) => v === "off" ? `ytd-app *, ytd-app *::before, ytd-app *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; scroll-behavior: auto !important; }` : `ytd-app *, ytd-app *::before, ytd-app *::after { transition-duration: 60ms !important; animation-duration: 60ms !important; }`
    },
    {
      id: "scrollbar",
      label: "Scrollbalken",
      group: "Allgemein",
      type: "select",
      options: [["", "Normal"], ["thin", "Schmal"], ["none", "Versteckt"]],
      css: (v) => v === "none" ? `html, body { scrollbar-width: none !important; } html::-webkit-scrollbar { display: none; }` : `html, body { scrollbar-width: thin !important; }`
    }
  ];
  var controlById = Object.fromEntries([...controls, ...colorControls.map((c) => ({ ...c, type: "color", group: "Farben" }))].map((c) => [c.id, c]));
  function extraCss(colors) {
    return [searchboxCss(colors), cardTextCss(colors)].filter(Boolean).join("\n");
  }

  // src/registry/youtube/presets.js
  var GRID_PAGES = ["home", "subscriptions", "channel"];
  var layoutPresets = [
    {
      id: "compact",
      label: "Kompakt",
      pages: [...GRID_PAGES, "search"],
      css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 6 !important; --ytd-rich-grid-posts-per-row: 6 !important; --ytd-rich-grid-item-margin: 8px !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { margin-bottom: 16px !important; }
${s} #video-title, ${s} yt-lockup-metadata-view-model h3 { font-size: 13px !important; line-height: 1.3 !important; }
${s} yt-content-metadata-view-model, ${s} #metadata-line { font-size: 12px !important; }
${s} ytd-search ytd-video-renderer ytd-thumbnail, ${s} ytd-search yt-lockup-view-model a[class*="ContentImage"] { max-width: 240px !important; min-width: 240px !important; }
${s} ytd-search #description-text, ${s} ytd-search .metadata-snippet-container { display: none !important; }`
    },
    {
      id: "list",
      label: "Liste",
      pages: GRID_PAGES,
      css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; --ytd-rich-grid-posts-per-row: 1 !important; }
${s} ytd-rich-grid-renderer > #contents { max-width: 1100px !important; margin: 0 auto !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { width: 100% !important; margin: 0 0 12px !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model > div { flex-direction: row !important; align-items: flex-start !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model a[class*="ContentImage"] { width: 320px !important; min-width: 320px !important; flex: none !important; margin-right: 16px !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model [class*="MetadataViewModel"] { flex: 1 !important; }
${s} ytd-rich-item-renderer ytd-rich-grid-media #dismissible { display: flex !important; flex-direction: row !important; }
${s} ytd-rich-item-renderer ytd-rich-grid-media ytd-thumbnail { width: 320px !important; min-width: 320px !important; margin-right: 16px !important; }
${s} ytd-rich-section-renderer { width: 100% !important; max-width: 1100px !important; margin-inline: auto !important; }`
    },
    {
      id: "text",
      label: "Nur Text",
      pages: [...GRID_PAGES, "search"],
      css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 1 !important; }
${s} ytd-rich-grid-renderer > #contents { max-width: 900px !important; margin: 0 auto !important; }
${s} ytd-rich-item-renderer[rendered-from-rich-grid] { width: 100% !important; margin: 0 0 4px !important; }
${s} ytd-thumbnail, ${s} yt-thumbnail-view-model, ${s} a[class*="ContentImage"], ${s} #avatar-link, ${s} yt-decorated-avatar-view-model { display: none !important; }
${s} ytd-rich-item-renderer yt-lockup-view-model > div, ${s} ytd-video-renderer #dismissible { flex-direction: row !important; }
${s} ytd-rich-item-renderer, ${s} ytd-video-renderer, ${s} ytd-search yt-lockup-view-model { border-bottom: 1px solid var(--yt-sys-color-baseline--outline, #333) !important; padding: 8px 0 !important; }
${s} ytd-search #description-text, ${s} ytd-search .metadata-snippet-container { display: none !important; }`
    },
    {
      id: "classic",
      label: "Classic",
      pages: [...GRID_PAGES, "search", "watch", "playlist"],
      css: (s) => `
${s} ytd-rich-grid-renderer { --ytd-rich-grid-items-per-row: 5 !important; --ytd-rich-grid-posts-per-row: 5 !important; }
${s} ytd-thumbnail a#thumbnail, ${s} ytd-thumbnail yt-image img, ${s} yt-thumbnail-view-model, ${s} yt-thumbnail-view-model img, ${s} [class*="ThumbnailViewModelImage"], ${s} #ytd-player, ${s} ytd-playlist-thumbnail { border-radius: 0 !important; }
${s} #video-title, ${s} yt-lockup-metadata-view-model h3 { font-size: 14px !important; font-weight: 500 !important; }
${s} #cinematics, ${s} #cinematics-container { display: none !important; }
${s} yt-button-shape button, ${s} button[class*="ButtonShape"] { border-radius: 2px !important; }
${s} #avatar img, ${s} yt-avatar-shape img { border-radius: 0 !important; }`
    },
    {
      id: "theater",
      label: "Kino (breit, Empfehlungen unten)",
      pages: ["watch"],
      resize: true,
      css: (s) => `
${s} ytd-watch-flexy:not([fullscreen]) #columns { flex-direction: column !important; align-items: center !important; }
${s} ytd-watch-flexy:not([fullscreen]) #primary { width: min(100%, var(--ytx-player-max-w, 1400px)) !important; max-width: none !important; min-width: 0 !important; margin: 0 auto !important; padding-right: 0 !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary { width: min(100%, var(--ytx-player-max-w, 1400px)) !important; max-width: none !important; padding: 0 !important; margin: 0 auto !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary #related { display: block !important; }`
    },
    {
      id: "focus",
      label: "Fokus (nur Player & Beschreibung)",
      pages: ["watch"],
      resize: true,
      css: (s) => `
${s} ytd-watch-flexy:not([fullscreen]) #columns { justify-content: center !important; }
${s} ytd-watch-flexy:not([fullscreen]) #primary { width: min(100%, var(--ytx-player-max-w, 1280px)) !important; max-width: none !important; min-width: 0 !important; padding-right: 0 !important; margin: 0 auto !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary #related, ${s} ytd-watch-flexy ytd-comments#comments { display: none !important; }
${s} ytd-watch-flexy:not([fullscreen]) #secondary:not(:has(ytd-playlist-panel-renderer:not([hidden]))):not(:has(ytd-live-chat-frame)) { display: none !important; }`
    },
    {
      id: "wideList",
      label: "Breite Liste",
      pages: ["playlist", "search"],
      css: (s) => `
${s} ytd-search ytd-two-column-search-results-renderer, ${s} ytd-search #container.ytd-search { max-width: 1400px !important; }
${s} ytd-browse[page-subtype="playlist"] ytd-two-column-browse-results-renderer { max-width: 1600px !important; }
${s} ytd-browse[page-subtype="playlist"] ytd-two-column-browse-results-renderer #primary { max-width: none !important; }`
    }
  ];
  var presetById = Object.fromEntries(layoutPresets.map((p) => [p.id, p]));
  var LAYOUT_PAGES = [
    ["home", "Startseite"],
    ["subscriptions", "Abos"],
    ["search", "Suche"],
    ["watch", "Videoseite"],
    ["channel", "Kanal"],
    ["playlist", "Playlist"]
  ];
  var orderGroups = {
    "watch.actions": {
      label: "Aktionsleiste unter dem Video",
      items: [
        ["like", "Like / Dislike"],
        ["share", "Teilen"],
        ["save", "Speichern"],
        ["download", "Herunterladen"],
        ["clip", "Clip"],
        ["thanks", "Super Thanks"],
        ["ask", "KI-Fragen"],
        ["ytx", "ytx-Buttons"]
      ],
      container: `ytd-watch-metadata #actions ytd-menu-renderer { display: flex !important; flex-wrap: nowrap !important; align-items: center !important; }
ytd-watch-metadata #actions ytd-menu-renderer > #top-level-buttons-computed, ytd-watch-metadata #actions ytd-menu-renderer > #flexible-item-buttons { display: contents !important; }
ytd-watch-metadata #actions ytd-menu-renderer > yt-button-shape, ytd-watch-metadata #actions ytd-menu-renderer > yt-icon-button { order: 999 !important; }
ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn] { order: 500; }
ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn] + [data-ytx-btn] { margin-left: 8px; }`,
      item: (id, i) => id === "ytx" ? `ytd-watch-metadata #actions [data-ytx-mount^="actions."] { order: ${i} !important; }` : `ytd-watch-metadata #actions [data-ytx-btn="${id}"] { order: ${i} !important; }`
    }
  };
  var topbarModes = [
    ["", "Fixiert (YouTube)"],
    ["static", "Mitscrollen"],
    ["autohide", "Beim Runterscrollen ausblenden"]
  ];
  var topbarCss = {
    static: `ytd-app #masthead-container.ytd-app { position: absolute !important; }`,
    autohide: `html[data-ytx-scrolled-down] ytd-app #masthead-container.ytd-app { transform: translateY(-100%) !important; transition: transform .2s ease !important; } ytd-app #masthead-container.ytd-app { transition: transform .2s ease !important; }`
  };

  // src/registry/youtube/pages.js
  function pageFromUrl(href) {
    let u;
    try {
      u = new URL(href, "https://www.youtube.com");
    } catch {
      return "other";
    }
    const p = u.pathname;
    if (p === "/" || p === "") return "home";
    if (p.startsWith("/watch")) return "watch";
    if (p.startsWith("/results")) return "search";
    if (p.startsWith("/playlist")) return "playlist";
    if (p.startsWith("/shorts/")) return "shorts";
    if (p.startsWith("/feed/subscriptions")) return "subscriptions";
    if (p.startsWith("/feed/history")) return "history";
    if (p.startsWith("/feed/you") || p.startsWith("/feed/library")) return "you";
    if (p.startsWith("/feed/")) return "feed";
    if (/^\/(@|channel\/|c\/|user\/)/.test(p)) return "channel";
    return "other";
  }
  function videoIdFromUrl(href) {
    try {
      const u = new URL(href, "https://www.youtube.com");
      return u.pathname.startsWith("/watch") ? u.searchParams.get("v") : null;
    } catch {
      return null;
    }
  }
  var PAGE_LABELS = {
    home: "Startseite",
    watch: "Videoseite",
    search: "Suche",
    playlist: "Playlist",
    subscriptions: "Abos",
    channel: "Kanal",
    shorts: "Shorts",
    history: "Verlauf",
    you: "Mein YouTube",
    feed: "Feed",
    other: "Sonstige"
  };
  var FILTER_PAGES = [
    ["home", "Startseite"],
    ["subscriptions", "Abos"],
    ["search", "Suche"],
    ["watch", "Empfehlungen auf Videoseite"],
    ["channel", "Kanal"],
    ["playlist", "Playlists"]
  ];

  // src/core/format.js
  function parseDuration(text) {
    if (text == null) return null;
    if (typeof text === "number") return text;
    const m = String(text).trim().match(/(\d+(?::\d{1,2}){1,2})/);
    if (!m) return null;
    let s = 0;
    for (const p of m[1].split(":").map(Number)) s = s * 60 + p;
    return s;
  }
  function formatDuration(sec, { long = "hours" } = {}) {
    if (sec == null || !isFinite(sec)) return "–";
    sec = Math.max(0, Math.round(sec));
    if (sec === 0) return "0 min";
    if (sec < 60) return "< 1 min";
    let m = Math.floor(sec / 60);
    let h2 = Math.floor(m / 60);
    m %= 60;
    if (long === "days" && h2 >= 24) {
      const d = Math.floor(h2 / 24);
      h2 %= 24;
      return [`${d} d`, h2 && `${h2} h`, m && `${m} min`].filter(Boolean).join(" ");
    }
    if (!h2) return `${m} min`;
    return m ? `${h2} h ${m} min` : `${h2} h`;
  }
  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h2 = Math.floor(sec / 3600);
    const m = Math.floor(sec % 3600 / 60);
    const s = sec % 60;
    const pad2 = (n) => String(n).padStart(2, "0");
    return h2 ? `${h2}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }
  function subtitleTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    const pad2 = (n, l = 2) => String(n).padStart(l, "0");
    const h2 = Math.floor(ms / 36e5);
    const m = Math.floor(ms % 36e5 / 6e4);
    const s = Math.floor(ms % 6e4 / 1e3);
    return `${pad2(h2)}:${pad2(m)}:${pad2(s)}${sep}${pad2(ms % 1e3, 3)}`;
  }
  function firstInt(text) {
    const m = String(text ?? "").match(/\d[\d.,\s]*/);
    if (!m) return null;
    const n = Number(m[0].replace(/[^\d]/g, ""));
    return isFinite(n) ? n : null;
  }
  var AGE_UNITS = [
    [/(sekunde|second)/i, 1 / 86400],
    [/(minute)/i, 1 / 1440],
    [/(stunde|hour)/i, 1 / 24],
    [/(tag|day)/i, 1],
    [/(woche|week)/i, 7],
    [/(monat|month)/i, 30],
    [/(jahr|year)/i, 365]
  ];
  function parseAgeDays(text) {
    if (!text) return null;
    const s = String(text);
    if (!/(vor |ago)/i.test(s)) return null;
    const n = firstInt(s) ?? 1;
    for (const [re, f] of AGE_UNITS) if (re.test(s)) return n * f;
    return null;
  }
  function formatDate(iso, withTime = false) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const opts = { day: "2-digit", month: "2-digit", year: "numeric" };
    if (withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleString("de-DE", opts);
  }
  function formatTimeOfDay(date) {
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }

  // src/registry/youtube/paths.js
  function activePageRoots() {
    const roots = qsa("ytd-page-manager#page-manager > :not([hidden])");
    return roots.length ? roots : [document];
  }
  var CARD_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model",
    "ytd-playlist-video-renderer"
  ];
  var CARD_PARENT = "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-playlist-video-renderer";
  function parseHref(href) {
    if (!href) return {};
    try {
      const u = new URL(href, location.origin);
      if (u.pathname.startsWith("/shorts/")) return { videoId: u.pathname.split("/")[2], isShort: true };
      return { videoId: u.searchParams.get("v"), list: u.searchParams.get("list"), index: firstInt(u.searchParams.get("index")), radio: u.searchParams.get("start_radio") === "1" };
    } catch {
      return {};
    }
  }
  function overlayInfo(overlays) {
    const out = { durationSec: null, isShort: false, live: false, percent: null };
    for (const o of overlays || []) {
      const ts = o.thumbnailOverlayTimeStatusRenderer;
      if (ts) {
        if (ts.style === "SHORTS") out.isShort = true;
        if (ts.style === "LIVE") out.live = true;
        out.durationSec ??= parseDuration(runsText(ts.text));
      }
      const rp = o.thumbnailOverlayResumePlaybackRenderer;
      if (rp) out.percent = rp.percentDurationWatched ?? null;
    }
    return out;
  }
  function readPolymerCard(el) {
    let d = dataOf(el);
    if (!d) return null;
    if (d.content) d = d.content.videoRenderer || d.content.reelItemRenderer || d.content.lockupViewModel || d.content;
    if (!d.videoId && !d.title) return null;
    const owner = d.ownerText || d.longBylineText || d.shortBylineText;
    const ov = overlayInfo(d.thumbnailOverlays);
    return {
      kind: "video",
      videoId: d.videoId || null,
      title: runsText(d.title) || runsText(d.headline) || "",
      channel: runsText(owner),
      channelUrl: pick(owner, "runs[0].navigationEndpoint.browseEndpoint.canonicalBaseUrl") || "",
      channelId: pick(owner, "runs[0].navigationEndpoint.browseEndpoint.browseId") || "",
      durationSec: parseDuration(runsText(d.lengthText)) ?? ov.durationSec,
      isShort: !!d.navigationEndpoint?.reelWatchEndpoint || ov.isShort,
      live: ov.live || (d.badges || []).some((b) => /LIVE/.test(b.metadataBadgeRenderer?.style || "")),
      percent: ov.percent,
      ageDays: parseAgeDays(runsText(d.publishedTimeText))
    };
  }
  function readLockupCard(el) {
    const a = qs('a[href*="/watch?"], a[href^="/shorts/"], a[href^="/playlist?"]', el);
    const href = a?.getAttribute("href") || "";
    const info2 = parseHref(href);
    const titleEl = qs("h3", el) || qs('[class*="MetadataViewModelTitle"]', el);
    const channelLink = qs('a[href^="/@"], a[href^="/channel/"]', el);
    let channel = channelLink?.textContent.trim() || "";
    const parts = qsa('yt-content-metadata-view-model span[role="text"], yt-content-metadata-view-model span', el).map((s) => s.textContent.trim()).filter(Boolean);
    if (!channel && parts.length) channel = parts[0];
    let durationSec = null;
    let live = false;
    for (const b of qsa("badge-shape", el)) {
      const t = b.textContent.trim();
      if (/live/i.test(b.className) || /^(live|live jetzt)$/i.test(t)) live = true;
      durationSec ??= parseDuration(t);
    }
    let percent = null;
    const bar = qs('[class*="ProgressBarSegment"][style*="width"], yt-thumbnail-overlay-progress-bar-view-model [style*="width"]', el);
    if (bar) percent = firstInt(bar.style.width);
    let ageDays = null;
    for (const p of parts) {
      ageDays = parseAgeDays(p);
      if (ageDays != null) break;
    }
    const isPlaylist = href.startsWith("/playlist?") || !!qs("yt-collection-thumbnail-view-model, yt-collections-stack", el);
    return {
      kind: isPlaylist ? "playlist" : info2.radio ? "mix" : "video",
      videoId: info2.videoId || null,
      title: titleEl?.textContent.trim() || a?.getAttribute("title") || "",
      channel,
      channelUrl: channelLink?.getAttribute("href") || "",
      channelId: "",
      durationSec,
      isShort: !!info2.isShort,
      live,
      percent,
      ageDays
    };
  }
  function readCard(el) {
    if (el.tagName === "YT-LOCKUP-VIEW-MODEL") return readLockupCard(el);
    const inner = el.tagName === "YTD-RICH-ITEM-RENDERER" ? qs("yt-lockup-view-model", el) : null;
    if (inner) return readLockupCard(inner);
    const shortsLockup = qs("ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2", el);
    if (shortsLockup) {
      const a = qs('a[href^="/shorts/"]', shortsLockup);
      return { kind: "video", videoId: parseHref(a?.getAttribute("href")).videoId, title: a?.getAttribute("title") || shortsLockup.textContent.trim(), channel: "", channelUrl: "", durationSec: null, isShort: true, live: false, percent: null, ageDays: null };
    }
    return readPolymerCard(el) || readLockupCard(el);
  }
  var playlistPage = {
    root: 'ytd-browse[page-subtype="playlist"]',
    polymerItems: 'ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer ytd-playlist-video-renderer',
    lockupItems: 'ytd-browse[page-subtype="playlist"] yt-item-section-renderer yt-lockup-view-model, ytd-browse[page-subtype="playlist"] ytd-item-section-renderer yt-lockup-view-model',
    continuation: [
      'ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer ytd-continuation-item-renderer',
      'ytd-browse[page-subtype="playlist"] yt-item-section-renderer #contents > :last-child:not(:has(yt-lockup-view-model))',
      'ytd-browse[page-subtype="playlist"] ytd-item-section-renderer ytd-continuation-item-renderer'
    ],
    dragHandles: 'ytd-browse[page-subtype="playlist"] ytd-playlist-video-renderer #reorder',
    readPolymerItem(el) {
      const d = dataOf(el);
      if (!d) return null;
      const ov = overlayInfo(d.thumbnailOverlays);
      const len = d.lengthSeconds != null ? Number(d.lengthSeconds) : parseDuration(runsText(d.lengthText));
      return {
        el,
        wrapper: el,
        videoId: d.videoId,
        index: firstInt(runsText(d.index)) ?? null,
        title: runsText(d.title),
        channel: runsText(d.shortBylineText),
        durationSec: len || null,
        percent: ov.percent,
        live: ov.live,
        unavailable: d.isPlayable === false || !len
      };
    },
    readLockupItem(el) {
      const c = readLockupCard(el);
      const a = qs('a[href*="/watch?"]', el);
      const info2 = parseHref(a?.getAttribute("href"));
      let wrapper = el;
      while (wrapper.parentElement && wrapper.parentElement.id !== "contents") wrapper = wrapper.parentElement;
      return {
        el,
        wrapper,
        videoId: c.videoId,
        index: info2.index ?? null,
        title: c.title,
        channel: c.channel,
        durationSec: c.durationSec,
        percent: c.percent,
        live: c.live,
        unavailable: !c.durationSec && !c.live
      };
    },
    listContainer(kind) {
      return kind === "polymer" ? qs('ytd-browse[page-subtype="playlist"] ytd-playlist-video-list-renderer #contents') : qs('ytd-browse[page-subtype="playlist"] yt-item-section-renderer #contents, ytd-browse[page-subtype="playlist"] ytd-item-section-renderer #contents');
    },
    total() {
      const d = dataOf(qs('ytd-browse[page-subtype="playlist"]'));
      const fromData = pickAny(d, [
        (x) => runsText(x.header.playlistHeaderRenderer.numVideosText),
        (x) => runsText(x.header.playlistHeaderRenderer.stats[0]),
        (x) => runsText(x.sidebar.playlistSidebarRenderer.items[0].playlistSidebarPrimaryInfoRenderer.stats[0]),
        (x) => x.header.pageHeaderRenderer.content.pageHeaderViewModel.metadata.contentMetadataViewModel.metadataRows.flatMap((r) => r.metadataParts).map((p) => p.text?.content).find((t) => t && /\d/.test(t) && !/[.:]\d{2}\b.*\d{4}/.test(t))
      ]);
      if (fromData) return firstInt(fromData);
      const el = qs('ytd-browse[page-subtype="playlist"] ytd-playlist-byline-renderer, ytd-browse[page-subtype="playlist"] yt-content-metadata-view-model');
      return el ? firstInt(el.textContent) : null;
    },
    playlistId() {
      return new URL(location.href).searchParams.get("list");
    }
  };
  var playlistPanel = {
    root: "ytd-watch-flexy ytd-playlist-panel-renderer#playlist",
    read() {
      const el = qs(this.root);
      if (!el || el.hasAttribute("hidden")) return null;
      const d = dataOf(el);
      if (!d || !Array.isArray(d.contents)) return null;
      const items = [];
      d.contents.forEach((c, pos) => {
        const r = c.playlistPanelVideoRenderer || c.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
        if (!r) return;
        const ov = overlayInfo(r.thumbnailOverlays);
        items.push({
          videoId: r.videoId,
          index: r.navigationEndpoint?.watchEndpoint?.index ?? firstInt(runsText(r.indexText)) ?? pos,
          durationSec: parseDuration(runsText(r.lengthText)),
          percent: ov.percent,
          selected: !!r.selected
        });
      });
      const total = d.totalVideos ?? firstInt(runsText(d.totalVideosText));
      const current2 = d.localCurrentIndex ?? d.currentIndex ?? items.find((i) => i.selected)?.index ?? 0;
      return { el, items, total, current: current2, infinite: !!d.isInfinite };
    },
    itemElements() {
      return qsa("ytd-watch-flexy ytd-playlist-panel-renderer#playlist ytd-playlist-panel-video-renderer");
    }
  };
  var watch = {
    playerResponse() {
      try {
        return player()?.getPlayerResponse?.() || null;
      } catch {
        return null;
      }
    },
    videoData() {
      try {
        return player()?.getVideoData?.() || null;
      } catch {
        return null;
      }
    },
    captionTracks(pr = this.playerResponse()) {
      return pick(pr, "captions.playerCaptionsTracklistRenderer.captionTracks") || [];
    },
    publishDate(pr = this.playerResponse()) {
      return pickAny(pr, ["microformat.playerMicroformatRenderer.publishDate", "microformat.playerMicroformatRenderer.uploadDate"]);
    },
    description(pr = this.playerResponse()) {
      const flexy = dataOf(qs("ytd-watch-flexy"));
      const fromNext = pickAny(flexy, [
        (x) => x.contents.twoColumnWatchNextResults.results.results.contents.find((c) => c.videoSecondaryInfoRenderer).videoSecondaryInfoRenderer.attributedDescription.content
      ]);
      return fromNext || pick(pr, "videoDetails.shortDescription") || "";
    },
    chapters() {
      const panel = qs('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]');
      const list = pick(dataOf(panel), "content.macroMarkersListRenderer.contents") || [];
      const out = [];
      for (const c of list) {
        const r = c.macroMarkersListItemRenderer;
        if (!r) continue;
        const sec = r.onTap?.watchEndpoint?.startTimeSeconds ?? parseDuration(runsText(r.timeDescription));
        if (sec != null) out.push({ title: runsText(r.title), startSec: sec });
      }
      if (out.length) return out;
      const flexy = dataOf(qs("ytd-watch-flexy"));
      const map = pickAny(flexy, ["playerOverlays.playerOverlayRenderer.decoratedPlayerBarRenderer.decoratedPlayerBarRenderer.playerBar.multiMarkersPlayerBarRenderer.markersMap"]) || [];
      for (const m of map) {
        for (const ch of m.value?.chapters || []) {
          const r = ch.chapterRenderer;
          if (r) out.push({ title: runsText(r.title), startSec: Math.round((r.timeRangeStartMillis || 0) / 1e3) });
        }
        if (out.length) break;
      }
      return out;
    },
    // url die der player selbst mit token fuer untertitel anfragt
    isTimedtextUrl(url) {
      return /\/api\/timedtext\?/.test(url) && /[?&]pot=/.test(url);
    }
  };

  // src/core/scheduler.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function debounce(fn, wait = 150, maxWait = 0) {
    let timer2 = null;
    let first = 0;
    const run2 = () => {
      timer2 = null;
      first = 0;
      fn();
    };
    const call2 = () => {
      const now = Date.now();
      if (!first) first = now;
      clearTimeout(timer2);
      if (maxWait && now - first >= maxWait) return run2();
      timer2 = setTimeout(run2, wait);
    };
    call2.cancel = () => {
      clearTimeout(timer2);
      timer2 = null;
      first = 0;
    };
    call2.flush = () => {
      if (timer2) {
        clearTimeout(timer2);
        run2();
      }
    };
    return call2;
  }
  async function waitFor(check, { timeout = 5e3, interval = 100 } = {}) {
    const end = Date.now() + timeout;
    for (; ; ) {
      let v;
      try {
        v = check();
      } catch {
        v = null;
      }
      if (v) return v;
      if (Date.now() > end) return null;
      await sleep(interval);
    }
  }

  // src/behaviors/youtube.js
  var QUALITY_ORDER = ["highres", "hd2880", "hd2160", "hd1440", "hd1080", "hd720", "large", "medium", "small", "tiny"];
  function shortsId(url) {
    const m = String(url || "").match(/\/shorts\/([\w-]{6,})/);
    return m ? m[1] : null;
  }
  var behaviors = [
    {
      id: "shortsRedirect",
      label: "Shorts als normales Video öffnen",
      description: "/shorts/ID wird zu /watch?v=ID umgeleitet",
      type: "toggle",
      default: false,
      early: true,
      start(ctx) {
        const go = (url) => {
          const id = shortsId(url);
          if (id) location.replace(`/watch?v=${id}`);
        };
        go(location.href);
        const a = ctx.nav.on("start", (page, url) => page === "shorts" && go(url));
        const b = ctx.nav.on("page", (page) => page === "shorts" && go(location.href));
        return () => {
          a();
          b();
        };
      },
      health: (ctx) => ({ status: ctx.nav.eventsSeen.has("yt-navigate-start") || ctx.nav.page !== "other" ? "ok" : "warn", detail: ctx.nav.eventsSeen.has("yt-navigate-start") ? "Navigations-Events kommen an" : "Noch kein Navigations-Event gesehen – Umleitung greift beim Laden trotzdem" })
    },
    {
      id: "homeRedirect",
      label: "Startseite umleiten",
      description: "Die Startseite wird beim Öffnen sofort ersetzt",
      type: "select",
      options: [
        ["", "Aus"],
        ["/feed/subscriptions", "Abos"],
        ["/feed/history", "Verlauf"],
        ["/playlist?list=WL", "Später ansehen"],
        ["/feed/playlists", "Playlists"]
      ],
      default: "",
      radical: true,
      early: true,
      start(ctx, target) {
        const go = () => {
          if (location.pathname === "/") location.replace(target);
        };
        go();
        const a = ctx.nav.on("start", (page) => page === "home" && location.replace(target));
        const b = ctx.nav.on("page", (page) => page === "home" && go());
        return () => {
          a();
          b();
        };
      }
    },
    {
      id: "autoplayOff",
      label: "Autoplay ausschalten",
      description: "Schaltet den Autoplay-Schalter im Player einmal pro Video aus. Wer ihn danach selbst anmacht, wird nicht überstimmt",
      type: "toggle",
      default: false,
      start(ctx) {
        let userTouched = false;
        let lastTry = 0;
        let clicks = 0;
        const offUser = listen(
          document,
          "click",
          (e) => {
            if (e.isTrusted && e.target?.closest?.("#movie_player .ytp-autonav-toggle")) userTouched = true;
          },
          true
        );
        const offVideo = ctx.nav.on("video", () => clicks = 0);
        const check = () => {
          if (ctx.nav.page !== "watch" || userTouched || clicks >= 10) return;
          const now = Date.now();
          if (now - lastTry < 1200 || !player()?.getPlayerState) return;
          const toggle2 = qs("#movie_player .ytp-autonav-toggle-button");
          if (!toggle2 || toggle2.getAttribute("aria-checked") !== "true") return;
          const btn2 = toggle2.closest("button") || toggle2;
          btn2.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          lastTry = now;
          clicks++;
          log.info(`autoplay ausgeschaltet (${clicks})`);
        };
        const off = ctx.onSweep(check);
        const iv = setInterval(check, 1500);
        check();
        return () => {
          off();
          offUser();
          offVideo();
          clearInterval(iv);
        };
      },
      health: () => {
        if (!document.querySelector("#movie_player")) return { status: "skip", detail: "Kein Player auf dieser Seite" };
        const btn2 = qs("#movie_player .ytp-autonav-toggle-button");
        return btn2 ? { status: "ok", detail: `Schalter gefunden (an: ${btn2.getAttribute("aria-checked")})` } : { status: "warn", detail: "Autoplay-Schalter nicht gefunden" };
      }
    },
    {
      id: "forceQuality",
      label: "Bevorzugte Qualität",
      description: "Setzt beim Start jedes Videos die Qualität, oder die nächst niedrigere verfügbare",
      type: "select",
      options: [["", "YouTube entscheidet"], ["hd2160", "2160p"], ["hd1440", "1440p"], ["hd1080", "1080p"], ["hd720", "720p"], ["large", "480p"], ["medium", "360p"]],
      default: "",
      start(ctx, quality) {
        let applied = null;
        const apply = async () => {
          if (ctx.nav.page !== "watch" || !ctx.nav.videoId || applied === ctx.nav.videoId) return;
          const vid = ctx.nav.videoId;
          const levels = await waitFor(() => {
            const l = player()?.getAvailableQualityLevels?.();
            return l && l.length ? l : null;
          }, { timeout: 8e3, interval: 250 });
          if (!levels || vid !== ctx.nav.videoId) return;
          const want = QUALITY_ORDER.indexOf(quality);
          const pick2 = levels.filter((l) => l !== "auto").find((l) => QUALITY_ORDER.indexOf(l) >= want) || levels[0];
          const p = player();
          try {
            p.setPlaybackQualityRange?.(pick2, pick2);
            p.setPlaybackQuality?.(pick2);
            applied = vid;
            log.info(`qualitaet ${pick2}`);
          } catch (e) {
            log.warn("qualitaet setzen", e);
          }
        };
        const off = ctx.nav.on("video", () => {
          applied = null;
          apply();
        });
        const off2 = listen(document, "playing", (e) => e.target?.closest?.("#movie_player") && apply(), true);
        apply();
        return () => {
          off();
          off2();
        };
      },
      health: () => {
        const p = player();
        if (!p) return { status: "skip", detail: "Kein Player" };
        return typeof p.setPlaybackQualityRange === "function" ? { status: "ok", detail: `Aktuell ${p.getPlaybackQuality?.()}` } : { status: "fail", detail: "Player-API setPlaybackQualityRange fehlt" };
      }
    },
    {
      id: "speedMemory",
      label: "Geschwindigkeit merken",
      description: "Neue Videos starten mit der zuletzt gewählten Geschwindigkeit",
      type: "toggle",
      default: false,
      start(ctx) {
        let saved = Number(ctx.state.get("speed", 1)) || 1;
        let setting = false;
        const inMainPlayer = (v) => v?.tagName === "VIDEO" && v.closest("#movie_player");
        const adShowing2 = () => !!qs("#movie_player.ad-showing");
        const a = listen(
          document,
          "ratechange",
          (e) => {
            if (setting || !inMainPlayer(e.target) || adShowing2()) return;
            saved = e.target.playbackRate;
            ctx.state.set("speed", saved);
          },
          true
        );
        const b = listen(
          document,
          "playing",
          (e) => {
            const v = e.target;
            if (!inMainPlayer(v) || adShowing2() || Math.abs(v.playbackRate - saved) < 0.01) return;
            setting = true;
            try {
              const p = player();
              if (p?.setPlaybackRate) p.setPlaybackRate(saved);
              else v.playbackRate = saved;
            } finally {
              setTimeout(() => setting = false, 100);
            }
          },
          true
        );
        return () => {
          a();
          b();
        };
      }
    },
    {
      id: "pauseOnBlur",
      label: "Pausieren wenn Tab im Hintergrund",
      type: "select",
      options: [["", "Aus"], ["pause", "Nur pausieren"], ["resume", "Pausieren und beim Zurückkommen fortsetzen"]],
      default: "",
      start(ctx, mode) {
        let pausedByUs = false;
        return listen(document, "visibilitychange", () => {
          const p = player();
          if (!p || ctx.nav.page !== "watch") return;
          if (document.hidden) {
            if (p.getPlayerState?.() === 1) {
              p.pauseVideo();
              pausedByUs = true;
            }
          } else if (mode === "resume" && pausedByUs) {
            p.playVideo();
            pausedByUs = false;
          }
        });
      }
    },
    {
      id: "channelTrailerPause",
      label: "Kanal-Trailer nicht automatisch abspielen",
      type: "toggle",
      default: false,
      start() {
        return listen(
          document,
          "playing",
          (e) => {
            const v = e.target;
            if (v?.tagName === "VIDEO" && v.closest("ytd-channel-video-player-renderer")) v.pause();
          },
          true
        );
      }
    },
    {
      id: "experimentalFlags",
      label: "Experiment-Flags (experimentell)",
      description: "Eine Zeile pro Flag: name=wert. Wirkt erst nach Neuladen und oft gar nicht, YouTube kann Flags jederzeit ignorieren",
      type: "textarea",
      default: "",
      radical: true,
      early: true,
      start(ctx, text) {
        const flags = parseFlags(text);
        if (!Object.keys(flags).length) return () => {
        };
        let stopped = false;
        (async () => {
          for (let i = 0; i < 200 && !stopped; i++) {
            const cfg = pageWindow.ytcfg;
            if (cfg?.set && cfg?.get) {
              try {
                cfg.set({ EXPERIMENT_FLAGS: { ...cfg.get("EXPERIMENT_FLAGS") || {}, ...flags } });
                log.info(`flags gesetzt ${Object.keys(flags).length}`);
              } catch (e) {
                log.warn("flags", e);
              }
              return;
            }
            await sleep(25);
          }
        })();
        return () => stopped = true;
      },
      health: (ctx, text) => {
        const flags = parseFlags(text);
        const keys = Object.keys(flags);
        if (!keys.length) return { status: "skip", detail: "Keine Flags gesetzt" };
        const cur = pageWindow.ytcfg?.get?.("EXPERIMENT_FLAGS") || {};
        const ok = keys.filter((k) => String(cur[k]) === String(flags[k]));
        return { status: ok.length === keys.length ? "ok" : "warn", detail: `${ok.length}/${keys.length} Flags im ytcfg wirksam` };
      }
    }
  ];
  function parseFlags(text) {
    const out = {};
    for (const line of String(text || "").split("\n")) {
      const m = line.trim().match(/^([\w.]+)\s*=\s*(.+)$/);
      if (!m) continue;
      const v = m[2].trim();
      out[m[1]] = v === "true" ? true : v === "false" ? false : isFinite(Number(v)) ? Number(v) : v;
    }
    return out;
  }
  var behaviorById = Object.fromEntries(behaviors.map((b) => [b.id, b]));

  // src/features/youtube/transcript/panelSource.js
  var PANEL = 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]';
  var OPENER = "ytd-watch-metadata ytd-video-description-transcript-section-renderer button";
  var SEGMENTS = "ytd-transcript-segment-renderer, transcript-segment-view-model";
  function readSegments() {
    const out = [];
    for (const el of qsa(SEGMENTS)) {
      const d = dataOf(el);
      let startMs = Number(d?.startMs);
      let endMs = Number(d?.endMs);
      let text = runsText(d?.snippet);
      if (!text) text = (qs('.segment-text, yt-formatted-string:not(.segment-timestamp), [class*="SegmentText"]', el) || el).textContent || "";
      if (!isFinite(startMs)) {
        const ts = qs('.segment-timestamp, [class*="Timestamp"]', el)?.textContent || "";
        const parts = ts.trim().split(":").map(Number);
        startMs = parts.every(isFinite) ? parts.reduce((a, b) => a * 60 + b, 0) * 1e3 : NaN;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (!text || !isFinite(startMs)) continue;
      out.push({ startMs, endMs: isFinite(endMs) ? endMs : startMs, text });
    }
    return out;
  }
  async function transcriptFromPanel() {
    const panels = qsa(PANEL);
    const openBefore = panels.find((p) => p.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
    let opened = false;
    if (!openBefore) {
      const opener = qs(OPENER);
      if (!opener) return null;
      document.documentElement.setAttribute("data-ytx-hide-transcript-panel", "");
      opener.click();
      opened = true;
    }
    try {
      const first = await waitFor(() => qsa(SEGMENTS).length || null, { timeout: 9e3, interval: 200 });
      if (!first) return null;
      let last2 = -1;
      for (let i = 0; i < 10; i++) {
        const n = qsa(SEGMENTS).length;
        if (n === last2) break;
        last2 = n;
        await sleep(250);
      }
      const segs = readSegments();
      return segs.length ? { events: segs.map((s) => ({ tStartMs: s.startMs, dDurationMs: Math.max(0, s.endMs - s.startMs), segs: [{ utf8: s.text }] })) } : null;
    } finally {
      if (opened) {
        const p = qsa(PANEL).find((x) => x.getAttribute("visibility") === "ENGAGEMENT_PANEL_VISIBILITY_EXPANDED");
        qs("#visibility-button button, #visibility-button yt-button-shape button", p || document)?.click();
        setTimeout(() => document.documentElement.removeAttribute("data-ytx-hide-transcript-panel"), 300);
      }
    }
  }
  var PANEL_HIDE_CSS = `html[data-ytx-hide-transcript-panel] ${PANEL} { position: absolute !important; left: -99999px !important; }`;

  // src/features/youtube/transcript/source.js
  var tokenUrls = /* @__PURE__ */ new Map();
  var sourceStats = { captured: 0, observer: false, lastError: null, lastMethod: null };
  function record(url) {
    if (!watch.isTimedtextUrl(url)) return;
    try {
      const v = new URL(url).searchParams.get("v");
      if (v) {
        tokenUrls.set(v, url);
        sourceStats.captured++;
      }
    } catch {
    }
  }
  function scanEntries() {
    try {
      for (const e of performance.getEntriesByType("resource")) record(e.name);
    } catch {
    }
  }
  function initTimedtextCapture() {
    scanEntries();
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) record(e.name);
      });
      po.observe({ type: "resource", buffered: true });
      sourceStats.observer = true;
      onDispose(() => po.disconnect());
    } catch (e) {
      log.warn("PerformanceObserver", e);
    }
  }
  function hasToken(videoId) {
    if (!tokenUrls.has(videoId)) scanEntries();
    return tokenUrls.has(videoId);
  }
  function listTracks(pr = watch.playerResponse()) {
    return watch.captionTracks(pr).map((t) => {
      const u = new URL(t.baseUrl, location.origin);
      const kind = t.kind || u.searchParams.get("kind") || "";
      const name = t.name?.simpleText || t.name?.runs?.map((r) => r.text).join("") || t.languageCode;
      return {
        id: t.vssId || `${kind}.${t.languageCode}`,
        lang: t.languageCode,
        kind,
        auto: kind === "asr",
        label: name,
        baseUrl: t.baseUrl
      };
    });
  }
  function pickTrack(tracks, { language = "auto", preferManual = true } = {}) {
    if (!tracks.length) return null;
    const manual = (lang) => tracks.find((t) => !t.auto && t.lang.split("-")[0] === lang);
    const auto = (lang) => tracks.find((t) => t.auto && t.lang.split("-")[0] === lang);
    const spoken = tracks.find((t) => t.auto)?.lang.split("-")[0];
    const ui = (document.documentElement.lang || "de").split("-")[0];
    const order = [];
    if (language === "auto") {
      try {
        const cur = player()?.getOption?.("captions", "track");
        if (cur?.languageCode) order.push(tracks.find((t) => t.lang === cur.languageCode && (t.kind || "") === (cur.kind || "")));
      } catch {
      }
    }
    const langs = language === "ui" ? [ui, spoken] : language === "auto" || language === "original" ? [spoken, ui] : [language, spoken, ui];
    for (const l of langs) {
      if (!l) continue;
      if (preferManual) order.push(manual(l), auto(l));
      else order.push(auto(l), manual(l));
    }
    order.push(tracks.find((t) => !t.auto), tracks[0]);
    return order.find(Boolean);
  }
  var CAPTION_PREFS = ["yt-player-caption-persistence", "yt-player-caption-sticky-language"];
  function snapshotPrefs() {
    const out = {};
    for (const k of CAPTION_PREFS) {
      try {
        out[k] = localStorage.getItem(k);
      } catch {
      }
    }
    return out;
  }
  function restorePrefs(snap) {
    for (const k of CAPTION_PREFS) {
      try {
        if (snap[k] == null) localStorage.removeItem(k);
        else localStorage.setItem(k, snap[k]);
      } catch {
      }
    }
  }
  function captionsOn() {
    const btn2 = document.querySelector("#movie_player .ytp-subtitles-button");
    return btn2 ? btn2.getAttribute("aria-pressed") === "true" : false;
  }
  async function triggerPlayer(videoId, track) {
    const p = player();
    if (!p) return null;
    const prefs = snapshotPrefs();
    const wasOn = captionsOn();
    let prev2 = null;
    try {
      prev2 = p.getOption?.("captions", "track");
    } catch {
    }
    try {
      p.loadModule?.("captions");
    } catch {
    }
    try {
      p.setOption?.("captions", "track", { languageCode: track.lang, ...track.kind ? { kind: track.kind } : {} });
    } catch {
    }
    const url = await waitFor(() => {
      scanEntries();
      return tokenUrls.get(videoId);
    }, { timeout: 7e3, interval: 150 });
    try {
      if (wasOn && prev2?.languageCode) p.setOption?.("captions", "track", prev2);
      else if (!wasOn) {
        p.setOption?.("captions", "track", {});
        p.unloadModule?.("captions");
      }
    } catch {
    }
    if (!wasOn && captionsOn()) document.querySelector("#movie_player .ytp-subtitles-button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    restorePrefs(prefs);
    sourceStats.lastTrigger = { wasOn, restoredOff: !captionsOn() || wasOn };
    return url;
  }
  function buildUrl(base, track) {
    const u = new URL(base);
    const t = new URL(track.baseUrl, location.origin);
    for (const key of ["lang", "kind", "name", "tlang"]) {
      const v = t.searchParams.get(key);
      if (v) u.searchParams.set(key, v);
      else u.searchParams.delete(key);
    }
    if (track.kind) u.searchParams.set("kind", track.kind);
    u.searchParams.set("fmt", "json3");
    return u.toString();
  }
  async function load(url) {
    const res = await fetch(url, { credentials: "include" });
    const text = await res.text();
    if (!res.ok || !text.trim()) return null;
    return JSON.parse(text);
  }
  var cache = /* @__PURE__ */ new Map();
  var adShowing = () => !!document.querySelector("#movie_player.ad-showing");
  async function fetchTrack(videoId, track, { onStatus } = {}) {
    const key = `${videoId}|${track.id}`;
    if (cache.has(key)) return cache.get(key);
    const t0 = performance.now();
    let json = null;
    let base = hasToken(videoId) ? tokenUrls.get(videoId) : null;
    if (base) {
      json = await load(buildUrl(base, track));
      if (json) sourceStats.lastMethod = "Token (bereits vorhanden)";
    }
    let panelTried = false;
    const tryPanel = async () => {
      if (panelTried) return null;
      panelTried = true;
      onStatus?.("Versuche Transkript-Panel …");
      try {
        const r = await transcriptFromPanel();
        if (r) sourceStats.lastMethod = "Transkript-Panel (Fallback, Sprache wie im Panel)";
        return r;
      } catch (e) {
        log.warn("panel fallback", e);
        return null;
      }
    };
    if (!json && adShowing()) json = await tryPanel();
    if (!json) {
      tokenUrls.delete(videoId);
      if (adShowing()) {
        onStatus?.("Warte auf Werbung …");
        await waitFor(() => !adShowing(), { timeout: 6e4, interval: 500 });
      }
      onStatus?.("Lädt …");
      base = await triggerPlayer(videoId, track);
      if (base) {
        json = await load(buildUrl(base, track));
        if (json) sourceStats.lastMethod = "Token (über Player angefordert)";
      }
    }
    if (!json) json = await tryPanel();
    sourceStats.lastMs = Math.round(performance.now() - t0);
    if (!json || !Array.isArray(json.events)) {
      const state = player()?.getPlayerState?.();
      const hint = adShowing() ? "Werbung läuft noch" : state === -1 ? "Video einmal kurz starten und erneut versuchen" : "YouTube hat keine Untertitel geliefert";
      sourceStats.lastError = hint;
      throw new Error(`Transkript nicht verfügbar: ${hint}`);
    }
    sourceStats.lastError = null;
    if (sourceStats.lastMethod.startsWith("Token")) cache.set(key, json);
    if (cache.size > 20) cache.delete(cache.keys().next().value);
    return json;
  }

  // src/features/youtube/transcript/formats.js
  function parseJson3(json) {
    const segs = [];
    for (const ev of json.events || []) {
      if (!ev.segs) continue;
      const raw = ev.segs.map((s) => s.utf8 || "").join("");
      const text = raw.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const startMs = ev.tStartMs || 0;
      segs.push({ startMs, endMs: startMs + (ev.dDurationMs || 0), text });
    }
    segs.sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i].endMs > segs[i + 1].startMs) segs[i].endMs = Math.max(segs[i].startMs, segs[i + 1].startMs);
    }
    const out = [];
    for (const s of segs) {
      const prev2 = out[out.length - 1];
      if (prev2 && prev2.text === s.text && s.startMs - prev2.endMs < 1500) {
        prev2.endMs = s.endMs;
        continue;
      }
      out.push(s);
    }
    return out;
  }
  var TAG_RE = /\[(?:musik|music|applaus|applause|gelächter|laughter|lachen|geräusche|noise|__)\]|\((?:musik|music|applaus|applause)\)|♪+/gi;
  function cleanSegments(segs, { stripTags = true, speakerHeuristic = true } = {}) {
    const out = [];
    for (const s of segs) {
      let text = s.text;
      let speaker = false;
      if (speakerHeuristic && /^(>>|&gt;&gt;|- )/.test(text)) {
        speaker = true;
        text = text.replace(/^(>>|&gt;&gt;|- )\s*/, "");
      }
      if (stripTags) text = text.replace(TAG_RE, "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      out.push({ ...s, text, speaker });
    }
    return out;
  }
  var SENTENCE_END = /[.!?…:;"“”)]$/;
  function toParagraphs(segs, { mode = "pause", pauseMs = 1500, chapters = [], maxChars = 900 } = {}) {
    const useChapters = mode === "chapters" && chapters.length > 1;
    const splitPause = mode !== "none";
    const paras = [];
    let cur = null;
    let chIdx = -1;
    const chapterFor = (ms) => {
      let idx = -1;
      for (let i = 0; i < chapters.length; i++) if (chapters[i].startSec * 1e3 <= ms + 500) idx = i;
      return idx;
    };
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const prev2 = segs[i - 1];
      let title = null;
      if (useChapters) {
        const idx = chapterFor(s.startMs);
        if (idx !== chIdx) {
          chIdx = idx;
          if (idx >= 0) title = chapters[idx].title;
        }
      }
      const gap = prev2 ? s.startMs - prev2.endMs : 0;
      const long = cur && cur.chars > maxChars && SENTENCE_END.test(prev2?.text || "");
      const brk = !cur || title !== null || s.speaker || splitPause && (gap >= pauseMs || long);
      if (brk) {
        cur = { startMs: s.startMs, title, segs: [], chars: 0 };
        paras.push(cur);
      }
      cur.segs.push(s);
      cur.chars += s.text.length + 1;
    }
    return paras;
  }
  function stats(segs) {
    const words = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
    return { words, readingMin: Math.max(1, Math.round(words / 230)) };
  }
  var joinText = (segs) => segs.map((s) => s.text).join(" ").replace(/\s+([,.!?;:])/g, "$1");
  function videoLink(videoId, sec) {
    return `https://www.youtube.com/watch?v=${videoId}${sec ? `&t=${Math.floor(sec)}s` : ""}`;
  }
  function mdHeader(meta) {
    const lines2 = [`# ${meta.title}`, ""];
    if (meta.author) lines2.push(`- **Kanal:** ${meta.channelUrl ? `[${meta.author}](${meta.channelUrl})` : meta.author}`);
    lines2.push(`- **Video:** ${videoLink(meta.videoId)}`);
    if (meta.publishDate) lines2.push(`- **Veröffentlicht:** ${formatDate(meta.publishDate)}`);
    if (meta.durationSec) lines2.push(`- **Länge:** ${clock(meta.durationSec)}`);
    if (meta.trackLabel) lines2.push(`- **Transkript:** ${meta.trackLabel}`);
    lines2.push("");
    return lines2.join("\n");
  }
  function textHeader(meta) {
    return [meta.title, [meta.author, videoLink(meta.videoId)].filter(Boolean).join(" – "), meta.trackLabel ? `Transkript: ${meta.trackLabel}` : "", ""].filter((x, i) => x || i === 3).join("\n");
  }
  function render(format, { meta, segs, paras }, { header = true, timestampEvery = "paragraph" } = {}) {
    if (format === "srt") {
      return segs.map((s, i) => `${i + 1}
${subtitleTime(s.startMs, ",")} --> ${subtitleTime(Math.max(s.endMs, s.startMs + 500), ",")}
${s.text}
`).join("\n");
    }
    if (format === "vtt") {
      return `WEBVTT

${segs.map((s) => `${subtitleTime(s.startMs, ".")} --> ${subtitleTime(Math.max(s.endMs, s.startMs + 500), ".")}
${s.text}
`).join("\n")}`;
    }
    const out = [];
    if (format === "markdown") {
      if (header) out.push(mdHeader(meta));
      for (const p of paras) {
        if (p.title) out.push(`## [${p.title}](${videoLink(meta.videoId, p.startMs / 1e3)})`, "");
        if (timestampEvery === "segment") {
          out.push(p.segs.map((s) => `[${clock(s.startMs / 1e3)}](${videoLink(meta.videoId, s.startMs / 1e3)}) ${s.text}`).join("  \n"), "");
        } else {
          out.push(`[${clock(p.startMs / 1e3)}](${videoLink(meta.videoId, p.startMs / 1e3)}) ${joinText(p.segs)}`, "");
        }
      }
      return out.join("\n").trim() + "\n";
    }
    if (header) out.push(textHeader(meta));
    for (const p of paras) {
      if (p.title) out.push(format === "timestamps" ? `[${clock(p.startMs / 1e3)}] ${p.title}` : p.title, "");
      if (format === "timestamps") {
        if (timestampEvery === "segment") out.push(p.segs.map((s) => `[${clock(s.startMs / 1e3)}] ${s.text}`).join("\n"), "");
        else out.push(`[${clock(p.startMs / 1e3)}] ${joinText(p.segs)}`, "");
      } else {
        out.push(joinText(p.segs), "");
      }
    }
    return out.join("\n").trim() + "\n";
  }
  var FORMAT_LABELS = {
    plain: "Nur Text",
    timestamps: "Text mit Zeitstempeln",
    markdown: "Markdown mit Zeitlinks",
    srt: "SRT-Untertitel",
    vtt: "WebVTT-Untertitel"
  };

  // src/core/css.js
  var sheets = /* @__PURE__ */ new Map();
  function setCss(id, text) {
    let el = sheets.get(id);
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-ytx-own", "");
      el.setAttribute("data-ytx-css", id);
      sheets.set(id, el);
    }
    if (el.textContent !== text) el.textContent = text;
    if (!el.isConnected) (document.head || document.documentElement).append(el);
  }
  function removeCss(id) {
    const el = sheets.get(id);
    if (el) {
      el.remove();
      sheets.delete(id);
    }
  }
  function ensureCss() {
    for (const el of sheets.values()) {
      if (!el.isConnected) (document.head || document.documentElement).append(el);
    }
  }
  function cssStats() {
    let rules2 = 0;
    for (const el of sheets.values()) rules2 += el.sheet?.cssRules?.length || 0;
    return { sheets: sheets.size, rules: rules2 };
  }
  onDispose(() => {
    for (const el of sheets.values()) el.remove();
    sheets.clear();
  });

  // src/features/ui.js
  var CSS = `
.ytx-btn { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 18px; cursor: pointer; white-space: nowrap; user-select: none;
  font: 500 14px/36px Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--tonal-background, rgba(255,255,255,.1)); }
.ytx-btn:hover { background: var(--yt-sys-color-baseline--mono-tonal-hover, rgba(255,255,255,.2)); }
.ytx-btn:focus-visible { outline: 2px solid var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-btn[disabled] { opacity: .5; cursor: default; }
.ytx-btn .ytx-ico { font-size: 16px; line-height: 1; }
.ytx-btn, .ytx-split { flex: none !important; }
.ytx-split { all: initial; display: inline-flex; align-items: stretch; margin-left: 8px; vertical-align: middle; }
.ytx-modal { position: fixed; z-index: 2500; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5); }
.ytx-modal > div { width: min(720px, 92vw); max-height: 80vh; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px;
  font: 400 14px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--menu-background, #282828); }
.ytx-modal textarea { flex: 1; min-height: 300px; resize: vertical; padding: 8px; border-radius: 8px; font: 12px/1.4 ui-monospace, Consolas, monospace;
  color: inherit; background: var(--yt-sys-color-baseline--raised-background, #1f1f1f); border: 1px solid var(--yt-sys-color-baseline--outline, #444); }
.ytx-modal .ytx-row { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.ytx-split > .ytx-btn:first-child { border-radius: 18px 0 0 18px; padding-right: 10px; }
.ytx-split > .ytx-btn:last-child { border-radius: 0 18px 18px 0; padding: 0 10px; border-left: 1px solid var(--yt-sys-color-baseline--outline, rgba(255,255,255,.2)); }
.ytx-small { height: 28px; line-height: 28px; font-size: 12px; padding: 0 10px; border-radius: 14px; }
.ytx-inline { all: initial; font: inherit; color: inherit; }
.ytx-note { all: initial; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 400 12px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-note b { font-weight: 500; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); }
.ytx-link { all: initial; cursor: pointer; font: 500 12px/1.4 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-link:hover { text-decoration: underline; }
.ytx-menu { position: fixed; z-index: 2300; min-width: 240px; max-width: 340px; max-height: 70vh; overflow: auto; padding: 8px 0; border-radius: 12px; box-sizing: border-box;
  font: 400 14px/1.35 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary, #f1f1f1); background: var(--yt-sys-color-baseline--menu-background, #282828);
  box-shadow: 0 4px 32px rgba(0,0,0,.4); }
.ytx-menu-title { padding: 8px 16px 4px; font-size: 11px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 16px; box-sizing: border-box; cursor: pointer; border: 0; background: none; text-align: left; font: inherit; color: inherit; }
.ytx-menu-item:hover, .ytx-menu-item:focus-visible { outline: none; background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.1)); }
.ytx-menu-item[disabled] { opacity: .45; cursor: default; background: none; }
.ytx-menu-item .ytx-check { width: 14px; text-align: center; color: var(--yt-sys-color-baseline--call-to-action, #3ea6ff); }
.ytx-menu-item .ytx-sub { margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-menu-sep { height: 1px; margin: 6px 0; background: var(--yt-sys-color-baseline--outline, rgba(255,255,255,.1)); }
.ytx-menu-foot { padding: 6px 16px 2px; font-size: 12px; color: var(--yt-sys-color-baseline--text-secondary, #aaa); }
.ytx-toast { position: fixed; z-index: 2400; left: 50%; bottom: 32px; transform: translateX(-50%); max-width: 80vw; padding: 10px 16px; border-radius: 8px;
  font: 400 14px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-primary-inverse, #0f0f0f); background: var(--yt-sys-color-baseline--inverted-background, #f1f1f1); box-shadow: 0 4px 16px rgba(0,0,0,.3); }
.ytx-toast[data-kind="error"] { background: #c62828; color: #fff; }
.ytx-badge { position: absolute; z-index: 3; right: 4px; top: 4px; padding: 1px 5px; border-radius: 4px; pointer-events: none; font: 500 11px/16px Roboto, Arial, sans-serif; color: #fff; background: rgba(0,0,0,.75); }
`;
  function initUiCss() {
    setCss("ui", CSS);
  }
  function button({ label, icon, title, small, onClick }) {
    const b = h("button", { class: ["ytx-btn", small && "ytx-small"], type: "button", title, "data-ytx-own": "" }, icon && h("span", { class: "ytx-ico", text: icon }), label && h("span", { class: "ytx-label", text: label }));
    if (onClick)
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      });
    return b;
  }
  function splitButton({ label, icon, title, onMain, onMenu }) {
    const main = button({ label, icon, title, onClick: onMain });
    const more = button({ icon: "▾", title: "Optionen", onClick: (e) => onMenu(more, e) });
    const wrap = h("div", { class: "ytx-split", "data-ytx-own": "" }, main, more);
    wrap.main = main;
    wrap.more = more;
    return wrap;
  }
  var openMenu = null;
  function closeMenu() {
    openMenu?.remove();
    openMenu = null;
  }
  function showMenu(anchorEl, items) {
    const wasOpenForThis = openMenu && openMenu.__anchor === anchorEl;
    closeMenu();
    if (wasOpenForThis) return;
    const menu = h("div", { class: "ytx-menu", role: "menu", "data-ytx-own": "" });
    menu.__anchor = anchorEl;
    for (const it of items) {
      if (!it) continue;
      if (it.sep) menu.append(h("div", { class: "ytx-menu-sep" }));
      else if (it.title) menu.append(h("div", { class: "ytx-menu-title", text: it.title }));
      else if (it.foot) menu.append(h("div", { class: "ytx-menu-foot", text: it.foot }));
      else {
        const b = h(
          "button",
          { class: "ytx-menu-item", role: "menuitem", type: "button", disabled: it.disabled },
          it.checked !== void 0 && h("span", { class: "ytx-check", text: it.checked ? "●" : "" }),
          h("span", { text: it.label }),
          it.sub && h("span", { class: "ytx-sub", text: it.sub })
        );
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!it.keepOpen) closeMenu();
          it.run?.();
        });
        menu.append(b);
      }
    }
    document.body.append(menu);
    const r = anchorEl.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - mw - 8);
    let top2 = r.bottom + 6;
    if (top2 + mh > window.innerHeight - 8) top2 = Math.max(8, r.top - mh - 6);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${top2}px`;
    openMenu = menu;
    menu.querySelector(".ytx-menu-item:not([disabled])")?.focus({ preventScroll: true });
  }
  var toastEl = null;
  var toastTimer = null;
  function toast(text, kind = "info", ms = 2600) {
    toastEl?.remove();
    clearTimeout(toastTimer);
    toastEl = h("div", { class: "ytx-toast", "data-kind": kind, "data-ytx-own": "", role: "status", text });
    document.body.append(toastEl);
    toastTimer = setTimeout(() => {
      toastEl?.remove();
      toastEl = null;
    }, ms);
  }
  function textDialog(title, text) {
    document.querySelector(".ytx-modal")?.remove();
    const ta = h("textarea", { readonly: true, spellcheck: "false" });
    ta.value = text;
    const close = () => modal.remove();
    const closeBtn = button({ label: "Schließen", onClick: close });
    const modal = h("div", { class: "ytx-modal", "data-ytx-own": "" }, h("div", null, h("b", { text: title }), h("span", { class: "ytx-note", text: "Die Zwischenablage war blockiert. Text ist markiert – mit Strg+C kopieren." }), ta, h("div", { class: "ytx-row" }, closeBtn)));
    modal.addEventListener("click", (e) => e.target === modal && close());
    modal.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") close();
    });
    document.body.append(modal);
    ta.focus();
    ta.select();
  }
  function setButtonBusy(btn2, busy, label) {
    const l = btn2.querySelector(".ytx-label");
    if (busy) {
      btn2.__label ??= l?.textContent;
      btn2.disabled = true;
      if (l && label) l.textContent = label;
    } else {
      btn2.disabled = false;
      if (l && btn2.__label != null) l.textContent = btn2.__label;
      btn2.__label = null;
    }
  }
  function initMenuDismiss() {
    listen(document, "pointerdown", (e) => {
      if (openMenu && !e.composedPath().includes(openMenu) && !e.composedPath().includes(openMenu.__anchor)) closeMenu();
    }, true);
    listen(document, "keydown", (e) => e.key === "Escape" && closeMenu(), true);
    listen(window, "resize", closeMenu);
    listen(document, "yt-navigate-start", closeMenu);
    onDispose(() => {
      closeMenu();
      toastEl?.remove();
    });
  }

  // src/features/youtube/transcript/index.js
  var FORMATS = Object.entries(FORMAT_LABELS);
  var transcript_default = {
    id: "transcript.copy",
    label: "Transkript kopieren",
    group: "Videoseite",
    description: "Komplettes Transkript mit einem Klick in die Zwischenablage. Button erscheint nur, wenn das Video Untertitel hat",
    pages: ["watch"],
    stability: "mittel",
    anchors: ["watch.actions", "transcript.panelHeader"],
    settings: {
      format: { type: "select", label: "Standardformat", options: FORMATS, default: "markdown" },
      language: { type: "select", label: "Sprache", options: [["auto", "Automatisch (Player / Originalsprache)"], ["original", "Originalsprache"], ["ui", "Oberflächensprache"], ["de", "Deutsch"], ["en", "Englisch"]], default: "auto" },
      preferManual: { type: "toggle", label: "Manuelle Untertitel bevorzugen", default: true },
      paragraphs: { type: "select", label: "Absätze", options: [["none", "Keine"], ["pause", "Bei Sprechpausen"], ["chapters", "Nach Kapiteln (sonst Pausen)"]], default: "chapters" },
      pauseMs: { type: "range", label: "Pause für neuen Absatz", min: 500, max: 6e3, step: 250, unit: "ms", default: 1500 },
      timestampEvery: { type: "select", label: "Zeitstempel", options: [["paragraph", "Pro Absatz"], ["segment", "Pro Untertitelzeile"]], default: "paragraph" },
      header: { type: "toggle", label: "Titel, Kanal und Link voranstellen", default: true },
      stripTags: { type: "toggle", label: "[Musik], [Applaus] entfernen", default: true },
      speakerHeuristic: { type: "toggle", label: "Sprecherwechsel (>>) als Absatz", default: true },
      placement: { type: "multi", label: "Button-Position", options: [["actions", "Aktionsleiste"], ["panel", "Transkript-Panel"]], default: ["actions", "panel"] },
      showStats: { type: "toggle", label: "Wortzahl und Lesezeit anzeigen", default: true }
    },
    hotkeys: [
      ["transcript.copy", "Transkript kopieren", "Alt+T"],
      ["transcript.quote", "Aktuelle Stelle zitieren", "Alt+Q"]
    ],
    setup(ctx) {
      let s = ctx.settings;
      let tracks = [];
      let chosen = /* @__PURE__ */ new Map();
      let lastStats = null;
      let lastError = null;
      let busy = false;
      const available = () => ctx.nav.page === "watch" && tracks.length > 0;
      const refreshTracks = () => {
        const pr = watch.playerResponse();
        const vid = ctx.nav.videoId;
        const prVid = pr?.videoDetails?.videoId;
        tracks = prVid && prVid === vid ? listTracks(pr) : [];
      };
      const currentTrack2 = () => chosen.get(ctx.nav.videoId) || pickTrack(tracks, s);
      async function buildDoc(track, onStatus) {
        const vid = ctx.nav.videoId;
        const json = await fetchTrack(vid, track, { onStatus });
        const pr = watch.playerResponse();
        const vd = pr?.videoDetails || {};
        const segsRaw = parseJson3(json);
        const segs = cleanSegments(segsRaw, s);
        const chapters = s.paragraphs === "chapters" ? watch.chapters() : [];
        const paras = toParagraphs(segs, { mode: s.paragraphs === "none" ? "none" : s.paragraphs, pauseMs: s.pauseMs, chapters });
        const meta = {
          videoId: vid,
          title: vd.title || document.title.replace(/ - YouTube$/, ""),
          author: vd.author,
          channelUrl: vd.channelId ? `https://www.youtube.com/channel/${vd.channelId}` : "",
          publishDate: watch.publishDate(pr),
          durationSec: Number(vd.lengthSeconds) || null,
          trackLabel: track.label
        };
        lastStats = { ...stats(segs), segments: segs.length, track: track.label, video: vid };
        return { meta, segs, paras };
      }
      async function copy(format = s.format, track = currentTrack2(), btn2) {
        if (busy) return;
        if (!track) return toast("Für dieses Video gibt es kein Transkript", "error");
        busy = true;
        if (btn2) setButtonBusy(btn2, true, "Lädt …");
        try {
          const doc = await buildDoc(track, (label) => btn2 && setButtonBusy(btn2, true, label));
          if (!doc.segs.length) throw new Error("Transkript ist leer");
          const text = render(format, doc, s);
          const ok = await ctx.copyText(text);
          lastError = null;
          const extra = s.showStats ? ` · ${lastStats.words.toLocaleString("de-DE")} Wörter · ~${lastStats.readingMin} min Lesezeit` : "";
          if (ok) toast(`Kopiert: ${FORMAT_LABELS[format]}${extra}`);
          else textDialog(`Transkript (${FORMAT_LABELS[format]})`, text);
        } catch (e) {
          lastError = e.message;
          ctx.log.warn("transcript", e);
          toast(e.message, "error", 4e3);
        } finally {
          busy = false;
          if (btn2) setButtonBusy(btn2, false);
        }
      }
      async function quote() {
        const track = currentTrack2();
        if (!track) return toast("Kein Transkript für dieses Video", "error");
        const t = (player()?.getCurrentTime?.() || 0) * 1e3;
        try {
          const doc = await buildDoc(track);
          const i = doc.segs.findIndex((x) => x.endMs >= t);
          const pick2 = doc.segs.slice(Math.max(0, i - 1), i + 2);
          if (!pick2.length) throw new Error("Keine Zeile an dieser Stelle");
          const start = pick2[0].startMs / 1e3;
          const text = `> ${pick2.map((x) => x.text).join(" ")}
> — [${doc.meta.title} @ ${clock(start)}](${videoLink(doc.meta.videoId, start)})
`;
          if (await ctx.copyText(text)) toast(`Zitat bei ${clock(start)} kopiert`);
          else textDialog("Zitat", text);
        } catch (e) {
          toast(e.message, "error");
        }
      }
      function openMenu2(anchor) {
        const cur = currentTrack2();
        const items = [{ title: "Kopieren als" }];
        for (const [id, label] of FORMATS) items.push({ label, sub: id === s.format ? "Standard" : "", run: () => copy(id, cur, anchor.parentElement?.main) });
        items.push({ sep: true }, { label: "Aktuelle Stelle zitieren", sub: "Alt+Q", run: quote });
        if (tracks.length > 1) {
          items.push({ sep: true }, { title: "Spur" });
          const sorted = [...tracks].sort((a, b) => a.auto - b.auto || a.label.localeCompare(b.label, "de"));
          for (const t of sorted.slice(0, 40)) {
            items.push({ label: t.label, checked: t.id === cur?.id, run: () => chosen.set(ctx.nav.videoId, t) });
          }
        }
        if (lastStats && lastStats.video === ctx.nav.videoId) items.push({ sep: true }, { foot: `${lastStats.words.toLocaleString("de-DE")} Wörter · ~${lastStats.readingMin} min Lesezeit · ${lastStats.track}` });
        showMenu(anchor, items);
      }
      const mounts2 = [];
      const mountAll = () => {
        for (const m of mounts2.splice(0)) m.destroy();
        if (s.placement.includes("actions")) {
          mounts2.push(
            ctx.mount({
              id: "actions.transcript",
              anchor: "watch.actions",
              position: "before",
              when: available,
              create: () => {
                const sb = splitButton({ label: "Transkript", icon: "⧉", title: "Transkript kopieren (Alt+T)", onMain: () => copy(s.format, currentTrack2(), sb.main), onMenu: (more) => openMenu2(more) });
                return sb;
              }
            })
          );
        }
        if (s.placement.includes("panel")) {
          mounts2.push(
            ctx.mount({
              id: "panel.transcript",
              anchor: "transcript.panelHeader",
              position: "append",
              when: available,
              create: () => {
                const b = button({ label: "Kopieren", icon: "⧉", small: true, title: "Komplettes Transkript kopieren", onClick: () => copy(s.format, currentTrack2(), b) });
                b.style.marginLeft = "8px";
                return b;
              }
            })
          );
        }
      };
      ctx.action("transcript.copy", () => available() && copy());
      ctx.action("transcript.quote", () => available() && quote());
      ctx.css(PANEL_HIDE_CSS);
      mountAll();
      return {
        onVideo() {
          refreshTracks();
          mounts2.forEach((m) => m.refresh());
        },
        onSweep() {
          const before = tracks.length;
          refreshTracks();
          if (before !== tracks.length) mounts2.forEach((m) => m.refresh());
        },
        update(next) {
          const placementChanged = JSON.stringify(next.placement) !== JSON.stringify(s.placement);
          s = next;
          if (placementChanged) mountAll();
        },
        dispose() {
          mounts2.forEach((m) => m.destroy());
        },
        health() {
          refreshTracks();
          if (!ctx.nav.videoId) return { status: "skip", detail: "Kein Video" };
          if (!tracks.length) return { status: "skip", detail: "Video hat keine Untertitel – Button bleibt ausgeblendet" };
          const m = mounts2.map((x) => `${x.ok ? "✓" : "✗"}`).join(" ");
          const token = hasToken(ctx.nav.videoId) ? "Token vorhanden" : "Token wird beim Kopieren angefordert";
          const err = lastError || sourceStats.lastError;
          const method = sourceStats.lastMethod ? ` · zuletzt: ${sourceStats.lastMethod} (${sourceStats.lastMs} ms)` : "";
          return { status: err ? "warn" : mounts2.some((x) => x.ok) ? "ok" : "warn", detail: `${tracks.length} Spuren · ${token} · Buttons ${m}${method}${err ? ` · letzter Fehler: ${err}` : ""}` };
        },
        debug: { copy, buildDoc, currentTrack: currentTrack2, tracks: () => tracks }
      };
    }
  };

  // src/features/youtube/playlist/common.js
  function readPlaylist() {
    const polymer = qsa(playlistPage.polymerItems);
    const kind = polymer.length ? "polymer" : "lockup";
    const els = kind === "polymer" ? polymer : qsa(playlistPage.lockupItems);
    const items = [];
    for (const el of els) {
      const it = kind === "polymer" ? playlistPage.readPolymerItem(el) : playlistPage.readLockupItem(el);
      if (it) items.push(it);
    }
    const continuation = findContinuation();
    return { kind, items, total: playlistPage.total(), continuation, complete: !continuation };
  }
  function findContinuation() {
    const el = qsFirst(playlistPage.continuation);
    if (!el) return null;
    if (el.matches("ytd-continuation-item-renderer") || el.querySelector('ytd-continuation-item-renderer, tp-yt-paper-spinner, [class*="Spinner"], yt-spinner, [class*="continuation" i]')) return el;
    return null;
  }
  function summarize(items, { doneThreshold = 90 } = {}) {
    let total = 0;
    let watched = 0;
    let unavailable = 0;
    let live = 0;
    let withProgress = 0;
    for (const it of items) {
      if (it.live) {
        live++;
        continue;
      }
      if (it.unavailable || !it.durationSec) {
        unavailable++;
        continue;
      }
      total += it.durationSec;
      if (it.percent != null && it.percent > 0) {
        withProgress++;
        watched += it.percent >= doneThreshold ? it.durationSec : it.durationSec * it.percent / 100;
      }
    }
    return { total, watched, remaining: Math.max(0, total - watched), unavailable, live, withProgress, count: items.length };
  }
  var loading = null;
  async function loadAll(onProgress) {
    if (loading) return loading;
    loading = (async () => {
      const y0 = window.scrollY;
      let stale = 0;
      let rounds = 0;
      try {
        while (rounds < 200) {
          const before = readPlaylist();
          onProgress?.(before);
          if (!before.continuation) break;
          before.continuation.scrollIntoView({ block: "center" });
          window.dispatchEvent(new Event("scroll"));
          let grew = false;
          for (let i = 0; i < 40; i++) {
            await sleep(150);
            const n = readPlaylist().items.length;
            if (n > before.items.length) {
              grew = true;
              break;
            }
            if (!findContinuation()) break;
          }
          rounds++;
          if (!grew) {
            stale++;
            if (stale >= 3) break;
            window.scrollBy(0, -200);
            await sleep(200);
          } else {
            stale = 0;
          }
        }
      } finally {
        window.scrollTo(0, y0);
      }
      const result = readPlaylist();
      onProgress?.(result);
      return result;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }
  function isLoading() {
    return !!loading;
  }

  // src/features/youtube/playlist/duration.js
  var duration_default = {
    id: "playlist.duration",
    label: "Playlist-Dauer",
    group: "Playlist",
    description: "Gesamtdauer, gesehene und verbleibende Zeit auf Playlist-Seiten und im Playlist-Panel neben Videos",
    pages: ["playlist", "watch"],
    stability: "mittel-hoch",
    anchors: ["playlist.header", "watch.playlistHeader"],
    settings: {
      show: { type: "multi", label: "Anzeigen", options: [["total", "Gesamt"], ["watched", "Gesehen"], ["remaining", "Übrig"]], default: ["total", "remaining"] },
      doneThreshold: { type: "range", label: "Gilt als gesehen ab", min: 50, max: 100, step: 5, unit: "%", default: 90 },
      speed: { type: "select", label: "Zusätzlich umgerechnet auf", options: [["", "Aus"], ["player", "Aktuelle Player-Geschwindigkeit"], ["1.25", "1,25×"], ["1.5", "1,5×"], ["1.75", "1,75×"], ["2", "2×"]], default: "" },
      panelFromHere: { type: "toggle", label: "Im Playlist-Panel: Rest ab aktuellem Video", default: true },
      autoLoadAll: { type: "toggle", label: "Große Playlists automatisch komplett laden", default: false },
      longFormat: { type: "select", label: "Lange Dauer als", options: [["hours", "Stunden (27 h)"], ["days", "Tage (1 d 3 h)"]], default: "hours" }
    },
    setup(ctx) {
      let s = ctx.settings;
      let last2 = null;
      let autoTriedFor = null;
      const rate = () => {
        if (!s.speed) return null;
        if (s.speed === "player") {
          const r = player()?.getPlaybackRate?.();
          return r && r !== 1 ? r : null;
        }
        return Number(s.speed);
      };
      const fmt = (sec) => formatDuration(sec, { long: s.longFormat });
      function statsParts(sum, complete, approx) {
        const pre = complete ? "" : "≥ ";
        const parts = [];
        if (s.show.includes("total")) parts.push([`${pre}${fmt(sum.total)}`, "gesamt"]);
        if (s.show.includes("watched") && sum.withProgress) parts.push([`~${fmt(sum.watched)}`, "gesehen"]);
        if (s.show.includes("remaining")) parts.push([`${approx && sum.withProgress ? "~" : pre}${fmt(sum.remaining)}`, "übrig"]);
        const r = rate();
        if (r) parts.push([`${pre}${fmt(sum.remaining / r)}`, `bei ${String(r).replace(".", ",")}×`]);
        return parts;
      }
      function renderPage(node) {
        const data2 = readPlaylist();
        const sum = summarize(data2.items, s);
        last2 = { ...sum, loaded: data2.items.length, expected: data2.total, complete: data2.complete, kind: data2.kind };
        clear(node);
        node.append(h("span", { text: "⏱" }));
        for (const [val, label] of statsParts(sum, data2.complete, true)) node.append(h("span", null, h("b", { text: val }), ` ${label}`));
        if (sum.unavailable) node.append(h("span", { text: `${sum.unavailable} ohne Dauer` }));
        if (sum.live) node.append(h("span", { text: `${sum.live} live` }));
        if (!data2.complete) {
          node.append(h("span", { text: `${data2.items.length}${data2.total ? ` / ${data2.total}` : ""} geladen` }));
          if (isLoading()) node.append(h("span", { text: "lädt …" }));
          else {
            const link = h("button", { class: "ytx-link", type: "button", text: "Alle laden" });
            link.addEventListener("click", (e) => {
              e.preventDefault();
              startLoad(node);
            });
            node.append(link);
          }
        }
      }
      async function startLoad(node) {
        renderPage(node);
        await loadAll(() => renderPage(node));
        renderPage(node);
      }
      function renderPanel(node) {
        const d = playlistPanel.read();
        if (!d || !d.items.length) {
          clear(node);
          return;
        }
        const maxIndex = Math.max(...d.items.map((i) => i.index));
        const minIndex = Math.min(...d.items.map((i) => i.index));
        const total = d.total ?? d.items.length;
        const cur = d.current ?? 0;
        const complete = !d.infinite && maxIndex >= total - 1;
        const all = summarize(d.items.map((i) => ({ ...i, unavailable: !i.durationSec })), s);
        const rest = d.items.filter((i) => i.index >= cur);
        let restSec = rest.reduce((n, i) => n + (i.durationSec || 0), 0);
        const t = player()?.getCurrentTime?.() || 0;
        if (rest.find((i) => i.index === cur)?.durationSec) restSec -= Math.min(t, rest.find((i) => i.index === cur).durationSec);
        const pre = complete ? "" : "≥ ";
        clear(node);
        const parts = [];
        if (s.panelFromHere) parts.push([`${pre}${fmt(restSec)}`, "ab hier"]);
        if (s.show.includes("total")) parts.push([`${complete && minIndex === 0 ? "" : "≥ "}${fmt(all.total)}`, "gesamt"]);
        const r = rate();
        if (r && s.panelFromHere) parts.push([`${pre}${fmt(restSec / r)}`, `bei ${String(r).replace(".", ",")}×`]);
        node.append(h("span", { text: "⏱" }), ...parts.map(([v, l]) => h("span", null, h("b", { text: v }), ` ${l}`)));
        last2 = { panel: true, restSec, loaded: d.items.length, expected: total, complete };
      }
      const pageMount = ctx.mount({
        id: "playlist.duration",
        anchor: "playlist.header",
        position: "after",
        when: () => ctx.nav.page === "playlist",
        create: () => h("div", { class: "ytx-note", style: { display: "flex", margin: "8px 0" } }),
        update: (node) => {
          if (!isLoading()) renderPage(node);
        }
      });
      const panelMount = ctx.mount({
        id: "watch.playlist.duration",
        anchor: "watch.playlistHeader",
        position: "append",
        when: () => ctx.nav.page === "watch" && !!playlistPanel.read(),
        create: () => h("div", { class: "ytx-note", style: { display: "flex", marginTop: "4px" } }),
        update: (node) => renderPanel(node)
      });
      const iv = setInterval(() => {
        if (ctx.nav.page === "watch" && panelMount.node?.isConnected) renderPanel(panelMount.node);
      }, 5e3);
      return {
        onSweep() {
          if (s.autoLoadAll && ctx.nav.page === "playlist" && autoTriedFor !== ctx.nav.url && pageMount.node?.isConnected) {
            autoTriedFor = ctx.nav.url;
            const d = readPlaylist();
            if (!d.complete && d.items.length) startLoad(pageMount.node);
          }
        },
        update(next) {
          s = next;
          pageMount.refresh();
          panelMount.refresh();
        },
        dispose() {
          clearInterval(iv);
          pageMount.destroy();
          panelMount.destroy();
        },
        health() {
          if (ctx.nav.page === "playlist") {
            if (!pageMount.ok) return { status: "fail", detail: "Anker im Playlist-Kopf nicht gefunden" };
            if (!last2 || !last2.loaded) return { status: "warn", detail: "Keine Einträge erkannt" };
            return { status: "ok", detail: `${last2.kind === "lockup" ? "neue Komponenten" : "Polymer"} · ${last2.loaded}${last2.expected ? `/${last2.expected}` : ""} geladen · ${fmt(last2.total ?? 0)} · ${last2.complete ? "vollständig" : "teilweise"} · ${last2.unavailable} ohne Dauer` };
          }
          if (!playlistPanel.read()) return { status: "skip", detail: "Keine Playlist im Video" };
          return panelMount.ok ? { status: "ok", detail: `Panel · ${last2?.loaded ?? 0}/${last2?.expected ?? "?"} Einträge` } : { status: "warn", detail: "Anker im Playlist-Panel fehlt" };
        },
        debug: { readPlaylist, loadAll: () => loadAll(), last: () => last2 }
      };
    }
  };

  // src/features/youtube/playlist/dimWatched.js
  var ATTR = "data-ytx-watched";
  var dimWatched_default = {
    id: "playlist.dimWatched",
    label: "Gesehene Videos in Playlists markieren",
    group: "Playlist",
    description: "Räumt „Später ansehen“ optisch auf ohne etwas zu löschen",
    pages: ["playlist", "watch"],
    stability: "mittel",
    settings: {
      mode: { type: "select", label: "Darstellung", options: [["dim", "Dimmen"], ["hide", "Ausblenden"]], default: "dim" },
      threshold: { type: "range", label: "Ab Fortschritt", min: 10, max: 100, step: 5, unit: "%", default: 90 }
    },
    setup(ctx) {
      let s = ctx.settings;
      let marked = 0;
      ctx.css(`
[${ATTR}="dim"] { opacity: var(--ytx-dim-opacity, .35) !important; }
[${ATTR}="dim"]:hover { opacity: 1 !important; }
[${ATTR}="hide"] { display: none !important; }`);
      const clearAll = () => {
        for (const el of qsa(`[${ATTR}]`)) el.removeAttribute(ATTR);
      };
      const run2 = () => {
        marked = 0;
        if (ctx.nav.page === "playlist") {
          for (const it of readPlaylist().items) {
            const on = it.percent != null && it.percent >= s.threshold;
            if (on) {
              it.wrapper.setAttribute(ATTR, s.mode);
              marked++;
            } else if (it.wrapper.hasAttribute(ATTR)) it.wrapper.removeAttribute(ATTR);
          }
        } else if (ctx.nav.page === "watch") {
          const d = playlistPanel.read();
          if (!d) return;
          const els = playlistPanel.itemElements();
          els.forEach((el, i) => {
            const it = d.items[i];
            const on = it && !it.selected && it.percent != null && it.percent >= s.threshold;
            if (on) {
              el.setAttribute(ATTR, "dim");
              marked++;
            } else if (el.hasAttribute(ATTR)) el.removeAttribute(ATTR);
          });
        }
      };
      return {
        onSweep: run2,
        onPage: run2,
        update(next) {
          s = next;
          clearAll();
          run2();
        },
        dispose() {
          clearAll();
          ctx.css("");
        },
        health: () => ({ status: "ok", detail: `${marked} Einträge markiert (Fortschritt nur sichtbar wenn angemeldet)` })
      };
    }
  };

  // src/features/youtube/playlist/sort.js
  var SORTS = [
    ["", "Reihenfolge: Original"],
    ["duration-asc", "Dauer: kurz zuerst"],
    ["duration-desc", "Dauer: lang zuerst"],
    ["progress-asc", "Fortschritt: ungesehen zuerst"],
    ["progress-desc", "Fortschritt: angefangen zuerst"],
    ["title", "Titel A–Z"],
    ["channel", "Kanal A–Z"],
    ["reverse", "Umgekehrt"]
  ];
  var cmpText = (a, b) => a.localeCompare(b, "de", { sensitivity: "base" });
  function sorter(key) {
    switch (key) {
      case "duration-asc":
        return (a, b) => (a.durationSec ?? Infinity) - (b.durationSec ?? Infinity);
      case "duration-desc":
        return (a, b) => (b.durationSec ?? -1) - (a.durationSec ?? -1);
      case "progress-asc":
        return (a, b) => (a.percent ?? 0) - (b.percent ?? 0);
      case "progress-desc":
        return (a, b) => (b.percent ?? 0) - (a.percent ?? 0);
      case "title":
        return (a, b) => cmpText(a.title || "", b.title || "");
      case "channel":
        return (a, b) => cmpText(a.channel || "", b.channel || "") || (a.index ?? 0) - (b.index ?? 0);
      case "reverse":
        return (a, b) => (b.index ?? 0) - (a.index ?? 0);
      default:
        return null;
    }
  }
  var sort_default = {
    id: "playlist.sort",
    label: "Playlist sortieren (nur Anzeige)",
    group: "Playlist",
    description: "Sortiert die Anzeige von Playlists und „Später ansehen“. Bei YouTube wird nichts verändert",
    pages: ["playlist"],
    stability: "mittel",
    settings: {
      loadBeforeSort: { type: "toggle", label: "Vor dem Sortieren alle Einträge laden", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let key = "";
      let applied = 0;
      ctx.css(`
[data-ytx-sorted] { display: flex !important; flex-direction: column !important; }
${playlistPage.dragHandles} { visibility: hidden !important; }
[data-ytx-sorted] ytd-playlist-video-renderer #reorder { visibility: hidden !important; }`);
      const reset = () => {
        for (const c of qsa("[data-ytx-sorted]")) {
          c.removeAttribute("data-ytx-sorted");
          for (const child of c.children) child.style.removeProperty("order");
        }
        applied = 0;
      };
      const apply = () => {
        if (!key) return reset();
        const data2 = readPlaylist();
        const container = playlistPage.listContainer(data2.kind);
        if (!container) return;
        const cmp = sorter(key);
        const sorted = data2.items.slice().sort((a, b) => cmp(a, b) || (a.index ?? 0) - (b.index ?? 0));
        container.setAttribute("data-ytx-sorted", key);
        sorted.forEach((it, i) => it.wrapper.style.setProperty("order", String(i)));
        for (const child of container.children) if (!child.style.order) child.style.setProperty("order", "999999");
        applied = sorted.length;
      };
      const select2 = h("select", { class: "ytx-btn ytx-small", title: "Anzeige sortieren", style: { paddingRight: "8px" } }, SORTS.map(([v, l]) => h("option", { value: v, text: l })));
      select2.addEventListener("change", async () => {
        key = select2.value;
        if (key && s.loadBeforeSort && !readPlaylist().complete) {
          select2.disabled = true;
          toast("Lade alle Einträge zum Sortieren …");
          await loadAll();
          select2.disabled = false;
        }
        apply();
      });
      const mount2 = ctx.mount({
        id: "playlist.sort",
        anchor: "playlist.header",
        position: "after",
        when: () => ctx.nav.page === "playlist",
        create: () => h("div", { style: { margin: "4px 0 8px" } }, select2)
      });
      return {
        onPage() {
          key = "";
          select2.value = "";
          reset();
        },
        onLeave() {
          reset();
        },
        onSweep() {
          if (key && !isLoading()) apply();
        },
        update(next) {
          s = next;
        },
        dispose() {
          reset();
          mount2.destroy();
          ctx.css("");
        },
        health: () => qs('ytd-browse[page-subtype="playlist"]') ? { status: mount2.ok ? "ok" : "warn", detail: key ? `${applied} Einträge sortiert (${key})` : "Original-Reihenfolge" } : { status: "skip" }
      };
    }
  };

  // src/features/youtube/watchExtras.js
  var endsAt = {
    id: "player.endsAt",
    label: "Endzeit im Player",
    group: "Videoseite",
    description: "„endet 21:47“ neben der Zeitanzeige, rechnet Geschwindigkeit mit ein",
    pages: ["watch"],
    stability: "hoch",
    anchors: ["player.timeDisplay"],
    settings: {
      showRemaining: { type: "toggle", label: "Restzeit anzeigen (−12:34)", default: false },
      speedAdjusted: { type: "toggle", label: "Geschwindigkeit berücksichtigen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let lastText = "";
      const text = () => {
        const p = player();
        if (!p) return "";
        const vd = p.getVideoData?.();
        if (vd?.isLive || p.classList?.contains("ad-showing")) return "";
        const dur = p.getDuration?.() || 0;
        const cur = p.getCurrentTime?.() || 0;
        if (!dur) return "";
        const r = s.speedAdjusted ? p.getPlaybackRate?.() || 1 : 1;
        const left = Math.max(0, (dur - cur) / r);
        const end = formatTimeOfDay(new Date(Date.now() + left * 1e3));
        return `${s.showRemaining ? ` · −${clock(left)}` : ""} · endet ${end}`;
      };
      const m = ctx.mount({
        id: "player.endsAt",
        anchor: "player.timeDisplay",
        position: "append",
        when: () => ctx.nav.page === "watch",
        create: () => h("span", { class: "ytx-inline", style: { color: "inherit", font: "inherit", whiteSpace: "nowrap" } }),
        update: (node) => {
          const t = text();
          if (t !== lastText) node.textContent = lastText = t;
        }
      });
      let tick2 = 0;
      const off = listen(document, "timeupdate", (e) => {
        if (!e.target?.closest?.("#movie_player")) return;
        const now = Date.now();
        if (now - tick2 < 1e3) return;
        tick2 = now;
        m.refresh();
      }, true);
      const off2 = listen(document, "ratechange", () => m.refresh(), true);
      return {
        update(next) {
          s = next;
          lastText = "";
          m.refresh();
        },
        dispose() {
          off();
          off2();
          m.destroy();
        },
        health: () => m.ok ? { status: "ok", detail: lastText.trim() || "wartet auf Wiedergabe" } : { status: "warn", detail: "Zeitanzeige im Player nicht gefunden" }
      };
    }
  };
  var publishDate = {
    id: "watch.publishDate",
    label: "Exaktes Veröffentlichungsdatum",
    group: "Videoseite",
    description: "Zeigt das Datum unter dem Video statt nur „vor 3 Jahren“",
    pages: ["watch"],
    stability: "mittel-hoch",
    anchors: ["watch.titleRow"],
    settings: {
      withTime: { type: "toggle", label: "Mit Uhrzeit", default: false }
    },
    setup(ctx) {
      let s = ctx.settings;
      let shown = "";
      const m = ctx.mount({
        id: "watch.publishDate",
        anchor: "watch.titleRow",
        position: "append",
        when: () => ctx.nav.page === "watch" && !!watch.publishDate(),
        create: () => h("div", { class: "ytx-note", style: { marginTop: "4px" } }),
        update: (node) => {
          const pr = watch.playerResponse();
          if (pr?.videoDetails?.videoId !== ctx.nav.videoId) return;
          const iso = watch.publishDate(pr);
          const t = iso ? `Veröffentlicht am ${formatDate(iso, s.withTime && /T/.test(iso))}` : "";
          if (t !== shown) node.textContent = shown = t;
        }
      });
      return {
        onVideo: () => m.refresh(),
        update(next) {
          s = next;
          shown = "";
          m.refresh();
        },
        dispose: () => m.destroy(),
        health: () => m.ok ? { status: "ok", detail: shown } : { status: watch.publishDate() ? "warn" : "skip", detail: watch.publishDate() ? "Anker unter dem Titel fehlt" : "Kein Datum in Player-Daten" }
      };
    }
  };
  var copyInfo = {
    id: "watch.copyInfo",
    label: "Kapitel, Beschreibung und Link kopieren",
    group: "Videoseite",
    description: "Kleiner Kopieren-Button in der Aktionsleiste, funktioniert auch ohne Transkript",
    pages: ["watch"],
    stability: "mittel-hoch",
    anchors: ["watch.actions"],
    settings: {
      linkFormat: { type: "select", label: "Links als", options: [["markdown", "Markdown"], ["plain", "Nur URL"]], default: "markdown" }
    },
    hotkeys: [["info.linkHere", "Link an aktueller Stelle kopieren", "Alt+L"]],
    setup(ctx) {
      let s = ctx.settings;
      const meta = () => {
        const pr = watch.playerResponse();
        const vd = pr?.videoDetails || {};
        return { id: ctx.nav.videoId, title: vd.title || document.title.replace(/ - YouTube$/, ""), author: vd.author || "", pr };
      };
      const done2 = async (text, what) => {
        if (!text) return toast(`${what}: nichts vorhanden`, "error");
        if (await ctx.copyText(text)) toast(`${what} kopiert`);
        else textDialog(what, text);
      };
      const link = (title, sec) => s.linkFormat === "markdown" ? `[${title}](${videoLink(meta().id, sec)})` : videoLink(meta().id, sec);
      const chaptersText = (md) => {
        const m = meta();
        const ch = watch.chapters();
        if (!ch.length) return null;
        return ch.map((c) => md ? `- [${clock(c.startSec)}](${videoLink(m.id, c.startSec)}) ${c.title}` : `${clock(c.startSec)} ${c.title}`).join("\n");
      };
      const linkHere = () => {
        const t = Math.floor(player()?.getCurrentTime?.() || 0);
        done2(link(`${meta().title} @ ${clock(t)}`, t), `Link bei ${clock(t)}`);
      };
      ctx.action("info.linkHere", () => ctx.nav.page === "watch" && linkHere());
      const open = (anchor) => {
        const m = meta();
        const hasChapters = watch.chapters().length > 0;
        showMenu(anchor, [
          { title: "Kopieren" },
          { label: "Titel mit Link", run: () => done2(link(m.title), "Link") },
          { label: "Link an aktueller Stelle", sub: "Alt+L", run: linkHere },
          { label: "Kapitel (Text)", disabled: !hasChapters, run: () => done2(chaptersText(false), "Kapitel") },
          { label: "Kapitel (Markdown mit Zeitlinks)", disabled: !hasChapters, run: () => done2(`## ${m.title}

${chaptersText(true)}
`, "Kapitel") },
          { label: "Beschreibung", run: () => done2(watch.description(m.pr), "Beschreibung") }
        ]);
      };
      const mt = ctx.mount({
        id: "actions.copyInfo",
        anchor: "watch.actions",
        position: "before",
        when: () => ctx.nav.page === "watch",
        create: () => {
          const b = button({ icon: "⎘", title: "Titel, Link, Kapitel oder Beschreibung kopieren", onClick: () => open(b) });
          b.style.marginLeft = "8px";
          return b;
        }
      });
      return {
        update(next) {
          s = next;
        },
        dispose: () => mt.destroy(),
        health: () => mt.ok ? { status: "ok", detail: `${watch.chapters().length} Kapitel erkannt` } : { status: "warn", detail: "Aktionsleiste nicht gefunden" }
      };
    }
  };

  // src/features/youtube/cardExtras.js
  var BARS = ['ytd-thumbnail-overlay-resume-playback-renderer #progress[style*="width"]', 'yt-thumbnail-view-model [class*="ProgressBarSegment"][style*="width"]', 'yt-thumbnail-overlay-progress-bar-view-model [style*="width"]'];
  var progressBadge = {
    id: "thumb.progressBadge",
    label: "Fortschritt als Zahl auf Thumbnails",
    group: "Thumbnails",
    description: "„62 %“ statt nur dünnem roten Balken. Braucht Anmeldung, sonst liefert YouTube keinen Fortschritt",
    stability: "mittel",
    settings: {
      min: { type: "range", label: "Erst ab", min: 1, max: 95, step: 1, unit: "%", default: 1 },
      doneLabel: { type: "toggle", label: "Ab 95 % „✓ gesehen“ zeigen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let count = 0;
      const run2 = () => {
        count = 0;
        for (const bar of qsa(BARS.join(", "))) {
          const pct = firstInt(bar.style.width);
          const thumb = bar.closest("ytd-thumbnail, yt-thumbnail-view-model");
          if (!thumb) continue;
          let badge2 = thumb.querySelector(":scope > .ytx-badge");
          if (pct == null || pct < s.min) {
            badge2?.remove();
            continue;
          }
          const text = s.doneLabel && pct >= 95 ? "✓ gesehen" : `${pct} %`;
          if (!badge2) {
            badge2 = h("span", { class: "ytx-badge", "data-ytx-own": "" });
            if (getComputedStyle(thumb).position === "static") thumb.style.position = "relative";
            thumb.append(badge2);
          }
          if (badge2.textContent !== text) badge2.textContent = text;
          count++;
        }
      };
      return {
        onSweep: run2,
        update(next) {
          s = next;
          run2();
        },
        dispose() {
          for (const b of qsa(".ytx-badge")) b.remove();
        },
        health: () => ({ status: count ? "ok" : "skip", detail: `${count} Badges · ohne Anmeldung gibt es keinen Fortschritt` })
      };
    }
  };
  var PROXY = [
    ["share", "Teilen", "↗"],
    ["save", "Speichern", "＋"],
    ["download", "Herunterladen", "⤓"],
    ["clip", "Clip", "✂"],
    ["thanks", "Super Thanks", "♥"],
    ["like", "Like", "👍"]
  ];
  var proxyButtons = {
    id: "ui.proxyButtons",
    label: "Buttons spiegeln",
    group: "Videoseite",
    description: "Eigene Buttons an anderer Stelle, die den Original-Button fernsteuern. Das Original darf ausgeblendet sein",
    pages: ["watch"],
    stability: "mittel",
    anchors: ["top.buttons", "player.rightControls", "watch.titleRow"],
    settings: {
      buttons: { type: "multi", label: "Buttons", options: PROXY.map(([id, l]) => [id, l]), default: ["share", "save"] },
      placement: { type: "select", label: "Position", options: [["watch.titleRow", "Unter dem Titel"], ["top.buttons", "Kopfzeile"], ["player.rightControls", "Player rechts"]], default: "watch.titleRow" },
      labels: { type: "toggle", label: "Beschriftung zeigen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let missing = [];
      let m = null;
      const clickOriginal = (id) => {
        const orig = document.querySelector(`ytd-watch-metadata [data-ytx-btn="${id}"] button, ytd-watch-metadata [data-ytx-btn="${id}"] a, ytd-watch-metadata [data-ytx-btn="${id}"]`);
        if (!orig) return false;
        orig.click();
        return true;
      };
      const build = () => {
        m?.destroy();
        m = ctx.mount({
          id: "proxy.buttons",
          anchor: s.placement,
          position: s.placement === "player.rightControls" ? "prepend" : "append",
          when: () => ctx.nav.page === "watch",
          create: () => {
            const row2 = h("div", { style: { display: "inline-flex", gap: "6px", alignItems: "center", margin: s.placement === "watch.titleRow" ? "8px 0" : "0 6px" } });
            for (const [id, label, icon] of PROXY) {
              if (!s.buttons.includes(id)) continue;
              const b = button({ label: s.labels ? label : "", icon, small: true, title: label, onClick: () => clickOriginal(id) });
              b.dataset.proxy = id;
              row2.append(b);
            }
            return row2;
          },
          update: (node) => {
            missing = [];
            for (const b of node.querySelectorAll("[data-proxy]")) {
              const ok = !!document.querySelector(`ytd-watch-metadata [data-ytx-btn="${b.dataset.proxy}"]`);
              b.disabled = !ok;
              if (!ok) missing.push(b.dataset.proxy);
            }
          }
        });
      };
      build();
      return {
        update(next) {
          s = next;
          build();
        },
        dispose: () => m?.destroy(),
        health: () => m?.ok ? { status: missing.length ? "warn" : "ok", detail: missing.length ? `Original fehlt: ${missing.join(", ")} (evtl. im ⋯-Menü oder nicht angemeldet)` : "alle Originale gefunden" } : { status: "warn", detail: "Anker nicht gefunden" }
      };
    }
  };

  // src/features/youtube/index.js
  var featureManifests = [transcript_default, copyInfo, duration_default, sort_default, dimWatched_default, endsAt, publishDate, progressBadge, proxyButtons];

  // src/profiles/youtube.js
  var H = "hide";
  var C = "collapse";
  var tidyDisplay = {
    "guide.shorts": H,
    "guide.explore": H,
    "guide.moreYT": H,
    "guide.footer": H,
    "top.create": H,
    "top.voice": H,
    "home.shortsShelf": H,
    "home.chips": H,
    "home.shelves": H,
    "home.banner": H,
    "watch.sidebar": C,
    "watch.comments": C,
    "watch.shortsShelf": H,
    "watch.merch": H,
    "watch.ads": H,
    "watch.ambient": H,
    "watch.infoCards": H,
    "watch.btn.download": H,
    "watch.btn.clip": H,
    "watch.btn.thanks": H,
    "watch.btn.ask": H,
    "watch.btn.join": H,
    "player.endscreen": H,
    "player.cards": H,
    "player.pauseOverlay": H,
    "player.paidPromo": H,
    "player.watermark": H,
    "player.btn.cast": H,
    "thumb.hoverPreview": H,
    "search.shorts": H,
    "search.peopleAlsoSearch": H,
    "search.shelves": H,
    "search.ads": H,
    "channel.shortsTab": H,
    "channel.shortsShelf": H,
    "subs.shorts": H
  };
  var tidyFeatures = {
    "transcript.copy": { enabled: true },
    "watch.copyInfo": { enabled: true },
    "playlist.duration": { enabled: true },
    "playlist.dimWatched": { enabled: false },
    "playlist.sort": { enabled: true },
    "player.endsAt": { enabled: true },
    "watch.publishDate": { enabled: true },
    "thumb.progressBadge": { enabled: true },
    "ui.proxyButtons": { enabled: false }
  };
  var templates = [
    {
      id: "youtube",
      name: "YouTube (Original)",
      description: "Nichts verändert. Zum Vergleichen und als Notausgang",
      config: () => ({})
    },
    {
      id: "aufgeraeumt",
      name: "Aufgeräumt",
      description: "Shorts und Ablenkungen weg, nützliche Features an",
      config: () => ({
        display: { ...tidyDisplay },
        behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true },
        filters: { enabled: true, mode: "dim", shorts: true, pages: ["home", "subscriptions", "search", "watch"] },
        features: structuredClone(tidyFeatures)
      })
    },
    {
      id: "fokus",
      name: "Fokus",
      description: "Radikal: keine Startseite, keine Empfehlungen, keine Thumbnails",
      config: () => ({
        display: {
          ...tidyDisplay,
          "guide.subs": C,
          "top.notifications": H,
          "home.feedAll": H,
          "watch.sidebar": H,
          "watch.comments": H,
          "watch.chat": C,
          "watch.btn.likeCount": H,
          "player.btn.autoplay": H,
          "thumb.image": H
        },
        layout: { presets: { watch: "focus", subscriptions: "list" } },
        behavior: { shortsRedirect: true, autoplayOff: true, channelTrailerPause: true, homeRedirect: "/feed/subscriptions" },
        filters: { enabled: true, mode: "hide", shorts: true, pages: ["home", "subscriptions", "search", "watch", "channel"] },
        features: structuredClone(tidyFeatures)
      })
    }
  ];
  var templateById = Object.fromEntries(templates.map((t) => [t.id, t]));
  var DEFAULT_ACTIVE = "aufgeraeumt";

  // src/sites/youtube.js
  var youtubeSite = {
    id: "youtube",
    label: "YouTube",
    appHost: "ytd-app",
    pageFromUrl,
    videoIdFromUrl,
    PAGE_LABELS,
    targets,
    GROUPS,
    targetById,
    anchors,
    tagRules,
    look: { colorControls, controls, themes, LOOK_GROUPS, controlById, tokenScope: TOKEN_SCOPE, extraCss },
    presets: { layoutPresets, presetById, LAYOUT_PAGES, orderGroups, topbarModes, topbarCss },
    behaviors,
    behaviorById,
    features: featureManifests,
    templates,
    filters: { pages: FILTER_PAGES, CARD_SELECTORS, CARD_PARENT, readCard, activePageRoots },
    panelTabs: ["display", "look", "layout", "behavior", "filters", "features", "profiles", "diagnose"],
    boot() {
      initTimedtextCapture();
    }
  };

  // src/registry/music/targets.js
  var GROUPS2 = ["Navigation", "Werbung & Premium", "Startseite", "Entdecken", "Player", "Playerleiste", "Suche", "Künstlerseite"];
  var targets2 = [
    // navigation
    {
      id: "m.guide.samples",
      label: "Samples",
      group: "Navigation",
      modes: SH,
      sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="samples"]', 'ytmusic-pivot-bar-item-renderer[data-ytx-mguide="samples"]']
    },
    {
      id: "m.guide.explore",
      label: "Entdecken",
      group: "Navigation",
      modes: SH,
      sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="explore"]']
    },
    {
      id: "m.guide.upgrade",
      label: "Upgrade / Premium",
      group: "Navigation",
      modes: SH,
      sel: ['ytmusic-guide-entry-renderer[data-ytx-mguide="upgrade"]', 'ytmusic-pivot-bar-item-renderer[data-ytx-mguide="upgrade"]']
    },
    {
      id: "m.guide.playlists",
      label: "Playlists in der Seitenleiste",
      group: "Navigation",
      modes: SDCH,
      sel: ['ytmusic-guide-section-renderer[data-ytx-mguide-section="playlists"]']
    },
    {
      id: "m.guide.signin",
      label: "Anmelde-Hinweis in der Seitenleiste",
      group: "Navigation",
      modes: SH,
      sel: ["ytmusic-guide-signin-promo-renderer"]
    },
    {
      id: "m.nav.cast",
      label: "Cast-Button",
      group: "Navigation",
      modes: SH,
      sel: ["ytmusic-nav-bar ytmusic-cast-button", "ytmusic-nav-bar .cast-button"]
    },
    {
      id: "m.nav.history",
      label: "Verlaufs-Button oben",
      group: "Navigation",
      modes: SH,
      sel: ["ytmusic-nav-bar .history-icon-button"]
    },
    // werbung und premium
    {
      id: "m.promo.mealbar",
      label: "Premium-Hinweisleisten",
      group: "Werbung & Premium",
      modes: SH,
      sel: ["ytmusic-mealbar-promo-renderer", "ytmusic-statement-banner-renderer", "ytmusic-popup-container ytmusic-mealbar-promo-renderer", "tp-yt-paper-toast:has(ytmusic-notification-action-renderer [data-ytx-mpromo])"]
    },
    {
      id: "m.promo.background",
      label: "Premium-Werbekarten",
      group: "Werbung & Premium",
      modes: SH,
      sel: ["ytmusic-background-promo-renderer", 'ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="promo"]', "ytmusic-message-renderer[data-ytx-mpromo]"]
    },
    {
      id: "m.promo.upsell",
      label: "Upsell-Dialoge („Hintergrundwiedergabe mit Premium“)",
      group: "Werbung & Premium",
      modes: SH,
      note: "Blendet den Dialog nur aus, die Funktion bleibt Premium",
      sel: ["tp-yt-paper-dialog:has(ytmusic-mealbar-promo-renderer)", "ytmusic-upsell-dialog-renderer", "tp-yt-paper-dialog:has(ytmusic-upsell-dialog-renderer)"]
    },
    // startseite
    {
      id: "m.home.chips",
      label: "Stimmungs-Chips oben",
      group: "Startseite",
      pages: ["home"],
      modes: SDH,
      sel: ["ytmusic-browse-response ytmusic-section-list-renderer > #header ytmusic-chip-cloud-renderer"]
    },
    {
      id: "m.home.podcastChip",
      label: "Podcast-Chip",
      group: "Startseite",
      pages: ["home"],
      modes: SH,
      sel: ['ytmusic-chip-cloud-chip-renderer[data-ytx-mchip="podcasts"]']
    },
    {
      id: "m.home.podcasts",
      label: "Podcast-Regale",
      group: "Startseite",
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="podcast"]', 'ytmusic-shelf-renderer[data-ytx-mshelf-kind="podcast"]']
    },
    {
      id: "m.home.videos",
      label: "Musikvideo-Regale",
      group: "Startseite",
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
    },
    {
      id: "m.home.samplesShelf",
      label: "Samples-/Kurzvideo-Regale",
      group: "Startseite",
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="samples"]', "ytmusic-immersive-carousel-shelf-renderer"]
    },
    {
      id: "m.home.playlists",
      label: "Playlist-Empfehlungen",
      group: "Startseite",
      pages: ["home"],
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="playlist"]']
    },
    {
      id: "m.home.background",
      label: "Großes Hintergrundbild",
      group: "Startseite",
      modes: SH,
      sel: ["ytmusic-browse-response > #background", "ytmusic-browse-response #background ytmusic-fullbleed-thumbnail-renderer"]
    },
    // entdecken
    {
      id: "m.explore.newVideos",
      label: "Neue Musikvideos",
      group: "Entdecken",
      pages: ["explore"],
      modes: SDCH,
      sel: ['ytmusic-browse-response ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
    },
    {
      id: "m.explore.podcasts",
      label: "Podcasts auf Entdecken",
      group: "Entdecken",
      pages: ["explore"],
      modes: SDCH,
      sel: ['ytmusic-browse-response ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="podcast"]']
    },
    // player seite
    {
      id: "m.player.comments",
      label: "Kommentare-Tab",
      group: "Player",
      modes: SH,
      sel: ['ytmusic-player-page tp-yt-paper-tab[data-ytx-mtab="comments"]']
    },
    {
      id: "m.player.related",
      label: "Ähnliche-Titel-Tab",
      group: "Player",
      modes: SH,
      sel: ['ytmusic-player-page tp-yt-paper-tab[data-ytx-mtab="related"]']
    },
    {
      id: "m.player.avToggle",
      label: "Titel/Video-Umschalter",
      group: "Player",
      modes: SH,
      sel: ["ytmusic-player-page ytmusic-av-toggle"]
    },
    {
      id: "m.player.chips",
      label: "Warteschlangen-Chips (Stimmung/Filter)",
      group: "Player",
      modes: SDH,
      sel: ["ytmusic-player-queue ytmusic-chip-cloud-renderer", "ytmusic-tab-renderer ytmusic-chip-cloud-renderer"]
    },
    {
      id: "m.player.video",
      label: "Video/Albumcover im Player",
      group: "Player",
      radical: true,
      modes: SDH,
      sel: ["ytmusic-player-page #player", "ytmusic-player-page #song-image"]
    },
    // playerleiste
    {
      id: "m.bar.volume",
      label: "Lautstärke-Regler",
      group: "Playerleiste",
      modes: SH,
      sel: ["ytmusic-player-bar #volume-slider", "ytmusic-player-bar .volume"]
    },
    {
      id: "m.bar.repeatShuffle",
      label: "Wiederholen & Zufall",
      group: "Playerleiste",
      modes: SH,
      sel: ["ytmusic-player-bar .repeat", "ytmusic-player-bar .shuffle"]
    },
    {
      id: "m.bar.dislike",
      label: "Dislike-Button",
      group: "Playerleiste",
      modes: SH,
      sel: ["ytmusic-player-bar ytmusic-like-button-renderer #button-shape-dislike", "ytmusic-player-bar ytmusic-like-button-renderer .dislike"]
    },
    {
      id: "m.bar.thumbnail",
      label: "Cover in der Playerleiste",
      group: "Playerleiste",
      modes: SH,
      sel: ["ytmusic-player-bar .thumbnail-image-wrapper"]
    },
    // suche
    {
      id: "m.search.podcasts",
      label: "Podcasts & Folgen in der Suche",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="podcast"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="podcast"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="episode"]']
    },
    {
      id: "m.search.videos",
      label: "Videos in der Suche",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="video"]']
    },
    {
      id: "m.search.profiles",
      label: "Profile in der Suche",
      group: "Suche",
      pages: ["search"],
      modes: SDCH,
      sel: ['ytmusic-shelf-renderer[data-ytx-mshelf-kind="profile"]', 'ytmusic-responsive-list-item-renderer[data-ytx-mitem="profile"]']
    },
    // kuenstler
    {
      id: "m.artist.videos",
      label: "Videos-Regal",
      group: "Künstlerseite",
      pages: ["artist"],
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="video"]']
    },
    {
      id: "m.artist.featured",
      label: "Playlists mit dem Künstler",
      group: "Künstlerseite",
      pages: ["artist"],
      modes: SDCH,
      sel: ['ytmusic-carousel-shelf-renderer[data-ytx-mshelf-kind="playlist"]']
    }
  ];
  var targetById2 = Object.fromEntries(targets2.map((t) => [t.id, t]));

  // src/registry/music/anchors.js
  var anchors2 = {
    "top.buttons": {
      label: "Kopfzeile rechts",
      sel: ["ytmusic-nav-bar #right-content", "ytmusic-nav-bar .right-content"]
    },
    "m.bar.right": {
      label: "Playerleiste rechts",
      sel: ["ytmusic-player-bar .right-controls-buttons", "ytmusic-player-bar #right-controls"]
    },
    "m.bar.info": {
      label: "Playerleiste Titelinfo",
      sel: ["ytmusic-player-bar .content-info-wrapper", "ytmusic-player-bar .middle-controls"]
    },
    "m.bar.middleButtons": {
      label: "Playerleiste neben Like",
      sel: ["ytmusic-player-bar .middle-controls-buttons"]
    },
    "m.player.tabs": {
      label: "Tab-Leiste im Player",
      sel: ["ytmusic-player-page tp-yt-paper-tabs.tab-header-container", "ytmusic-player-page #side-panel tp-yt-paper-tabs"]
    },
    "m.player.tabContent": {
      label: "Tab-Inhalt im Player",
      sel: ["ytmusic-player-page ytmusic-tab-renderer#tab-renderer"]
    },
    "m.queue.top": {
      label: "Warteschlange oben",
      sel: ["ytmusic-player-page ytmusic-player-queue", "ytmusic-player-page #queue"]
    },
    "m.lyrics": {
      label: "Songtext im Player",
      visibleOnly: true,
      sel: ["ytmusic-player-page ytmusic-tab-renderer ytmusic-description-shelf-renderer", "ytmusic-player-page ytmusic-tab-renderer ytmusic-message-renderer"]
    },
    "m.browse.top": {
      label: "Seitenanfang (Startseite, Entdecken)",
      visibleOnly: true,
      sel: ["ytmusic-browse-response:not([hidden]) ytmusic-section-list-renderer > #contents", "ytmusic-browse-response:not([hidden]) #content-wrapper"]
    },
    "m.header.buttons": {
      label: "Kopfbereich Künstler/Album/Playlist",
      visibleOnly: true,
      sel: [
        "ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer .action-buttons",
        "ytmusic-browse-response:not([hidden]) ytmusic-immersive-header-renderer .buttons",
        "ytmusic-browse-response:not([hidden]) ytmusic-visual-header-renderer .buttons",
        "ytmusic-browse-response:not([hidden]) ytmusic-detail-header-renderer .buttons"
      ]
    },
    "m.header.title": {
      label: "Titel im Kopfbereich",
      visibleOnly: true,
      sel: [
        "ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer .strapline",
        "ytmusic-browse-response:not([hidden]) ytmusic-responsive-header-renderer h1",
        "ytmusic-browse-response:not([hidden]) ytmusic-immersive-header-renderer h1",
        "ytmusic-browse-response:not([hidden]) ytmusic-visual-header-renderer h1"
      ]
    },
    "m.search.top": {
      label: "Suchergebnisse oben",
      visibleOnly: true,
      sel: ["ytmusic-search-page ytmusic-tabbed-search-results-renderer", "ytmusic-search-page #contents"]
    }
  };

  // src/registry/music/parse.js
  var runsText2 = (t) => t ? t.simpleText ?? (t.runs || []).map((r) => r.text).join("") : "";
  function pageTypeOf(ep) {
    const t = ep?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || "";
    return t.replace("MUSIC_PAGE_TYPE_", "");
  }
  function videoTypeOf(ep) {
    return (ep?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType || "").replace("MUSIC_VIDEO_TYPE_", "");
  }
  var YEAR = /^(19|20)\d{2}$/;
  function parseByline(runs = []) {
    const artists = [];
    let album = null;
    let year = null;
    let owner = null;
    for (const r of runs) {
      const ep = r.navigationEndpoint;
      const id = ep?.browseEndpoint?.browseId;
      const pt = pageTypeOf(ep);
      const text = (r.text || "").trim();
      if (id && (pt === "ARTIST" || !pt && /^UC/.test(id))) artists.push({ id, name: text });
      else if (id && pt === "ALBUM") album = { id, name: text };
      else if (id && pt === "USER_CHANNEL") owner = { id, name: text };
      else if (YEAR.test(text)) year = Number(text);
    }
    return { artists, album, year, owner };
  }
  function splitArtistNames(text) {
    return String(text || "").split(/\s*(?:,|&| und | and | x | feat\.? | ft\.? )\s*/i).map((s) => s.trim()).filter(Boolean);
  }
  var flexRuns = (r, i) => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
  var fixedText = (r) => (r.fixedColumns || []).map((c) => runsText2(c.musicResponsiveListItemFixedColumnRenderer?.text)).join(" ");
  function thumbOf(r) {
    const list = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || r?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || r?.thumbnail?.thumbnails || [];
    return list.length ? list[Math.min(list.length - 1, 1)].url : "";
  }
  function parseListItem(r) {
    if (!r) return null;
    const title = runsText2({ runs: flexRuns(r, 0) });
    const videoId = r.playlistItemData?.videoId || flexRuns(r, 0)[0]?.navigationEndpoint?.watchEndpoint?.videoId || null;
    const playEp = r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
    const vType = videoTypeOf(playEp) || videoTypeOf(flexRuns(r, 0)[0]?.navigationEndpoint);
    const allRuns = [...flexRuns(r, 1), ...flexRuns(r, 2), ...flexRuns(r, 3)];
    const by = parseByline(allRuns);
    const thumbnail = thumbOf(r);
    if (videoId) {
      if (vType === "PODCAST_EPISODE") return { type: "episode", videoId, title, thumbnail };
      const durationSec = parseDuration(fixedText(r)) ?? parseDuration(runsText2({ runs: allRuns.filter((x) => /^\d+:\d{2}/.test(x.text || "")) }));
      if (!by.artists.length) {
        const plain = runsText2({ runs: flexRuns(r, 1) });
        if (plain && !/\d/.test(plain)) by.artists.push(...splitArtistNames(plain).map((name) => ({ id: null, name })));
      }
      return {
        type: vType === "OMV" || vType === "UGC" ? "video" : "song",
        videoId,
        title,
        artists: by.artists,
        album: by.album,
        year: by.year,
        durationSec,
        videoType: vType || null,
        thumbnail,
        setVideoId: r.playlistItemData?.playlistSetVideoId || null
      };
    }
    const ep = r.navigationEndpoint;
    const id = ep?.browseEndpoint?.browseId;
    const pt = pageTypeOf(ep);
    if (!id) return null;
    if (pt === "ARTIST") return { type: "artist", id, name: title, thumbnail };
    if (pt === "ALBUM") return { type: "album", id, title, artists: by.artists, year: by.year, thumbnail };
    if (pt === "PLAYLIST") return { type: "playlist", id: id.replace(/^VL/, ""), title, owner: by.owner, editorial: !by.owner, thumbnail };
    if (pt === "PODCAST_SHOW_DETAIL_PAGE") return { type: "podcast", id, title, thumbnail };
    if (pt === "USER_CHANNEL") return { type: "profile", id, name: title, thumbnail };
    return { type: "other", id, title, pageType: pt };
  }
  function parseTwoRow(r) {
    if (!r) return null;
    const ep = r.navigationEndpoint;
    const title = runsText2(r.title);
    const subRuns = r.subtitle?.runs || [];
    const by = parseByline(subRuns);
    const thumbnail = thumbOf(r);
    if (ep?.watchEndpoint?.videoId) {
      const vType = videoTypeOf(ep);
      return { type: vType === "ATV" ? "song" : "video", videoId: ep.watchEndpoint.videoId, title, artists: by.artists, album: by.album, year: by.year, videoType: vType || null, thumbnail };
    }
    const id = ep?.browseEndpoint?.browseId;
    const pt = pageTypeOf(ep);
    if (!id) return null;
    if (pt === "ARTIST") return { type: "artist", id, name: title, subtitle: runsText2(r.subtitle), thumbnail };
    if (pt === "ALBUM") {
      const parts = runsText2(r.subtitle).split("•").map((s) => s.trim()).filter(Boolean);
      const kind = parts.length > 1 && !YEAR.test(parts[0]) ? parts[0] : "Album";
      return { type: "album", id, title, kind, year: by.year ?? firstYear(parts), artists: by.artists, thumbnail };
    }
    if (pt === "PLAYLIST") return { type: "playlist", id: id.replace(/^VL/, ""), title, owner: by.owner, editorial: !by.owner && !subRuns.some((x) => x.navigationEndpoint), subtitle: runsText2(r.subtitle), thumbnail };
    if (pt === "PODCAST_SHOW_DETAIL_PAGE") return { type: "podcast", id, title, thumbnail };
    return { type: "other", id, title, pageType: pt };
  }
  var firstYear = (parts) => {
    const y = parts.find((p) => YEAR.test(p));
    return y ? Number(y) : null;
  };
  function parseItem(it) {
    if (!it) return null;
    if (it.musicResponsiveListItemRenderer) return parseListItem(it.musicResponsiveListItemRenderer);
    if (it.musicTwoRowItemRenderer) return parseTwoRow(it.musicTwoRowItemRenderer);
    return null;
  }
  function sectionsOf(data2) {
    const c = data2?.contents;
    return c?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || c?.twoColumnBrowseResultsRenderer?.secondaryContents?.sectionListRenderer?.contents || c?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || c?.sectionListRenderer?.contents || [];
  }
  function parseShelves(data2) {
    const out = [];
    for (const s of sectionsOf(data2)) {
      const key = Object.keys(s)[0];
      const v = s[key];
      const head = v?.header?.musicCarouselShelfBasicHeaderRenderer;
      const items = (v?.contents || []).map(parseItem).filter(Boolean);
      out.push({
        kind: key,
        title: runsText2(head?.title) || runsText2(v?.title),
        more: head?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint?.browseId || null,
        items
      });
    }
    return out;
  }
  function parseArtistPage(data2, browseId = null) {
    const header = data2?.header?.musicImmersiveHeaderRenderer || data2?.header?.musicVisualHeaderRenderer || {};
    const shelves = parseShelves(data2);
    const artist = { id: browseId, name: runsText2(header.title), channelId: header.subscriptionButton?.subscribeButtonRenderer?.channelId || null, topSongs: [], releases: [], videos: [], featuredOn: [], ownPlaylists: [], similar: [] };
    for (const sh of shelves) {
      for (const it of sh.items) {
        if (it.type === "song" && sh.kind === "musicShelfRenderer") artist.topSongs.push(it);
        else if (it.type === "album") artist.releases.push(it);
        else if (it.type === "video" || it.type === "song" && sh.kind !== "musicShelfRenderer") artist.videos.push(it);
        else if (it.type === "playlist") (it.editorial ? artist.featuredOn : artist.ownPlaylists).push(it);
        else if (it.type === "artist") artist.similar.push(it);
      }
    }
    if (!artist.id) artist.id = artist.topSongs.flatMap((s) => s.artists).find((a) => a.name === artist.name)?.id || null;
    for (const r of artist.releases) if (!r.artists.length && artist.id) r.artists = [{ id: artist.id, name: artist.name }];
    return artist;
  }
  function responsiveHeader(data2) {
    const tabs = data2?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    for (const t of tabs) if (t.musicResponsiveHeaderRenderer) return t.musicResponsiveHeaderRenderer;
    return data2?.header?.musicDetailHeaderRenderer || data2?.header?.musicResponsiveHeaderRenderer || null;
  }
  function parseCollectionPage(data2, params = {}) {
    const h2 = responsiveHeader(data2) || {};
    const pageType = (params.browseEndpointContextSupportedConfigs ? JSON.parse(params.browseEndpointContextSupportedConfigs)?.browseEndpointContextMusicConfig?.pageType : "")?.replace("MUSIC_PAGE_TYPE_", "") || "";
    const straps = parseByline(h2.straplineTextOne?.runs || []);
    const subParts = runsText2(h2.subtitle).split("•").map((s) => s.trim());
    const tracks = [];
    const related = [];
    for (const s of sectionsOf(data2)) {
      const v = s.musicShelfRenderer || s.musicPlaylistShelfRenderer;
      if (v) for (const it of v.contents || []) {
        const p = parseItem(it);
        if (p && (p.type === "song" || p.type === "video")) tracks.push(p);
      }
      if (s.musicCarouselShelfRenderer) related.push(...(s.musicCarouselShelfRenderer.contents || []).map(parseItem).filter(Boolean));
    }
    const artists = straps.artists;
    const year = firstYear(subParts) ?? straps.year;
    const isAlbum = pageType === "ALBUM" || /^MPREb_/.test(params.browseId || "");
    if (isAlbum) for (const t of tracks) {
      t.type = "song";
      if (!t.artists.length || t.artists.every((a) => !a.id)) t.artists = artists.length ? artists : t.artists;
      t.album ||= { id: params.browseId || null, name: runsText2(h2.title) };
      t.year ??= year;
    }
    return {
      type: isAlbum ? "album" : "playlist",
      id: (params.browseId || "").replace(/^VL/, "") || null,
      title: runsText2(h2.title),
      kind: subParts.length > 1 ? subParts[0] : null,
      year,
      artists,
      trackCount: firstInt(runsText2(h2.secondSubtitle)),
      tracks,
      related
    };
  }
  function parseSearchPage(data2) {
    const out = { songs: [], videos: [], artists: [], albums: [], playlists: [], podcasts: [], top: null };
    for (const s of sectionsOf(data2)) {
      if (s.musicCardShelfRenderer) {
        const c = s.musicCardShelfRenderer;
        const ep = c.title?.runs?.[0]?.navigationEndpoint;
        out.top = { title: runsText2(c.title), subtitle: runsText2(c.subtitle), id: ep?.browseEndpoint?.browseId || ep?.watchEndpoint?.videoId || null, pageType: pageTypeOf(ep) };
        continue;
      }
      const v = s.itemSectionRenderer || s.musicShelfRenderer;
      for (const it of v?.contents || []) {
        const p = parseItem(it);
        if (!p) continue;
        if (p.type === "song") out.songs.push(p);
        else if (p.type === "video") out.videos.push(p);
        else if (p.type === "artist") out.artists.push(p);
        else if (p.type === "album") out.albums.push(p);
        else if (p.type === "playlist") out.playlists.push(p);
        else if (p.type === "podcast" || p.type === "episode") out.podcasts.push(p);
      }
    }
    return out;
  }
  function parseMoodsPage(data2) {
    const groups = [];
    const walk = (o, d = 0) => {
      if (!o || typeof o !== "object" || d > 20) return;
      if (o.gridRenderer) {
        const g = o.gridRenderer;
        groups.push({
          title: runsText2(g.header?.gridHeaderRenderer?.title),
          items: (g.items || []).map((i) => i.musicNavigationButtonRenderer).filter(Boolean).map((b) => ({ name: runsText2(b.buttonText), params: b.clickCommand?.browseEndpoint?.params || null, browseId: b.clickCommand?.browseEndpoint?.browseId || null }))
        });
        return;
      }
      for (const k of Object.keys(o)) walk(o[k], d + 1);
    };
    walk(data2);
    return { moods: groups[0]?.items || [], genres: groups[1]?.items || [], groups };
  }
  function parseQueueItem(item) {
    const r = item?.playlistPanelVideoRenderer || item?.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer;
    if (!r) return null;
    const counterpart = item?.playlistPanelVideoWrapperRenderer?.counterpart?.[0]?.counterpartRenderer?.playlistPanelVideoRenderer;
    const by = parseByline(r.longBylineText?.runs || r.shortBylineText?.runs || []);
    if (!by.artists.length) {
      const first = runsText2(r.shortBylineText || r.longBylineText).split("•")[0];
      by.artists.push(...splitArtistNames(first).map((name) => ({ id: null, name })));
    }
    return {
      type: "song",
      videoId: r.videoId,
      counterpartVideoId: counterpart?.videoId || null,
      title: runsText2(r.title),
      artists: by.artists,
      album: by.album,
      year: by.year,
      durationSec: parseDuration(runsText2(r.lengthText)),
      selected: !!r.selected,
      setVideoId: r.playlistSetVideoId || null,
      thumbnail: (r.thumbnail?.thumbnails || [])[0]?.url || ""
    };
  }

  // src/registry/music/tags.js
  var TAG_ATTRS = ["data-ytx-mguide", "data-ytx-mguide-section", "data-ytx-mshelf-kind", "data-ytx-mitem", "data-ytx-mchip", "data-ytx-mtab", "data-ytx-mpromo"];
  function guideName(d) {
    const id = d?.navigationEndpoint?.browseEndpoint?.browseId || "";
    const icon = String(d?.icon?.iconType || "");
    if (id === "FEmusic_home") return "home";
    if (id === "FEmusic_explore") return "explore";
    if (id === "FEmusic_library_landing") return "library";
    if (/immersive|samples/i.test(id) || /SAMPLES|SHORTS|IMMERSIVE/.test(icon)) return "samples";
    if (/^SP|unlimited/i.test(id) || /UNLIMITED|PREMIUM|UPGRADE/.test(icon) || d?.navigationEndpoint?.urlEndpoint) return "upgrade";
    return null;
  }
  function chipKind(d) {
    const params = d?.navigationEndpoint?.browseEndpoint?.params;
    if (params) {
      try {
        const bin = atob(params.replace(/-/g, "+").replace(/_/g, "/"));
        if (bin.includes("\b\f")) return "podcasts";
      } catch {
      }
    }
    return null;
  }
  function shelfKind(d) {
    const items = d?.contents || [];
    const counts2 = {};
    for (const it of items.slice(0, 12)) {
      const key = Object.keys(it || {})[0];
      if (key === "musicMultiRowListItemRenderer") {
        counts2.podcast = (counts2.podcast || 0) + 1;
        continue;
      }
      const p = parseItem(it);
      if (!p) continue;
      let k = p.type;
      if (k === "episode") k = "podcast";
      counts2[k] = (counts2[k] || 0) + 1;
    }
    const ep = d?.header?.musicCarouselShelfBasicHeaderRenderer?.moreContentButton?.buttonRenderer?.navigationEndpoint;
    if (/immersive/i.test(ep?.browseEndpoint?.browseId || "")) return "samples";
    const top2 = Object.entries(counts2).sort((a, b) => b[1] - a[1])[0];
    return top2 ? top2[0] : null;
  }
  var tagRules2 = [
    {
      id: "m.guide",
      label: "Seitenleisten-Einträge",
      core: true,
      run() {
        let n = 0;
        for (const el of qsa("ytmusic-guide-entry-renderer, ytmusic-pivot-bar-item-renderer")) {
          const name = guideName(dataOf(el));
          if (name) {
            if (el.getAttribute("data-ytx-mguide") !== name) el.setAttribute("data-ytx-mguide", name);
            n++;
          }
        }
        for (const sec of qsa("ytmusic-guide-section-renderer")) {
          const d = dataOf(sec);
          const entries2 = (d?.items || []).map((x) => Object.keys(x || {})[0]);
          const kind = entries2.some((k) => k === "guideEntryRenderer") && (d?.items || []).some((x) => x.guideEntryRenderer?.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("VL")) ? "playlists" : null;
          if (kind) {
            sec.setAttribute("data-ytx-mguide-section", kind);
            n++;
          }
        }
        return n;
      }
    },
    {
      id: "m.shelves",
      label: "Regale nach Inhalt",
      run() {
        let n = 0;
        for (const el of qsa("ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer")) {
          const d = dataOf(el);
          if (!d) continue;
          if (el.__ytxShelfData === d) {
            n++;
            continue;
          }
          el.__ytxShelfData = d;
          const kind = shelfKind(d);
          if (kind) el.setAttribute("data-ytx-mshelf-kind", kind);
          else el.removeAttribute("data-ytx-mshelf-kind");
          n++;
        }
        return n;
      }
    },
    {
      id: "m.items",
      label: "Listeneinträge nach Typ",
      pages: ["search", "library", "artist", "other"],
      run() {
        let n = 0;
        for (const el of qsa("ytmusic-responsive-list-item-renderer")) {
          const d = dataOf(el);
          if (!d || el.__ytxItemData === d) continue;
          el.__ytxItemData = d;
          const p = parseItem({ musicResponsiveListItemRenderer: d });
          if (p?.type) {
            el.setAttribute("data-ytx-mitem", p.type);
            n++;
          }
        }
        return n;
      }
    },
    {
      id: "m.chips",
      label: "Chips",
      pages: ["home"],
      run() {
        let n = 0;
        for (const el of qsa("ytmusic-chip-cloud-chip-renderer")) {
          const k = chipKind(dataOf(el));
          if (k) {
            el.setAttribute("data-ytx-mchip", k);
            n++;
          }
        }
        return n;
      }
    },
    {
      id: "m.playerTabs",
      label: "Player-Tabs",
      run() {
        const tabs = qsa("ytmusic-player-page tp-yt-paper-tab");
        const page = document.querySelector("ytmusic-player-page");
        const st = page?.polymerController?.store?.getState?.() || document.querySelector("ytmusic-app")?.polymerController?.store?.getState?.();
        const data2 = st?.playerPage?.playerPageTabs || [];
        let n = 0;
        tabs.forEach((el, i) => {
          const t = data2[i]?.tabRenderer;
          const pt = t?.endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType || "";
          const id = t?.endpoint?.browseEndpoint?.browseId || "";
          let name = null;
          if (t?.content?.musicQueueRenderer) name = "queue";
          else if (t?.content?.sectionListRenderer && !t.endpoint) name = "comments";
          else if (id.startsWith("MPLYt") || /LYRICS/.test(pt)) name = "lyrics";
          else if (/COMMENT/.test(pt) || /comment/i.test(id)) name = "comments";
          else if (id.startsWith("MPTRt") || /TRACK_RELATED/.test(pt)) name = "related";
          if (name) {
            el.setAttribute("data-ytx-mtab", name);
            n++;
          }
        });
        return n;
      }
    }
  ];

  // src/registry/music/look.js
  var T = (name) => `--ytmusic-${name}`;
  var TOKEN_SCOPE2 = "html:root:root, html:root:root body, html:root:root ytmusic-app, html:root:root ytmusic-player-page, html:root:root ytmusic-player-bar";
  var LOOK_GROUPS2 = ["Farben", "Dichte", "Typografie", "Player", "Allgemein"];
  var colorControls2 = [
    {
      id: "bg",
      label: "Hintergrund",
      tokens: [T("background"), T("general-background-c"), T("nav-bar"), T("player-page-background"), T("color-black4")],
      extra: (v) => `html:root body, ytmusic-app-layout #nav-bar-background, ytmusic-app-layout #mini-guide-background, ytmusic-app-layout #guide-wrapper, ytmusic-browse-response #background { background-color: ${v} !important; }`
    },
    { id: "raised", label: "Flächen & Karten", tokens: [T("brand-background-solid"), T("color-black1"), T("color-black2"), T("search-background"), T("horizontal-action-card-background")] },
    { id: "menu", label: "Menüs & Dialoge", tokens: [], extra: (v) => `ytmusic-menu-popup-renderer, tp-yt-paper-listbox, ytmusic-dialog, tp-yt-paper-dialog, ytmusic-search-suggestions-section { background-color: ${v} !important; }` },
    { id: "text", label: "Text", tokens: [T("text-primary"), T("color-white1")] },
    { id: "textSecondary", label: "Text gedimmt", tokens: [T("text-secondary"), T("overlay-text-secondary"), T("search-box-text-secondary")] },
    { id: "accent", label: "Akzent & Links", tokens: [T("search-suggestion-focus-active")], extra: (v) => `ytmusic-app a.yt-simple-endpoint:hover, ytmusic-chip-cloud-chip-renderer[is-selected] { color: ${v} !important; }` },
    { id: "outline", label: "Rahmen & Trenner", tokens: [T("divider"), T("guide-divider"), T("search-border"), T("search-bar-border-bauhaus")] },
    {
      id: "playerBar",
      label: "Playerleiste",
      tokens: [T("player-bar-background")],
      extra: (v) => `ytmusic-player-bar, ytmusic-app-layout #player-bar-background { background: ${v} !important; }`
    },
    {
      id: "progress",
      label: "Fortschrittsbalken",
      tokens: [],
      extra: (v) => `ytmusic-player-bar #progress-bar, ytmusic-player-page #progress-bar { --paper-slider-active-color: ${v} !important; --paper-slider-knob-color: ${v} !important; --paper-slider-knob-start-color: ${v} !important; } ytmusic-player-bar #progress-bar #primaryProgress { background: ${v} !important; }`
    }
  ];
  var themes2 = [
    { id: "", label: "YouTube Music (unverändert)", values: {} },
    { id: "oled", label: "OLED Schwarz", values: { bg: "#000000", raised: "#0e0e0e", menu: "#161616", text: "#ededed", textSecondary: "#9a9a9a", accent: "#5aa9ff", outline: "#262626", playerBar: "#0a0a0a", progress: "#e53935" } },
    { id: "nord", label: "Nord", values: { bg: "#2e3440", raised: "#3b4252", menu: "#434c5e", text: "#eceff4", textSecondary: "#a9b1c1", accent: "#88c0d0", outline: "#4c566a", playerBar: "#3b4252", progress: "#88c0d0" } },
    { id: "gruvbox", label: "Gruvbox", values: { bg: "#282828", raised: "#3c3836", menu: "#504945", text: "#ebdbb2", textSecondary: "#a89984", accent: "#fabd2f", outline: "#504945", playerBar: "#32302f", progress: "#fe8019" } },
    { id: "dracula", label: "Dracula", values: { bg: "#282a36", raised: "#343746", menu: "#3e4153", text: "#f8f8f2", textSecondary: "#a4a8c0", accent: "#bd93f9", outline: "#44475a", playerBar: "#343746", progress: "#ff79c6" } },
    { id: "solarized", label: "Solarized Dark", values: { bg: "#002b36", raised: "#073642", menu: "#0b4452", text: "#eee8d5", textSecondary: "#93a1a1", accent: "#2aa198", outline: "#0f4b59", playerBar: "#073642", progress: "#cb4b16" } },
    { id: "vinyl", label: "Vinyl (warm)", values: { bg: "#1b1612", raised: "#2a221c", menu: "#342a22", text: "#f3e9dc", textSecondary: "#b8a590", accent: "#e0a458", outline: "#3d3128", playerBar: "#241d18", progress: "#e0a458" } }
  ];
  var CARD_TITLES2 = "ytmusic-two-row-item-renderer .title, ytmusic-responsive-list-item-renderer .title";
  var controls2 = [
    {
      id: "thumbSize",
      label: "Kachelgröße in Karussells",
      group: "Dichte",
      type: "range",
      min: 120,
      max: 320,
      step: 10,
      unit: "px",
      placeholder: 180,
      css: (v) => `ytmusic-carousel ytmusic-two-row-item-renderer:not([aspect-ratio="MUSIC_TWO_ROW_ITEM_THUMBNAIL_ASPECT_RATIO_RECTANGLE_16_9"]) { width: ${v}px !important; } ytmusic-carousel ytmusic-two-row-item-renderer #item-thumbnail, ytmusic-carousel ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer { width: ${v}px !important; height: ${v}px !important; }`
    },
    {
      id: "rowHeight",
      label: "Zeilenhöhe in Listen",
      group: "Dichte",
      type: "range",
      min: 40,
      max: 80,
      step: 2,
      unit: "px",
      placeholder: 56,
      css: (v) => `ytmusic-responsive-list-item-renderer[height-style="MUSIC_RESPONSIVE_LIST_ITEM_HEIGHT_MEDIUM"], ytmusic-responsive-list-item-renderer { min-height: ${v}px !important; height: auto !important; } ytmusic-player-queue-item { height: ${v}px !important; }`
    },
    {
      id: "contentWidth",
      label: "Maximale Inhaltsbreite",
      group: "Dichte",
      type: "range",
      min: 800,
      max: 2600,
      step: 50,
      unit: "px",
      placeholder: 1478,
      css: (v) => `ytmusic-browse-response #content-wrapper, ytmusic-search-page #contents, ytmusic-section-list-renderer.ytmusic-browse-response { max-width: ${v}px !important; margin-inline: auto !important; } ytmusic-app { --ytmusic-content-width: ${v}px !important; }`
    },
    {
      id: "radius",
      label: "Ecken-Rundung",
      group: "Dichte",
      type: "range",
      min: 0,
      max: 24,
      step: 1,
      unit: "px",
      placeholder: 4,
      css: (v) => `ytmusic-thumbnail-renderer img, ytmusic-two-row-item-renderer #item-thumbnail, ytmusic-responsive-list-item-renderer ytmusic-thumbnail-renderer, ytmusic-player-bar .thumbnail-image-wrapper img, ytmusic-player-queue-item .thumbnail img, #song-image img { border-radius: ${v}px !important; }`
    },
    {
      id: "font",
      label: "Schrift",
      group: "Typografie",
      type: "select",
      options: [
        ["", "YouTube Music"],
        ['system-ui, -apple-system, "Segoe UI", sans-serif', "System"],
        ["Inter, system-ui, sans-serif", "Inter (falls installiert)"],
        ['"Segoe UI", system-ui, sans-serif', "Segoe UI"],
        ['Georgia, "Times New Roman", serif', "Serif"],
        ['"JetBrains Mono", Consolas, monospace', "Monospace"]
      ],
      css: (v) => `ytmusic-app, ytmusic-app *:not(yt-icon):not(svg):not(path), ytmusic-popup-container * { font-family: ${v} !important; }`
    },
    {
      id: "titleSize",
      label: "Titelgröße",
      group: "Typografie",
      type: "range",
      min: 11,
      max: 22,
      step: 1,
      unit: "px",
      placeholder: 14,
      css: (v) => `${CARD_TITLES2} { font-size: ${v}px !important; line-height: 1.35 !important; }`
    },
    {
      id: "lyricsSize",
      label: "Songtext-Schriftgröße",
      group: "Typografie",
      type: "range",
      min: 12,
      max: 40,
      step: 1,
      unit: "px",
      placeholder: 18,
      css: (v) => `ytmusic-player-page ytmusic-description-shelf-renderer .description, ytmusic-player-page ytmusic-description-shelf-renderer yt-formatted-string.description { font-size: ${v}px !important; line-height: 1.5 !important; }`
    },
    {
      id: "playerBarHeight",
      label: "Höhe Playerleiste",
      group: "Player",
      type: "range",
      min: 56,
      max: 110,
      step: 2,
      unit: "px",
      placeholder: 72,
      css: (v) => `ytmusic-app-layout { --ytmusic-player-bar-height: ${v}px !important; } ytmusic-player-bar { height: ${v}px !important; }`
    },
    {
      id: "coverBlur",
      label: "Hintergrund-Unschärfe Player",
      group: "Player",
      type: "range",
      min: 0,
      max: 100,
      step: 5,
      unit: "%",
      placeholder: 100,
      css: (v) => `ytmusic-player-page #background, ytmusic-browse-response #background { opacity: ${v / 100} !important; }`
    },
    {
      id: "dimOpacity",
      label: "Stärke von „Dimmen“",
      group: "Allgemein",
      type: "range",
      min: 5,
      max: 80,
      step: 5,
      unit: "%",
      placeholder: 30,
      css: (v) => `:root { --ytx-dim-opacity: ${v / 100}; }`
    },
    {
      id: "motion",
      label: "Animationen",
      group: "Allgemein",
      type: "select",
      options: [["", "Normal"], ["reduced", "Reduziert"], ["off", "Aus"]],
      css: (v) => v === "off" ? `ytmusic-app *, ytmusic-app *::before, ytmusic-app *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; }` : `ytmusic-app *, ytmusic-app *::before, ytmusic-app *::after { transition-duration: 60ms !important; animation-duration: 60ms !important; }`
    },
    {
      id: "scrollbar",
      label: "Scrollbalken",
      group: "Allgemein",
      type: "select",
      options: [["", "Normal"], ["thin", "Schmal"], ["none", "Versteckt"]],
      css: (v) => v === "none" ? `html, body { scrollbar-width: none !important; } html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }` : `html, body { scrollbar-width: thin !important; }`
    }
  ];
  var controlById2 = Object.fromEntries([...controls2, ...colorControls2.map((c) => ({ ...c, type: "color", group: "Farben" }))].map((c) => [c.id, c]));
  function extraCss2(colors) {
    const out = [];
    const map = { bg: "base-background", raised: "raised-background", menu: "menu-background", text: "text-primary", textSecondary: "text-secondary", accent: "call-to-action", outline: "outline" };
    const decl = Object.entries(map).filter(([k]) => colors[k]).map(([k, t]) => `--yt-sys-color-baseline--${t}: ${colors[k]};`);
    if (decl.length) out.push(`html:root:root { ${decl.join(" ")} }`);
    return out.join("\n");
  }

  // src/registry/music/presets.js
  var layoutPresets2 = [
    {
      id: "compact",
      label: "Kompakt",
      pages: ["home", "explore", "artist", "library"],
      css: (s) => `
${s} ytmusic-carousel ytmusic-two-row-item-renderer:not([aspect-ratio*="16_9"]) { width: 140px !important; }
${s} ytmusic-carousel ytmusic-two-row-item-renderer #item-thumbnail, ${s} ytmusic-carousel ytmusic-two-row-item-renderer ytmusic-thumbnail-renderer { width: 140px !important; height: 140px !important; }
${s} ytmusic-carousel-shelf-renderer { margin-bottom: 20px !important; }
${s} ytmusic-responsive-list-item-renderer { min-height: 44px !important; }`
    },
    {
      id: "list",
      label: "Listen statt Karussells",
      pages: ["home", "explore"],
      css: (s) => `
${s} ytmusic-carousel-shelf-renderer ytmusic-carousel #items { display: flex !important; flex-wrap: wrap !important; gap: 12px !important; transform: none !important; }
${s} ytmusic-carousel-shelf-renderer ytmusic-carousel { overflow: visible !important; }
${s} ytmusic-carousel-shelf-renderer #next-items-button, ${s} ytmusic-carousel-shelf-renderer #previous-items-button { display: none !important; }`
    },
    {
      id: "lyricsFocus",
      label: "Songtext groß",
      pages: ["watch"],
      css: (s) => `
${s} ytmusic-player-page #side-panel { flex: 1 1 60% !important; max-width: none !important; }
${s} ytmusic-player-page #main-panel { flex: 1 1 40% !important; }
${s} ytmusic-player-page ytmusic-description-shelf-renderer .description { font-size: 22px !important; line-height: 1.6 !important; }`
    },
    {
      id: "queueWide",
      label: "Warteschlange breit",
      pages: ["watch"],
      css: (s) => `
${s} ytmusic-player-page #side-panel { flex: 1 1 55% !important; max-width: none !important; }
${s} ytmusic-player-page #main-panel { flex: 1 1 45% !important; }`
    }
  ];
  var presetById2 = Object.fromEntries(layoutPresets2.map((p) => [p.id, p]));
  var LAYOUT_PAGES2 = [
    ["home", "Startseite"],
    ["explore", "Entdecken"],
    ["artist", "Künstler"],
    ["library", "Mediathek"],
    ["watch", "Player"]
  ];
  var orderGroups2 = {};
  var topbarModes2 = [
    ["", "Fixiert (YouTube Music)"],
    ["autohide", "Beim Runterscrollen ausblenden"]
  ];
  var topbarCss2 = {
    autohide: `html[data-ytx-scrolled-down] ytmusic-nav-bar, html[data-ytx-scrolled-down] ytmusic-app-layout #nav-bar-background { transform: translateY(-100%) !important; } ytmusic-nav-bar, ytmusic-app-layout #nav-bar-background { transition: transform .2s ease !important; }`
  };

  // src/registry/music/pages.js
  var PAGE_LABELS2 = {
    home: "Startseite",
    explore: "Entdecken",
    library: "Mediathek",
    watch: "Player",
    search: "Suche",
    artist: "Künstler",
    album: "Album",
    playlist: "Playlist",
    moods: "Stimmungen & Genres",
    genre: "Genre",
    charts: "Charts",
    newReleases: "Neuerscheinungen",
    history: "Verlauf",
    podcast: "Podcast",
    other: "Sonstige"
  };
  var BROWSE_PAGES = [
    [/^FEmusic_home$/, "home"],
    [/^FEmusic_explore$/, "explore"],
    [/^FEmusic_(library|liked)/, "library"],
    [/^FEmusic_history$/, "history"],
    [/^FEmusic_moods_and_genres_category$/, "genre"],
    [/^FEmusic_moods_and_genres$/, "moods"],
    [/^FEmusic_charts$/, "charts"],
    [/^FEmusic_new_releases/, "newReleases"],
    [/^MPREb_/, "album"],
    [/^(VL|RD|OLAK|PL)/, "playlist"],
    [/^MPSP/, "podcast"],
    [/^UC[\w-]{22}$/, "artist"]
  ];
  function browseIdFromUrl(href) {
    try {
      const u = new URL(href, "https://music.youtube.com");
      const m = u.pathname.match(/^\/(?:browse|channel)\/([^/?#]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  }
  function pageFromUrl2(href) {
    let u;
    try {
      u = new URL(href, "https://music.youtube.com");
    } catch {
      return "other";
    }
    const p = u.pathname;
    if (p === "/" || p === "") return "home";
    if (p === "/watch") return "watch";
    if (p === "/search") return "search";
    if (p === "/explore") return "explore";
    if (p === "/playlist") return "playlist";
    if (p === "/podcasts") return "podcast";
    if (p === "/library" || p.startsWith("/library/")) return "library";
    if (p === "/moods_and_genres") return "moods";
    if (p === "/charts") return "charts";
    if (p === "/new_releases") return "newReleases";
    if (p === "/history") return "history";
    if (/^\/@[^/]+\/?$/.test(p)) return "artist";
    const id = browseIdFromUrl(href);
    if (id) {
      for (const [re, page] of BROWSE_PAGES) if (re.test(id)) return page;
    }
    return "other";
  }
  function videoIdFromUrl2(href) {
    try {
      const u = new URL(href, "https://music.youtube.com");
      return u.pathname === "/watch" ? u.searchParams.get("v") : null;
    } catch {
      return null;
    }
  }

  // src/registry/music/player.js
  var appEl = () => document.querySelector("ytmusic-app");
  function appStore() {
    try {
      const s = appEl()?.polymerController?.store;
      return s && typeof s.getState === "function" ? s : null;
    } catch {
      return null;
    }
  }
  function appState() {
    try {
      return appStore()?.getState() || null;
    } catch {
      return null;
    }
  }
  function playerApi() {
    const p = document.getElementById("movie_player");
    return p && typeof p.getVideoData === "function" ? p : null;
  }
  function mediaEl() {
    return document.querySelector("#movie_player video") || document.querySelector("ytmusic-player video");
  }
  function isLoggedIn() {
    try {
      const cfg = (window.wrappedJSObject || window).ytcfg?.get?.("LOGGED_IN");
      if (typeof cfg === "boolean") return cfg;
    } catch {
    }
    return !document.querySelector("ytmusic-nav-bar a.sign-in-link");
  }
  function queueRaw() {
    return appState()?.queue || null;
  }
  function queueItems() {
    const q2 = queueRaw();
    if (!q2?.items) return [];
    const out = [];
    q2.items.forEach((it, i) => {
      const p = parseQueueItem(it);
      if (p) out.push({ ...p, index: i });
    });
    const auto = [];
    (q2.automixItems || []).forEach((it, i) => {
      const p = parseQueueItem(it);
      if (p) auto.push({ ...p, index: q2.items.length + i, automix: true });
    });
    return out.concat(auto);
  }
  function selectedIndex() {
    const q2 = queueRaw();
    return typeof q2?.selectedItemIndex === "number" ? q2.selectedItemIndex : -1;
  }
  function likeOf(videoId) {
    const st = appState();
    const v = st?.likeStatus?.videos?.[videoId];
    if (v) return v;
    const bar = document.querySelector("ytmusic-player-bar ytmusic-like-button-renderer");
    return bar?.getAttribute("like-status") || "INDIFFERENT";
  }
  function isPlayerPageOpen() {
    return document.querySelector("ytmusic-app-layout")?.hasAttribute("player-page-open") || false;
  }
  function currentTrack() {
    const p = playerApi();
    const st = appState();
    const vd = st?.player?.playerResponse?.videoDetails;
    let vid = null;
    try {
      vid = p?.getVideoData?.()?.video_id || null;
    } catch {
    }
    vid ||= vd?.videoId || null;
    if (!vid) return null;
    const items = queueItems();
    const item = items.find((x) => x.videoId === vid || x.counterpartVideoId === vid) || items.find((x) => x.index === selectedIndex()) || null;
    const sameItem = item && (item.videoId === vid || item.counterpartVideoId === vid);
    let pos = 0;
    let dur = 0;
    let rate = 1;
    let state = -1;
    try {
      pos = p?.getCurrentTime?.() || 0;
      dur = p?.getDuration?.() || 0;
      rate = p?.getPlaybackRate?.() || 1;
      state = p?.getPlayerState?.() ?? -1;
    } catch {
    }
    if (!dur && vd?.lengthSeconds) dur = Number(vd.lengthSeconds) || 0;
    const ad = !!(st?.player?.adPlaying || p?.classList?.contains("ad-showing"));
    const playing = typeof st?.player?.isPlaying === "boolean" ? st.player.isPlaying : state === 1;
    return {
      videoId: vid,
      title: sameItem && item.title || (vd?.videoId === vid ? vd.title : "") || "",
      artists: sameItem && item.artists?.length ? item.artists : vd?.videoId === vid && vd.author ? [{ id: vd.channelId || null, name: vd.author.replace(/ - Topic$/, "") }] : [],
      album: sameItem ? item.album : null,
      year: sameItem ? item.year : null,
      durationSec: dur || (sameItem ? item.durationSec : 0),
      thumbnail: sameItem ? item.thumbnail : "",
      videoType: vd?.videoId === vid ? vd.musicVideoType || null : null,
      counterpartVideoId: sameItem ? item.videoId === vid ? item.counterpartVideoId : item.videoId : null,
      liked: likeOf(vid) === "LIKE",
      disliked: likeOf(vid) === "DISLIKE",
      ad,
      playing,
      pos,
      dur,
      rate,
      audioOnly: !!st?.player?.audioOnly,
      queueIndex: sameItem ? item.index : -1
    };
  }
  function lyricsBrowseId() {
    const tabs = appState()?.playerPage?.playerPageTabs || [];
    for (const t of tabs) {
      const id = t?.tabRenderer?.endpoint?.browseEndpoint?.browseId;
      if (id && id.startsWith("MPLYt")) return id;
    }
    return null;
  }
  function lyricsTabIndex() {
    const tabs = appState()?.playerPage?.playerPageTabs || [];
    return tabs.findIndex((t) => t?.tabRenderer?.endpoint?.browseEndpoint?.browseId?.startsWith("MPLYt"));
  }
  function lyricsData() {
    const st = appState();
    const id = lyricsBrowseId();
    const tabs = st?.playerPage?.playerPageTabs || [];
    const tabIdx = lyricsTabIndex();
    const unselectable = tabIdx >= 0 && tabs[tabIdx]?.tabRenderer?.unselectable;
    if (!id) return tabs.length ? { available: false, reason: unselectable ? "kein Songtext" : "kein Songtext-Tab" } : null;
    const content = st?.playerPage?.playerPageTabsContent?.[id];
    if (!content) return null;
    const sections = content?.contents?.sectionListRenderer?.contents || [];
    for (const s of sections) {
      const timed = s.musicTimedLyricsRenderer || s.timedLyricsRenderer;
      if (timed?.timedLyricsData) {
        return {
          available: true,
          timed: true,
          lines: timed.timedLyricsData.map((l) => ({ text: l.lyricLine || "", startMs: Number(l.cueRange?.startTimeMilliseconds) || 0 })),
          source: runsText2(timed.footer || timed.sourceMessage)
        };
      }
      const d = s.musicDescriptionShelfRenderer;
      if (d?.description) {
        const text = runsText2(d.description);
        return { available: true, timed: false, lines: text.split("\n").map((t) => ({ text: t })), source: runsText2(d.footer) };
      }
    }
    const msg = sections.map((s) => runsText2(s.messageRenderer?.text || s.musicMessageRenderer?.text)).find(Boolean);
    return { available: false, reason: msg || "kein Songtext" };
  }
  function navigateEndpoint(endpoint) {
    const app = appEl();
    if (!app || !endpoint) return false;
    const ys = document.createElement("yt-formatted-string");
    ys.setAttribute("data-ytx-own", "");
    ys.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden";
    app.append(ys);
    ys.text = { runs: [{ text: "ytx", navigationEndpoint: endpoint }] };
    return new Promise((resolve) => {
      let tries = 0;
      const go = () => {
        const a = ys.querySelector("a");
        if (a) {
          a.click();
          ys.remove();
          resolve(true);
        } else if (++tries > 20) {
          ys.remove();
          resolve(false);
        } else {
          setTimeout(go, 25);
        }
      };
      go();
    });
  }
  var endpoints = {
    play: (videoId, playlistId) => ({ watchEndpoint: { videoId, ...playlistId ? { playlistId } : {} } }),
    radio: (videoId) => ({ watchEndpoint: { videoId, playlistId: `RDAMVM${videoId}`, params: "wAEB" } }),
    playlist: (playlistId) => ({ watchEndpoint: { playlistId } }),
    browse: (browseId, params, pageType) => ({ browseEndpoint: { browseId, ...params ? { params } : {}, ...pageType ? { browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: `MUSIC_PAGE_TYPE_${pageType}` } } } : {} } }),
    search: (query) => ({ searchEndpoint: { query } })
  };
  function nextVideo() {
    const p = playerApi();
    if (!p?.nextVideo) return false;
    p.nextVideo();
    return true;
  }
  function currentBrowse() {
    const main = appState()?.navigation?.mainContent;
    const data2 = main?.endpoint?.data;
    if (!data2?.browseId || !main?.response) return null;
    return { browseId: data2.browseId, params: data2.params || null, response: main.response };
  }

  // src/behaviors/music.js
  function clickConfirm(dialog) {
    const btn2 = dialog.querySelector("yt-button-renderer#confirm-button button, #confirm-button button, yt-button-renderer button, button");
    if (!btn2) return false;
    btn2.click();
    return true;
  }
  var behaviors2 = [
    {
      id: "m.stillThere",
      label: "„Noch da?“ automatisch bestätigen",
      description: "Die Wiedergabe pausiert nicht mehr nach längerer Zeit ohne Eingabe",
      type: "toggle",
      default: false,
      start(ctx) {
        let hits = 0;
        const off = ctx.onSweep(() => {
          for (const r of qsa("ytmusic-you-there-renderer")) {
            const dialog = r.closest("tp-yt-paper-dialog") || r;
            if (dialog.hidden || getComputedStyle(dialog).display === "none") continue;
            if (clickConfirm(r)) hits++;
          }
        });
        ctx.state.set("m.stillThere.hits", 0);
        return () => {
          off();
          ctx.state.set("m.stillThere.hits", hits);
        };
      },
      health: () => ({ status: "ok", detail: "beobachtet Dialoge" })
    },
    {
      id: "m.closePromoDialogs",
      label: "Premium-Dialoge schließen",
      description: "Schließt Upsell-Popups statt sie nur zu verstecken, damit die Seite bedienbar bleibt",
      type: "toggle",
      default: false,
      start(ctx) {
        const off = ctx.onSweep(() => {
          for (const r of qsa("ytmusic-mealbar-promo-renderer, ytmusic-upsell-dialog-renderer")) {
            const dismiss = r.querySelector("#dismiss-button button, .dismiss-button button, yt-button-renderer.dismiss-button button");
            if (dismiss && r.offsetParent !== null) dismiss.click();
          }
        });
        return off;
      }
    },
    {
      id: "m.homeRedirect",
      label: "Startseite umleiten",
      description: "Beim Öffnen von music.youtube.com direkt woanders landen",
      type: "select",
      options: [
        ["", "Aus"],
        ["/library", "Mediathek"],
        ["/explore", "Entdecken"],
        ["/playlist?list=LM", "Lieblingssongs"],
        ["/history", "Verlauf"]
      ],
      default: "",
      radical: true,
      start(ctx, target) {
        if (location.pathname === "/" && !location.search) location.replace(target);
        return () => {
        };
      }
    }
  ];
  var behaviorById2 = Object.fromEntries(behaviors2.map((b) => [b.id, b]));

  // src/features/music/logic/versions.js
  var VERSION_TAGS = [
    ["live", /\blive\b|\(live|\blive at\b|\bunplugged\b/i, "Live"],
    ["remix", /\bremix\b|\brmx\b|\bmix\)|\bedit\)|\bbootleg\b|\bflip\b/i, "Remix"],
    ["spedup", /sped[\s-]*up|speed[\s-]*up|\bnightcore\b|\bfast(er)? version\b/i, "Sped up"],
    ["slowed", /\bslowed\b|\breverb\b|\bslow(ed)? version\b/i, "Slowed"],
    ["karaoke", /\bkaraoke\b|\binstrumental\b|\bbacking track\b/i, "Karaoke"],
    ["acoustic", /\bacoustic\b|\bakustik\b/i, "Akustik"],
    ["cover", /\bcover\b/i, "Cover"],
    ["remaster", /\bremaster(ed)?\b/i, "Remaster"],
    ["radio", /\bradio edit\b|\bradio version\b/i, "Radio Edit"],
    ["extended", /\bextended\b/i, "Extended"]
  ];
  function versionTags(title) {
    const t = String(title || "");
    return VERSION_TAGS.filter(([, re]) => re.test(t)).map(([id]) => id);
  }
  function baseTitle(title) {
    return String(title || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\((?:[^()]*)\)|\[(?:[^\[\]]*)\]/g, " ").replace(/\s[-–—|]\s.*(live|remix|version|edit|sped|slowed|nightcore|karaoke|instrumental|acoustic|remaster|mix).*$/i, " ").replace(/\b(feat|ft|featuring|prod)\.?\s.*$/i, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }
  function artistKey(a) {
    if (!a) return "";
    return a.id || `name:${String(a.name || "").trim().toLowerCase()}`;
  }
  function trackKey(track) {
    const first = track?.artists?.[0];
    const who = first ? String(first.name || first.id || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "") : "";
    return `${baseTitle(track?.title)}|${who}`;
  }

  // src/features/music/logic/tracker.js
  var TRACKER_DEFAULTS = {
    completePct: 0.9,
    endSlackSec: 8,
    minSamples: 2,
    repeatWindowMs: 15 * 60 * 1e3,
    quickSkipSec: 10
  };
  function createTracker(options = {}) {
    const o = { ...TRACKER_DEFAULTS, ...options };
    let cur = null;
    let last2 = null;
    function start(s) {
      cur = {
        videoId: s.videoId,
        meta: s.meta || null,
        startedAt: s.ts,
        lastTs: s.ts,
        lastPos: s.pos || 0,
        maxPos: s.pos || 0,
        listened: 0,
        duration: s.dur || 0,
        samples: 1,
        liked: !!s.liked,
        repeat: !!(last2 && last2.videoId === s.videoId && s.ts - last2.endedAt < o.repeatWindowMs),
        context: s.context || null
      };
    }
    function finalize(reason, ts) {
      if (!cur) return null;
      const c = cur;
      cur = null;
      const dur = c.duration || c.meta?.durationSec || 0;
      if (c.samples < o.minSamples && c.listened < 1) return null;
      const pct = dur ? Math.min(1, c.listened / dur) : 0;
      const reachedEnd = dur ? c.maxPos >= dur - o.endSlackSec : false;
      const completed = pct >= o.completePct || reachedEnd && pct >= 0.5 || reason === "ended";
      const skipped = !completed && (reason === "change" || reason === "skip");
      const meta = c.meta || {};
      const rec = {
        id: `${c.startedAt}-${c.videoId}`,
        videoId: c.videoId,
        title: meta.title || "",
        artists: meta.artists || [],
        artistKeys: (meta.artists || []).map(artistKey).filter(Boolean),
        album: meta.album || null,
        year: meta.year ?? null,
        startedAt: c.startedAt,
        endedAt: ts,
        listenedSec: Math.round(c.listened * 10) / 10,
        durationSec: dur ? Math.round(dur) : null,
        percent: Math.round(pct * 1e3) / 1e3,
        completed,
        skipped,
        quickSkip: skipped && c.listened < o.quickSkipSec,
        skipAtSec: skipped ? Math.round(c.lastPos) : null,
        skipAtPct: skipped && dur ? Math.round(c.lastPos / dur * 1e3) / 1e3 : null,
        repeat: c.repeat,
        liked: c.liked,
        reason,
        context: c.context
      };
      last2 = { videoId: rec.videoId, endedAt: ts };
      return rec;
    }
    return {
      get current() {
        return cur;
      },
      // s = { ts, videoId, pos, dur, playing, ad, liked, rate, meta, context }
      sample(s) {
        const out = [];
        if (!s || !s.videoId || s.ad) return out;
        if (cur && cur.videoId !== s.videoId) {
          const r = finalize("change", s.ts);
          if (r) out.push(r);
        }
        if (!cur) {
          start(s);
          return out;
        }
        if (cur.duration && s.pos < 3 && cur.maxPos >= cur.duration - o.endSlackSec && s.playing) {
          const r = finalize("ended", s.ts);
          if (r) out.push(r);
          last2 = { videoId: s.videoId, endedAt: s.ts };
          start(s);
          return out;
        }
        const wall = Math.max(0, (s.ts - cur.lastTs) / 1e3);
        const allowed = wall * (s.rate || 1) + 2;
        const delta = s.pos - cur.lastPos;
        if (s.playing && delta > 0 && delta <= allowed) cur.listened += delta;
        cur.lastPos = s.pos;
        cur.lastTs = s.ts;
        cur.maxPos = Math.max(cur.maxPos, s.pos);
        cur.samples++;
        if (s.dur) cur.duration = s.dur;
        if (s.liked) cur.liked = true;
        if (s.meta && (!cur.meta || !cur.meta.artists?.length)) cur.meta = s.meta;
        return out;
      },
      // ende des songs laut player, seitenwechsel oder schliessen
      finish(reason, ts) {
        const r = finalize(reason, ts);
        return r ? [r] : [];
      }
    };
  }

  // src/core/config.js
  var SCHEMA = 3;
  var SITE_KEYS = ["youtube", "music"];
  function defaultFilters() {
    return {
      enabled: false,
      mode: "dim",
      pages: ["home", "subscriptions", "search", "watch"],
      shorts: false,
      live: false,
      channels: { block: [], allowOnly: [] },
      title: { keywords: [], regex: [], caseSensitive: false },
      duration: { minSec: null, maxSec: null },
      age: { maxDays: null },
      watched: { hide: false, minPercent: 90 }
    };
  }
  function emptySection(def) {
    const out = {
      display: {},
      vars: { theme: "" },
      layout: { presets: {}, order: {}, topbar: "", zones: null },
      behavior: {},
      features: {}
    };
    if (def?.filters) out.filters = defaultFilters();
    return out;
  }
  var isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  var strList = (x) => Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean) : [];
  var numOrNull = (x) => x === "" || x === null || x === void 0 || !isFinite(Number(x)) ? null : Number(x);
  function splitLegacy(raw) {
    if (!isObj(raw)) return {};
    if (SITE_KEYS.some((k) => isObj(raw[k]))) return raw;
    if (["display", "vars", "layout", "behavior", "filters", "features"].some((k) => k in raw)) return { youtube: raw };
    return {};
  }
  function normalize(raw, def) {
    const src = isObj(raw) ? raw : {};
    const cfg = emptySection(def);
    const look = def.look;
    const presets = def.presets;
    if (isObj(src.display)) {
      for (const [id, mode] of Object.entries(src.display)) {
        const t = def.targetById[id];
        if (t && t.modes.includes(mode) && mode !== "show") cfg.display[id] = mode;
      }
    }
    if (isObj(src.vars)) {
      if (look.themes.some((t) => t.id === src.vars.theme)) cfg.vars.theme = src.vars.theme;
      for (const [id, v] of Object.entries(src.vars)) {
        if (id === "theme") continue;
        const c = look.controlById[id];
        if (!c || v === "" || v === null || v === void 0) continue;
        if (c.type === "range") {
          const n = Number(v);
          if (isFinite(n)) cfg.vars[id] = Math.min(c.max, Math.max(c.min, n));
        } else if (c.type === "color") {
          if (/^#[0-9a-f]{3,8}$/i.test(v)) cfg.vars[id] = v;
        } else if (c.type === "select") {
          if (c.options.some(([val]) => val === v)) cfg.vars[id] = v;
        }
      }
    }
    if (isObj(src.layout)) {
      if (isObj(src.layout.presets)) {
        for (const [page, id] of Object.entries(src.layout.presets)) {
          const p = presets.presetById[id];
          if (p && p.pages.includes(page)) cfg.layout.presets[page] = id;
        }
      }
      if (isObj(src.layout.order)) {
        for (const [gid, list] of Object.entries(src.layout.order)) {
          const g = presets.orderGroups[gid];
          if (!g) continue;
          const known = new Set(g.items.map(([id]) => id));
          const clean = strList(list).filter((id) => known.has(id));
          if (clean.length) cfg.layout.order[gid] = [...new Set(clean)];
        }
      }
      if (presets.topbarModes.some(([v]) => v === src.layout.topbar)) cfg.layout.topbar = src.layout.topbar;
      if (isObj(src.layout.zones)) cfg.layout.zones = src.layout.zones;
    }
    if (isObj(src.behavior)) {
      for (const [id, v] of Object.entries(src.behavior)) {
        const b = def.behaviorById[id];
        if (!b) continue;
        if (b.type === "toggle") cfg.behavior[id] = !!v;
        else if (b.type === "select" && b.options.some(([val]) => val === v)) cfg.behavior[id] = v;
        else if (b.type === "textarea") cfg.behavior[id] = String(v ?? "");
      }
    }
    if (def.filters && isObj(src.filters)) {
      const f = src.filters;
      const d = cfg.filters;
      d.enabled = !!f.enabled;
      if (["dim", "collapse", "hide"].includes(f.mode)) d.mode = f.mode;
      if (Array.isArray(f.pages)) d.pages = strList(f.pages);
      d.shorts = !!f.shorts;
      d.live = !!f.live;
      d.channels.block = strList(f.channels?.block);
      d.channels.allowOnly = strList(f.channels?.allowOnly);
      d.title.keywords = strList(f.title?.keywords);
      d.title.regex = strList(f.title?.regex);
      d.title.caseSensitive = !!f.title?.caseSensitive;
      d.duration.minSec = numOrNull(f.duration?.minSec);
      d.duration.maxSec = numOrNull(f.duration?.maxSec);
      d.age.maxDays = numOrNull(f.age?.maxDays);
      d.watched.hide = !!f.watched?.hide;
      d.watched.minPercent = numOrNull(f.watched?.minPercent) ?? 90;
    }
    const srcFeatures = isObj(src.features) ? src.features : {};
    for (const m of def.features) {
      const s = isObj(srcFeatures[m.id]) ? srcFeatures[m.id] : {};
      const out = { enabled: !!s.enabled };
      for (const [key, sd] of Object.entries(m.settings || {})) out[key] = normalizeSetting(sd, s[key]);
      cfg.features[m.id] = out;
    }
    return cfg;
  }
  function normalizeProfile(raw, sites2) {
    const split = splitLegacy(raw);
    const out = { schema: SCHEMA };
    for (const key of SITE_KEYS) out[key] = normalize(split[key], sites2[key]);
    return out;
  }
  function normalizeSetting(def, v) {
    switch (def.type) {
      case "toggle":
        return v === void 0 ? !!def.default : !!v;
      case "select":
        return def.options.some(([val]) => val === v) ? v : def.default;
      case "multi": {
        const allowed = new Set(def.options.map(([val]) => val));
        return Array.isArray(v) ? v.filter((x) => allowed.has(x)) : def.default.slice();
      }
      case "range": {
        const n = Number(v);
        return isFinite(n) && v !== null && v !== "" ? Math.min(def.max, Math.max(def.min, n)) : def.default;
      }
      case "text":
        return typeof v === "string" ? v : def.default;
      default:
        return v ?? def.default;
    }
  }

  // src/profiles/music.js
  var H2 = "hide";
  var C2 = "collapse";
  var tidyDisplay2 = {
    "m.guide.samples": H2,
    "m.guide.upgrade": H2,
    "m.guide.signin": H2,
    "m.promo.mealbar": H2,
    "m.promo.background": H2,
    "m.promo.upsell": H2,
    "m.home.podcastChip": H2,
    "m.home.podcasts": H2,
    "m.home.samplesShelf": H2,
    "m.explore.podcasts": H2,
    "m.search.podcasts": C2,
    "m.search.profiles": H2
  };
  var tidyFeatures2 = {
    "m.history": { enabled: true },
    "m.favorites": { enabled: true },
    "m.hub": { enabled: true },
    "m.releases": { enabled: true },
    "m.smartQueue": { enabled: true },
    "m.queueInfo": { enabled: true },
    "m.lyrics": { enabled: true },
    "m.audio": { enabled: false }
  };
  var musicTemplates = {
    youtube: () => ({}),
    aufgeraeumt: () => ({
      display: { ...tidyDisplay2 },
      behavior: { "m.stillThere": true },
      features: structuredClone(tidyFeatures2)
    }),
    fokus: () => ({
      display: {
        ...tidyDisplay2,
        "m.guide.explore": H2,
        "m.home.chips": H2,
        "m.home.videos": H2,
        "m.home.playlists": C2,
        "m.home.background": H2,
        "m.player.comments": H2,
        "m.player.related": H2,
        "m.search.videos": C2
      },
      behavior: { "m.stillThere": true, "m.closePromoDialogs": true },
      features: { ...structuredClone(tidyFeatures2), "m.audio": { enabled: true, preferAudio: true } }
    })
  };

  // src/profiles/index.js
  var templates2 = templates.map((t) => ({
    ...t,
    config: () => ({ schema: SCHEMA, youtube: t.config(), music: musicTemplates[t.id]?.() || {} })
  }));
  var templateById2 = Object.fromEntries(templates2.map((t) => [t.id, t]));

  // src/core/store.js
  var KEY = "ytx.store";
  var STATE_KEY = "ytx.state";
  var hasGM = () => typeof GM_getValue === "function" && typeof GM_setValue === "function";
  function readRaw(key) {
    try {
      if (hasGM()) {
        const v = GM_getValue(key, null);
        if (v != null) return typeof v === "string" ? JSON.parse(v) : v;
      }
    } catch (e) {
      log.warn("GM_getValue", e);
    }
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }
  function writeRaw(key, value) {
    const json = JSON.stringify(value);
    try {
      if (hasGM()) {
        GM_setValue(key, json);
        return;
      }
    } catch (e) {
      log.warn("GM_setValue", e);
    }
    try {
      localStorage.setItem(key, json);
    } catch (e) {
      log.warn("localStorage", e);
    }
  }
  function slug(name) {
    return String(name).toLowerCase().replace(/[äöü]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue" })[c]).replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profil";
  }
  var defaultSettings = () => ({ hotkeys: {}, panelButton: true, panelTab: "display" });
  function freshData() {
    const profiles = {};
    for (const t of templates2) profiles[t.id] = { name: t.name, template: t.id, config: t.config() };
    return { schema: SCHEMA, active: DEFAULT_ACTIVE, profiles, settings: defaultSettings(), buckets: {}, migrations: MIGRATIONS.map(([id]) => id) };
  }
  var MIGRATIONS = [
    [
      "schema-3-sites",
      (d) => {
        for (const p of Object.values(d.profiles || {})) {
          const split = splitLegacy(p.config);
          p.config = { schema: SCHEMA, ...split };
          const t = templateById2[p.template];
          if (!p.config.music && t) p.config.music = t.config().music;
        }
        d.schema = SCHEMA;
      }
    ],
    [
      "thumbs-color-default",
      (d) => {
        const p = d.profiles.aufgeraeumt;
        const disp = p?.config?.youtube?.display;
        if (p?.template === "aufgeraeumt" && disp?.["thumb.image"] === "dim") delete disp["thumb.image"];
      }
    ]
  ];
  var data = null;
  var config = null;
  var subs = /* @__PURE__ */ new Set();
  var saveSoon = debounce(() => writeRaw(KEY, data), 250, 1500);
  var runtime = readRaw(STATE_KEY) || {};
  var saveState = debounce(() => writeRaw(STATE_KEY, runtime), 500, 3e3);
  function migrate() {
    data.migrations ||= [];
    let changed = false;
    for (const [id, fn] of MIGRATIONS) {
      if (data.migrations.includes(id)) continue;
      try {
        fn(data);
      } catch (e) {
        log.warn(`migration ${id}`, e);
      }
      data.migrations.push(id);
      changed = true;
    }
    if (changed) writeRaw(KEY, data);
  }
  function activeProfile() {
    return data.profiles[data.active] || data.profiles[Object.keys(data.profiles)[0]];
  }
  function recompute() {
    config = normalize(activeProfile()?.config?.[site.id], site);
  }
  function emit(reason) {
    for (const fn of subs) {
      try {
        fn(config, reason);
      } catch (e) {
        log.error("store subscriber", e);
      }
    }
  }
  function commit(reason) {
    recompute();
    saveSoon();
    emit(reason);
  }
  var store = {
    init() {
      data = readRaw(KEY);
      if (!data || typeof data !== "object" || !data.profiles || !Object.keys(data.profiles).length) {
        data = freshData();
        writeRaw(KEY, data);
      }
      data.settings ||= defaultSettings();
      data.buckets ||= {};
      migrate();
      for (const t of templates2) {
        if (!data.profiles[t.id] && !data.deletedTemplates?.includes(t.id)) data.profiles[t.id] = { name: t.name, template: t.id, config: t.config() };
      }
      if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0];
      recompute();
      const flush = () => this.flush();
      window.addEventListener("pagehide", flush);
      document.addEventListener("visibilitychange", () => document.hidden && flush());
    },
    flush() {
      saveSoon.flush();
      saveState.flush();
    },
    get config() {
      return config;
    },
    get data() {
      return data;
    },
    get settings() {
      return data.settings;
    },
    get activeId() {
      return data.active;
    },
    get siteId() {
      return site.id;
    },
    profiles() {
      return Object.entries(data.profiles).map(([id, p]) => ({ id, name: p.name, template: p.template, active: id === data.active }));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // mutator bekommt den abschnitt der aktuellen seite
    update(mutator, reason = "update") {
      const p = activeProfile();
      const draft = normalize(p.config?.[site.id], site);
      mutator(draft);
      p.config = { ...p.config || {}, schema: SCHEMA, [site.id]: normalize(draft, site) };
      commit(reason);
    },
    // look (theme/farben/dichte/typografie) der jeweils anderen seite im selben profil
    // dient dazu, den style zwischen youtube und music zu uebertragen
    otherLooks() {
      const p = activeProfile();
      return SITE_KEYS.filter((id) => id !== site.id).map((id) => ({
        id,
        label: sites[id].label,
        vars: normalize(p.config?.[id], sites[id]).vars
      }));
    },
    updateSettings(mutator) {
      mutator(data.settings);
      saveSoon();
      emit("settings");
    },
    // seitenweite einstellungen, normalisiert vom besitzer des buckets
    bucket(name, normalizeFn) {
      const b = normalizeFn ? normalizeFn(data.buckets[name]) : data.buckets[name];
      return b;
    },
    updateBucket(name, mutator, normalizeFn) {
      const draft = normalizeFn ? normalizeFn(data.buckets[name]) : structuredClone(data.buckets[name] || {});
      mutator(draft);
      data.buckets[name] = normalizeFn ? normalizeFn(draft) : draft;
      saveSoon();
      emit(`bucket:${name}`);
      return data.buckets[name];
    },
    setActive(id) {
      if (!data.profiles[id] || id === data.active) return;
      data.active = id;
      commit("profile");
    },
    cycleProfile() {
      const ids = Object.keys(data.profiles);
      const i = ids.indexOf(data.active);
      this.setActive(ids[(i + 1) % ids.length]);
      return data.profiles[data.active].name;
    },
    createProfile(name, fromId = data.active) {
      let id = slug(name);
      while (data.profiles[id]) id += "-2";
      const src = data.profiles[fromId];
      data.profiles[id] = { name: String(name).trim() || "Profil", template: null, config: structuredClone(src ? src.config : {}) };
      data.active = id;
      commit("profile");
      return id;
    },
    renameProfile(id, name) {
      if (!data.profiles[id] || !String(name).trim()) return;
      data.profiles[id].name = String(name).trim();
      saveSoon();
      emit("profile");
    },
    deleteProfile(id) {
      if (!data.profiles[id] || Object.keys(data.profiles).length <= 1) return false;
      if (data.profiles[id].template) (data.deletedTemplates ||= []).push(data.profiles[id].template);
      delete data.profiles[id];
      if (data.active === id) data.active = Object.keys(data.profiles)[0];
      commit("profile");
      return true;
    },
    // setzt nur den abschnitt der aktuellen seite zurueck
    resetProfile(id, allSites = false) {
      const p = data.profiles[id];
      if (!p) return;
      const t = templateById2[p.template];
      const fresh = t ? t.config() : {};
      p.config = allSites ? fresh : { ...p.config || {}, schema: SCHEMA, [site.id]: fresh[site.id] || {} };
      commit("profile");
    },
    exportJson(all = false) {
      const p = activeProfile();
      const out = all ? { ...data, buckets: void 0 } : { schema: SCHEMA, profile: { name: p.name, config: normalizeProfile(p.config, sites) } };
      return JSON.stringify(out, null, 2);
    },
    importJson(text) {
      const obj = JSON.parse(text);
      if (obj.profiles && typeof obj.profiles === "object") {
        for (const [id2, p] of Object.entries(obj.profiles)) {
          if (!p || typeof p !== "object") continue;
          data.profiles[id2] = { name: String(p.name || id2), template: p.template ?? null, config: normalizeProfile(p.config, sites) };
        }
        if (obj.active && data.profiles[obj.active]) data.active = obj.active;
        if (obj.settings) data.settings = { ...data.settings, ...obj.settings };
        commit("import");
        return "Alle Profile importiert";
      }
      const cfg = obj.profile?.config || obj.config || obj;
      const name = obj.profile?.name || "Importiert";
      const id = this.createProfile(name);
      data.profiles[id].config = normalizeProfile(cfg, sites);
      commit("import");
      return `Profil „${name}“ importiert`;
    },
    resetAll() {
      const buckets = data.buckets;
      data = freshData();
      data.buckets = buckets;
      commit("reset");
    },
    state: {
      get(key, def) {
        return key in runtime ? runtime[key] : def;
      },
      set(key, value) {
        runtime[key] = value;
        saveState();
      }
    }
  };

  // src/core/idb.js
  var req = (r) => new Promise((ok, fail) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  var done = (tx) => new Promise((ok, fail) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error("transaction abgebrochen"));
  });
  function openDatabase(name, migrations) {
    const status = { name, version: migrations.length, open: false, error: null, openedAt: 0, upgradedFrom: null, blocked: false };
    let dbp = null;
    const open = () => {
      if (dbp) return dbp;
      dbp = new Promise((ok, fail) => {
        if (typeof indexedDB === "undefined") return fail(new Error("IndexedDB nicht verfügbar"));
        const r = indexedDB.open(name, migrations.length);
        r.onupgradeneeded = (e) => {
          const db2 = r.result;
          const tx = r.transaction;
          status.upgradedFrom = e.oldVersion;
          for (let v = e.oldVersion; v < migrations.length; v++) {
            try {
              migrations[v](db2, tx);
            } catch (err) {
              log.error(`idb migration ${name} v${v + 1}`, err);
              tx.abort();
              return;
            }
          }
        };
        r.onblocked = () => {
          status.blocked = true;
          log.warn(`idb ${name} blockiert durch anderen tab`);
        };
        r.onsuccess = () => {
          const db2 = r.result;
          db2.onversionchange = () => {
            db2.close();
            dbp = null;
            status.open = false;
          };
          status.open = true;
          status.openedAt = Date.now();
          ok(db2);
        };
        r.onerror = () => {
          status.error = r.error?.message || "unbekannt";
          dbp = null;
          fail(r.error);
        };
      });
      return dbp;
    };
    const withStore = async (store2, mode, fn) => {
      const db2 = await open();
      const tx = db2.transaction(store2, mode);
      const result = fn(tx.objectStore(store2), tx);
      const value = result instanceof IDBRequest ? await req(result) : await result;
      await done(tx);
      return value;
    };
    return {
      status,
      open,
      get: (store2, key) => withStore(store2, "readonly", (s) => s.get(key)),
      put: (store2, value) => withStore(store2, "readwrite", (s) => s.put(value)),
      delete: (store2, key) => withStore(store2, "readwrite", (s) => s.delete(key)),
      clear: (store2) => withStore(store2, "readwrite", (s) => s.clear()),
      count: (store2) => withStore(store2, "readonly", (s) => s.count()),
      getAll: (store2, query, count) => withStore(store2, "readonly", (s) => s.getAll(query, count)),
      putMany: (store2, values) => withStore(store2, "readwrite", (s) => {
        for (const v of values) s.put(v);
      }),
      deleteMany: (store2, keys) => withStore(store2, "readwrite", (s) => {
        for (const k of keys) s.delete(k);
      }),
      byIndex: (store2, index, query, count) => withStore(store2, "readonly", (s) => s.index(index).getAll(query, count)),
      // neueste zuerst ueber einen index mit cursor
      latest: (store2, index, limit = 50) => withStore(
        store2,
        "readonly",
        (s) => new Promise((ok, fail) => {
          const out = [];
          const c = s.index(index).openCursor(null, "prev");
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur || out.length >= limit) return ok(out);
            out.push(cur.value);
            cur.continue();
          };
          c.onerror = () => fail(c.error);
        })
      ),
      deleteWhere: (store2, index, range2) => withStore(
        store2,
        "readwrite",
        (s) => new Promise((ok, fail) => {
          let n = 0;
          const c = s.index(index).openCursor(range2);
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur) return ok(n);
            cur.delete();
            n++;
            cur.continue();
          };
          c.onerror = () => fail(c.error);
        })
      ),
      async exportAll(stores) {
        const db2 = await open();
        const out = { database: name, version: db2.version, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), stores: {} };
        for (const st of stores || [...db2.objectStoreNames]) out.stores[st] = await withStore(st, "readonly", (s) => s.getAll());
        return out;
      },
      async importAll(dump, { replace = false, stores } = {}) {
        const db2 = await open();
        const names = stores || Object.keys(dump.stores || {}).filter((n) => db2.objectStoreNames.contains(n));
        for (const st of names) {
          await withStore(st, "readwrite", (s) => {
            if (replace) s.clear();
            for (const v of dump.stores[st] || []) s.put(v);
          });
        }
        return names;
      },
      async sizes() {
        const db2 = await open();
        const out = {};
        for (const st of db2.objectStoreNames) out[st] = await withStore(st, "readonly", (s) => s.count());
        return out;
      },
      close() {
        dbp?.then((db2) => db2.close()).catch(() => {
        });
        dbp = null;
        status.open = false;
      }
    };
  }

  // src/features/music/data/db.js
  var MUSIC_DB = "ytx-music";
  var MIGRATIONS2 = [
    // v1 grundschema
    (db2) => {
      const plays = db2.createObjectStore("plays", { keyPath: "id" });
      plays.createIndex("startedAt", "startedAt");
      plays.createIndex("videoId", "videoId");
      plays.createIndex("artistKeys", "artistKeys", { multiEntry: true });
      const tracks = db2.createObjectStore("tracks", { keyPath: "videoId" });
      tracks.createIndex("seenAt", "seenAt");
      const artists = db2.createObjectStore("artists", { keyPath: "id" });
      artists.createIndex("checkedAt", "checkedAt");
      const favorites = db2.createObjectStore("favorites", { keyPath: "key" });
      favorites.createIndex("type", "type");
      const releases = db2.createObjectStore("releases", { keyPath: "id" });
      releases.createIndex("artistId", "artistId");
      releases.createIndex("firstSeen", "firstSeen");
      db2.createObjectStore("feedback", { keyPath: "key" });
      const cache4 = db2.createObjectStore("cache", { keyPath: "key" });
      cache4.createIndex("ts", "ts");
      db2.createObjectStore("meta", { keyPath: "key" });
    },
    // v2 genre zuordnungen aus genre seiten und suche
    (db2) => {
      const genres = db2.createObjectStore("genres", { keyPath: "key" });
      genres.createIndex("checkedAt", "checkedAt");
    }
  ];
  var USER_STORES = ["plays", "favorites", "feedback", "releases", "meta", "genres"];
  var db = null;
  function musicDb() {
    db ||= openDatabase(MUSIC_DB, MIGRATIONS2);
    return db;
  }
  async function getMeta(key, def = null) {
    const r = await musicDb().get("meta", key);
    return r ? r.value : def;
  }
  function setMeta(key, value) {
    return musicDb().put("meta", { key, value, ts: Date.now() });
  }

  // src/features/music/logic/rules.js
  var DEFAULT_TERMS = ["live", "sped up", "nightcore", "remix", "slowed", "karaoke"];
  var escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  function termRegex(term) {
    const t = String(term || "").trim();
    if (!t) return null;
    const body = t.split(/[\s-]+/).map(escapeRe).join("[\\s-]*");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${body}($|[^\\p{L}\\p{N}])`, "iu");
  }
  function compileRules(blocklist = {}) {
    const artists = blocklist.artists || [];
    return {
      artistIds: new Set(artists.map((a) => a.id).filter(Boolean)),
      artistNames: new Set(artists.map((a) => String(a.name || "").trim().toLowerCase()).filter(Boolean)),
      songIds: new Set((blocklist.songs || []).map((s) => s.videoId).filter(Boolean)),
      terms: (blocklist.terms || []).map((t) => [t, termRegex(t)]).filter(([, re]) => re)
    };
  }
  function blockReason(track, rules2) {
    if (!track || !rules2) return null;
    if (track.videoId && rules2.songIds.has(track.videoId)) return { kind: "song", label: "Song blockiert" };
    for (const a of track.artists || []) {
      if (a.id && rules2.artistIds.has(a.id) || rules2.artistNames.has(String(a.name || "").trim().toLowerCase())) return { kind: "artist", label: `Künstler blockiert: ${a.name}` };
    }
    const title = `${track.title || ""} ${track.album?.name || ""}`;
    for (const [term, re] of rules2.terms) if (re.test(title)) return { kind: "term", label: `Titelbegriff: ${term}` };
    return null;
  }
  function isExcluded(track, excluded = {}) {
    if (!track) return false;
    if ((excluded.songs || []).some((s) => s.videoId === track.videoId)) return true;
    const keys = new Set((excluded.artists || []).map(artistKey));
    return (track.artists || []).some((a) => keys.has(artistKey(a)));
  }

  // src/features/music/logic/taste.js
  var DEFAULT_WEIGHTS = {
    complete: 1,
    repeat: 0.6,
    like: 2,
    partial: 0.4,
    skip: -1.6,
    favoriteArtist: 4,
    favoriteSong: 3,
    favoriteAlbum: 2,
    favoritePlaylist: 1,
    feedback: 1.5
  };
  var DAY = 24 * 3600 * 1e3;
  function playScore(p, w = DEFAULT_WEIGHTS) {
    const pct = Math.max(0, Math.min(1, p.percent ?? 0));
    let s = 0;
    if (p.completed) s = w.complete + (p.repeat ? w.repeat : 0);
    else if (p.skipped) s = w.skip * Math.pow(1 - pct, 1.5);
    else s = w.partial * pct;
    if (p.liked) s += w.like;
    return s;
  }
  var decay = (ageMs, halfLifeDays = 120) => Math.pow(0.5, Math.max(0, ageMs) / (halfLifeDays * DAY));
  function bump(map, key, init) {
    let v = map.get(key);
    if (!v) {
      v = init();
      map.set(key, v);
    }
    return v;
  }
  var emptyStats = () => ({ score: 0, plays: 0, completes: 0, skips: 0, quickSkips: 0, listenedSec: 0, lastPlayed: 0, firstPlayed: 0, liked: false });
  function buildProfile(plays = [], { favorites = [], feedback = [], excluded = {}, now = Date.now(), weights = DEFAULT_WEIGHTS, halfLifeDays = 120 } = {}) {
    const artists = /* @__PURE__ */ new Map();
    const songs = /* @__PURE__ */ new Map();
    const albums = /* @__PURE__ */ new Map();
    let total = 0;
    let listened = 0;
    for (const p of plays) {
      if (isExcluded(p, excluded)) continue;
      const d = decay(now - (p.startedAt || now), halfLifeDays);
      const sc = playScore(p, weights) * d;
      total++;
      listened += p.listenedSec || 0;
      const touch = (st, name) => {
        st.score += sc;
        st.plays++;
        if (p.completed) st.completes++;
        if (p.skipped) st.skips++;
        if (p.quickSkip) st.quickSkips++;
        if (p.liked) st.liked = true;
        st.listenedSec += p.listenedSec || 0;
        st.lastPlayed = Math.max(st.lastPlayed, p.startedAt || 0);
        st.firstPlayed = st.firstPlayed ? Math.min(st.firstPlayed, p.startedAt || now) : p.startedAt || now;
        if (name && !st.name) st.name = name;
      };
      const song = bump(songs, p.videoId, () => ({ ...emptyStats(), videoId: p.videoId, title: p.title, artists: p.artists || [], album: p.album || null }));
      touch(song, null);
      const list = (p.artists || []).slice(0, 4);
      list.forEach((a, i) => {
        const st = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id || null, name: a.name }));
        const share = i === 0 ? 1 : 0.5;
        const before = st.score;
        touch(st, a.name);
        st.score = before + sc * share;
      });
      if (p.album?.id) touch(bump(albums, p.album.id, () => ({ ...emptyStats(), id: p.album.id, name: p.album.name })), p.album.name);
    }
    for (const f of favorites) {
      if (f.type === "artist") {
        const st = bump(artists, f.id ? f.id : `name:${(f.name || "").toLowerCase()}`, () => ({ ...emptyStats(), key: f.id, id: f.id, name: f.name }));
        st.score += weights.favoriteArtist * (f.weight ?? 1);
        st.favorite = true;
      } else if (f.type === "song") {
        const st = bump(songs, f.id, () => ({ ...emptyStats(), videoId: f.id, title: f.name, artists: f.artists || [] }));
        st.score += weights.favoriteSong * (f.weight ?? 1);
        st.favorite = true;
        for (const a of f.artists || []) {
          const as = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id, name: a.name }));
          as.score += weights.favoriteSong * 0.4;
        }
      } else if (f.type === "album") {
        const st = bump(albums, f.id, () => ({ ...emptyStats(), id: f.id, name: f.name }));
        st.score += weights.favoriteAlbum * (f.weight ?? 1);
        st.favorite = true;
        for (const a of f.artists || []) {
          const as = bump(artists, artistKey(a), () => ({ ...emptyStats(), key: artistKey(a), id: a.id, name: a.name }));
          as.score += weights.favoriteAlbum * 0.5;
        }
      }
    }
    const ignored = /* @__PURE__ */ new Set();
    for (const fb of feedback) {
      if (fb.type === "artist") {
        const st = bump(artists, fb.id, () => ({ ...emptyStats(), key: fb.id, id: fb.id?.startsWith("name:") ? null : fb.id, name: fb.name }));
        st.score += weights.feedback * (fb.value || 0);
        st.feedback = fb.value || 0;
      } else if (fb.type === "song") {
        if (fb.ignore) ignored.add(fb.id);
        const st = bump(songs, fb.id, () => ({ ...emptyStats(), videoId: fb.id, title: fb.name, artists: fb.artists || [] }));
        st.score += weights.feedback * (fb.value || 0);
      }
    }
    const maxArtist = Math.max(1, ...[...artists.values()].map((a) => Math.abs(a.score)));
    const maxSong = Math.max(1, ...[...songs.values()].map((s) => Math.abs(s.score)));
    return {
      artists,
      songs,
      albums,
      ignored,
      totals: { plays: total, listenedSec: listened },
      artistAffinity(a) {
        const st = artists.get(typeof a === "string" ? a : artistKey(a));
        return st ? Math.max(-1, Math.min(1, st.score / maxArtist)) : 0;
      },
      songAffinity(videoId) {
        const st = songs.get(videoId);
        return st ? Math.max(-1, Math.min(1, st.score / maxSong)) : 0;
      },
      artistPlays(a) {
        return artists.get(typeof a === "string" ? a : artistKey(a))?.plays || 0;
      },
      songPlays(videoId) {
        return songs.get(videoId)?.plays || 0;
      },
      isHighSkip(videoId, { minSkips = 3, rate = 0.6 } = {}) {
        const st = songs.get(videoId);
        return !!st && st.skips >= minSkips && st.skips / Math.max(1, st.plays) >= rate;
      },
      topArtists(n = 20, { minScore = 0.01 } = {}) {
        return [...artists.values()].filter((a) => a.score > minScore).sort((a, b) => b.score - a.score).slice(0, n);
      },
      topSongs(n = 20) {
        return [...songs.values()].filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, n);
      }
    };
  }

  // src/features/music/data/prefs.js
  var PREFS_BUCKET = "music";
  var isObj2 = (x) => x && typeof x === "object" && !Array.isArray(x);
  var num = (v, def, min, max) => {
    const n = Number(v);
    return v === null || v === void 0 || v === "" || !isFinite(n) ? def : Math.min(max, Math.max(min, n));
  };
  var strList2 = (x) => Array.isArray(x) ? [...new Set(x.map((s) => String(s).trim()).filter(Boolean))] : null;
  var artistList = (x) => Array.isArray(x) ? x.filter((a) => isObj2(a) && (a.id || a.name)).map((a) => ({ id: a.id || null, name: String(a.name || a.id) })) : [];
  var songList = (x) => Array.isArray(x) ? x.filter((s) => isObj2(s) && s.videoId).map((s) => ({ videoId: s.videoId, title: String(s.title || ""), artists: artistList(s.artists) })) : [];
  var PROVIDER_IDS = ["local", "musicbrainz", "lastfm", "ollama"];
  function defaultPrefs() {
    return {
      discovery: 0.5,
      explain: true,
      history: { paused: false, retentionDays: null, minListenSec: 5, recordContext: true },
      blocklist: { artists: [], songs: [], terms: DEFAULT_TERMS.slice() },
      excluded: { artists: [], songs: [] },
      hideVersions: [],
      weights: { ...DEFAULT_WEIGHTS },
      halfLifeDays: 120,
      releases: { enabled: true, intervalHours: 24, maxArtists: 25, includeTopArtists: true, maxAgeDays: 60 },
      smartQueue: { autoSkip: false, skipBlocked: true, skipHighSkip: false, skipDuplicates: true, skipRecentlyPlayed: false, markOnly: false },
      providers: { local: { enabled: true }, musicbrainz: { enabled: false }, lastfm: { enabled: false, apiKey: "" }, ollama: { enabled: false, url: "http://localhost:11434", model: "" } },
      genres: { favorites: [] }
    };
  }
  function normalizePrefs(raw) {
    const d = defaultPrefs();
    if (!isObj2(raw)) return d;
    d.discovery = num(raw.discovery, d.discovery, 0, 1);
    d.explain = raw.explain !== false;
    if (isObj2(raw.history)) {
      d.history.paused = !!raw.history.paused;
      d.history.retentionDays = raw.history.retentionDays == null || raw.history.retentionDays === "" ? null : num(raw.history.retentionDays, null, 1, 3650);
      d.history.minListenSec = num(raw.history.minListenSec, d.history.minListenSec, 0, 120);
      d.history.recordContext = raw.history.recordContext !== false;
    }
    if (isObj2(raw.blocklist)) {
      d.blocklist.artists = artistList(raw.blocklist.artists);
      d.blocklist.songs = songList(raw.blocklist.songs);
      d.blocklist.terms = strList2(raw.blocklist.terms) ?? d.blocklist.terms;
    }
    if (isObj2(raw.excluded)) {
      d.excluded.artists = artistList(raw.excluded.artists);
      d.excluded.songs = songList(raw.excluded.songs);
    }
    d.hideVersions = strList2(raw.hideVersions) || [];
    if (isObj2(raw.weights)) for (const k of Object.keys(d.weights)) d.weights[k] = num(raw.weights[k], d.weights[k], -10, 10);
    d.halfLifeDays = num(raw.halfLifeDays, d.halfLifeDays, 7, 3650);
    if (isObj2(raw.releases)) {
      d.releases.enabled = raw.releases.enabled !== false;
      d.releases.intervalHours = num(raw.releases.intervalHours, d.releases.intervalHours, 6, 24 * 14);
      d.releases.maxArtists = num(raw.releases.maxArtists, d.releases.maxArtists, 1, 100);
      d.releases.includeTopArtists = raw.releases.includeTopArtists !== false;
      d.releases.maxAgeDays = num(raw.releases.maxAgeDays, d.releases.maxAgeDays, 7, 730);
    }
    if (isObj2(raw.smartQueue)) {
      for (const k of Object.keys(d.smartQueue)) if (k in raw.smartQueue) d.smartQueue[k] = !!raw.smartQueue[k];
    }
    if (isObj2(raw.providers)) {
      for (const id of PROVIDER_IDS) {
        const p = raw.providers[id];
        if (!isObj2(p)) continue;
        d.providers[id].enabled = id === "local" ? p.enabled !== false : !!p.enabled;
        for (const k of Object.keys(d.providers[id])) if (k !== "enabled" && typeof p[k] === "string") d.providers[id][k] = p[k];
      }
    }
    if (isObj2(raw.genres)) d.genres.favorites = strList2(raw.genres.favorites) || [];
    return d;
  }
  var SESSION_KEY = "ytx.music.session";
  function readSession() {
    try {
      const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  }
  function writeSession(session) {
    try {
      if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
    }
  }

  // src/features/music/logic/sessions.js
  var SESSION_PRESETS = [
    {
      id: "focus",
      label: "Fokus",
      description: "Ruhig und vertraut, keine Live- oder Remix-Versionen",
      discovery: 0.25,
      extraTerms: ["live", "remix", "sped up", "nightcore"],
      moods: ["konzentration", "focus", "chill", "entspann"],
      skipHighSkip: true
    },
    {
      id: "gym",
      label: "Gym",
      description: "Energie, gerne auch neue Songs",
      discovery: 0.45,
      extraTerms: ["slowed", "acoustic", "akustik", "karaoke"],
      moods: ["workout", "power", "party", "sport"],
      skipHighSkip: true
    },
    {
      id: "evening",
      label: "Abends",
      description: "Entspannt, eher Bekanntes",
      discovery: 0.3,
      extraTerms: ["sped up", "nightcore"],
      moods: ["chill", "entspann", "romantik", "einschlafen", "sleep", "relax"],
      skipHighSkip: true
    },
    {
      id: "explore",
      label: "Entdecken",
      description: "Passende Künstler, die du kaum gehört hast",
      discovery: 0.9,
      extraTerms: [],
      moods: [],
      skipHighSkip: true,
      skipRecentlyPlayed: true
    },
    {
      id: "known",
      label: "Nur bekannte Musik",
      description: "Nur Künstler, die du schon gehört oder favorisiert hast",
      discovery: 0,
      extraTerms: [],
      moods: [],
      onlyKnownArtists: true,
      skipHighSkip: true
    }
  ];
  var presetById3 = Object.fromEntries(SESSION_PRESETS.map((p) => [p.id, p]));
  function effectiveSettings(prefs, session) {
    const p = session?.presetId ? presetById3[session.presetId] : null;
    const terms = [.../* @__PURE__ */ new Set([...prefs.blocklist?.terms || [], ...p?.extraTerms || []])];
    return {
      discovery: p ? p.discovery : prefs.discovery,
      blocklist: { ...prefs.blocklist || {}, terms },
      onlyKnownArtists: !!p?.onlyKnownArtists,
      skipHighSkip: p ? !!p.skipHighSkip : !!prefs.smartQueue?.skipHighSkip,
      skipRecentlyPlayed: p ? !!p.skipRecentlyPlayed : !!prefs.smartQueue?.skipRecentlyPlayed,
      moods: p?.moods || [],
      preset: p
    };
  }
  function matchMood(moods, keywords) {
    if (!keywords?.length) return null;
    const lower = keywords.map((k) => k.toLowerCase());
    return moods.find((m) => lower.some((k) => m.name.toLowerCase().includes(k))) || null;
  }

  // src/features/music/runtime.js
  var handlers = /* @__PURE__ */ new Map();
  function emit2(type, payload) {
    for (const fn of handlers.get(type) || []) {
      try {
        fn(payload);
      } catch (e) {
        log.error(`music event ${type}`, e);
      }
    }
  }
  var profileCache = null;
  var profilePromise = null;
  var invalidate = () => {
    profileCache = null;
    profilePromise = null;
  };
  var music = {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, /* @__PURE__ */ new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit: emit2,
    // ---------- vorlieben ----------
    prefs() {
      return store.bucket(PREFS_BUCKET, normalizePrefs);
    },
    updatePrefs(mutator) {
      const next = store.updateBucket(PREFS_BUCKET, mutator, normalizePrefs);
      invalidate();
      emit2("prefs", next);
      return next;
    },
    session() {
      return readSession();
    },
    setSession(presetId) {
      writeSession(presetId ? { presetId, startedAt: Date.now() } : null);
      emit2("session", readSession());
    },
    effective() {
      return effectiveSettings(this.prefs(), readSession());
    },
    rules() {
      return compileRules(this.effective().blocklist);
    },
    // ---------- verlauf ----------
    history: {
      async add(rec) {
        const p = music.prefs();
        if (p.history.paused) return false;
        if ((rec.listenedSec || 0) < p.history.minListenSec && !rec.completed) return false;
        if (!p.history.recordContext) delete rec.context;
        await musicDb().put("plays", rec);
        await musicDb().put("tracks", { videoId: rec.videoId, title: rec.title, artists: rec.artists, album: rec.album, year: rec.year, durationSec: rec.durationSec, seenAt: rec.endedAt }).catch(() => {
        });
        await setMeta("lastPlayAt", rec.endedAt);
        invalidate();
        emit2("plays", rec);
        return true;
      },
      list({ from = 0, to = Date.now() + DAY } = {}) {
        return musicDb().byIndex("plays", "startedAt", IDBKeyRange.bound(from, to));
      },
      recent(limit = 50) {
        return musicDb().latest("plays", "startedAt", limit);
      },
      count() {
        return musicDb().count("plays");
      },
      async remove(id) {
        await musicDb().delete("plays", id);
        invalidate();
        emit2("plays", null);
      },
      async removeMany(ids) {
        await musicDb().deleteMany("plays", ids);
        invalidate();
        emit2("plays", null);
      },
      async clear() {
        await musicDb().clear("plays");
        await musicDb().clear("tracks");
        invalidate();
        emit2("plays", null);
      },
      async applyRetention() {
        const days = music.prefs().history.retentionDays;
        if (!days) return 0;
        const n = await musicDb().deleteWhere("plays", "startedAt", IDBKeyRange.upperBound(Date.now() - days * DAY));
        if (n) {
          invalidate();
          emit2("plays", null);
        }
        return n;
      }
    },
    // ---------- favoriten ----------
    favorites: {
      all() {
        return musicDb().getAll("favorites");
      },
      byType(type) {
        return musicDb().byIndex("favorites", "type", type);
      },
      async has(type, id) {
        return !!await musicDb().get("favorites", `${type}:${id}`);
      },
      async toggle(item) {
        const key = `${item.type}:${item.id}`;
        const db2 = musicDb();
        const prev2 = await db2.get("favorites", key);
        if (prev2) await db2.delete("favorites", key);
        else await db2.put("favorites", { key, type: item.type, id: item.id, name: item.name || item.title || "", artists: item.artists || [], thumbnail: item.thumbnail || "", weight: item.weight ?? 1, addedAt: Date.now() });
        invalidate();
        emit2("favorites", { key, on: !prev2 });
        return !prev2;
      },
      async setWeight(key, weight) {
        const db2 = musicDb();
        const prev2 = await db2.get("favorites", key);
        if (!prev2) return;
        await db2.put("favorites", { ...prev2, weight });
        invalidate();
        emit2("favorites", { key, on: true });
      },
      async remove(key) {
        await musicDb().delete("favorites", key);
        invalidate();
        emit2("favorites", { key, on: false });
      }
    },
    // ---------- feedback ----------
    feedback: {
      all() {
        return musicDb().getAll("feedback");
      },
      async adjust({ type, id, name, artists, delta = 0, ignore }) {
        const key = `${type}:${id}`;
        const db2 = musicDb();
        const prev2 = await db2.get("feedback", key) || { key, type, id, name, artists: artists || [], value: 0 };
        const next = { ...prev2, name: name || prev2.name, value: Math.max(-3, Math.min(3, (prev2.value || 0) + delta)), ts: Date.now() };
        if (ignore !== void 0) next.ignore = !!ignore;
        await db2.put("feedback", next);
        invalidate();
        emit2("feedback", next);
        return next;
      },
      async remove(key) {
        await musicDb().delete("feedback", key);
        invalidate();
        emit2("feedback", null);
      }
    },
    // aktionen aus empfehlungen und player
    async act(kind, track) {
      const first = track?.artists?.[0];
      const aKey = first ? artistKey(first) : null;
      switch (kind) {
        case "more":
          await music.feedback.adjust({ type: "song", id: track.videoId, name: track.title, artists: track.artists, delta: 1 });
          if (aKey) await music.feedback.adjust({ type: "artist", id: aKey, name: first.name, delta: 0.5 });
          return "Mehr davon gemerkt";
        case "less":
          await music.feedback.adjust({ type: "song", id: track.videoId, name: track.title, artists: track.artists, delta: -1 });
          if (aKey) await music.feedback.adjust({ type: "artist", id: aKey, name: first.name, delta: -0.5 });
          return "Weniger davon gemerkt";
        case "preferArtist":
          if (!aKey) return "Kein Künstler erkannt";
          await music.feedback.adjust({ type: "artist", id: aKey, name: first.name, delta: 2 });
          return `${first.name} wird bevorzugt`;
        case "blockArtist":
          if (!first) return "Kein Künstler erkannt";
          music.updatePrefs((p) => {
            if (!p.blocklist.artists.some((a) => artistKey(a) === aKey)) p.blocklist.artists.push({ id: first.id || null, name: first.name });
          });
          return `${first.name} blockiert`;
        case "ignoreSong":
          await music.feedback.adjust({ type: "song", id: track.videoId, name: track.title, artists: track.artists, delta: -1, ignore: true });
          return "Song wird ignoriert";
        case "excludeArtist":
          if (!first) return "Kein Künstler erkannt";
          music.updatePrefs((p) => {
            if (!p.excluded.artists.some((a) => artistKey(a) === aKey)) p.excluded.artists.push({ id: first.id || null, name: first.name });
          });
          return `${first.name} zählt nicht mehr zum Profil`;
        case "excludeSong":
          music.updatePrefs((p) => {
            if (!p.excluded.songs.some((s) => s.videoId === track.videoId)) p.excluded.songs.push({ videoId: track.videoId, title: track.title, artists: track.artists || [] });
          });
          return "Song zählt nicht mehr zum Profil";
        default:
          return "";
      }
    },
    // ---------- neuerscheinungen ----------
    releases: {
      all() {
        return musicDb().getAll("releases");
      },
      latest(limit = 50) {
        return musicDb().latest("releases", "firstSeen", limit);
      },
      async markSeen() {
        await setMeta("releasesSeenAt", Date.now());
        emit2("releases", null);
      },
      async unseenCount() {
        const seen2 = await getMeta("releasesSeenAt", 0) || 0;
        const list = await musicDb().byIndex("releases", "firstSeen", IDBKeyRange.lowerBound(seen2 + 1));
        return list.filter((r) => r.fresh).length;
      }
    },
    // ---------- profil ----------
    async profile({ now = Date.now() } = {}) {
      if (profileCache && now - profileCache.at < 60 * 1e3) return profileCache.value;
      if (profilePromise) return profilePromise;
      profilePromise = (async () => {
        const p = music.prefs();
        const [plays, favorites, feedback] = await Promise.all([musicDb().getAll("plays"), musicDb().getAll("favorites"), musicDb().getAll("feedback")]);
        const value = buildProfile(plays, { favorites, feedback, excluded: p.excluded, now, weights: p.weights, halfLifeDays: p.halfLifeDays });
        value.playsList = plays;
        profileCache = { at: Date.now(), value };
        profilePromise = null;
        return value;
      })().catch((e) => {
        profilePromise = null;
        throw e;
      });
      return profilePromise;
    },
    invalidate,
    // ---------- export und import ----------
    async exportData() {
      const dump = await musicDb().exportAll(USER_STORES);
      dump.prefs = music.prefs();
      dump.app = "ytx-music";
      return dump;
    },
    async importData(dump, { replace = false } = {}) {
      if (!dump || dump.database !== MUSIC_DB || typeof dump.stores !== "object") throw new Error("keine ytx Music Sicherung");
      const names = await musicDb().importAll(dump, { replace, stores: USER_STORES.filter((s) => Array.isArray(dump.stores[s])) });
      if (dump.prefs) store.updateBucket(PREFS_BUCKET, (p) => Object.assign(p, normalizePrefs(dump.prefs)), normalizePrefs);
      invalidate();
      emit2("plays", null);
      emit2("favorites", null);
      emit2("prefs", music.prefs());
      return names;
    },
    db: musicDb,
    getMeta,
    setMeta
  };
  var scheduleRetention = debounce(() => {
    music.history.applyRetention().catch((e) => log.warn("music retention", e));
  }, 5e3);

  // src/features/music/history.js
  var autoSkipped = /* @__PURE__ */ new Map();
  var historyFeature = {
    id: "m.history",
    site: "music",
    label: "Hörverlauf & Geschmacksprofil",
    group: "Hören",
    description: "Merkt sich lokal, was du wie lange hörst, überspringst oder likest. Grundlage für Empfehlungen und Statistik. Pausieren, löschen und exportieren im Tab „Verlauf & Daten“",
    stability: "hoch",
    settings: {},
    setup(ctx) {
      const tracker = createTracker();
      const stats2 = { samples: 0, saved: 0, dropped: 0, lastSampleAt: 0, lastSaved: null, lastError: null, lastVideo: null };
      let pausedSince = 0;
      const save2 = async (records) => {
        for (const rec of records) {
          const auto = autoSkipped.get(rec.videoId);
          if (auto && Date.now() - auto < 10 * 60 * 1e3) {
            autoSkipped.delete(rec.videoId);
            stats2.dropped++;
            continue;
          }
          try {
            if (await music.history.add(rec)) {
              stats2.saved++;
              stats2.lastSaved = { title: rec.title, percent: rec.percent, skipped: rec.skipped, completed: rec.completed, at: rec.endedAt };
            } else {
              stats2.dropped++;
            }
          } catch (e) {
            stats2.lastError = e.message;
            ctx.log.warn("music history speichern", e);
          }
        }
      };
      const tick2 = () => {
        const t = currentTrack();
        const now = Date.now();
        if (!t) return;
        stats2.samples++;
        stats2.lastSampleAt = now;
        stats2.lastVideo = t.videoId;
        if (!t.playing) {
          pausedSince ||= now;
          if (now - pausedSince > 30 * 60 * 1e3 && tracker.current) save2(tracker.finish("pause", now));
        } else {
          pausedSince = 0;
        }
        const session = music.session();
        const meta = { title: t.title, artists: t.artists, album: t.album, year: t.year, durationSec: t.durationSec };
        const out = tracker.sample({ ts: now, videoId: t.videoId, pos: t.pos, dur: t.dur, playing: t.playing, ad: t.ad, liked: t.liked, rate: t.rate, meta, context: { page: ctx.nav.page, playlistId: ctx.nav.playlistId || null, session: session?.presetId || null, videoType: t.videoType } });
        if (out.length) save2(out);
      };
      const timer2 = setInterval(tick2, 1e3);
      const offHide = listen(window, "pagehide", () => save2(tracker.finish("close", Date.now())));
      scheduleRetention();
      const daily = setInterval(scheduleRetention, 6 * 3600 * 1e3);
      tick2();
      return {
        stats: stats2,
        tracker,
        dispose() {
          clearInterval(timer2);
          clearInterval(daily);
          offHide();
          save2(tracker.finish("close", Date.now()));
        },
        health() {
          const p = music.prefs();
          if (p.history.paused) return { status: "warn", detail: "Hörverlauf pausiert" };
          if (stats2.lastError) return { status: "fail", detail: `Speichern fehlgeschlagen: ${stats2.lastError}` };
          if (!stats2.lastVideo) return { status: "skip", detail: "Noch kein Titel erkannt" };
          const cur = tracker.current;
          return { status: "ok", detail: `${cur ? `läuft: ${cur.meta?.title || cur.videoId} · ${Math.round(cur.listened)} s gehört` : "bereit"} · ${stats2.saved} gespeichert in dieser Sitzung` };
        }
      };
    }
  };

  // src/features/music/ui.js
  var PAGE_CSS = `
.ytx-m-iconbtn { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 18px; cursor: pointer; user-select: none;
  font: 500 18px/1 Roboto, Arial, sans-serif; color: var(--ytmusic-text-secondary, #aaa); background: transparent; flex: none; }
.ytx-m-iconbtn:hover { color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.1); }
.ytx-m-iconbtn[aria-pressed="true"] { color: #ffc83d; }
.ytx-m-iconbtn .ytx-m-lbl { font-size: 13px; margin-left: 6px; }
.ytx-m-pill { all: initial; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 18px; cursor: pointer; user-select: none; white-space: nowrap;
  font: 500 14px/36px Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.1); }
.ytx-m-pill:hover { background: rgba(255,255,255,.2); }
.ytx-m-pill[data-badge]:after { content: attr(data-badge); margin-left: 2px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; box-sizing: border-box; font-size: 11px; line-height: 18px; text-align: center; color: #fff; background: #e53935; }
.ytx-m-info { all: initial; display: block; padding: 6px 16px; font: 400 12px/1.4 Roboto, Arial, sans-serif; color: var(--ytmusic-text-secondary, #aaa); }
.ytx-m-info b { font-weight: 500; color: var(--ytmusic-text-primary, #fff); }
.ytx-m-mark { all: initial; display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 4px; font: 500 10px/16px Roboto, Arial, sans-serif; color: #fff; background: rgba(229,57,53,.85); vertical-align: middle; white-space: nowrap; }
.ytx-m-mark[data-kind="highSkip"] { background: rgba(255,152,0,.85); }
.ytx-m-mark[data-kind="duplicate"], .ytx-m-mark[data-kind="recent"] { background: rgba(120,120,120,.85); }
ytmusic-player-queue-item[data-ytx-skip] { opacity: .55; }
ytmusic-player-queue-item[data-ytx-skip]:hover { opacity: 1; }
.ytx-m-bar-btns { display: inline-flex; align-items: center; gap: 2px; margin: 0 4px; }
`;
  function initMusicUiCss() {
    setCss("music.ui", PAGE_CSS);
  }
  function iconButton({ icon, label, title, pressed, onClick }) {
    const b = h("button", { type: "button", class: "ytx-m-iconbtn", title: title || label || "", "aria-pressed": pressed == null ? void 0 : String(!!pressed) }, h("span", { text: icon }), label && h("span", { class: "ytx-m-lbl", text: label }));
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(e, b);
    });
    return b;
  }
  function pill({ label, title, onClick }) {
    const b = h("button", { type: "button", class: "ytx-m-pill", title: title || label, text: label });
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(e, b);
    });
    return b;
  }
  var DRAWER_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { position: fixed; z-index: 2200; top: 64px; right: 0; bottom: 72px; width: min(520px, 100vw); display: flex; flex-direction: column;
  font: 400 14px/1.4 Roboto, Arial, sans-serif; color: var(--ytmusic-text-primary, #fff); background: var(--ytx-m-bg, #121212); border-left: 1px solid rgba(255,255,255,.1); box-shadow: -8px 0 32px rgba(0,0,0,.45); }
.wrap[hidden] { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
header h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 500; }
.tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 14px 8px; }
.tab, .chip { border: 0; cursor: pointer; padding: 5px 11px; border-radius: 14px; font: 500 12px/1.3 inherit; font-family: inherit; color: var(--ytmusic-text-primary, #fff); background: rgba(255,255,255,.08); }
.tab:hover, .chip:hover { background: rgba(255,255,255,.16); }
.tab[aria-selected="true"], .chip[aria-pressed="true"] { color: #000; background: #fff; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 4px 14px 8px; border-bottom: 1px solid rgba(255,255,255,.08); }
.tools label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.tools input[type=range] { width: 130px; accent-color: #fff; }
.tools select, .tools input[type=search] { font: inherit; font-size: 12px; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,.15); color: inherit; background: rgba(255,255,255,.06); }
.tools select option { color: #000; }
main { flex: 1; overflow: auto; padding: 6px 6px 16px; }
.status { padding: 8px 10px; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.status.err { color: #ff8a80; }
.row { display: grid; grid-template-columns: 44px 1fr auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 8px; }
.row:hover { background: rgba(255,255,255,.06); }
.row img, .row .ph { width: 44px; height: 44px; border-radius: 4px; object-fit: cover; background: rgba(255,255,255,.08); }
.row .t { min-width: 0; }
.row .title { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 500; }
.row .sub { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 12px; color: var(--ytmusic-text-secondary, #aaa); }
.reasons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
.reason { font-size: 10.5px; padding: 1px 6px; border-radius: 4px; color: var(--ytmusic-text-secondary, #bbb); background: rgba(255,255,255,.07); }
.acts { display: flex; gap: 2px; opacity: .55; }
.row:hover .acts { opacity: 1; }
.ib { border: 0; cursor: pointer; width: 30px; height: 30px; border-radius: 15px; font-size: 15px; color: inherit; background: transparent; }
.ib:hover { background: rgba(255,255,255,.12); }
.btn { border: 0; cursor: pointer; padding: 6px 12px; border-radius: 16px; font: 500 12px/1.3 inherit; font-family: inherit; color: #000; background: #fff; }
.btn.sec { color: inherit; background: rgba(255,255,255,.1); }
.btn:disabled { opacity: .5; cursor: default; }
.menu { position: fixed; z-index: 10; min-width: 200px; padding: 6px 0; border-radius: 10px; background: #282828; box-shadow: 0 6px 24px rgba(0,0,0,.5); }
.menu button { display: block; width: 100%; padding: 7px 14px; border: 0; text-align: left; font: inherit; color: inherit; background: none; cursor: pointer; }
.menu button:hover { background: rgba(255,255,255,.08); }
.section-title { padding: 10px 10px 4px; font-size: 12px; font-weight: 500; letter-spacing: .03em; text-transform: uppercase; color: var(--ytmusic-text-secondary, #aaa); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; padding: 4px 8px; }
.card { cursor: pointer; min-width: 0; }
.card img { width: 100%; aspect-ratio: 1; border-radius: 6px; object-fit: cover; background: rgba(255,255,255,.08); }
.card .title { font-size: 12px; font-weight: 500; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.card .sub { font-size: 11px; color: var(--ytmusic-text-secondary, #aaa); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.new { color: #ffc83d; }
`;
  function createDrawer({ title, onClose }) {
    const host2 = h("ytx-music-drawer", { "data-ytx-own": "" });
    const shadow = host2.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = DRAWER_CSS;
    const heading = h("h2", { text: title });
    const close = h("button", { class: "ib", title: "Schließen", text: "✕" });
    const tabs = h("div", { class: "tabs" });
    const tools = h("div", { class: "tools" });
    const main = h("main");
    const wrap = h("div", { class: "wrap", hidden: true }, h("header", null, heading, close), tabs, tools, main);
    shadow.append(style, wrap);
    close.addEventListener("click", () => api.close());
    for (const type of ["keydown", "keyup", "keypress"]) listen(shadow, type, (e) => {
      if (e.key === "Escape" && type === "keydown") api.close();
      e.stopPropagation();
    });
    let menu = null;
    const closeMenu2 = () => {
      menu?.remove();
      menu = null;
    };
    listen(shadow, "click", (e) => {
      if (menu && !menu.contains(e.composedPath()[0])) closeMenu2();
    });
    const api = {
      host: host2,
      shadow,
      tabs,
      tools,
      main,
      setTitle: (t) => heading.textContent = t,
      get isOpen() {
        return !wrap.hidden;
      },
      open() {
        if (!host2.isConnected) document.documentElement.append(host2);
        wrap.hidden = false;
      },
      close() {
        wrap.hidden = true;
        closeMenu2();
        onClose?.();
      },
      toggle() {
        wrap.hidden ? api.open() : api.close();
      },
      menu(anchor, items) {
        closeMenu2();
        const r = anchor.getBoundingClientRect();
        menu = h("div", { class: "menu" });
        for (const [label, fn] of items) {
          const b = h("button", { type: "button", text: label });
          b.addEventListener("click", (e) => {
            e.stopPropagation();
            closeMenu2();
            fn();
          });
          menu.append(b);
        }
        wrap.append(menu);
        const w = 220;
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
        menu.style.top = `${Math.min(window.innerHeight - 260, r.bottom + 4)}px`;
      }
    };
    onDispose(() => host2.remove());
    return api;
  }
  function artistNames(t) {
    return (t.artists || []).map((a) => a.name).join(", ");
  }
  function trackRow(item, { explain = true, onPlay, onMenu, extra } = {}) {
    const img = item.thumbnail ? h("img", { src: item.thumbnail, loading: "lazy", alt: "" }) : h("div", { class: "ph" });
    const sub = [artistNames(item), item.album?.name, item.durationSec ? formatDuration(item.durationSec) : null].filter(Boolean).join(" · ");
    const reasons = explain && item.reasons?.length ? h("div", { class: "reasons" }, ...item.reasons.slice(0, 4).map((r) => h("span", { class: "reason", text: r }))) : null;
    const play = h("button", { class: "ib", title: "Abspielen", text: "▶" });
    const more = h("button", { class: "ib", title: "Feedback und mehr", text: "⋯" });
    play.addEventListener("click", (e) => {
      e.stopPropagation();
      onPlay?.(item);
    });
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      onMenu?.(item, more);
    });
    const row2 = h("div", { class: "row" }, img, h("div", { class: "t" }, h("div", { class: "title", text: item.title || item.videoId }), h("div", { class: "sub", text: sub }), reasons, extra), h("div", { class: "acts" }, play, more));
    row2.addEventListener("dblclick", () => onPlay?.(item));
    return row2;
  }

  // src/features/music/favorites.js
  function pageSubject() {
    const b = currentBrowse();
    if (!b) return null;
    const id = b.browseId;
    if (/^UC[\w-]{22}$/.test(id)) {
      const a = parseArtistPage(b.response, id);
      return a.name ? { type: "artist", id, name: a.name, thumbnail: "" } : null;
    }
    if (/^MPREb_/.test(id)) {
      const c = parseCollectionPage(b.response, { browseId: id });
      return c.title ? { type: "album", id, name: c.title, artists: c.artists } : null;
    }
    if (/^VL/.test(id)) {
      const c = parseCollectionPage(b.response, { browseId: id });
      return c.title ? { type: "playlist", id: id.replace(/^VL/, ""), name: c.title } : null;
    }
    return null;
  }
  var TYPE_LABEL = { song: "Song", artist: "Künstler", album: "Album", playlist: "Playlist" };
  var favoritesFeature = {
    id: "m.favorites",
    site: "music",
    label: "Favoriten (★)",
    group: "Hören",
    description: "Stern in der Playerleiste und auf Künstler-, Album- und Playlist-Seiten. Favoriten zählen stärker als Likes und steuern „Für dich“ und Neuerscheinungen",
    stability: "mittel-hoch",
    anchors: ["m.bar.middleButtons", "m.header.buttons"],
    hotkeys: [["music.favorite", "Aktuellen Song favorisieren", "Alt+F"]],
    settings: {
      barButton: { type: "toggle", label: "Stern in der Playerleiste", default: true },
      pageButton: { type: "toggle", label: "Stern auf Künstler/Album/Playlist-Seiten", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      const state = { bar: null, page: null };
      const refreshBar = async (node) => {
        const t = currentTrack();
        if (!t) return;
        const keys = [`song:${t.videoId}`, ...(t.artists || []).filter((a) => a.id).map((a) => `artist:${a.id}`)];
        const cacheKey = keys.join("|");
        if (node.__key === cacheKey && Date.now() - (node.__at || 0) < 4e3) return;
        node.__key = cacheKey;
        node.__at = Date.now();
        const on = await music.favorites.has("song", t.videoId);
        node.setAttribute("aria-pressed", String(on));
        node.title = on ? "Song ist Favorit – klicken für Optionen" : "Favorisieren";
      };
      const barMenu = async (btn2) => {
        const t = currentTrack();
        if (!t) return toast("Kein Titel erkannt");
        const items = [{ title: t.title }];
        const songOn = await music.favorites.has("song", t.videoId);
        items.push({ label: songOn ? "Song nicht mehr favorisieren" : "Song favorisieren", checked: songOn, run: () => toggle2({ type: "song", id: t.videoId, name: t.title, artists: t.artists, thumbnail: t.thumbnail }) });
        for (const a of (t.artists || []).filter((x) => x.id)) {
          const on = await music.favorites.has("artist", a.id);
          items.push({ label: on ? `${a.name} nicht mehr favorisieren` : `${a.name} favorisieren`, checked: on, run: () => toggle2({ type: "artist", id: a.id, name: a.name }) });
        }
        if (t.album?.id) {
          const on = await music.favorites.has("album", t.album.id);
          items.push({ label: on ? "Album nicht mehr favorisieren" : `Album „${t.album.name}“ favorisieren`, checked: on, run: () => toggle2({ type: "album", id: t.album.id, name: t.album.name, artists: t.artists }) });
        }
        items.push({ sep: true }, { label: "Mehr davon", run: () => act("more", t) }, { label: "Weniger davon", run: () => act("less", t) }, { label: "Song ignorieren", run: () => act("ignoreSong", t) });
        if (t.artists?.[0]) items.push({ label: `${t.artists[0].name} blockieren`, run: () => act("blockArtist", t) });
        showMenu(btn2, items);
      };
      const act = async (kind, t) => toast(await music.act(kind, t));
      const toggle2 = async (item) => {
        const on = await music.favorites.toggle(item);
        toast(`${TYPE_LABEL[item.type]} ${on ? "favorisiert" : "entfernt"}: ${item.name}`);
        if (state.bar?.node) state.bar.node.__at = 0;
        state.bar?.refresh();
        state.page?.refresh();
      };
      state.bar = ctx.mount({
        id: "m.fav.bar",
        anchor: "m.bar.middleButtons",
        position: "prepend",
        when: () => s.barButton,
        create: () => iconButton({ icon: "★", title: "Favorisieren", pressed: false, onClick: (e, b) => barMenu(b) }),
        update: (node) => refreshBar(node)
      });
      state.page = ctx.mount({
        id: "m.fav.page",
        anchor: "m.header.buttons",
        position: "append",
        when: () => s.pageButton && ["artist", "album", "playlist"].includes(ctx.nav.page),
        create: () => {
          const b = iconButton({
            icon: "★",
            label: "Favorit",
            pressed: false,
            onClick: async () => {
              const subj = pageSubject();
              if (!subj) return toast("Seite noch nicht erkannt");
              await toggle2(subj);
            }
          });
          b.style.marginLeft = "8px";
          return b;
        },
        update: async (node) => {
          const subj = pageSubject();
          if (!subj) return;
          const key = `${subj.type}:${subj.id}`;
          if (node.__key === key && Date.now() - (node.__at || 0) < 4e3) return;
          node.__key = key;
          node.__at = Date.now();
          const on = await music.favorites.has(subj.type, subj.id);
          node.setAttribute("aria-pressed", String(on));
          node.querySelector(".ytx-m-lbl").textContent = on ? `${TYPE_LABEL[subj.type]}-Favorit` : "Favorit";
        }
      });
      const off = music.on("favorites", () => {
        if (state.bar.node) state.bar.node.__at = 0;
        if (state.page.node) state.page.node.__at = 0;
        state.bar.refresh();
        state.page.refresh();
      });
      ctx.action("music.favorite", async () => {
        const t = currentTrack();
        if (t) await toggle2({ type: "song", id: t.videoId, name: t.title, artists: t.artists, thumbnail: t.thumbnail });
      });
      return {
        update(next) {
          s = next;
          state.bar.refresh();
          state.page.refresh();
        },
        onVideo() {
          state.bar.refresh();
        },
        onPage() {
          state.page.refresh();
        },
        dispose() {
          off();
          state.bar.destroy();
          state.page.destroy();
        },
        health() {
          if (s.barButton && !state.bar.ok) return { status: currentTrack() ? "warn" : "skip", detail: currentTrack() ? "Playerleiste nicht gefunden" : "Kein Titel aktiv" };
          return { status: "ok", detail: `Stern ${state.bar.ok ? "in der Playerleiste" : ""}${state.page.ok ? " und auf der Seite" : ""}` };
        }
      };
    }
  };

  // src/core/pageData.js
  function createPageLoader({ extract, cache: cache4, minIntervalMs = 1800, maxAgeMs = 24 * 3600 * 1e3 }) {
    const stats2 = { requests: 0, cacheHits: 0, errors: 0, lastError: null, lastUrl: null, lastAt: 0, lastMs: 0, queued: 0, disabled: false };
    const inflight = /* @__PURE__ */ new Map();
    let chain = Promise.resolve();
    let nextAllowed = 0;
    let stopped = false;
    async function fetchParsed(path) {
      const wait = nextAllowed - Date.now();
      if (wait > 0) await sleep(wait);
      if (stopped) throw new Error("loader gestoppt");
      nextAllowed = Date.now() + minIntervalMs;
      const t0 = performance.now();
      stats2.requests++;
      stats2.lastUrl = path;
      const res = await fetch(path, { credentials: "include", headers: { accept: "text/html" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const parsed = extract(html);
      stats2.lastMs = Math.round(performance.now() - t0);
      stats2.lastAt = Date.now();
      if (!parsed) throw new Error("keine seitendaten im html");
      return parsed;
    }
    async function load3(path, { maxAge = maxAgeMs, force = false, cacheOnly = false, transform = (x) => x } = {}) {
      const key = `page:${path}`;
      if (!force && cache4) {
        try {
          const hit = await cache4.get(key);
          if (hit && (cacheOnly || Date.now() - hit.ts < maxAge)) {
            stats2.cacheHits++;
            return hit.value;
          }
        } catch {
        }
      }
      if (cacheOnly) throw new Error("nicht im cache");
      if (stats2.disabled) throw new Error("hintergrund laden deaktiviert");
      if (inflight.has(key)) return inflight.get(key);
      stats2.queued++;
      const p = chain = chain.then(async () => {
        try {
          const value = transform(await fetchParsed(path));
          if (cache4) await cache4.set(key, value).catch(() => {
          });
          return value;
        } catch (e) {
          stats2.errors++;
          stats2.lastError = `${path}: ${e.message}`;
          log.warn("pageData", stats2.lastError);
          throw e;
        } finally {
          stats2.queued--;
          inflight.delete(key);
        }
      });
      inflight.set(key, p);
      chain = p.catch(() => {
      });
      return p;
    }
    return {
      stats: stats2,
      load: load3,
      stop() {
        stopped = true;
      }
    };
  }

  // src/registry/music/initialData.js
  var RE = /initialData\.push\(\{path: '((?:\\.|[^'])*)', params: JSON\.parse\('((?:\\.|[^'])*)'\), data: '((?:\\.|[^'])*)'\}\)/g;
  var SIMPLE = { n: "\n", r: "\r", t: "	", b: "\b", f: "\f", v: "\v", 0: "\0" };
  function unescapeJs(s) {
    return s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[\s\S])/g, (_, e) => {
      if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
      if (e[0] === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
      return SIMPLE[e] ?? e;
    });
  }
  function extractInitialData(html) {
    const out = [];
    RE.lastIndex = 0;
    let m;
    while (m = RE.exec(html)) {
      try {
        out.push({ path: unescapeJs(m[1]), params: JSON.parse(unescapeJs(m[2])), data: JSON.parse(unescapeJs(m[3])) });
      } catch (e) {
        out.push({ path: null, error: e.message });
      }
    }
    return out;
  }
  function mainData(html) {
    const blocks = extractInitialData(html);
    const main = blocks.find((b) => b.path && b.path !== "/guide");
    return main ? { path: main.path, params: main.params, data: main.data } : null;
  }

  // src/features/music/data/catalog.js
  var HOUR = 3600 * 1e3;
  var cache2 = {
    async get(key) {
      const r = await musicDb().get("cache", key);
      return r ? { value: r.value, ts: r.ts } : null;
    },
    set(key, value) {
      return musicDb().put("cache", { key, value, ts: Date.now() });
    }
  };
  var loader = createPageLoader({ extract: mainData, cache: cache2, minIntervalMs: 2e3, maxAgeMs: 12 * HOUR });
  var catalog = {
    stats: loader.stats,
    artist(id, opts = {}) {
      return loader.load(`/channel/${encodeURIComponent(id)}`, { maxAge: 24 * HOUR, ...opts, transform: (m) => parseArtistPage(m.data, id) });
    },
    album(browseId, opts = {}) {
      return loader.load(`/browse/${encodeURIComponent(browseId)}`, { maxAge: 7 * 24 * HOUR, ...opts, transform: (m) => parseCollectionPage(m.data, { ...m.params, browseId }) });
    },
    playlist(id, opts = {}) {
      return loader.load(`/playlist?list=${encodeURIComponent(id)}`, { maxAge: 12 * HOUR, ...opts, transform: (m) => parseCollectionPage(m.data, { ...m.params, browseId: `VL${id}` }) });
    },
    search(query, opts = {}) {
      return loader.load(`/search?q=${encodeURIComponent(query)}`, { maxAge: 24 * HOUR, ...opts, transform: (m) => parseSearchPage(m.data) });
    },
    moods(opts = {}) {
      return loader.load("/moods_and_genres", { maxAge: 7 * 24 * HOUR, ...opts, transform: (m) => parseMoodsPage(m.data) });
    },
    async clearCache() {
      await musicDb().clear("cache");
    },
    async cacheInfo() {
      const db2 = musicDb();
      const count = await db2.count("cache").catch(() => 0);
      const newest = await db2.latest("cache", "ts", 1).catch(() => []);
      return { count, newest: newest[0]?.ts || 0 };
    }
  };

  // src/features/music/logic/recommend.js
  var SOURCE_WEIGHTS = {
    seed: 1.1,
    favoriteArtist: 1,
    release: 0.9,
    topArtist: 0.8,
    similar: 0.65,
    history: 0.6,
    genre: 0.5,
    featured: 0.4,
    search: 0.35
  };
  function discoveryValue(mode) {
    if (typeof mode === "number") return Math.max(0, Math.min(1, mode));
    return { familiar: 0.1, balanced: 0.5, explore: 0.9 }[mode] ?? 0.5;
  }
  function reasonText(src, ctx) {
    switch (src.kind) {
      case "seed":
        return src.via ? `Passend zu ${src.via}` : "Passend zum Startpunkt";
      case "favoriteArtist":
        return "Favorisierter Künstler";
      case "release":
        return "Neu von einem Favoriten";
      case "topArtist":
        return "Oft von dir gehört";
      case "similar":
        return `Ähnlich zu ${src.via}`;
      case "genre":
        return `Genre: ${src.genre}`;
      case "featured":
        return src.via ? `Von Fans von ${src.via} gehört` : "Von Fans deiner Favoriten häufig gehört";
      case "history":
        return "Lange nicht gehört";
      case "search":
        return src.via ? `Suche: ${src.via}` : "Suchtreffer";
      default:
        return null;
    }
  }
  function mergeCandidates(list) {
    const byId = /* @__PURE__ */ new Map();
    for (const c of list) {
      if (!c?.videoId) continue;
      const prev2 = byId.get(c.videoId);
      if (prev2) {
        prev2.sources.push(...c.sources || []);
        if (!prev2.album && c.album) prev2.album = c.album;
        if (!prev2.durationSec && c.durationSec) prev2.durationSec = c.durationSec;
        if ((!prev2.artists?.length || prev2.artists.every((a) => !a.id)) && c.artists?.some((a) => a.id)) prev2.artists = c.artists;
      } else {
        byId.set(c.videoId, { ...c, sources: [...c.sources || []] });
      }
    }
    return [...byId.values()];
  }
  function scoreCandidate(c, profile, opts) {
    const d = opts.discovery;
    const now = opts.now;
    let rel = 0;
    let fit = 0;
    const reasons = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const s of c.sources) {
      const w = (SOURCE_WEIGHTS[s.kind] ?? 0.3) * (s.weight ?? 1);
      rel = Math.max(rel, w) + Math.min(w, rel) * 0.25;
      if (s.viaKey) fit = Math.max(fit, profile.artistAffinity(s.viaKey) * (s.kind === "similar" ? 0.6 : 0.4));
      const txt = reasonText(s);
      if (txt && !seen2.has(txt)) {
        seen2.add(txt);
        reasons.push(txt);
      }
    }
    const keys = (c.artists || []).map(artistKey);
    const aff = keys.length ? Math.max(...keys.map((k) => profile.artistAffinity(k))) : 0;
    const artistPlays = keys.length ? Math.max(...keys.map((k) => profile.artistPlays(k))) : 0;
    const songPlays = profile.songPlays(c.videoId);
    const knownArtist = Math.min(1, artistPlays / 8);
    const knownSong = Math.min(1, songPlays / 3);
    const fam = 0.6 * knownArtist + 0.4 * knownSong;
    const mix = (1 - d) * (0.3 + 0.7 * fam) + d * (0.3 + 0.7 * (1 - fam));
    let score = (rel + fit + 0.8 * Math.max(0, aff) * (1 - 0.7 * d) + 0.3 * Math.max(0, profile.songAffinity(c.videoId)) * (1 - d)) * mix;
    if (aff < 0) score += aff * 1.2;
    if (profile.isHighSkip(c.videoId)) {
      score -= 1;
      reasons.push("Oft übersprungen");
    }
    const last2 = profile.songs.get(c.videoId)?.lastPlayed || 0;
    if (last2 && now - last2 < (opts.recentHours ?? 3) * 3600 * 1e3 && !c.sources.some((s) => s.kind === "history")) score -= 0.6;
    const favoriteArtist = keys.some((k) => profile.artists.get(k)?.favorite);
    if (!songPlays && !artistPlays && !favoriteArtist) reasons.push("Noch nie gehört");
    if (last2 && now - last2 > (opts.longAgoDays ?? 45) * DAY && profile.songs.get(c.videoId)?.score > 0 && !reasons.includes("Lange nicht gehört")) reasons.push("Lange nicht gehört");
    return { score, reasons, familiarity: fam, affinity: aff };
  }
  function rank(candidates, profile, options = {}) {
    const opts = {
      discovery: discoveryValue(options.discovery ?? 0.5),
      now: options.now ?? Date.now(),
      rules: options.rules || null,
      excluded: options.excluded || {},
      hideVersions: options.hideVersions || [],
      onlyKnownArtists: !!options.onlyKnownArtists,
      maxPerArtist: options.maxPerArtist ?? null,
      limit: options.limit ?? 50,
      recentHours: options.recentHours,
      longAgoDays: options.longAgoDays,
      excludeIds: options.excludeIds || /* @__PURE__ */ new Set()
    };
    const scored = [];
    for (const c of mergeCandidates(candidates)) {
      if (opts.excludeIds.has(c.videoId)) continue;
      if (profile.ignored?.has(c.videoId)) continue;
      if (opts.rules && blockReason(c, opts.rules)) continue;
      if (isExcluded(c, opts.excluded)) continue;
      if (opts.hideVersions.length && versionTags(c.title).some((t) => opts.hideVersions.includes(t))) continue;
      if (opts.onlyKnownArtists) {
        const known = (c.artists || []).some((a) => profile.artistPlays(artistKey(a)) >= 2 || profile.artists.get(artistKey(a))?.favorite);
        if (!known) continue;
      }
      scored.push({ ...c, ...scoreCandidate(c, profile, opts) });
    }
    scored.sort((a, b) => b.score - a.score);
    const keys = /* @__PURE__ */ new Set();
    const perArtist = /* @__PURE__ */ new Map();
    const cap = opts.maxPerArtist ?? (opts.discovery > 0.7 ? 2 : opts.discovery < 0.3 ? 4 : 3);
    const out = [];
    for (const c of scored) {
      const k = trackKey(c);
      if (keys.has(k)) continue;
      const a = artistKey(c.artists?.[0]);
      const n = perArtist.get(a) || 0;
      if (a && n >= cap) continue;
      keys.add(k);
      perArtist.set(a, n + 1);
      out.push(c);
      if (out.length >= opts.limit) break;
    }
    return out;
  }

  // src/features/music/metadataProviders/local.js
  var localProvider = {
    id: "local",
    label: "Lokal (YouTube-Music-Seiten + eigener Verlauf)",
    external: false,
    note: "Ähnliche Künstler aus „Fans hören auch“ der Künstlerseite",
    available: () => true,
    async similarArtists(artist) {
      if (!artist?.id) return [];
      const page = await catalog.artist(artist.id);
      return (page.similar || []).map((a) => ({ id: a.id, name: a.name }));
    },
    async genresOf() {
      return [];
    }
  };

  // src/features/music/metadataProviders/http.js
  function hasGmRequest() {
    return typeof GM_xmlhttpRequest === "function";
  }
  function gmJson(url, { method = "GET", headers = {}, body = null, timeout = 15e3 } = {}) {
    return new Promise((resolve, reject) => {
      if (!hasGmRequest()) return reject(new Error("GM_xmlhttpRequest nicht verfügbar"));
      GM_xmlhttpRequest({
        url,
        method,
        headers,
        data: body,
        timeout,
        responseType: "json",
        onload: (r) => {
          if (r.status < 200 || r.status >= 300) return reject(new Error(`HTTP ${r.status}`));
          try {
            resolve(typeof r.response === "object" && r.response ? r.response : JSON.parse(r.responseText));
          } catch (e) {
            reject(e);
          }
        },
        onerror: () => reject(new Error("Netzwerkfehler")),
        ontimeout: () => reject(new Error("Zeitüberschreitung"))
      });
    });
  }

  // src/features/music/metadataProviders/musicbrainz.js
  var musicbrainzProvider = {
    id: "musicbrainz",
    label: "MusicBrainz (Genres)",
    external: true,
    note: "Schickt Künstlernamen an musicbrainz.org. Braucht Tampermonkey-Freigabe für die Domain",
    available: () => hasGmRequest(),
    async genresOf(artist) {
      if (!artist?.name) return [];
      const q2 = encodeURIComponent(`artist:"${artist.name}"`);
      const r = await gmJson(`https://musicbrainz.org/ws/2/artist/?query=${q2}&limit=1&fmt=json`, { headers: { accept: "application/json" } });
      const a = r?.artists?.[0];
      if (!a || (a.score ?? 0) < 90) return [];
      return (a.tags || []).sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 5).map((t) => t.name);
    }
  };

  // src/features/music/metadataProviders/lastfm.js
  var lastfmProvider = {
    id: "lastfm",
    label: "Last.fm (ähnliche Künstler, Tags)",
    external: true,
    note: "Braucht einen eigenen API-Key. Schickt Künstlernamen an last.fm",
    available: (prefs) => hasGmRequest() && !!prefs?.providers?.lastfm?.apiKey,
    async similarArtists(artist, prefs) {
      const key = prefs.providers.lastfm.apiKey;
      const r = await gmJson(`https://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist=${encodeURIComponent(artist.name)}&limit=15&api_key=${encodeURIComponent(key)}&format=json`);
      return (r?.similarartists?.artist || []).map((a) => ({ id: null, name: a.name }));
    },
    async genresOf(artist, prefs) {
      const key = prefs.providers.lastfm.apiKey;
      const r = await gmJson(`https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artist.name)}&api_key=${encodeURIComponent(key)}&format=json`);
      return (r?.toptags?.tag || []).slice(0, 5).map((t) => t.name);
    }
  };

  // src/features/music/metadataProviders/ollama.js
  var ollamaProvider = {
    id: "ollama",
    label: "Ollama (lokales Modell)",
    external: true,
    note: "Läuft auf deinem Rechner. Schätzt Genres, kann sich irren",
    available: (prefs) => hasGmRequest() && !!prefs?.providers?.ollama?.model,
    async genresOf(artist, prefs) {
      const { url, model } = prefs.providers.ollama;
      const prompt = `Nenne bis zu 3 Musikgenres für den Künstler "${artist.name}". Antworte nur mit einer JSON-Liste von Strings.`;
      const r = await gmJson(`${url.replace(/\/$/, "")}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model, prompt, stream: false, format: "json" }), timeout: 3e4 });
      try {
        const v = JSON.parse(r?.response || "[]");
        const list = Array.isArray(v) ? v : Object.values(v).flat();
        return list.filter((x) => typeof x === "string").slice(0, 3);
      } catch {
        return [];
      }
    }
  };

  // src/features/music/metadataProviders/index.js
  var providers = [localProvider, musicbrainzProvider, lastfmProvider, ollamaProvider];
  function activeProviders(prefs) {
    return providers.filter((p) => prefs.providers?.[p.id]?.enabled && p.available(prefs));
  }
  async function collect(prefs, method, ...args) {
    const out = [];
    for (const p of activeProviders(prefs)) {
      if (typeof p[method] !== "function") continue;
      try {
        const r = await p[method](...args, prefs);
        if (Array.isArray(r)) out.push(...r.map((x) => typeof x === "object" ? { ...x, source: x.source || p.id } : x));
      } catch (e) {
        p.lastError = e.message;
      }
    }
    return out;
  }
  var metadata = {
    similarArtists: (artist, prefs) => collect(prefs, "similarArtists", artist),
    genresOf: async (artist, prefs) => [...new Set(await collect(prefs, "genresOf", artist))],
    status(prefs) {
      return providers.map((p) => ({ id: p.id, label: p.label, external: p.external, enabled: !!prefs.providers?.[p.id]?.enabled, available: p.available(prefs), note: p.note, lastError: p.lastError || null }));
    }
  };

  // src/features/music/mixes.js
  var MIXES = [
    ["forYou", "Für dich"],
    ["releases", "Neu von deinen Künstlern"],
    ["genre", "Genre passend zu dir"],
    ["longAgo", "Lange nicht gehört"],
    ["neverHeard", "Noch nie gehört"],
    ["similar", "Ähnlich wie dieser Künstler"],
    ["moreFrom", "Mehr von diesem Künstler"],
    ["radio", "Smart Radio"]
  ];

  // src/features/music/engine.js
  function toCandidate(t, source) {
    if (!t?.videoId) return null;
    return { videoId: t.videoId, title: t.title, artists: t.artists || [], album: t.album || null, year: t.year ?? null, durationSec: t.durationSec || null, thumbnail: t.thumbnail || "", videoType: t.videoType || null, sources: [source] };
  }
  function budget(max, report) {
    const start = loader.stats.requests;
    const errors = [];
    return {
      errors,
      get used() {
        return loader.stats.requests - start;
      },
      async get(fn) {
        const over = loader.stats.requests - start >= max;
        try {
          return await fn(over ? { cacheOnly: true } : {});
        } catch (e) {
          if (!/nicht im cache/.test(e.message)) errors.push(e.message);
          return null;
        } finally {
          report?.(loader.stats.requests - start, max);
        }
      }
    };
  }
  function rankOptions(prefs, eff, overrides = {}) {
    return {
      discovery: overrides.discovery ?? eff.discovery,
      rules: music.rules(),
      excluded: prefs.excluded,
      hideVersions: prefs.hideVersions,
      onlyKnownArtists: overrides.onlyKnownArtists ?? eff.onlyKnownArtists,
      limit: overrides.limit ?? 40,
      maxPerArtist: overrides.maxPerArtist,
      excludeIds: overrides.excludeIds
    };
  }
  async function seedArtists(profile, max = 8) {
    const favs = (await music.favorites.byType("artist")).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
    const out = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const f of favs) {
      if (!f.id || seen2.has(f.id)) continue;
      seen2.add(f.id);
      out.push({ id: f.id, name: f.name, key: f.id, kind: "favoriteArtist" });
    }
    for (const a of profile.topArtists(30)) {
      if (!a.id || seen2.has(a.id) || a.feedback < 0) continue;
      seen2.add(a.id);
      out.push({ id: a.id, name: a.name, key: a.key, kind: "topArtist" });
    }
    return out.slice(0, max);
  }
  function recentIds(profile, hours) {
    const since = Date.now() - hours * 3600 * 1e3;
    return new Set([...profile.songs.values()].filter((s) => s.lastPlayed > since).map((s) => s.videoId));
  }
  async function forYou(ctx) {
    const { profile, b } = ctx;
    const cands = [];
    const seeds = await seedArtists(profile, 8);
    const similarSeen = new Set(seeds.map((s) => s.id));
    let similarCount = 0;
    for (const seed of seeds) {
      const page = await b.get((o) => catalog.artist(seed.id, o));
      if (!page) continue;
      for (const t of page.topSongs.slice(0, 6)) cands.push(toCandidate(t, { kind: seed.kind, via: seed.name, viaKey: seed.key }));
      for (const sim of page.similar.slice(0, 3)) {
        if (similarCount >= 6 || similarSeen.has(sim.id)) continue;
        similarSeen.add(sim.id);
        similarCount++;
        const sp = await b.get((o) => catalog.artist(sim.id, o));
        for (const t of sp?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: "similar", via: seed.name, viaKey: seed.key }));
      }
    }
    for (const seed of seeds.slice(0, 2)) {
      const page = await b.get((o) => catalog.artist(seed.id, o));
      const pl = page?.featuredOn?.[0];
      if (!pl) continue;
      const col = await b.get((o) => catalog.playlist(pl.id, o));
      for (const t of col?.tracks.slice(0, 12) || []) cands.push(toCandidate(t, { kind: "featured", via: seed.name, viaKey: seed.key }));
    }
    for (const s of await music.favorites.byType("song")) cands.push(toCandidate({ videoId: s.id, title: s.name, artists: s.artists }, { kind: "seed", via: "deinen Lieblingssongs", weight: 0.9 }));
    const old = Date.now() - 45 * DAY;
    for (const s of profile.topSongs(40)) if (s.lastPlayed && s.lastPlayed < old) cands.push(toCandidate(s, { kind: "history" }));
    return { candidates: cands.filter(Boolean), excludeIds: recentIds(profile, 2) };
  }
  async function releasesMix(ctx) {
    const { b } = ctx;
    const list = (await music.releases.latest(60)).filter((r) => r.fresh || r.recent);
    const cands = [];
    for (const r of list.slice(0, 10)) {
      const col = await b.get((o) => catalog.album(r.id, o));
      for (const t of col?.tracks.slice(0, r.kind && /single|ep/i.test(r.kind) ? 3 : 4) || []) cands.push(toCandidate(t, { kind: "release", via: r.artistName, viaKey: r.artistId }));
    }
    return { candidates: cands.filter(Boolean), releases: list, overrides: { discovery: 0.5, maxPerArtist: 4 } };
  }
  async function genreMix(ctx, { genre }) {
    const { b, profile } = ctx;
    if (!genre) throw new Error("kein Genre gewählt");
    const cands = [];
    const res = await b.get((o) => catalog.search(genre, o));
    if (!res) return { candidates: [] };
    for (const t of res.songs.slice(0, 20)) cands.push(toCandidate(t, { kind: "genre", genre }));
    for (const pl of res.playlists.filter((p) => p.editorial !== false).slice(0, 2)) {
      const col = await b.get((o) => catalog.playlist(pl.id, o));
      for (const t of col?.tracks.slice(0, 25) || []) cands.push(toCandidate(t, { kind: "genre", genre }));
    }
    const artists = res.artists.slice(0, 6).sort((a, c) => profile.artistAffinity(artistKey(c)) - profile.artistAffinity(artistKey(a)));
    for (const a of artists.slice(0, 3)) {
      const page = await b.get((o) => catalog.artist(a.id, o));
      for (const t of page?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: "genre", genre, viaKey: a.id }));
    }
    return { candidates: cands.filter(Boolean) };
  }
  async function longAgo(ctx) {
    const old = Date.now() - 45 * DAY;
    const cands = ctx.profile.topSongs(300).filter((s) => s.lastPlayed && s.lastPlayed < old && s.completes > 0).map((s) => toCandidate(s, { kind: "history" }));
    return { candidates: cands.filter(Boolean), overrides: { discovery: 0.1, maxPerArtist: 3 } };
  }
  async function neverHeard(ctx) {
    const base = await forYou(ctx);
    const p = ctx.profile;
    const cands = base.candidates.filter((c) => !p.songPlays(c.videoId) && !(c.artists || []).some((a) => p.artistPlays(artistKey(a)) > 0));
    return { candidates: cands, overrides: { discovery: 0.95 } };
  }
  async function similarMix(ctx, { artist }) {
    const { b } = ctx;
    if (!artist?.id) throw new Error("kein Künstler");
    const page = await b.get((o) => catalog.artist(artist.id, o));
    const cands = [];
    const similar = [...page?.similar || []];
    const prefs = music.prefs();
    for (const extra of await metadata.similarArtists(artist, prefs).catch(() => [])) {
      if (extra.source === "local" || similar.some((s) => s.name.toLowerCase() === extra.name.toLowerCase())) continue;
      similar.push({ id: extra.id, name: extra.name, external: extra.source });
    }
    for (const sim of similar.slice(0, 8)) {
      let id = sim.id;
      if (!id) {
        const r = await b.get((o) => catalog.search(sim.name, o));
        id = r?.artists?.find((a) => a.name.toLowerCase() === sim.name.toLowerCase())?.id;
      }
      if (!id) continue;
      const sp = await b.get((o) => catalog.artist(id, o));
      for (const t of sp?.topSongs.slice(0, 4) || []) cands.push(toCandidate(t, { kind: "similar", via: page?.name || artist.name, viaKey: artist.id }));
    }
    return { candidates: cands.filter(Boolean), overrides: { maxPerArtist: 3 } };
  }
  async function moreFrom(ctx, { artist }) {
    const { b, profile } = ctx;
    if (!artist?.id) throw new Error("kein Künstler");
    const page = await b.get((o) => catalog.artist(artist.id, o));
    if (!page) return { candidates: [] };
    const cands = page.topSongs.map((t) => toCandidate(t, { kind: "seed", via: page.name, viaKey: artist.id }));
    for (const r of page.releases.slice(0, 4)) {
      const col = await b.get((o) => catalog.album(r.id, o));
      for (const t of col?.tracks || []) cands.push(toCandidate(t, { kind: "seed", via: page.name, viaKey: artist.id, weight: 0.8 }));
    }
    return { candidates: cands.filter(Boolean), excludeIds: recentIds(profile, 3), overrides: { maxPerArtist: 50, discovery: 0.5 } };
  }
  async function moodMix(ctx, { presetId, mood }) {
    const { b } = ctx;
    let name = mood;
    if (!name && presetId) {
      const moods = await b.get((o) => catalog.moods(o));
      name = matchMood([...moods?.moods || [], ...moods?.genres || []], presetById3[presetId]?.moods)?.name;
    }
    if (!name) return { candidates: [] };
    const res = await b.get((o) => catalog.search(name, o));
    const cands = [];
    for (const pl of (res?.playlists || []).slice(0, 3)) {
      const col = await b.get((o) => catalog.playlist(pl.id, o));
      for (const t of col?.tracks.slice(0, 25) || []) cands.push(toCandidate(t, { kind: "genre", genre: name }));
    }
    return { candidates: cands.filter(Boolean) };
  }
  async function radio(ctx, { seed }) {
    if (!seed) throw new Error("kein Startpunkt");
    if (seed.type === "genre") return genreMix(ctx, { genre: seed.name });
    if (seed.type === "mood") return moodMix(ctx, { mood: seed.name, presetId: seed.presetId });
    const artist = seed.type === "artist" ? seed : seed.artists?.find((a) => a.id);
    const cands = [];
    if (artist) {
      const own = await moreFrom(ctx, { artist });
      for (const c of own.candidates.slice(0, 12)) cands.push({ ...c, sources: c.sources.map((s) => ({ ...s, weight: 0.7 })) });
      cands.push(...(await similarMix(ctx, { artist })).candidates);
    }
    if (seed.type === "song") cands.unshift(toCandidate(seed, { kind: "seed", via: seed.title, weight: 2 }));
    return { candidates: cands.filter(Boolean), overrides: { maxPerArtist: 3 }, interleave: true };
  }
  function spreadArtists(list) {
    const rest = list.slice();
    const out = [];
    let prev2 = null;
    while (rest.length) {
      let i = rest.findIndex((x2) => artistKey(x2.artists?.[0]) !== prev2);
      if (i < 0) i = 0;
      const [x] = rest.splice(i, 1);
      prev2 = artistKey(x.artists?.[0]);
      out.push(x);
    }
    return out;
  }
  var BUILDERS = { forYou, releases: releasesMix, genre: genreMix, longAgo, neverHeard, similar: similarMix, moreFrom, radio, mood: moodMix };
  async function buildMix(kind, args = {}, { maxRequests = 12, onProgress, limit = 40 } = {}) {
    const fn = BUILDERS[kind];
    if (!fn) throw new Error(`unbekannter Mix ${kind}`);
    const t0 = Date.now();
    const profile = await music.profile();
    const prefs = music.prefs();
    const eff = music.effective();
    const b = budget(maxRequests, onProgress);
    let res;
    try {
      res = await fn({ profile, prefs, eff, b }, args);
    } catch (e) {
      log.warn(`mix ${kind}`, e);
      return { kind, items: [], error: e.message, errors: b.errors, requests: b.used, ms: Date.now() - t0 };
    }
    const opts = rankOptions(prefs, eff, { limit, ...res.overrides || {}, excludeIds: res.excludeIds, ...args.overrides || {} });
    if (args.discovery != null) opts.discovery = discoveryValue(args.discovery);
    const ranked = rank(res.candidates, profile, opts);
    const items = res.interleave ? spreadArtists(ranked) : ranked;
    return { kind, items, releases: res.releases, candidates: res.candidates.length, errors: b.errors, requests: b.used, ms: Date.now() - t0, discovery: opts.discovery };
  }
  var checking = null;
  function releaseCheckRunning() {
    return !!checking;
  }
  async function checkReleases({ force = false, onProgress } = {}) {
    if (checking) return checking;
    checking = (async () => {
      const prefs = music.prefs();
      const db2 = music.db();
      const profile = await music.profile();
      const favs = await music.favorites.byType("artist");
      const list = favs.filter((f) => f.id).map((f) => ({ id: f.id, name: f.name }));
      if (prefs.releases.includeTopArtists) {
        for (const a of profile.topArtists(prefs.releases.maxArtists)) if (a.id && !list.some((x) => x.id === a.id)) list.push({ id: a.id, name: a.name });
      }
      const artists = list.slice(0, prefs.releases.maxArtists);
      const now = Date.now();
      const thisYear = new Date(now).getFullYear();
      const due = [];
      for (const a of artists) {
        const rec = await db2.get("artists", a.id);
        if (force || !rec || now - (rec.checkedAt || 0) > prefs.releases.intervalHours * 3600 * 1e3) due.push({ ...a, rec });
      }
      let fresh = 0;
      let checked = 0;
      const errors = [];
      for (const a of due) {
        try {
          const page = await catalog.artist(a.id, { maxAge: 3600 * 1e3 });
          const baseline = !a.rec;
          for (const r of page.releases) {
            const prev2 = await db2.get("releases", r.id);
            if (prev2) continue;
            const isFresh = !baseline;
            if (isFresh) fresh++;
            await db2.put("releases", { id: r.id, artistId: a.id, artistName: page.name || a.name, title: r.title, kind: r.kind || "Album", year: r.year || null, thumbnail: r.thumbnail || "", firstSeen: now, fresh: isFresh, recent: !!r.year && r.year >= thisYear });
          }
          await db2.put("artists", { id: a.id, name: page.name || a.name, checkedAt: Date.now(), releaseCount: page.releases.length, similar: page.similar.slice(0, 10) });
        } catch (e) {
          errors.push(`${a.name}: ${e.message}`);
        }
        checked++;
        onProgress?.(checked, due.length);
      }
      const maxAge = prefs.releases.maxAgeDays * DAY;
      for (const r of await music.releases.all()) {
        if (r.fresh && now - r.firstSeen > maxAge) await db2.put("releases", { ...r, fresh: false });
      }
      const result = { at: Date.now(), artists: artists.length, checked, fresh, errors };
      await music.setMeta("lastReleaseCheck", result);
      music.emit("releases", result);
      return result;
    })().finally(() => {
      checking = null;
    });
    return checking;
  }

  // src/features/music/releases.js
  var releasesFeature = {
    id: "m.releases",
    site: "music",
    label: "Neue Songs deiner Künstler",
    group: "Entdecken",
    description: "Schaut höchstens einmal pro Intervall auf die Künstlerseiten deiner Favoriten und meistgehörten Künstler. Neues erscheint im Mix-Fenster unter „Neu“ und als Zahl am Mix-Button",
    stability: "mittel",
    settings: {
      notify: { type: "toggle", label: "Hinweis bei neuen Veröffentlichungen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let last2 = null;
      let timer2 = null;
      let stopped = false;
      const run2 = async (force = false) => {
        const p = music.prefs();
        if (!p.releases.enabled && !force) return null;
        if (releaseCheckRunning()) return null;
        try {
          const res = await checkReleases({ force });
          last2 = res;
          if (res.fresh && s.notify) toast(`${res.fresh} neue Veröffentlichung${res.fresh === 1 ? "" : "en"} deiner Künstler`);
          return res;
        } catch (e) {
          ctx.log.warn("music releases", e);
          last2 = { at: Date.now(), error: e.message };
          return last2;
        }
      };
      const first = setTimeout(() => !stopped && run2(false), 25 * 1e3);
      timer2 = setInterval(() => !stopped && !document.hidden && run2(false), 60 * 60 * 1e3);
      music.getMeta("lastReleaseCheck").then((v) => last2 ||= v).catch(() => {
      });
      return {
        run: run2,
        get last() {
          return last2;
        },
        update(next) {
          s = next;
        },
        dispose() {
          stopped = true;
          clearTimeout(first);
          clearInterval(timer2);
        },
        health() {
          const p = music.prefs();
          if (!p.releases.enabled) return { status: "skip", detail: "Hintergrundprüfung im Tab „Musik“ ausgeschaltet" };
          if (releaseCheckRunning()) return { status: "ok", detail: "prüft gerade …" };
          if (!last2) return { status: "skip", detail: "noch nicht geprüft (startet ~25 s nach dem Laden)" };
          if (last2.error) return { status: "warn", detail: last2.error };
          const when2 = new Date(last2.at).toLocaleString("de-DE");
          return { status: last2.errors?.length ? "warn" : "ok", detail: `zuletzt ${when2} · ${last2.checked}/${last2.artists} Künstler geprüft · ${last2.fresh} neu${last2.errors?.length ? ` · Fehler: ${last2.errors.slice(0, 2).join("; ")}` : ""}` };
        }
      };
    }
  };

  // src/features/music/ytxQueue.js
  var KEY2 = "ytx.music.queue";
  var listeners = /* @__PURE__ */ new Set();
  var q = load2();
  var timer = null;
  var prev = null;
  var lastJumpAt = 0;
  function load2() {
    try {
      const v = JSON.parse(sessionStorage.getItem(KEY2) || "null");
      if (v && Array.isArray(v.items)) return v;
    } catch {
    }
    return { items: [], index: -1, active: false, title: "", note: "" };
  }
  function save() {
    try {
      sessionStorage.setItem(KEY2, JSON.stringify(q));
    } catch {
    }
    for (const fn of listeners) {
      try {
        fn(q);
      } catch {
      }
    }
  }
  async function jump(i) {
    const rules2 = music.rules();
    while (i < q.items.length && blockReason(q.items[i], rules2)) i++;
    if (i >= q.items.length) {
      q.active = false;
      q.note = "Ende erreicht";
      save();
      stopTimer();
      return false;
    }
    q.index = i;
    q.note = "";
    lastJumpAt = Date.now();
    save();
    const want = q.items[i].videoId;
    const ok = await navigateEndpoint(endpoints.play(want));
    if (!ok) log.warn("ytx queue navigation fehlgeschlagen");
    setTimeout(() => {
      const p = playerApi();
      try {
        if (p && p.getVideoData?.().video_id === want && [-1, 5].includes(p.getPlayerState?.())) p.playVideo?.();
      } catch {
      }
    }, 3e3);
    return ok;
  }
  function tick() {
    if (!q.active) return stopTimer();
    const t = currentTrack();
    if (!t || t.ad) return;
    const want = q.items[q.index];
    const now = Date.now();
    if (!want) return;
    if (t.videoId === want.videoId || t.counterpartVideoId === want.videoId) {
      if (t.playing && t.dur > 5 && t.pos >= t.dur - 1.2 && now - lastJumpAt > 5e3) jump(q.index + 1);
    } else if (now - lastJumpAt > 8e3) {
      const next = q.items.findIndex((x, i) => i > q.index && (x.videoId === t.videoId || x.videoId === t.counterpartVideoId));
      if (next > 0) {
        q.index = next;
        save();
      } else if (prev && (prev.videoId === want.videoId || prev.counterpartVideoId === want.videoId) && prev.dur && prev.pos >= prev.dur - 6) {
        jump(q.index + 1);
      } else if (prev && prev.videoId !== t.videoId) {
        q.active = false;
        q.note = "Angehalten, weil du etwas anderes gewählt hast";
        save();
      }
    }
    prev = { videoId: t.videoId, counterpartVideoId: t.counterpartVideoId, pos: t.pos, dur: t.dur };
  }
  function startTimer() {
    if (!timer) timer = setInterval(tick, 500);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }
  var ytxQueue = {
    get state() {
      return q;
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async play(items, { start = 0, title = "" } = {}) {
      q = { items: items.map((x) => ({ videoId: x.videoId, title: x.title, artists: x.artists || [], album: x.album || null, durationSec: x.durationSec || null, thumbnail: x.thumbnail || "", reasons: x.reasons || [] })), index: -1, active: true, title, note: "" };
      prev = null;
      startTimer();
      return jump(start);
    },
    jumpTo(i) {
      q.active = true;
      startTimer();
      return jump(i);
    },
    resume() {
      if (!q.items.length) return;
      q.active = true;
      q.note = "";
      save();
      startTimer();
    },
    stop() {
      q.active = false;
      q.note = "Gestoppt";
      save();
      stopTimer();
    },
    clear() {
      q = { items: [], index: -1, active: false, title: "", note: "" };
      save();
      stopTimer();
    },
    remaining() {
      return q.items.slice(q.index + 1).reduce((s, x) => s + (x.durationSec || 0), 0);
    }
  };
  if (q.active) startTimer();
  onDispose(stopTimer);

  // src/features/music/hub.js
  var SHORT = { forYou: "Für dich", releases: "Neu", genre: "Genre", longAgo: "Lange nicht gehört", neverHeard: "Noch nie gehört", similar: "Ähnlich", moreFrom: "Mehr von", radio: "Smart Radio" };
  var TABS = [...MIXES.map(([id, label]) => [id, SHORT[id] || label, label]), ["queue", "Reihenfolge", "ytx-Reihenfolge"]];
  var cache3 = /* @__PURE__ */ new Map();
  function currentArtist() {
    const b = currentBrowse();
    if (b && /^UC[\w-]{22}$/.test(b.browseId)) {
      const a2 = parseArtistPage(b.response, b.browseId);
      if (a2.name) return { id: b.browseId, name: a2.name };
    }
    const t = currentTrack();
    const a = t?.artists?.find((x) => x.id);
    return a ? { id: a.id, name: a.name } : null;
  }
  var hubFeature = {
    id: "m.hub",
    site: "music",
    label: "Mix-Fenster (Für dich, Neu, Genre, Smart Radio)",
    group: "Entdecken",
    description: "Eigene Empfehlungen aus deinem lokalen Profil und YouTube-Music-Seiten, jeweils mit Begründung und Feedback-Knöpfen. Button „Mix“ oben rechts",
    stability: "mittel",
    anchors: ["top.buttons", "m.browse.top"],
    hotkeys: [["music.hub", "Mix-Fenster öffnen/schließen", "Alt+M"]],
    settings: {
      homeShelf: { type: "toggle", label: "Regal „Neu von deinen Künstlern“ auf der Startseite", default: true },
      maxRequests: { type: "range", label: "Max. neue Seitenabrufe pro Mix", min: 2, max: 40, step: 1, default: 12 },
      explain: { type: "toggle", label: "Begründungen anzeigen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      const ui = { tab: ctx.state.get("m.hub.tab", "forYou"), discovery: null, genre: ctx.state.get("m.hub.genre", ""), seed: null, result: null, loading: false };
      let badge2 = 0;
      let renderToken = 0;
      const drawer = createDrawer({ title: "ytx Mix" });
      const updateBadge = async () => {
        badge2 = await music.releases.unseenCount().catch(() => 0);
        if (btn2.node) {
          if (badge2) btn2.node.setAttribute("data-badge", String(badge2));
          else btn2.node.removeAttribute("data-badge");
        }
      };
      const btn2 = ctx.mount({
        id: "m.hub.button",
        anchor: "top.buttons",
        position: "prepend",
        create: () => {
          const b = pill({ label: "Mix", title: "ytx Mix (Alt+M)", onClick: () => toggle2() });
          b.style.margin = "0 8px";
          return b;
        }
      });
      function toggle2() {
        drawer.toggle();
        if (drawer.isOpen) render2();
      }
      ctx.action("music.hub", toggle2);
      function drawTabs() {
        drawer.tabs.replaceChildren(
          ...TABS.map(([id, label]) => {
            const b = h("button", { class: "tab", type: "button", "aria-selected": String(ui.tab === id), text: id === "releases" && badge2 ? `${label} (${badge2})` : label });
            b.addEventListener("click", () => {
              ui.tab = id;
              ctx.state.set("m.hub.tab", id);
              ui.result = null;
              render2();
            });
            return b;
          })
        );
      }
      function drawTools() {
        const prefs = music.prefs();
        const session = music.session();
        const t = drawer.tools;
        t.replaceChildren();
        if (ui.tab === "queue") return;
        const disc = ui.discovery ?? music.effective().discovery;
        const slider = h("input", { type: "range", min: 0, max: 100, step: 5, value: Math.round(disc * 100) });
        const val = h("span", { text: `${Math.round(disc * 100)}` });
        slider.addEventListener("input", () => val.textContent = slider.value);
        slider.addEventListener("change", () => {
          ui.discovery = Number(slider.value) / 100;
          load3(true);
        });
        t.append(h("label", { title: "Nur für diese Ansicht, Standard im ytx-Panel" }, "Bekannt", slider, "Entdecken"));
        const sel = h("select", { title: "Session-Preset, gilt nur in diesem Tab" }, h("option", { value: "", text: "Keine Session", selected: !session }), ...SESSION_PRESETS.map((p) => h("option", { value: p.id, text: p.label, selected: session?.presetId === p.id })));
        sel.addEventListener("change", () => {
          music.setSession(sel.value || null);
          ui.discovery = null;
          load3(true);
        });
        t.append(sel);
        if (ui.tab === "genre") {
          const input = h("input", { type: "search", placeholder: "Genre oder Stimmung", value: ui.genre, list: "ytx-genres" });
          const dl = h("datalist", { id: "ytx-genres" });
          catalog.moods().then((m) => dl.replaceChildren(...[...m.genres, ...m.moods].map((g) => h("option", { value: g.name })))).catch(() => {
          });
          input.addEventListener("change", () => {
            ui.genre = input.value.trim();
            ctx.state.set("m.hub.genre", ui.genre);
            load3(true);
          });
          t.append(input, dl);
          const favs = prefs.genres.favorites;
          if (ui.genre) {
            const on = favs.includes(ui.genre);
            const star = h("button", { class: "chip", type: "button", "aria-pressed": String(on), text: on ? "★ Lieblingsgenre" : "☆ merken" });
            star.addEventListener("click", () => {
              music.updatePrefs((p) => {
                const set = new Set(p.genres.favorites);
                if (set.has(ui.genre)) set.delete(ui.genre);
                else set.add(ui.genre);
                p.genres.favorites = [...set];
              });
              drawTools();
            });
            t.append(star);
          }
          for (const g of favs) {
            const c = h("button", { class: "chip", type: "button", "aria-pressed": String(g === ui.genre), text: g });
            c.addEventListener("click", () => {
              ui.genre = g;
              ctx.state.set("m.hub.genre", g);
              load3(true);
            });
            t.append(c);
          }
        }
        if (ui.tab === "releases") {
          const run2 = h("button", { class: "btn sec", type: "button", text: releaseCheckRunning() ? "prüft …" : "Jetzt prüfen", disabled: releaseCheckRunning() });
          run2.addEventListener("click", async () => {
            run2.disabled = true;
            run2.textContent = "prüft …";
            const r = await checkReleases({ force: true, onProgress: (n, total) => run2.textContent = `prüft ${n}/${total}` }).catch((e) => ({ error: e.message }));
            toast(r.error ? `Prüfung fehlgeschlagen: ${r.error}` : `${r.checked} Künstler geprüft, ${r.fresh} neu`);
            load3(true);
          });
          t.append(run2);
        }
        if (ui.tab === "radio") {
          const tr = currentTrack();
          const a = currentArtist();
          const opts = [
            tr && ["song", `Song: ${tr.title}`],
            a && ["artist", `Künstler: ${a.name}`],
            ui.genre && ["genre", `Genre: ${ui.genre}`],
            ...SESSION_PRESETS.map((p) => [`mood:${p.id}`, `Stimmung: ${p.label}`])
          ].filter(Boolean);
          const cur = ui.seed?.key || opts[0]?.[0] || "";
          const seedSel = h("select", null, ...opts.map(([v, l]) => h("option", { value: v, text: l, selected: v === cur })));
          seedSel.addEventListener("change", () => {
            ui.seed = { key: seedSel.value };
            load3(true);
          });
          t.append(seedSel);
        }
        const reload = h("button", { class: "btn sec", type: "button", text: "↻", title: "Neu berechnen" });
        reload.addEventListener("click", () => load3(true, true));
        t.append(reload);
      }
      function mixArgs() {
        const disc = ui.discovery;
        const base = disc == null ? {} : { discovery: disc };
        if (ui.tab === "genre") return { ...base, genre: ui.genre };
        if (ui.tab === "similar" || ui.tab === "moreFrom") return { ...base, artist: currentArtist() };
        if (ui.tab === "radio") {
          const key = ui.seed?.key || (currentTrack() ? "song" : currentArtist() ? "artist" : "mood:explore");
          const tr = currentTrack();
          if (key === "song" && tr) return { ...base, seed: { type: "song", ...tr } };
          if (key === "artist") return { ...base, seed: { type: "artist", ...currentArtist() } };
          if (key === "genre") return { ...base, seed: { type: "genre", name: ui.genre } };
          if (key.startsWith("mood:")) return { ...base, seed: { type: "mood", presetId: key.slice(5) } };
        }
        return base;
      }
      function cacheKey(args) {
        return JSON.stringify([ui.tab, args.genre, args.artist?.id, args.seed?.videoId || args.seed?.id || args.seed?.name || args.seed?.presetId, args.discovery, music.session()?.presetId]);
      }
      async function load3(redraw = false, force = false) {
        if (redraw) drawTools();
        if (ui.tab === "queue") return render2();
        const args = mixArgs();
        const key = cacheKey(args);
        const hit = cache3.get(key);
        if (!force && hit && Date.now() - hit.at < 10 * 60 * 1e3) {
          ui.result = hit.result;
          return drawBody();
        }
        if ((ui.tab === "similar" || ui.tab === "moreFrom") && !args.artist) {
          ui.result = { items: [], error: "Öffne eine Künstlerseite oder spiele einen Song, dann weiß ytx, um wen es geht." };
          return drawBody();
        }
        if (ui.tab === "genre" && !args.genre) {
          ui.result = { items: [], error: "Genre oder Stimmung oben eingeben, z. B. Deutschrap, Indie, Chill." };
          return drawBody();
        }
        const token = ++renderToken;
        ui.loading = true;
        ui.result = null;
        drawBody("lädt …");
        const res = await buildMix(ui.tab === "radio" ? "radio" : ui.tab, args, { maxRequests: s.maxRequests, onProgress: (n, max) => token === renderToken && drawBody(`lädt Seiten … ${n}/${max}`) });
        if (token !== renderToken) return;
        ui.loading = false;
        ui.result = res;
        if (!res.error) cache3.set(key, { at: Date.now(), result: res });
        drawBody();
        if (ui.tab === "releases") {
          music.releases.markSeen();
          updateBadge();
        }
      }
      function menuFor(item, anchor) {
        const first = item.artists?.[0];
        const act = async (kind) => {
          toast(await music.act(kind, item));
          cache3.clear();
        };
        drawer.menu(anchor, [
          ["▶ Abspielen mit Radio", () => navigateEndpoint(endpoints.radio(item.videoId))],
          ["Ab hier in ytx-Reihenfolge", () => playAll(ui.result.items.indexOf(item))],
          ["👍 Mehr davon", () => act("more")],
          ["👎 Weniger davon", () => act("less")],
          first && [`Künstler bevorzugen: ${first.name}`, () => act("preferArtist")],
          first && [`Künstler blockieren: ${first.name}`, () => act("blockArtist")],
          ["Song ignorieren", () => act("ignoreSong")],
          first?.id && [`★ ${first.name} favorisieren`, async () => toast(await music.favorites.toggle({ type: "artist", id: first.id, name: first.name }) ? "Favorisiert" : "Entfernt")],
          first?.id && [`Ähnlich wie ${first.name}`, () => openArtistTab("similar", first)],
          first?.id && [`Mehr von ${first.name}`, () => openArtistTab("moreFrom", first)],
          ["Aus Profil ausschließen", () => act("excludeSong")]
        ].filter(Boolean));
      }
      let artistOverride = null;
      function openArtistTab(tab, artist) {
        artistOverride = artist;
        ui.tab = tab;
        ui.result = null;
        render2();
      }
      function playAll(start = 0) {
        const items = ui.result?.items || [];
        if (!items.length) return;
        ytxQueue.play(items, { start: Math.max(0, start), title: TABS.find(([id]) => id === ui.tab)?.[1] || "Mix" });
        toast(`ytx-Reihenfolge: ${items.length} Titel`);
      }
      function drawBody(status) {
        const main = drawer.main;
        main.replaceChildren();
        if (status) return main.append(h("div", { class: "status", text: status }));
        const r = ui.result;
        if (!r) return;
        if (r.error) return main.append(h("div", { class: "status err", text: r.error }));
        if (ui.tab === "releases" && r.releases?.length) {
          main.append(h("div", { class: "section-title", text: "Veröffentlichungen" }));
          const grid = h("div", { class: "grid" });
          for (const rel of r.releases.slice(0, 24)) {
            const card = h("div", { class: "card", title: `${rel.artistName} · ${rel.title}` }, rel.thumbnail ? h("img", { src: rel.thumbnail, loading: "lazy", alt: "" }) : h("img", { alt: "" }), h("div", { class: ["title", rel.fresh && "new"], text: `${rel.fresh ? "● " : ""}${rel.title}` }), h("div", { class: "sub", text: `${rel.artistName}${rel.year ? ` · ${rel.year}` : ""}${rel.kind ? ` · ${rel.kind}` : ""}` }));
            card.addEventListener("click", () => navigateEndpoint(endpoints.browse(rel.id, null, "ALBUM")));
            grid.append(card);
          }
          main.append(grid);
        } else if (ui.tab === "releases") {
          main.append(h("div", { class: "status", text: "Noch keine Veröffentlichungen bekannt. Favorisiere Künstler (★) oder höre ein paar Songs, dann „Jetzt prüfen“." }));
        }
        const items = r.items || [];
        const head = h("div", { class: "status" }, `${items.length} Titel${items.length ? ` · ${formatDuration(items.reduce((a, x) => a + (x.durationSec || 0), 0))}` : ""} · ${r.requests || 0} Seitenabrufe · ${Math.round(r.ms || 0)} ms${r.errors?.length ? ` · ${r.errors.length} Fehler` : ""}`);
        if (items.length) {
          const all = h("button", { class: "btn", type: "button", text: "▶ Alles abspielen", style: { marginLeft: "8px" } });
          all.addEventListener("click", () => playAll(0));
          head.append(all);
        }
        main.append(head);
        if (!items.length && ui.tab !== "releases") main.append(h("div", { class: "status", text: emptyHint() }));
        for (const it of items) main.append(trackRow(it, { explain: s.explain && music.prefs().explain, onPlay: (x) => navigateEndpoint(endpoints.radio(x.videoId)), onMenu: menuFor }));
      }
      function emptyHint() {
        if (ui.tab === "longAgo") return "Noch nichts: hier landen Songs, die du früher gern gehört hast und seit über 45 Tagen nicht mehr.";
        if (ui.tab === "forYou" || ui.tab === "neverHeard") return "Zu wenig Daten. Favorisiere ein paar Künstler (★ in der Playerleiste) oder höre ein paar Songs mit eingeschaltetem Hörverlauf.";
        return "Keine passenden Titel gefunden. Blocklisten im ytx-Panel prüfen oder den Regler Richtung „Entdecken“ schieben.";
      }
      function drawQueue() {
        const main = drawer.main;
        const st = ytxQueue.state;
        main.replaceChildren();
        if (!st.items.length) return main.append(h("div", { class: "status", text: "Keine ytx-Reihenfolge aktiv. In einem Mix „▶ Alles abspielen“ wählen." }));
        const ctl = h("div", { class: "status" }, `${st.title || "Mix"} · ${st.index + 1}/${st.items.length} · Rest ${formatDuration(ytxQueue.remaining())} · ${st.active ? "aktiv" : st.note || "pausiert"}`);
        const b = h("button", { class: "btn sec", type: "button", text: st.active ? "Stop" : "Fortsetzen", style: { marginLeft: "8px" } });
        b.addEventListener("click", () => st.active ? ytxQueue.stop() : ytxQueue.resume());
        const c = h("button", { class: "btn sec", type: "button", text: "Leeren", style: { marginLeft: "6px" } });
        c.addEventListener("click", () => ytxQueue.clear());
        ctl.append(b, c);
        main.append(ctl);
        st.items.forEach((it, i) => {
          const row2 = trackRow(it, { explain: false, onPlay: () => ytxQueue.jumpTo(i), onMenu: menuFor });
          if (i === st.index) row2.style.background = "rgba(255,255,255,.1)";
          if (i < st.index) row2.style.opacity = ".5";
          main.append(row2);
        });
      }
      function render2() {
        if (!drawer.isOpen) return;
        drawTabs();
        drawTools();
        if (ui.tab === "queue") return drawQueue();
        if (artistOverride && (ui.tab === "similar" || ui.tab === "moreFrom")) {
          const a = artistOverride;
          artistOverride = null;
          const args = { artist: a, ...ui.discovery == null ? {} : { discovery: ui.discovery } };
          const token = ++renderToken;
          drawBody("lädt …");
          buildMix(ui.tab, args, { maxRequests: s.maxRequests }).then((res) => {
            if (token !== renderToken) return;
            ui.result = res;
            drawBody();
          });
          return;
        }
        if (ui.result) drawBody();
        else load3();
      }
      const offQueue = ytxQueue.on(() => drawer.isOpen && ui.tab === "queue" && drawQueue());
      const shelf = ctx.mount({
        id: "m.hub.homeShelf",
        anchor: "m.browse.top",
        position: "prepend",
        when: () => s.homeShelf && ctx.nav.page === "home",
        create: () => h("div", { class: "ytx-m-shelf", style: { margin: "0 0 24px" } }),
        update: (node) => drawShelf(node)
      });
      async function drawShelf(node) {
        if (node.__at && Date.now() - node.__at < 60 * 1e3) return;
        node.__at = Date.now();
        const list = (await music.releases.latest(40).catch(() => [])).filter((r) => r.fresh || r.recent).slice(0, 12);
        if (!list.length) {
          node.replaceChildren();
          return;
        }
        const row2 = h("div", { style: { display: "flex", gap: "16px", overflowX: "auto", paddingBottom: "6px" } });
        for (const r of list) {
          const card = h(
            "a",
            { href: `/browse/${r.id}`, style: { flex: "none", width: "150px", color: "var(--ytmusic-text-primary, #fff)", textDecoration: "none", font: "400 13px/1.35 Roboto, Arial, sans-serif" } },
            h("img", { src: r.thumbnail, loading: "lazy", alt: "", style: { width: "150px", height: "150px", borderRadius: "4px", objectFit: "cover", background: "rgba(255,255,255,.08)" } }),
            h("div", { text: `${r.fresh ? "● " : ""}${r.title}`, style: { marginTop: "6px", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.fresh ? "#ffc83d" : "inherit" } }),
            h("div", { text: `${r.artistName}${r.kind ? ` · ${r.kind}` : ""}`, style: { color: "var(--ytmusic-text-secondary, #aaa)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } })
          );
          card.addEventListener("click", (e) => {
            e.preventDefault();
            navigateEndpoint(endpoints.browse(r.id, null, "ALBUM"));
          });
          row2.append(card);
        }
        node.replaceChildren(h("div", { style: { font: "700 24px/1.3 Roboto, Arial, sans-serif", color: "var(--ytmusic-text-primary, #fff)", margin: "8px 0 16px" }, text: "Neu von deinen Künstlern" }), row2);
      }
      const offs = [
        music.on("releases", () => {
          updateBadge();
          if (shelf.node) shelf.node.__at = 0;
          shelf.refresh();
          cache3.clear();
        }),
        music.on("favorites", () => cache3.clear()),
        music.on("prefs", () => cache3.clear()),
        music.on("session", () => drawer.isOpen && drawTools())
      ];
      updateBadge();
      return {
        drawer,
        open: () => {
          drawer.open();
          render2();
        },
        update(next) {
          s = next;
          shelf.refresh();
          render2();
        },
        onPage() {
          shelf.refresh();
        },
        dispose() {
          offQueue();
          for (const off of offs) off();
          btn2.destroy();
          shelf.destroy();
          drawer.host.remove();
        },
        health() {
          if (!btn2.ok) return { status: "warn", detail: "Kopfzeile für den Mix-Button nicht gefunden" };
          const r = ui.result;
          return { status: r?.errors?.length ? "warn" : "ok", detail: `Button da${badge2 ? ` · ${badge2} neue Veröffentlichungen` : ""}${r ? ` · letzter Mix ${r.items?.length || 0} Titel, ${r.requests} Abrufe${r.errors?.length ? `, Fehler: ${r.errors[0]}` : ""}` : ""}` };
        }
      };
    }
  };

  // src/features/music/logic/queue.js
  function skipDecision(track, ctx) {
    if (!track?.videoId) return null;
    const { rules: rules2, profile, settings = {}, recentKeys, recentIds: recentIds2, now = Date.now() } = ctx;
    const blocked = rules2 && blockReason(track, rules2);
    if (blocked) return blocked;
    if (settings.onlyKnownArtists && profile) {
      const known = (track.artists || []).some((a) => profile.artistPlays(artistKey(a)) >= 2 || profile.artists.get(artistKey(a))?.favorite);
      if (!known) return { kind: "unknown", label: "Unbekannter Künstler (Session „Nur bekannte Musik“)" };
    }
    if (settings.skipHighSkip && profile?.isHighSkip(track.videoId)) return { kind: "highSkip", label: "Oft übersprungen" };
    if (settings.skipDuplicates !== false && recentKeys) {
      const k = trackKey(track);
      const seen2 = recentKeys.get(k);
      if (seen2 && seen2.videoId !== track.videoId && now - seen2.ts < 3 * 3600 * 1e3) return { kind: "duplicate", label: "Andere Fassung schon gespielt" };
    }
    if (settings.skipRecentlyPlayed && recentIds2) {
      const ts = recentIds2.get(track.videoId);
      if (ts && now - ts < 2 * 3600 * 1e3) return { kind: "recent", label: "Kürzlich gespielt" };
    }
    return null;
  }
  function queueTotals(items, selectedIndex2, positionSec = 0) {
    let total = 0;
    let remaining = 0;
    let unknown = 0;
    items.forEach((it, i) => {
      if (!it.durationSec) {
        unknown++;
        return;
      }
      total += it.durationSec;
      if (i > selectedIndex2) remaining += it.durationSec;
      else if (i === selectedIndex2) remaining += Math.max(0, it.durationSec - positionSec);
    });
    return { total, remaining, unknown, count: items.length, after: Math.max(0, items.length - selectedIndex2 - 1) };
  }

  // src/features/music/logic/lyrics.js
  var LYRICS_FORMATS = [
    ["plain", "Nur Text"],
    ["header", "Mit Titel und Künstler"],
    ["timestamps", "Mit Zeitstempeln"],
    ["lrc", "LRC-Datei"]
  ];
  function stamp(ms, lrc) {
    const total = Math.max(0, Math.floor(ms / 10));
    const cs = total % 100;
    const s = Math.floor(total / 100) % 60;
    const m = Math.floor(total / 6e3);
    return lrc ? `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  }
  function formatLyrics(data2, { mode = "plain", meta = {} } = {}) {
    if (!data2?.available || !data2.lines?.length) return "";
    const lines2 = data2.lines.map((l) => ({ text: String(l.text ?? "").replace(/\s+$/, ""), startMs: l.startMs }));
    const who = (meta.artists || []).map((a) => a.name).join(", ");
    if (mode === "lrc") {
      const head = [meta.title && `[ti:${meta.title}]`, who && `[ar:${who}]`, meta.album?.name && `[al:${meta.album.name}]`].filter(Boolean);
      const body = data2.timed ? lines2.map((l) => `[${stamp(l.startMs || 0, true)}]${l.text}`) : lines2.map((l) => l.text);
      return [...head, ...body].join("\n");
    }
    if (mode === "timestamps" && data2.timed) return lines2.map((l) => `[${stamp(l.startMs || 0, false)}] ${l.text}`).join("\n");
    const text = lines2.map((l) => l.text).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (mode === "header") return [`${meta.title || ""}${who ? ` – ${who}` : ""}`.trim(), "", text, data2.source ? `
${data2.source}` : ""].join("\n").trim();
    return text;
  }

  // src/features/music/player.js
  function queueItemOf(raw) {
    if (!raw) return null;
    return parseQueueItem(raw) || parseQueueItem({ playlistPanelVideoRenderer: raw });
  }
  var SKIP_SETTING = { term: "skipBlocked", artist: "skipBlocked", song: "skipBlocked", highSkip: "skipHighSkip", duplicate: "skipDuplicates", recent: "skipRecentlyPlayed", unknown: null };
  var smartQueueFeature = {
    id: "m.smartQueue",
    site: "music",
    label: "Smart Queue (Auto-Skip & Markierungen)",
    group: "Warteschlange",
    description: "Markiert in YouTubes Warteschlange blockierte, oft übersprungene und doppelte Titel und überspringt sie auf Wunsch automatisch. Die Warteschlange selbst wird nicht umgebaut. Regeln im Tab „Musik“",
    stability: "mittel",
    settings: {
      marks: { type: "toggle", label: "Markierungen in der Warteschlange", default: true },
      notify: { type: "toggle", label: "Hinweis beim automatischen Überspringen", default: true }
    },
    setup(ctx) {
      let s = ctx.settings;
      let profile = null;
      const recentKeys = /* @__PURE__ */ new Map();
      const recentIds2 = /* @__PURE__ */ new Map();
      const stats2 = { skipped: 0, last: null, marked: 0 };
      let lastVideo = null;
      let decidedFor = null;
      let userPicked = { videoId: null, at: 0 };
      let burst = [];
      const loadProfile = debounce(async () => {
        try {
          profile = await music.profile();
          for (const p of (profile.playsList || []).slice(-300)) {
            recentIds2.set(p.videoId, Math.max(recentIds2.get(p.videoId) || 0, p.startedAt));
            recentKeys.set(trackKey(p), { videoId: p.videoId, ts: p.startedAt });
          }
        } catch (e) {
          ctx.log.warn("smart queue profil", e);
        }
      }, 800);
      loadProfile();
      const offs = [music.on("plays", loadProfile), music.on("favorites", loadProfile), music.on("feedback", loadProfile), music.on("prefs", loadProfile)];
      offs.push(
        listen(document, "click", (e) => {
          const item = e.target?.closest?.("ytmusic-player-queue-item");
          const d = item && dataOf(item);
          const vid = queueItemOf(d)?.videoId;
          if (vid) userPicked = { videoId: vid, at: Date.now() };
        }, true)
      );
      const decide = (track, withHistory = true) => {
        const prefs = music.prefs();
        const eff = music.effective();
        const settings = { ...prefs.smartQueue, skipHighSkip: eff.skipHighSkip, skipRecentlyPlayed: eff.skipRecentlyPlayed, onlyKnownArtists: eff.onlyKnownArtists };
        return skipDecision(track, { rules: music.rules(), profile, settings, recentKeys: withHistory ? recentKeys : null, recentIds: withHistory ? recentIds2 : null });
      };
      const tick2 = () => {
        const t = currentTrack();
        if (!t || t.ad) return;
        const now = Date.now();
        if (t.videoId !== lastVideo) {
          lastVideo = t.videoId;
          decidedFor = null;
        }
        if (decidedFor === t.videoId || !t.title) return;
        decidedFor = t.videoId;
        const prefs = music.prefs();
        const d = decide(t);
        recentIds2.set(t.videoId, now);
        if (!recentKeys.has(trackKey(t)) || recentKeys.get(trackKey(t)).videoId === t.videoId) recentKeys.set(trackKey(t), { videoId: t.videoId, ts: now });
        if (!d) return;
        stats2.last = { title: t.title, reason: d.label, at: now, skipped: false };
        const key = SKIP_SETTING[d.kind];
        const allowed = d.kind === "unknown" ? true : !!prefs.smartQueue[key] || d.kind === "highSkip" && music.effective().skipHighSkip;
        if (!prefs.smartQueue.autoSkip || prefs.smartQueue.markOnly || !allowed) return;
        if (userPicked.videoId === t.videoId && now - userPicked.at < 15e3) return;
        if (ytxQueue.state.active && ytxQueue.state.items[ytxQueue.state.index]?.videoId === t.videoId) return;
        burst = burst.filter((x) => now - x < 3e4);
        if (burst.length >= 6) {
          stats2.last.reason += " (Schutz: zu viele Sprünge, pausiert)";
          return;
        }
        burst.push(now);
        autoSkipped.set(t.videoId, now);
        stats2.skipped++;
        stats2.last.skipped = true;
        if (s.notify) toast(`Übersprungen: ${t.title} – ${d.label}`);
        nextVideo();
      };
      const marks = () => {
        if (!s.marks) return;
        const items = qsa("ytmusic-player-page ytmusic-player-queue-item, ytmusic-player-queue ytmusic-player-queue-item");
        const seenKeys = /* @__PURE__ */ new Map();
        let n = 0;
        for (const el of items) {
          const raw = dataOf(el);
          const p = queueItemOf(raw);
          const old = el.querySelector(":scope .ytx-m-mark");
          if (!p?.videoId) continue;
          const k = trackKey(p);
          let d = decide(p, false);
          if (!d && seenKeys.has(k) && seenKeys.get(k) !== p.videoId) d = { kind: "duplicate", label: "Doppelt" };
          seenKeys.set(k, p.videoId);
          const label = d ? d.kind === "term" ? d.label.replace("Titelbegriff: ", "") : d.kind === "highSkip" ? "oft übersprungen" : d.kind === "duplicate" ? "doppelt" : d.kind === "artist" ? "Künstler blockiert" : d.kind === "song" ? "blockiert" : d.label : null;
          if (!label) {
            old?.remove();
            el.removeAttribute("data-ytx-skip");
            continue;
          }
          n++;
          el.setAttribute("data-ytx-skip", d.kind);
          if (old && old.textContent === label) continue;
          old?.remove();
          const host2 = el.querySelector(".song-info .byline-wrapper, .song-info, .title-wrapper, .song-title") || el;
          host2.append(h("span", { class: "ytx-m-mark", "data-kind": d.kind, "data-ytx-own": "", title: d.label, text: label }));
        }
        stats2.marked = n;
      };
      const timer2 = setInterval(tick2, 700);
      const offSweep = ctx.onSweep(marks);
      return {
        stats: stats2,
        update(next) {
          s = next;
          if (!s.marks) for (const m of qsa(".ytx-m-mark")) m.remove();
          marks();
        },
        dispose() {
          clearInterval(timer2);
          offSweep();
          for (const off of offs) off();
          for (const m of qsa(".ytx-m-mark")) m.remove();
          for (const el of qsa("[data-ytx-skip]")) el.removeAttribute("data-ytx-skip");
        },
        health() {
          const prefs = music.prefs();
          const q2 = queueItems();
          const mode = prefs.smartQueue.autoSkip ? prefs.smartQueue.markOnly ? "nur markieren" : "Auto-Skip an" : "Auto-Skip aus";
          if (!appState()) return { status: "fail", detail: "App-Zustand nicht lesbar" };
          return { status: "ok", detail: `${mode} · Warteschlange ${q2.length} Titel erkannt · ${stats2.marked} markiert · ${stats2.skipped} übersprungen${stats2.last ? ` · zuletzt: ${stats2.last.title} (${stats2.last.reason})` : ""}${profile ? "" : " · Profil lädt"}` };
        }
      };
    }
  };
  var queueInfoFeature = {
    id: "m.queueInfo",
    site: "music",
    label: "Warteschlange: Gesamt- und Restdauer",
    group: "Warteschlange",
    description: "„32 Titel · 1:54 h · noch 1:31 h · endet 23:10“ über der Warteschlange",
    stability: "hoch",
    anchors: ["m.queue.top"],
    settings: {
      endTime: { type: "toggle", label: "Uhrzeit des Endes anzeigen", default: true },
      automix: { type: "toggle", label: "Automix-Titel mitzählen", default: false }
    },
    setup(ctx) {
      let s = ctx.settings;
      let text = "";
      const m = ctx.mount({
        id: "m.queueInfo",
        anchor: "m.queue.top",
        position: "prepend",
        create: () => h("div", { class: "ytx-m-info" }),
        update: (node) => {
          const all = queueItems().filter((x) => s.automix || !x.automix);
          if (!all.length) {
            node.textContent = text = "";
            return;
          }
          const t = currentTrack();
          const sel = Math.max(0, all.findIndex((x) => x.index === selectedIndex()));
          const tot = queueTotals(all, sel, t?.pos || 0);
          const rate = t?.rate || 1;
          const parts = [`${tot.count} Titel`, formatDuration(tot.total), `noch ${formatDuration(tot.remaining / rate)}`];
          if (s.endTime && tot.remaining) parts.push(`endet ${formatTimeOfDay(new Date(Date.now() + tot.remaining / rate * 1e3))}`);
          if (tot.unknown) parts.push(`${tot.unknown} ohne Dauer`);
          const next = parts.join(" · ");
          if (next !== text) node.textContent = text = next;
        }
      });
      const timer2 = setInterval(() => m.refresh(), 5e3);
      return {
        update(next) {
          s = next;
          m.refresh();
        },
        dispose() {
          clearInterval(timer2);
          m.destroy();
        },
        health: () => m.ok ? { status: text ? "ok" : "skip", detail: text || "Warteschlange leer" } : { status: "skip", detail: "Warteschlange nicht sichtbar (Player-Seite öffnen)" }
      };
    }
  };
  async function ensureLyrics(timeout = 5e3) {
    let d = lyricsData();
    if (d) return d;
    const idx = lyricsTabIndex();
    if (idx < 0) return null;
    const tab = document.querySelectorAll("ytmusic-player-page tp-yt-paper-tab")[idx];
    tab?.click();
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 150));
      d = lyricsData();
      if (d) return d;
    }
    return null;
  }
  var lyricsFeature = {
    id: "m.lyrics",
    site: "music",
    label: "Songtext kopieren",
    group: "Player",
    description: "Button über dem Songtext: nur Text, mit Titel, mit Zeitstempeln (nur wenn YouTube Music zeitgestempelte Texte liefert) oder als LRC. Erscheint nur, wenn es einen Songtext gibt",
    stability: "mittel-hoch",
    anchors: ["m.lyrics"],
    hotkeys: [["music.lyricsCopy", "Songtext kopieren", "Alt+L"]],
    settings: {
      format: { type: "select", label: "Standardformat", options: LYRICS_FORMATS, default: "plain" }
    },
    setup(ctx) {
      let s = ctx.settings;
      let last2 = null;
      const copy = async (mode) => {
        const d = await ensureLyrics();
        if (!d) return toast("Songtext noch nicht geladen");
        if (!d.available) return toast(`Kein Songtext: ${d.reason}`);
        const t = currentTrack();
        const useMode = mode === "timestamps" && !d.timed ? "plain" : mode;
        const text = formatLyrics(d, { mode: useMode, meta: t || {} });
        last2 = { at: Date.now(), mode: useMode, lines: d.lines.length, timed: d.timed };
        if (await ctx.copyText(text)) toast(`Songtext kopiert${mode === "timestamps" && !d.timed ? " (ohne Zeitstempel, keine vorhanden)" : ""}`);
        else textDialog("Songtext", text);
      };
      const m = ctx.mount({
        id: "m.lyrics.copy",
        anchor: "m.lyrics",
        position: "before",
        when: () => !!lyricsData()?.available,
        create: () => {
          const main = h("button", { type: "button", class: "ytx-m-pill", text: "⧉ Songtext kopieren" });
          const more = h("button", { type: "button", class: "ytx-m-pill", text: "▾", title: "Format wählen" });
          main.addEventListener("click", (e) => {
            e.stopPropagation();
            copy(s.format);
          });
          more.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = lyricsData();
            showMenu(more, [{ title: "Kopieren als" }, ...LYRICS_FORMATS.map(([id, label]) => ({ label, checked: id === s.format, disabled: id === "timestamps" && !d?.timed, sub: id === "timestamps" && !d?.timed ? "nicht verfügbar" : "", run: () => copy(id) }))]);
          });
          return h("div", { style: { display: "flex", gap: "6px", margin: "8px 0 12px" } }, main, more);
        }
      });
      ctx.action("music.lyricsCopy", () => copy(s.format));
      const timer2 = setInterval(() => m.refresh(), 1500);
      return {
        update(next) {
          s = next;
        },
        onVideo() {
          m.refresh();
        },
        dispose() {
          clearInterval(timer2);
          m.destroy();
        },
        health() {
          const d = lyricsData();
          if (!d) return { status: "skip", detail: "Songtext-Tab noch nicht geöffnet" };
          if (!d.available) return { status: "skip", detail: `kein Songtext für diesen Titel (${d.reason})` };
          return { status: m.ok ? "ok" : "warn", detail: `${d.lines.length} Zeilen · ${d.timed ? "mit Zeitstempeln" : "ohne Zeitstempel"}${m.ok ? "" : " · Button-Anker fehlt"}${last2 ? ` · zuletzt kopiert ${new Date(last2.at).toLocaleTimeString("de-DE")}` : ""}` };
        }
      };
    }
  };
  var EQ_BANDS = [60, 230, 910, 3600, 14e3];
  var EQ_PRESETS = {
    flat: [0, 0, 0, 0, 0],
    bass: [6, 3, 0, 0, 0],
    vocal: [-2, 0, 3, 3, 0],
    treble: [0, 0, 0, 3, 5],
    loudness: [5, 2, 0, 2, 4],
    night: [-4, -1, 1, 1, -2]
  };
  var audioFeature = {
    id: "m.audio",
    site: "music",
    label: "Audio statt Video & Equalizer",
    group: "Player",
    description: "Schaltet Musikvideos automatisch auf die Audiofassung um, wenn es eine gibt. Equalizer ist experimentell: er leitet den Ton durch Web Audio, bei Problemen einfach ausschalten und die Seite neu laden",
    stability: "experimentell",
    settings: {
      preferAudio: { type: "toggle", label: "Immer Audiofassung (Titel statt Video)", default: true },
      eq: { type: "select", label: "Equalizer (experimentell)", options: [["", "Aus"], ["flat", "Neutral"], ["bass", "Bass+"], ["vocal", "Stimme"], ["treble", "Höhen+"], ["loudness", "Loudness"], ["night", "Nacht (leise Bässe)"]], default: "" },
      preamp: { type: "range", label: "Vorverstärkung (dB)", min: -12, max: 6, step: 1, default: 0 }
    },
    setup(ctx) {
      let s = ctx.settings;
      const stats2 = { switched: 0, lastSwitch: null, eq: "aus", eqError: null };
      let lastTry = { videoId: null, at: 0 };
      let graph = null;
      const switchAudio = () => {
        if (!s.preferAudio) return;
        const t = currentTrack();
        const toggle2 = document.querySelector("ytmusic-player-page ytmusic-av-toggle");
        if (!toggle2 || !t) return;
        if (!toggle2.hasAttribute("audio-only-playback-available")) return;
        if (toggle2.getAttribute("is-video-playback-mode-selected") !== "true") return;
        if (lastTry.videoId === t.videoId && Date.now() - lastTry.at < 1e4) return;
        lastTry = { videoId: t.videoId, at: Date.now() };
        const btn2 = toggle2.querySelector('.song-button, [class*="song-button"], button:first-of-type');
        if (btn2) {
          btn2.click();
          stats2.switched++;
          stats2.lastSwitch = t.title;
        }
      };
      const ensureGraph = () => {
        if (!s.eq) return applyEq();
        const el = mediaEl();
        if (!el) return;
        try {
          if (!graph || graph.el !== el) {
            const ac = graph?.ac || new AudioContext();
            const src = ac.createMediaElementSource(el);
            const pre = ac.createGain();
            const filters = EQ_BANDS.map((f, i) => {
              const b = ac.createBiquadFilter();
              b.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
              b.frequency.value = f;
              b.Q.value = 1;
              return b;
            });
            src.connect(pre);
            let node = pre;
            for (const f of filters) {
              node.connect(f);
              node = f;
            }
            node.connect(ac.destination);
            graph = { ac, el, src, pre, filters };
          }
          if (graph.ac.state === "suspended") graph.ac.resume().catch(() => {
          });
          applyEq();
        } catch (e) {
          stats2.eqError = e.message;
        }
      };
      const applyEq = () => {
        if (!graph) return;
        const gains = EQ_PRESETS[s.eq] || EQ_PRESETS.flat;
        graph.filters.forEach((f, i) => f.gain.value = s.eq ? gains[i] : 0);
        graph.pre.gain.value = s.eq ? Math.pow(10, (s.preamp || 0) / 20) : 1;
        stats2.eq = s.eq || "aus (neutral durchgeleitet)";
      };
      const resume = () => graph?.ac.state === "suspended" && graph.ac.resume().catch(() => {
      });
      const offs = [listen(document, "pointerdown", resume, true), listen(document, "keydown", resume, true)];
      const timer2 = setInterval(() => {
        switchAudio();
        if (s.eq || graph) ensureGraph();
      }, 1500);
      return {
        stats: stats2,
        update(next) {
          s = next;
          ensureGraph();
        },
        onVideo() {
          setTimeout(switchAudio, 800);
        },
        dispose() {
          clearInterval(timer2);
          for (const off of offs) off();
          if (graph) {
            graph.filters.forEach((f) => f.gain.value = 0);
            graph.pre.gain.value = 1;
          }
        },
        health() {
          const toggle2 = document.querySelector("ytmusic-player-page ytmusic-av-toggle");
          const parts = [`${stats2.switched} Mal auf Audio umgeschaltet`];
          if (!toggle2) parts.push("kein Titel/Video-Umschalter sichtbar");
          if (s.eq || graph) parts.push(`EQ ${stats2.eq}${graph ? ` · AudioContext ${graph.ac.state}` : ""}`);
          if (stats2.eqError) return { status: "warn", detail: `EQ-Fehler: ${stats2.eqError}` };
          return { status: "ok", detail: parts.join(" · ") };
        }
      };
    }
  };

  // src/features/music/index.js
  var featureManifests2 = [historyFeature, favoritesFeature, hubFeature, releasesFeature, smartQueueFeature, queueInfoFeature, lyricsFeature, audioFeature];

  // src/core/diagnose.js
  var checks = /* @__PURE__ */ new Map();
  function registerCheck(id, group, label, run2) {
    checks.set(id, { id, group, label, run: run2 });
    return () => checks.delete(id);
  }
  function runChecks() {
    const out = [];
    for (const c of checks.values()) {
      let r;
      try {
        r = c.run() || { status: "skip", detail: "" };
      } catch (e) {
        r = { status: "fail", detail: `Prüfung abgestürzt: ${e.message}` };
        log.error(`check ${c.id}`, e);
      }
      const list = Array.isArray(r) ? r : [r];
      for (const item of list) out.push({ id: item.id || c.id, group: c.group, label: item.label || c.label, status: item.status, detail: item.detail || "" });
    }
    return out;
  }
  function summarize2(results) {
    const s = { ok: 0, warn: 0, fail: 0, skip: 0 };
    for (const r of results) s[r.status] = (s[r.status] || 0) + 1;
    return s;
  }
  function reportText(results, meta) {
    const lines2 = [`ytx Diagnose ${(/* @__PURE__ */ new Date()).toISOString()}`, ...Object.entries(meta).map(([k, v]) => `${k}: ${v}`), ""];
    let group = null;
    for (const r of results) {
      if (r.group !== group) {
        group = r.group;
        lines2.push(`## ${group}`);
      }
      lines2.push(`[${r.status.toUpperCase()}] ${r.label}${r.detail ? ` – ${r.detail}` : ""}`);
    }
    const errs = log.entries().filter((e) => e.level !== "info");
    if (errs.length) {
      lines2.push("", "## Log");
      for (const e of errs.slice(-30)) lines2.push(`${new Date(e.t).toISOString()} ${e.level} ${e.msg}${e.n > 1 ? ` ×${e.n}` : ""}`);
    }
    return lines2.join("\n");
  }

  // src/core/observer.js
  var subs2 = /* @__PURE__ */ new Map();
  var running = false;
  var sweepStats = { runs: 0, lastMs: 0, lastAt: 0 };
  function onSweep(id, fn) {
    subs2.set(id, fn);
    return () => subs2.delete(id);
  }
  function sweep() {
    const t0 = performance.now();
    for (const [id, fn] of subs2) {
      try {
        fn();
      } catch (e) {
        log.error(`sweep ${id}`, e);
      }
    }
    sweepStats.runs++;
    sweepStats.lastMs = Math.round((performance.now() - t0) * 10) / 10;
    sweepStats.lastAt = Date.now();
  }
  var requestSweep = debounce(sweep, 120, 600);
  function sweepNow() {
    requestSweep.cancel();
    sweep();
  }
  function startObserver() {
    if (running) return;
    running = true;
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target;
        if (t.nodeType === 1 && t.closest && t.closest("[data-ytx-own]")) continue;
        let own = true;
        for (const n of r.addedNodes) if (!(n.nodeType === 1 && n.hasAttribute && n.hasAttribute("data-ytx-own"))) own = false;
        for (const n of r.removedNodes) if (!(n.nodeType === 1 && n.hasAttribute && n.hasAttribute("data-ytx-own"))) own = false;
        if (!own) return requestSweep();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    const iv = setInterval(requestSweep, 2e3);
    onDispose(() => {
      mo.disconnect();
      clearInterval(iv);
      requestSweep.cancel();
      running = false;
    });
  }

  // src/core/mount.js
  var mounts = /* @__PURE__ */ new Map();
  var anchorStatus = /* @__PURE__ */ new Map();
  function resolveAnchor(id, root = document) {
    const a = site.anchors[id];
    if (!a) {
      log.warn(`anker unbekannt ${id}`);
      return null;
    }
    let fallback = null;
    for (const sel of a.sel) {
      for (const el of qsa(sel, root)) {
        if (isVisible(el)) {
          anchorStatus.set(id, { ok: true, sel, at: Date.now() });
          return el;
        }
        fallback ||= el;
      }
    }
    anchorStatus.set(id, { ok: !!fallback, sel: fallback ? "unsichtbar" : null, at: Date.now() });
    return a.visibleOnly ? null : fallback;
  }
  function getAnchorStatus() {
    return anchorStatus;
  }
  function mount({ id, anchor, position = "append", create, update, when: when2 }) {
    const m = { id, anchor, position, create, update, when: when2, node: null, host: null, ok: false };
    mounts.set(id, m);
    place(m);
    requestSweep();
    return {
      get node() {
        return m.node;
      },
      get ok() {
        return m.ok;
      },
      refresh: () => place(m),
      destroy: () => {
        m.node?.remove();
        mounts.delete(id);
      }
    };
  }
  function place(m) {
    try {
      if (m.when && !m.when()) {
        if (m.node?.isConnected) m.node.remove();
        m.ok = false;
        return;
      }
      const list = Array.isArray(m.anchor) ? m.anchor : [m.anchor];
      let host2 = null;
      for (const a of list) {
        host2 = resolveAnchor(a);
        if (host2) break;
      }
      if (!host2) {
        m.ok = false;
        return;
      }
      if (!m.node) {
        m.node = m.create();
        m.node.setAttribute("data-ytx-own", "");
        m.node.setAttribute("data-ytx-mount", m.id);
      }
      const placed = m.node.isConnected && m.host === host2 && isPlaced(m.node, host2, m.position);
      if (!placed) {
        if (m.position === "append") host2.append(m.node);
        else if (m.position === "prepend") host2.prepend(m.node);
        else if (m.position === "before") host2.before(m.node);
        else host2.after(m.node);
        m.host = host2;
      }
      m.ok = true;
      m.update?.(m.node, host2);
    } catch (e) {
      m.ok = false;
      log.error(`mount ${m.id}`, e);
    }
  }
  function isPlaced(node, host2, position) {
    if (position === "append" || position === "prepend") return node.parentElement === host2;
    const step = position === "after" ? "nextElementSibling" : "previousElementSibling";
    let cur = host2[step];
    while (cur) {
      if (cur === node) return true;
      if (!cur.hasAttribute("data-ytx-mount")) return false;
      cur = cur[step];
    }
    return false;
  }
  function mountStatus() {
    return Array.from(mounts.values()).map((m) => ({ id: m.id, anchor: m.anchor, ok: m.ok }));
  }
  onSweep("mount", () => {
    for (const m of mounts.values()) place(m);
  });
  onDispose(() => {
    for (const m of mounts.values()) m.node?.remove();
    mounts.clear();
  });

  // src/features/music/diagnose.js
  var info = { at: 0, sizes: null, lastPlay: null, lastCheck: null, error: null };
  function refreshAsync() {
    if (Date.now() - info.at < 8e3) return;
    info.at = Date.now();
    const db2 = musicDb();
    Promise.all([db2.sizes(), db2.latest("plays", "startedAt", 1), music.getMeta("lastReleaseCheck")]).then(([sizes, last2, check]) => {
      info.sizes = sizes;
      info.lastPlay = last2[0] || null;
      info.lastCheck = check;
      info.error = null;
    }).catch((e) => info.error = e.message);
  }
  var ago = (ts) => {
    if (!ts) return "nie";
    const s = Math.round((Date.now() - ts) / 1e3);
    return s < 90 ? `vor ${s} s` : s < 5400 ? `vor ${Math.round(s / 60)} min` : s < 172800 ? `vor ${Math.round(s / 3600)} h` : `vor ${Math.round(s / 86400)} Tagen`;
  };
  function registerMusicChecks() {
    registerCheck("music.page", "Music", "Seite & Konto", () => {
      const b = currentBrowse();
      return [
        { id: "music.page", label: "Seitentyp", status: nav.page === "other" ? "warn" : "ok", detail: `${nav.page}${b ? ` · browseId ${b.browseId}` : ""}${isPlayerPageOpen() ? " · Player-Seite offen" : ""}` },
        { id: "music.login", label: "Anmeldung", status: "ok", detail: isLoggedIn() ? "eingeloggt" : "nicht eingeloggt (Mediathek, Likes, Verlauf von YouTube fehlen)" }
      ];
    });
    registerCheck("music.sources", "Music", "Datenquellen", () => {
      const st = appState();
      const q2 = queueRaw();
      const raw = (q2?.items?.length || 0) + (q2?.automixItems?.length || 0);
      const parsed = queueItems().length;
      return [
        { id: "music.store", label: "App-Zustand (Redux Store)", status: st ? "ok" : "fail", detail: st ? `Bereiche: ${Object.keys(st).slice(0, 12).join(", ")}` : "ytmusic-app.polymerController.store nicht erreichbar" },
        { id: "music.playerApi", label: "Player-API", status: playerApi() ? "ok" : "skip", detail: playerApi() ? "getVideoData, getCurrentTime, nextVideo verfügbar" : "noch kein Player" },
        { id: "music.browseData", label: "Seitendaten der aktuellen Seite", status: currentBrowse() ? "ok" : ["watch", "search", "other"].includes(nav.page) ? "skip" : "warn", detail: currentBrowse() ? "navigation.mainContent.response vorhanden" : "keine Browse-Daten im Store" },
        { id: "music.queue", label: "Warteschlange erkannt", status: raw ? parsed === raw ? "ok" : "warn" : "skip", detail: raw ? `${parsed}/${raw} Einträge gelesen · ausgewählt #${selectedIndex()}${ytxQueue.state.active ? ` · ytx-Reihenfolge aktiv ${ytxQueue.state.index + 1}/${ytxQueue.state.items.length}` : ""}` : "leer" },
        { id: "music.loader", label: "Hintergrund-Seitenabrufe", status: loader.stats.errors ? "warn" : "ok", detail: `${loader.stats.requests} Abrufe · ${loader.stats.cacheHits} aus Cache · ${loader.stats.errors} Fehler${loader.stats.lastError ? ` (${loader.stats.lastError})` : ""}${loader.stats.lastUrl ? ` · zuletzt ${loader.stats.lastUrl} in ${loader.stats.lastMs} ms` : ""}` }
      ];
    });
    registerCheck("music.track", "Music", "Aktueller Song", () => {
      const t = currentTrack();
      if (!t) return { id: "music.track", label: "Aktueller Song", status: "skip", detail: "nichts geladen" };
      const who = t.artists.map((a) => `${a.name}${a.id ? "" : " (ohne ID)"}`).join(", ");
      return [
        { id: "music.track", label: "Aktueller Song", status: t.title && t.artists.length ? "ok" : "warn", detail: `${t.title || "?"} – ${who || "?"}${t.album ? ` · ${t.album.name}` : ""} · ${Math.round(t.pos)}/${Math.round(t.dur)} s · ${t.playing ? "spielt" : "pausiert"}${t.ad ? " · Werbung" : ""} · ${t.videoType || "Typ ?"}${t.liked ? " · ♥" : ""}` },
        (() => {
          const d = lyricsData();
          return { id: "music.lyrics", label: "Songtext-Erkennung", status: d ? "ok" : "skip", detail: !d ? "Songtext-Tab noch nicht geladen" : d.available ? `${d.lines.length} Zeilen, ${d.timed ? "mit" : "ohne"} Zeitstempel` : `kein Songtext (${d.reason})` };
        })()
      ];
    });
    registerCheck(
      "music.anchors",
      "Music",
      "Music-Anker",
      () => Object.entries(anchors2).map(([id, a]) => {
        const el = resolveAnchor(id);
        return { id: `music.anchor.${id}`, label: `${a.label} (${id})`, status: el ? "ok" : "skip", detail: el ? "gefunden" : "nicht auf dieser Seite / nicht sichtbar" };
      })
    );
    registerCheck("music.data", "Music", "Lokale Daten", () => {
      refreshAsync();
      const db2 = musicDb().status;
      const p = music.prefs();
      const res = [
        { id: "music.idb", label: "IndexedDB", status: db2.error || info.error ? "fail" : db2.open ? "ok" : "skip", detail: db2.error || info.error || `${db2.name} v${db2.version}${db2.open ? " offen" : " noch nicht geöffnet"}${db2.blocked ? " · von anderem Tab blockiert" : ""}${info.sizes ? ` · ${Object.entries(info.sizes).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}` },
        { id: "music.history", label: "Hörverlauf", status: p.history.paused ? "warn" : info.lastPlay ? "ok" : "skip", detail: `${p.history.paused ? "pausiert · " : ""}letzter Eintrag ${ago(info.lastPlay?.endedAt)}${info.lastPlay ? ` (${info.lastPlay.title}, ${Math.round((info.lastPlay.percent || 0) * 100)} %${info.lastPlay.skipped ? ", übersprungen" : ""})` : ""}${p.history.retentionDays ? ` · Aufbewahrung ${p.history.retentionDays} Tage` : ""}` },
        { id: "music.releaseCheck", label: "Letzter Künstler-Check", status: info.lastCheck?.errors?.length ? "warn" : info.lastCheck ? "ok" : "skip", detail: info.lastCheck ? `${ago(info.lastCheck.at)} · ${info.lastCheck.checked}/${info.lastCheck.artists} Künstler · ${info.lastCheck.fresh} neu${info.lastCheck.errors?.length ? ` · ${info.lastCheck.errors[0]}` : ""}` : "noch keiner" },
        { id: "music.session", label: "Session-Preset", status: "ok", detail: music.session()?.presetId || "keins" }
      ];
      const errs = log.entries().filter((e) => e.level === "error" && /music|feature m\.|mix|pageData/.test(e.msg));
      res.push({ id: "music.errors", label: "Feature-Fehler", status: errs.length ? "fail" : "ok", detail: errs.length ? errs.slice(-3).map((e) => `${e.msg}${e.n > 1 ? ` ×${e.n}` : ""}`).join(" · ") : "keine" });
      return res;
    });
  }

  // src/sites/music.js
  var musicSite = {
    id: "music",
    label: "YouTube Music",
    appHost: "ytmusic-app",
    // alben oeffnen unter /playlist?list=OLAK..., die browse id im app zustand verraet den echten typ
    pageFromUrl(href) {
      const page = pageFromUrl2(href);
      if (page !== "playlist" || href !== location.href) return page;
      const id = currentBrowse()?.browseId || "";
      return id.startsWith("MPREb_") ? "album" : page;
    },
    videoIdFromUrl: videoIdFromUrl2,
    // der player laeuft seitenuebergreifend, der titel kommt nicht aus der url
    currentVideoId(page, href) {
      try {
        const id = playerApi()?.getVideoData?.()?.video_id;
        if (id) return id;
      } catch {
      }
      return appState()?.player?.playerResponse?.videoDetails?.videoId || videoIdFromUrl2(href);
    },
    PAGE_LABELS: PAGE_LABELS2,
    targets: targets2,
    GROUPS: GROUPS2,
    targetById: targetById2,
    anchors: anchors2,
    tagRules: tagRules2,
    tagAttrs: TAG_ATTRS,
    look: { colorControls: colorControls2, controls: controls2, themes: themes2, LOOK_GROUPS: LOOK_GROUPS2, controlById: controlById2, tokenScope: TOKEN_SCOPE2, extraCss: extraCss2 },
    presets: { layoutPresets: layoutPresets2, presetById: presetById2, LAYOUT_PAGES: LAYOUT_PAGES2, orderGroups: orderGroups2, topbarModes: topbarModes2, topbarCss: topbarCss2 },
    behaviors: behaviors2,
    behaviorById: behaviorById2,
    features: featureManifests2,
    filters: null,
    // fuer diagnose in der konsole ueber __ytx.debug
    get debug() {
      return { music, catalog, buildMix, checkReleases, ytxQueue };
    },
    panelTabs: ["display", "look", "layout", "behavior", "features", "music", "musicData", "musicStats", "profiles", "diagnose"],
    boot() {
      initMusicUiCss();
      registerMusicChecks();
    }
  };

  // src/sites/index.js
  var sites = { youtube: youtubeSite, music: musicSite };
  var site = sites[SITE_ID];

  // src/core/nav.js
  var handlers2 = { page: /* @__PURE__ */ new Set(), video: /* @__PURE__ */ new Set(), start: /* @__PURE__ */ new Set() };
  var nav = {
    page: "other",
    url: "",
    videoId: null,
    playlistId: null,
    eventsSeen: /* @__PURE__ */ new Set(),
    lastCheck: 0,
    on(type, fn) {
      handlers2[type].add(fn);
      return () => handlers2[type].delete(fn);
    }
  };
  function emit3(type, ...args) {
    for (const fn of handlers2[type]) {
      try {
        fn(...args);
      } catch (e) {
        log.error(`nav ${type}`, e);
      }
    }
  }
  function checkNav() {
    const href = location.href;
    const page = site.pageFromUrl(href);
    let videoId = null;
    try {
      videoId = site.currentVideoId ? site.currentVideoId(page, href) : site.videoIdFromUrl(href);
    } catch {
    }
    let playlistId = null;
    try {
      playlistId = new URL(href).searchParams.get("list");
    } catch {
    }
    const pageChanged = page !== nav.page || href !== nav.url;
    const videoChanged = videoId !== nav.videoId;
    nav.url = href;
    nav.playlistId = playlistId;
    nav.lastCheck = Date.now();
    if (page !== nav.page) {
      nav.page = page;
      document.documentElement.setAttribute("data-ytx-page", page);
    }
    if (videoChanged) nav.videoId = videoId;
    if (pageChanged) emit3("page", page);
    if (videoChanged) emit3("video", videoId);
  }
  function initNav() {
    nav.page = site.pageFromUrl(location.href);
    document.documentElement.setAttribute("data-ytx-page", nav.page);
    document.documentElement.setAttribute("data-ytx-site", site.id);
    const seen2 = (e) => nav.eventsSeen.add(e.type);
    listen(document, "yt-navigate-start", (e) => {
      seen2(e);
      const url = e.detail?.url;
      emit3("start", url ? site.pageFromUrl(url) : null, url);
    });
    for (const type of ["yt-navigate-finish", "yt-page-data-updated", "yt-player-updated"]) {
      listen(document, type, (e) => {
        seen2(e);
        checkNav();
      });
    }
    listen(window, "popstate", () => checkNav());
    for (const fn of ["pushState", "replaceState"]) {
      const orig = history[fn];
      if (orig.__ytx) continue;
      const wrapped = function(...args) {
        const r = orig.apply(this, args);
        setTimeout(checkNav, 0);
        return r;
      };
      wrapped.__ytx = true;
      wrapped.__orig = orig;
      history[fn] = wrapped;
    }
    onDispose(disposeNavHooks);
    checkNav();
  }
  function disposeNavHooks() {
    for (const fn of ["pushState", "replaceState"]) if (history[fn]?.__orig) history[fn] = history[fn].__orig;
  }

  // src/core/clipboard.js
  var clipboardState = { last: null, method: null };
  async function copyText(text) {
    clipboardState.last = text;
    if (typeof GM_setClipboard === "function") {
      try {
        GM_setClipboard(text, "text");
        clipboardState.method = "gm";
        return true;
      } catch (e) {
        log.warn("GM_setClipboard", e);
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      clipboardState.method = "navigator";
      return true;
    } catch {
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) {
        clipboardState.method = "execCommand";
        return true;
      }
    } catch {
    }
    clipboardState.method = "failed";
    log.warn("clipboard: kopieren fehlgeschlagen");
    return false;
  }

  // src/core/hotkeys.js
  var actions = /* @__PURE__ */ new Map();
  var bindings = {};
  function registerAction(id, label, run2, defaultKey = "") {
    actions.set(id, { id, label, run: run2, defaultKey });
    return () => actions.delete(id);
  }
  function listActions() {
    return Array.from(actions.values());
  }
  function setBindings(map) {
    bindings = map || {};
  }
  function keyFor(id) {
    const a = actions.get(id);
    return bindings[id] ?? a?.defaultKey ?? "";
  }
  function comboFromEvent(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    if (e.metaKey) parts.push("Meta");
    const k = e.key;
    if (["Control", "Alt", "Shift", "Meta"].includes(k)) return parts.join("+");
    const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : k.length === 1 ? k.toUpperCase() : k;
    parts.push(key);
    return parts.join("+");
  }
  function isTyping(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const el of path) {
      if (!el || el.nodeType !== 1) continue;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return true;
    }
    return false;
  }
  function initHotkeys() {
    listen(
      window,
      "keydown",
      (e) => {
        if (e.repeat) return;
        const combo = comboFromEvent(e);
        if (!combo.includes("+") && isTyping(e)) return;
        if (isTyping(e) && !e.altKey && !e.ctrlKey) return;
        for (const a of actions.values()) {
          const key = keyFor(a.id);
          if (key && key === combo) {
            e.preventDefault();
            e.stopPropagation();
            try {
              a.run();
            } catch (err) {
              log.error(`hotkey ${a.id}`, err);
            }
            return;
          }
        }
      },
      true
    );
  }

  // src/appliers/display.js
  var invalid = /* @__PURE__ */ new Map();
  function scopes(t, mode) {
    const attr = `[${attrName(t.id)}="${mode}"]`;
    return t.pages ? t.pages.map((p) => `html[data-ytx-page="${p}"]${attr}`) : [`html${attr}`];
  }
  function buildDisplayCss() {
    const out = [];
    for (const t of site.targets) {
      const good = t.sel.filter((s) => {
        const ok = validSelector(s);
        if (!ok) invalid.set(`${t.id} ${s}`, true);
        return ok;
      });
      for (const mode of t.modes) {
        if (mode === "show") continue;
        for (const scope of scopes(t, mode)) {
          for (const sel of good) {
            const full = `${scope} ${sel}`;
            if (mode === "hide") out.push(`${full} { display: none !important; }`);
            else if (mode === "collapse") out.push(`${full}:not([data-ytx-open]) { display: none !important; }`);
            else if (mode === "dim") {
              if (t.dim === "grayscale") {
                out.push(`${full} { filter: grayscale(1) contrast(.9) !important; opacity: .75 !important; transition: filter .2s ease, opacity .2s ease !important; }`);
                out.push(`${full}:hover { filter: none !important; opacity: 1 !important; }`);
              } else {
                out.push(`${full} { opacity: var(--ytx-dim-opacity, .3) !important; transition: opacity .15s ease !important; }`);
                out.push(`${full}:hover, ${full}:focus-within { opacity: 1 !important; }`);
              }
            }
          }
          if (t.css?.[mode]) out.push(t.css[mode](scope));
        }
      }
    }
    out.push(`
.ytx-collapse-bar { all: initial; display: flex; align-items: center; gap: 8px; box-sizing: border-box; width: 100%; margin: 8px 0; padding: 8px 12px; border-radius: 10px; cursor: pointer; user-select: none;
  font: 500 13px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08)); }
.ytx-collapse-bar:hover { color: var(--yt-sys-color-baseline--text-primary, #fff); background: var(--yt-sys-color-baseline--tonal-background, rgba(255,255,255,.12)); }
.ytx-collapse-bar .ytx-arrow { display: inline-block; transition: transform .15s ease; }
.ytx-collapse-bar[data-open] .ytx-arrow { transform: rotate(90deg); }
.ytx-collapse-bar .ytx-hint { margin-left: auto; opacity: .7; font-weight: 400; }`);
    return out.join("\n");
  }
  var current = {};
  function applyDisplay(cfg) {
    current = cfg.display;
    const root = document.documentElement;
    for (const t of site.targets) {
      const name = attrName(t.id);
      const mode = cfg.display[t.id];
      if (mode && mode !== "show") {
        if (root.getAttribute(name) !== mode) root.setAttribute(name, mode);
      } else if (root.hasAttribute(name)) {
        root.removeAttribute(name);
      }
    }
    syncCollapse();
  }
  var bars = /* @__PURE__ */ new WeakMap();
  function onPage(t) {
    return !t.pages || t.pages.includes(nav.page);
  }
  function syncCollapse() {
    for (const t of site.targets) {
      const active = current[t.id] === "collapse" && onPage(t);
      if (!active) {
        for (const bar of qsa(`.ytx-collapse-bar[data-ytx-bar="${t.id}"]`)) bar.remove();
        continue;
      }
      const selList = t.sel.filter(validSelector).join(", ");
      for (const el of qsa(selList)) {
        if (el.parentElement?.closest(selList)) continue;
        let bar = bars.get(el);
        if (bar && bar.isConnected && bar.nextElementSibling === el) continue;
        bar?.remove();
        bar = makeBar(t, el);
        bars.set(el, bar);
        el.before(bar);
      }
    }
  }
  function makeBar(t, el) {
    const arrow = h("span", { class: "ytx-arrow", text: "▸" });
    const hint = h("span", { class: "ytx-hint", text: "aufklappen" });
    const bar = h("div", { class: "ytx-collapse-bar", "data-ytx-own": "", "data-ytx-bar": t.id, role: "button", tabindex: "0" }, arrow, h("span", { text: t.label }), hint);
    const toggle2 = () => {
      const open = !el.hasAttribute("data-ytx-open");
      if (open) {
        el.setAttribute("data-ytx-open", "");
        bar.setAttribute("data-open", "");
      } else {
        el.removeAttribute("data-ytx-open");
        bar.removeAttribute("data-open");
      }
      hint.textContent = open ? "zuklappen" : "aufklappen";
      window.dispatchEvent(new Event("resize"));
    };
    bar.addEventListener("click", toggle2);
    bar.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle2()));
    if (el.hasAttribute("data-ytx-open")) {
      bar.setAttribute("data-open", "");
      hint.textContent = "zuklappen";
    }
    return bar;
  }
  function initDisplay() {
    setCss("display", buildDisplayCss());
    onSweep("display.collapse", syncCollapse);
    onDispose(() => {
      for (const bar of qsa(".ytx-collapse-bar")) bar.remove();
      for (const el of qsa("[data-ytx-open]")) el.removeAttribute("data-ytx-open");
      for (const t of site.targets) document.documentElement.removeAttribute(attrName(t.id));
    });
    registerCheck("display", "Anzeige", "Targets auf dieser Seite", () => {
      const results = [];
      if (invalid.size) results.push({ id: "display.invalid", label: "Ungültige Selektoren", status: "fail", detail: Array.from(invalid.keys()).join(" · ") });
      for (const t of site.targets) {
        if (t.pages && !t.pages.includes(nav.page)) continue;
        const n = t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0);
        const mode = current[t.id] || "show";
        const ready = !t.core || nav.page !== "watch" || document.querySelector("ytd-watch-metadata #actions ytd-menu-renderer");
        results.push({
          id: `display.${t.id}`,
          label: `${t.group} › ${t.label}`,
          status: n ? "ok" : t.core && ready ? "warn" : "skip",
          detail: `${n} Treffer · Modus ${MODE_LABELS[mode]}${n ? "" : t.core ? ` · sollte immer vorhanden sein – Selektor in registry/${site.id}/targets.js prüfen` : " · auf dieser Seite nicht vorhanden"}`
        });
      }
      return results;
    });
  }
  function countMatches(id) {
    const t = site.targetById[id];
    if (!t) return 0;
    return t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0);
  }

  // src/appliers/vars.js
  function buildVarsCss(vars, look = site.look) {
    const theme = look.themes.find((t) => t.id === vars.theme) || look.themes[0];
    const colors = { ...theme.values };
    for (const c of look.colorControls) if (vars[c.id]) colors[c.id] = vars[c.id];
    const out = [];
    const decl = [];
    for (const c of look.colorControls) {
      const v = colors[c.id];
      if (!v) continue;
      for (const token of c.tokens) decl.push(`${token}: ${v} !important;`);
      if (c.extra) out.push(c.extra(v));
    }
    if (decl.length) out.unshift(`${look.tokenScope} { ${decl.join(" ")} }`);
    const extra = look.extraCss?.(colors);
    if (extra) out.push(extra);
    for (const c of look.controls) {
      const v = vars[c.id];
      if (v === void 0 || v === null || v === "") continue;
      out.push(c.css(v));
    }
    return out.join("\n");
  }
  function applyVars(cfg) {
    setCss("vars", buildVarsCss(cfg.vars));
  }

  // src/appliers/layout.js
  var P = () => site.presets;
  var presetAttr = (page) => `data-ytx-l-${page}`;
  function buildPresetCss() {
    const out = [];
    for (const p of P().layoutPresets) {
      for (const page of p.pages) out.push(p.css(`html[data-ytx-page="${page}"][${presetAttr(page)}="${p.id}"]`));
    }
    return out.join("\n");
  }
  var last = "";
  var scrollOff = null;
  function applyLayout(cfg) {
    const root = document.documentElement;
    const pages = new Set(P().layoutPresets.flatMap((p) => p.pages));
    let needResize = false;
    for (const page of pages) {
      const id = cfg.layout.presets[page];
      const name = presetAttr(page);
      if (id) {
        if (root.getAttribute(name) !== id) {
          root.setAttribute(name, id);
          needResize ||= !!P().presetById[id]?.resize;
        }
      } else if (root.hasAttribute(name)) {
        needResize ||= !!P().presetById[root.getAttribute(name)]?.resize;
        root.removeAttribute(name);
      }
    }
    const dyn = [];
    for (const [gid, list] of Object.entries(cfg.layout.order)) {
      const g = P().orderGroups[gid];
      if (!g || !list.length) continue;
      dyn.push(g.container);
      list.forEach((id, i) => dyn.push(g.item(id, i + 1)));
    }
    const tb = P().topbarCss || {};
    if (cfg.layout.topbar && tb[cfg.layout.topbar]) dyn.push(tb[cfg.layout.topbar]);
    const text = dyn.join("\n");
    if (text !== last) {
      setCss("layout.dynamic", text);
      last = text;
    }
    if (cfg.layout.topbar === "autohide" && !scrollOff) {
      let y = window.scrollY;
      scrollOff = listen(window, "scroll", () => {
        const ny = window.scrollY;
        if (Math.abs(ny - y) < 8) return;
        if (ny > y && ny > 120) root.setAttribute("data-ytx-scrolled-down", "");
        else root.removeAttribute("data-ytx-scrolled-down");
        y = ny;
      }, { passive: true });
    } else if (cfg.layout.topbar !== "autohide" && scrollOff) {
      scrollOff();
      scrollOff = null;
      root.removeAttribute("data-ytx-scrolled-down");
    }
    if (needResize) setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }
  function initLayout(getConfig) {
    setCss("layout.presets", buildPresetCss());
    onDispose(() => {
      for (const a of Array.from(document.documentElement.attributes)) if (a.name.startsWith("data-ytx-l-") || a.name === "data-ytx-scrolled-down") document.documentElement.removeAttribute(a.name);
    });
    registerCheck("layout", "Layout", "Layout", () => {
      const cfg = getConfig();
      const res = [];
      const id = cfg.layout.presets[nav.page];
      res.push({ id: "layout.preset", label: `Preset auf dieser Seite (${nav.page})`, status: id ? "ok" : "skip", detail: id ? P().presetById[id]?.label : "keins" });
      if (cfg.layout.order["watch.actions"] && nav.page === "watch") {
        const ok = !!qs("ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn]");
        res.push({ id: "layout.order", label: "Reihenfolge Aktionsleiste", status: ok ? "ok" : "warn", detail: ok ? "Buttons getaggt, Reihenfolge aktiv" : "Keine getaggten Buttons gefunden" });
      }
      if (nav.page === "watch" && id && P().presetById[id]?.resize) {
        const video = qs("#movie_player video");
        const primary = qs("ytd-watch-flexy #primary");
        if (video && primary) {
          const vw = video.getBoundingClientRect().width;
          const pw = primary.getBoundingClientRect().width;
          res.push({ id: "layout.player", label: "Playergröße passt zum Layout", status: vw > 0 && vw <= pw + 40 ? "ok" : "warn", detail: `Video ${Math.round(vw)} px · Spalte ${Math.round(pw)} px` });
        }
      }
      return res;
    });
  }

  // src/appliers/behavior.js
  var running2 = /* @__PURE__ */ new Map();
  var ctxBase = null;
  function initBehavior(ctx) {
    ctxBase = ctx;
    onDispose(() => {
      for (const r of running2.values()) safeStop(r);
      running2.clear();
    });
    registerCheck(
      "behavior",
      "Verhalten",
      "Verhalten",
      () => site.behaviors.filter((b) => running2.has(b.id)).map((b) => {
        const r = running2.get(b.id);
        const h2 = b.health ? b.health(ctxBase, r.value) : { status: "ok", detail: "aktiv" };
        return { id: `behavior.${b.id}`, label: b.label, ...h2 };
      })
    );
  }
  function safeStop(r) {
    try {
      r.stop?.();
    } catch (e) {
      log.error("behavior stop", e);
    }
  }
  function applyBehavior(cfg) {
    for (const b of site.behaviors) {
      const value = cfg.behavior[b.id] ?? b.default;
      const active = b.type === "toggle" ? !!value : !!value;
      const r = running2.get(b.id);
      if (r && (!active || r.value !== value)) {
        safeStop(r);
        running2.delete(b.id);
      }
      if (active && !running2.has(b.id)) {
        try {
          const stop = b.start(ctxBase, value);
          running2.set(b.id, { stop, value });
        } catch (e) {
          log.error(`behavior ${b.id}`, e);
        }
      }
    }
  }

  // src/appliers/tagger.js
  var lastCount = /* @__PURE__ */ new Map();
  function run() {
    for (const r of site.tagRules) {
      if (r.pages && !r.pages.includes(nav.page)) continue;
      lastCount.set(r.id, r.run());
    }
  }
  function initTagger() {
    onSweep("tagger", run);
    run();
    onDispose(() => {
      for (const attr of ["data-ytx-btn", "data-ytx-guide", "data-ytx-guide-section", "data-ytx-top", "data-ytx-tab", "data-ytx-live", ...site.tagAttrs || []]) {
        for (const el of qsa(`[${attr}]`)) el.removeAttribute(attr);
      }
    });
    registerCheck(
      "tagger",
      "Grundlagen",
      "Tagging",
      () => site.tagRules.filter((r) => !r.pages || r.pages.includes(nav.page)).map((r) => {
        const n = lastCount.get(r.id) ?? 0;
        const extra = r.id === "watch.buttons" ? ` · ${qsa("ytd-watch-metadata [data-ytx-btn]").map((e) => e.getAttribute("data-ytx-btn")).join(", ")}` : "";
        return { id: `tag.${r.id}`, label: r.label, status: n ? "ok" : r.core ? "warn" : "skip", detail: `${n} Elemente getaggt${extra}` };
      })
    );
  }

  // src/appliers/filterLogic.js
  var REASONS = {
    allowOnly: "nicht auf Positivliste",
    channel: "Kanal",
    keyword: "Stichwort",
    regex: "Muster",
    short: "Short",
    live: "Live",
    tooShort: "zu kurz",
    tooLong: "zu lang",
    old: "zu alt",
    watched: "gesehen"
  };
  var norm = (s) => String(s || "").trim().toLowerCase();
  function channelMatches(entry, meta) {
    const e = norm(entry);
    if (!e) return false;
    if (e.startsWith("uc") && e.length > 20) return norm(meta.channelId) === e || norm(meta.channelUrl).includes(e);
    if (e.startsWith("@")) return norm(meta.channelUrl).replace(/^\//, "") === e || norm(meta.channelUrl).endsWith(`/${e}`);
    return norm(meta.channel) === e;
  }
  function compileRules2(f) {
    const flags = f.title.caseSensitive ? "" : "i";
    const regex = [];
    const errors = [];
    for (const r of f.title.regex) {
      try {
        regex.push(new RegExp(r, flags));
      } catch (e) {
        errors.push(`${r}: ${e.message}`);
      }
    }
    const keywords = f.title.caseSensitive ? f.title.keywords : f.title.keywords.map(norm);
    return { f, regex, keywords, errors };
  }
  function evaluate(meta, rules2) {
    const { f } = rules2;
    if (!meta) return null;
    const isVideo = meta.kind === "video";
    if (f.channels.allowOnly.length && (meta.channel || meta.channelUrl)) {
      if (!f.channels.allowOnly.some((c) => channelMatches(c, meta))) return REASONS.allowOnly;
    }
    if (f.channels.block.some((c) => channelMatches(c, meta))) return REASONS.channel;
    const title = f.title.caseSensitive ? meta.title : norm(meta.title);
    if (title) {
      if (rules2.keywords.some((k) => k && title.includes(k))) return REASONS.keyword;
      if (rules2.regex.some((re) => re.test(meta.title))) return REASONS.regex;
    }
    if (!isVideo) return null;
    if (f.shorts && meta.isShort) return REASONS.short;
    if (f.live && meta.live) return REASONS.live;
    if (meta.durationSec != null) {
      if (f.duration.minSec != null && meta.durationSec < f.duration.minSec) return REASONS.tooShort;
      if (f.duration.maxSec != null && meta.durationSec > f.duration.maxSec) return REASONS.tooLong;
    }
    if (f.age.maxDays != null && meta.ageDays != null && meta.ageDays > f.age.maxDays) return REASONS.old;
    if (f.watched.hide && meta.percent != null && meta.percent >= f.watched.minPercent) return REASONS.watched;
    return null;
  }

  // src/appliers/filters.js
  var F = () => site.filters;
  var ATTR2 = "data-ytx-f";
  var seen = /* @__PURE__ */ new WeakMap();
  var rules = null;
  var version = 0;
  var filterStats = { page: "", checked: 0, hits: 0, reasons: {}, unreadable: 0 };
  var CSS2 = `
[${ATTR2}="hide"] { display: none !important; }
[${ATTR2}="dim"]:not([data-ytx-f-open]) { opacity: var(--ytx-dim-opacity, .3) !important; transition: opacity .15s ease !important; }
[${ATTR2}="dim"]:not([data-ytx-f-open]):hover { opacity: 1 !important; }
[${ATTR2}="collapse"]:not([data-ytx-f-open]) > :not(.ytx-fbar) { display: none !important; }
[${ATTR2}="collapse"]:not([data-ytx-f-open]) { min-height: 0 !important; height: auto !important; }
.ytx-fbar { all: initial; display: none; box-sizing: border-box; width: 100%; padding: 6px 10px; margin: 2px 0 6px; border-radius: 8px; cursor: pointer;
  font: 12px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.06)); }
[${ATTR2}="collapse"] > .ytx-fbar { display: block; }
[${ATTR2}="collapse"][data-ytx-f-open] > .ytx-fbar { opacity: .6; }
[${ATTR2}] [${ATTR2}] { opacity: 1 !important; }
`;
  function outermostCards() {
    const out = [];
    for (const root of F().activePageRoots()) {
      for (const el of qsa(F().CARD_SELECTORS.join(", "), root)) {
        const parent = el.parentElement?.closest(F().CARD_PARENT);
        if (parent) continue;
        out.push(el);
      }
    }
    return out;
  }
  function clearCard(el) {
    el.removeAttribute(ATTR2);
    el.removeAttribute("data-ytx-f-reason");
    el.removeAttribute("data-ytx-f-open");
    el.querySelector(":scope > .ytx-fbar")?.remove();
  }
  function sweep2() {
    if (!rules) return;
    const f = rules.f;
    const active = f.enabled && f.pages.includes(nav.page);
    if (filterStats.page !== nav.url) Object.assign(filterStats, { page: nav.url, checked: 0, hits: 0, reasons: {}, unreadable: 0 });
    if (!active) {
      for (const el of qsa(`[${ATTR2}]`)) clearCard(el);
      return;
    }
    for (const el of outermostCards()) {
      const a = el.querySelector("a[href]");
      const sig = `${version}|${a?.getAttribute("href") || ""}|${el.querySelector("h3, #video-title")?.textContent || ""}`;
      if (seen.get(el) === sig) continue;
      seen.set(el, sig);
      let meta = null;
      try {
        meta = F().readCard(el);
      } catch (e) {
        log.warn("filter readCard", e);
      }
      filterStats.checked++;
      if (!meta || !meta.title && !meta.videoId) {
        filterStats.unreadable++;
        if (el.hasAttribute(ATTR2)) clearCard(el);
        continue;
      }
      const reason = evaluate(meta, rules);
      if (!reason) {
        if (el.hasAttribute(ATTR2)) clearCard(el);
        continue;
      }
      filterStats.hits++;
      filterStats.reasons[reason] = (filterStats.reasons[reason] || 0) + 1;
      el.setAttribute(ATTR2, f.mode);
      el.setAttribute("data-ytx-f-reason", reason);
      let bar = el.querySelector(":scope > .ytx-fbar");
      if (f.mode === "collapse") {
        if (!bar) {
          bar = h("div", { class: "ytx-fbar", "data-ytx-own": "", title: meta.title });
          bar.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.toggleAttribute("data-ytx-f-open");
          });
          el.prepend(bar);
        }
        bar.textContent = `Gefiltert (${reason}) · ${meta.channel || ""} – anzeigen`;
      } else {
        bar?.remove();
      }
    }
  }
  function applyFilters(cfg) {
    rules = compileRules2(cfg.filters);
    version++;
    sweep2();
  }
  function initFilters() {
    setCss("filters", CSS2);
    onSweep("filters", sweep2);
    onDispose(() => {
      for (const el of qsa(`[${ATTR2}]`)) clearCard(el);
    });
    registerCheck("filters", "Filter", "Filter", () => {
      if (!rules) return { status: "skip" };
      const f = rules.f;
      const res = [];
      if (!f.enabled) return { id: "filters.off", label: "Filter", status: "skip", detail: "ausgeschaltet" };
      if (rules.errors.length) res.push({ id: "filters.regex", label: "Ungültige Muster", status: "fail", detail: rules.errors.join(" · ") });
      const onPage3 = f.pages.includes(nav.page);
      const reasons = Object.entries(filterStats.reasons).map(([k, v]) => `${k} ${v}`).join(", ");
      res.push({
        id: "filters.stats",
        label: "Kacheln auf dieser Seite",
        status: !onPage3 ? "skip" : filterStats.checked && filterStats.unreadable / filterStats.checked > 0.5 ? "warn" : "ok",
        detail: onPage3 ? `${filterStats.checked} geprüft · ${filterStats.hits} gefiltert${reasons ? ` (${reasons})` : ""} · ${filterStats.unreadable} nicht lesbar` : "Filter für diese Seite aus"
      });
      return res;
    });
  }

  // src/appliers/features.js
  var running3 = /* @__PURE__ */ new Map();
  var manifests = [];
  var makeCtx = null;
  function onPage2(m) {
    return !m.pages || m.pages.includes(nav.page);
  }
  function call(inst, hook, ...args) {
    if (!inst?.[hook]) return;
    try {
      inst[hook](...args);
    } catch (e) {
      log.error(`feature ${inst.__id} ${hook}`, e);
    }
  }
  function initFeatures(list, ctxFactory) {
    manifests = list;
    makeCtx = ctxFactory;
    nav.on("page", (page) => {
      for (const [id, r] of running3) {
        const m = manifests.find((x) => x.id === id);
        call(r.inst, onPage2(m) ? "onPage" : "onLeave", page);
      }
    });
    nav.on("video", (videoId) => {
      for (const [id, r] of running3) {
        const m = manifests.find((x) => x.id === id);
        if (onPage2(m)) call(r.inst, "onVideo", videoId);
      }
    });
    onSweep("features", () => {
      for (const [id, r] of running3) {
        const m = manifests.find((x) => x.id === id);
        if (onPage2(m)) call(r.inst, "onSweep");
      }
    });
    onDispose(() => {
      for (const r of running3.values()) {
        call(r.inst, "dispose");
        r.ctx.cleanup?.();
      }
      running3.clear();
    });
    registerCheck("features", "Features", "Features", () => {
      const out = [];
      for (const m of manifests) {
        const r = running3.get(m.id);
        if (!r) continue;
        let h2 = { status: "ok", detail: "läuft" };
        if (!onPage2(m)) h2 = { status: "skip", detail: `nur auf: ${m.pages.join(", ")}` };
        else if (r.inst.health) {
          try {
            h2 = r.inst.health() || h2;
          } catch (e) {
            h2 = { status: "fail", detail: e.message };
          }
        }
        out.push({ id: `feature.${m.id}`, label: m.label, ...h2 });
      }
      return out;
    });
  }
  function applyFeatures(cfg) {
    for (const m of manifests) {
      const settings = cfg.features[m.id] || { enabled: false };
      const r = running3.get(m.id);
      const json = JSON.stringify(settings);
      if (r && (!settings.enabled || r.json !== json)) {
        if (settings.enabled && r.inst.update) {
          r.json = json;
          r.ctx.settings = settings;
          call(r.inst, "update", settings);
          continue;
        }
        call(r.inst, "dispose");
        r.ctx.cleanup?.();
        running3.delete(m.id);
      }
      if (settings.enabled && !running3.has(m.id)) {
        try {
          const ctx = makeCtx(m, settings);
          const inst = m.setup(ctx) || {};
          inst.__id = m.id;
          running3.set(m.id, { inst, json, ctx });
          if (onPage2(m)) {
            call(inst, "onPage", nav.page);
            if (nav.videoId) call(inst, "onVideo", nav.videoId);
          }
        } catch (e) {
          log.error(`feature ${m.id} setup`, e);
        }
      }
    }
  }
  function featureInstance(id) {
    return running3.get(id)?.inst || null;
  }

  // src/panel/styles.js
  var PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  --bg: var(--yt-sys-color-baseline--menu-background, #212121);
  --bg2: var(--yt-sys-color-baseline--raised-background, #2a2a2a);
  --fg: var(--yt-sys-color-baseline--text-primary, #f1f1f1);
  --fg2: var(--yt-sys-color-baseline--text-secondary, #aaa);
  --line: var(--yt-sys-color-baseline--outline, rgba(255,255,255,.12));
  --hover: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08));
  --accent: var(--yt-sys-color-baseline--call-to-action, #3ea6ff);
  --ok: #3fb950; --warn: #d29922; --fail: #f85149; --skip: #6e7681;
  position: fixed; z-index: 2250; top: 64px; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px));
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
  font: 400 13px/1.4 Roboto, "Segoe UI", Arial, sans-serif; color: var(--fg); background: var(--bg);
  box-shadow: 0 8px 40px rgba(0,0,0,.45); border: 1px solid var(--line);
}
.panel[hidden] { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
header .logo { font-weight: 700; font-size: 15px; letter-spacing: .02em; }
header select { flex: 1; min-width: 0; }
.iconbtn { width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--fg2); cursor: pointer; font-size: 16px; }
.iconbtn:hover { background: var(--hover); color: var(--fg); }
nav { display: flex; gap: 2px; padding: 6px 8px; overflow-x: auto; border-bottom: 1px solid var(--line); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
nav::-webkit-scrollbar { height: 6px; }
nav::-webkit-scrollbar-track { background: transparent; }
nav::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
nav::-webkit-scrollbar-thumb:hover { background: var(--fg2); }
nav button { flex: none; padding: 6px 10px; border: 0; border-radius: 8px; background: none; color: var(--fg2); cursor: pointer; font: 500 12px/1.2 inherit; font-family: inherit; }
nav button:hover { background: var(--hover); color: var(--fg); }
nav button[aria-selected="true"] { background: var(--fg); color: var(--bg); }
main { flex: 1; overflow: auto; padding: 10px 12px 20px; }
footer { padding: 6px 12px; border-top: 1px solid var(--line); color: var(--fg2); font-size: 11px; display: flex; justify-content: space-between; gap: 8px; }
h3 { margin: 16px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--fg2); }
h3:first-child { margin-top: 4px; }
details { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; background: var(--bg2); }
details > summary { list-style: none; cursor: pointer; padding: 8px 10px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: '▸'; color: var(--fg2); transition: transform .15s; }
details[open] > summary::before { transform: rotate(90deg); }
details > summary .count { margin-left: auto; color: var(--fg2); font-weight: 400; font-size: 11px; }
details > .body { padding: 2px 10px 8px; }
.row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); }
details .row:first-child, .card .row:first-child { border-top: 0; }
.row .label { flex: 1; min-width: 0; }
.row .label small { display: block; color: var(--fg2); font-size: 11px; margin-top: 1px; }
.row.stack { flex-direction: column; align-items: stretch; gap: 6px; }
.badge { display: inline-block; padding: 0 6px; border-radius: 6px; font-size: 10px; line-height: 16px; vertical-align: 1px; margin-left: 4px; background: var(--hover); color: var(--fg2); }
.badge.radical { background: rgba(248,81,73,.15); color: var(--fail); }
.badge.hits { min-width: 18px; text-align: center; }
.badge.hits.zero { opacity: .45; }
.seg { display: inline-flex; flex: none; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { border: 0; padding: 4px 8px; background: none; color: var(--fg2); cursor: pointer; font: 500 11px/1.2 inherit; font-family: inherit; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { background: var(--hover); color: var(--fg); }
.seg button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.seg button[aria-pressed="true"][data-mode="hide"] { background: var(--fail); }
.seg button[aria-pressed="true"][data-mode="dim"] { background: var(--warn); color: #111; }
.seg button[aria-pressed="true"][data-mode="collapse"] { background: #8957e5; }
.seg button[aria-pressed="true"][data-mode="show"] { background: var(--hover); color: var(--fg); }
select, input[type="text"], input[type="number"], input[type="search"], textarea {
  font: inherit; color: var(--fg); background: var(--bg2); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; min-width: 0; }
select:focus, input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
textarea { width: 100%; min-height: 64px; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
input[type="number"] { width: 90px; }
input[type="search"] { width: 100%; }
input[type="color"] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer; }
input[type="range"] { width: 130px; accent-color: var(--accent); }
.val { width: 58px; text-align: right; color: var(--fg2); font-variant-numeric: tabular-nums; font-size: 12px; }
.val.set { color: var(--fg); font-weight: 500; }
.switch { position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px; border: 0; background: var(--line); cursor: pointer; transition: background .15s; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch[aria-checked="true"] { background: var(--accent); }
.switch[aria-checked="true"]::after { transform: translateX(14px); }
.btn { border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; background: var(--bg2); color: var(--fg); cursor: pointer; font: 500 12px/1.2 inherit; font-family: inherit; }
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.danger { color: var(--fail); }
.btn.tiny { padding: 2px 6px; font-size: 11px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.reset { border: 0; background: none; color: var(--fg2); cursor: pointer; font-size: 13px; padding: 2px 4px; visibility: hidden; }
.reset.on { visibility: visible; }
.reset:hover { color: var(--fg); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { border: 1px solid var(--line); border-radius: 12px; padding: 3px 9px; background: none; color: var(--fg2); cursor: pointer; font: 500 11px/1.2 inherit; font-family: inherit; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.card { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; background: var(--bg2); }
.card > .head { display: flex; align-items: center; gap: 8px; padding: 9px 10px; }
.card > .head .title { flex: 1; font-weight: 500; }
.card > .desc { padding: 0 10px 6px; color: var(--fg2); font-size: 12px; }
.card > .settings { padding: 0 10px 8px; }
.status { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); }
.status:first-child { border-top: 0; }
.dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--skip); }
.dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.fail { background: var(--fail); }
.status .txt { flex: 1; min-width: 0; }
.status .txt small { display: block; color: var(--fg2); font-size: 11px; word-break: break-word; }
.summary { display: flex; gap: 12px; margin: 4px 0 8px; font-size: 12px; }
.summary span b { font-size: 15px; margin-right: 3px; }
.muted { color: var(--fg2); font-size: 12px; }
.hint { color: var(--fg2); font-size: 11px; margin: 4px 0; }
.err { color: var(--fail); font-size: 11px; }
.orderlist { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.orderlist .item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 8px; }
.orderlist .item span { flex: 1; }
.profiles .row .label b { font-weight: 500; }
.kbd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; padding: 3px 8px; min-width: 90px; text-align: center; }
.kbd.rec { outline: 2px solid var(--accent); }
.log { font-family: ui-monospace, Consolas, monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; color: var(--fg2); max-height: 200px; overflow: auto; }
`;

  // src/panel/controls.js
  function row(label, control, { note, badges = [], stack = false } = {}) {
    return h("div", { class: ["row", stack && "stack"] }, h("div", { class: "label" }, label, ...badges, note && h("small", { text: note })), control);
  }
  function badge(text, cls = "") {
    return h("span", { class: `badge ${cls}`, text });
  }
  function segmented(options, value, onChange) {
    const wrap = h("div", { class: "seg", role: "group" });
    for (const [val, label] of options) {
      const b = h("button", { type: "button", "data-mode": val, "aria-pressed": String(val === value), text: label });
      b.addEventListener("click", () => {
        for (const x of wrap.children) x.setAttribute("aria-pressed", String(x === b));
        onChange(val);
      });
      wrap.append(b);
    }
    return wrap;
  }
  function toggle(checked, onChange) {
    const b = h("button", { type: "button", class: "switch", role: "switch", "aria-checked": String(!!checked) });
    b.addEventListener("click", () => {
      const next = b.getAttribute("aria-checked") !== "true";
      b.setAttribute("aria-checked", String(next));
      onChange(next);
    });
    return b;
  }
  function select(options, value, onChange) {
    const s = h("select", null, options.map(([v, l]) => h("option", { value: v, text: l, selected: v === value })));
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }
  function range({ min, max, step = 1, unit = "", placeholder }, value, onChange) {
    const set = value !== void 0 && value !== null && value !== "";
    const input = h("input", { type: "range", min, max, step, value: set ? value : placeholder ?? min });
    const val = h("span", { class: ["val", set && "set"], text: set ? `${value}${unit}` : "auto" });
    const reset = h("button", { type: "button", class: ["reset", set && "on"], title: "Zurücksetzen", text: "↺" });
    const push2 = debounce(() => onChange(Number(input.value)), 30, 120);
    input.addEventListener("input", () => {
      val.textContent = `${input.value}${unit}`;
      val.classList.add("set");
      reset.classList.add("on");
      push2();
    });
    reset.addEventListener("click", () => {
      input.value = placeholder ?? min;
      val.textContent = "auto";
      val.classList.remove("set");
      reset.classList.remove("on");
      onChange(null);
    });
    return h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, input, val, reset);
  }
  function color(value, fallback, onChange) {
    const input = h("input", { type: "color", value: value || fallback || "#000000" });
    const reset = h("button", { type: "button", class: ["reset", value && "on"], title: "Zurücksetzen", text: "↺" });
    const push2 = debounce(() => onChange(input.value), 40, 150);
    input.addEventListener("input", () => {
      reset.classList.add("on");
      push2();
    });
    reset.addEventListener("click", () => {
      reset.classList.remove("on");
      input.value = fallback || "#000000";
      onChange(null);
    });
    return h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } }, input, reset);
  }
  function number(value, onChange, { min, max, step = 1, placeholder = "" } = {}) {
    const input = h("input", { type: "number", min, max, step, placeholder, value: value ?? "" });
    const push2 = debounce(() => onChange(input.value === "" ? null : Number(input.value)), 300);
    input.addEventListener("input", push2);
    return input;
  }
  function lines(values, onChange, placeholder = "") {
    const ta = h("textarea", { placeholder, spellcheck: "false" });
    ta.value = (values || []).join("\n");
    const push2 = debounce(() => onChange(ta.value.split("\n").map((s) => s.trim()).filter(Boolean)), 500);
    ta.addEventListener("input", push2);
    ta.addEventListener("blur", () => push2.flush());
    return ta;
  }
  function textarea(value, onChange, placeholder = "") {
    const ta = h("textarea", { placeholder, spellcheck: "false" });
    ta.value = value || "";
    const push2 = debounce(() => onChange(ta.value), 500);
    ta.addEventListener("input", push2);
    ta.addEventListener("blur", () => push2.flush());
    return ta;
  }
  function chips(options, values, onChange) {
    const cur = new Set(values);
    const wrap = h("div", { class: "chips" });
    for (const [v, l] of options) {
      const b = h("button", { type: "button", class: "chip", "aria-pressed": String(cur.has(v)), text: l });
      b.addEventListener("click", () => {
        if (cur.has(v)) cur.delete(v);
        else cur.add(v);
        b.setAttribute("aria-pressed", String(cur.has(v)));
        onChange(options.map(([x]) => x).filter((x) => cur.has(x)));
      });
      wrap.append(b);
    }
    return wrap;
  }
  function btn(label, onClick, cls = "") {
    const b = h("button", { type: "button", class: `btn ${cls}`, text: label });
    b.addEventListener("click", onClick);
    return b;
  }
  function settingControl(def, value, onChange) {
    switch (def.type) {
      case "toggle":
        return toggle(value, onChange);
      case "select":
        return select(def.options, value, onChange);
      case "multi":
        return chips(def.options, value, onChange);
      case "range":
        return range({ ...def, placeholder: def.default }, value, (v) => onChange(v ?? def.default));
      case "text":
        return textarea(value, onChange);
      default:
        return h("span", { class: "muted", text: String(value) });
    }
  }

  // src/panel/tabs.js
  var PAGE_LABEL = site.PAGE_LABELS;
  function displayTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const search = h("input", { type: "search", placeholder: "Suchen …", value: app.ui.displaySearch || "" });
    const onlyPage = toggle(app.ui.displayOnlyPage ?? false, (v) => {
      app.ui.displayOnlyPage = v;
      render2();
    });
    const list = h("div");
    root.append(
      h("div", { class: "row", style: { borderTop: 0 } }, search),
      row(`Nur Relevantes für ${PAGE_LABEL[app.nav.page] || app.nav.page}`, onlyPage, { note: "Zahlen zeigen Treffer auf der aktuellen Seite" }),
      list
    );
    search.addEventListener("input", () => {
      app.ui.displaySearch = search.value;
      render2();
    });
    function render2() {
      list.replaceChildren();
      const q2 = search.value.trim().toLowerCase();
      for (const group of site.GROUPS) {
        const items = site.targets.filter((t) => t.group === group).filter((t) => !q2 || `${t.label} ${t.id} ${t.note || ""}`.toLowerCase().includes(q2)).filter((t) => !app.ui.displayOnlyPage || !t.pages || t.pages.includes(app.nav.page));
        if (!items.length) continue;
        const active = items.filter((t) => cfg.display[t.id]).length;
        const det = h("details", { open: q2 || app.ui.openGroups?.has(group) }, h("summary", null, group, h("span", { class: "count", text: active ? `${active} aktiv` : "" })));
        det.addEventListener("toggle", () => {
          app.ui.openGroups ||= /* @__PURE__ */ new Set();
          if (det.open) app.ui.openGroups.add(group);
          else app.ui.openGroups.delete(group);
        });
        const body = h("div", { class: "body" });
        for (const t of items) {
          const relevant = !t.pages || t.pages.includes(app.nav.page);
          const hits = relevant ? countMatches(t.id) : null;
          const badges = [];
          if (t.radical) badges.push(badge("radikal", "radical"));
          if (hits !== null) badges.push(badge(String(hits), `hits ${hits ? "" : "zero"}`));
          const seg = segmented(
            t.modes.map((m) => [m, MODE_LABELS[m]]),
            cfg.display[t.id] || "show",
            (mode) => app.store.update((c) => {
              if (mode === "show") delete c.display[t.id];
              else c.display[t.id] = mode;
            }, "panel")
          );
          body.append(row(t.label, seg, { note: t.note, badges }));
        }
        det.append(body);
        list.append(det);
      }
    }
    render2();
    root.refreshCounts = render2;
    return root;
  }
  function lookTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const update = (fn) => app.store.update(fn, "panel");
    const { themes: themes3, colorControls: colorControls3, controls: controls3, LOOK_GROUPS: LOOK_GROUPS3 } = site.look;
    const theme = themes3.find((t) => t.id === cfg.vars.theme) || themes3[0];
    const others = app.store.otherLooks();
    if (others.length) {
      root.append(
        h(
          "div",
          { class: "btns" },
          ...others.map(
            (o) => btn(`Style von ${o.label} übernehmen`, () => {
              update((c) => c.vars = { ...c.vars, ...o.vars });
              app.rerender();
            }, "tiny")
          )
        ),
        h("p", { class: "hint", text: "Übernimmt Theme, Farben und passende Regler (z. B. Ecken-Rundung, Schrift). Nicht jede Einstellung existiert auf beiden Seiten." })
      );
    }
    root.append(h("h3", { text: "Theme" }));
    root.append(
      row("Farbschema", select(themes3.map((t) => [t.id, t.label]), cfg.vars.theme, (v) => {
        update((c) => c.vars.theme = v);
        app.rerender();
      }), { note: `Einzelne Farben unten überschreiben das Schema. Gedacht für den dunklen Modus von ${site.label}` })
    );
    const colorsBody = h("div");
    for (const c of colorControls3) {
      colorsBody.append(row(c.label, color(cfg.vars[c.id], theme.values[c.id] || "#000000", (v) => update((x) => v ? x.vars[c.id] = v : delete x.vars[c.id]))));
    }
    root.append(colorsBody);
    for (const group of LOOK_GROUPS3.filter((g) => g !== "Farben")) {
      const items = controls3.filter((c) => c.group === group);
      if (!items.length) continue;
      root.append(h("h3", { text: group }));
      for (const c of items) {
        let ctl;
        const set = (v) => update((x) => v === null || v === "" ? delete x.vars[c.id] : x.vars[c.id] = v);
        if (c.type === "range") ctl = range(c, cfg.vars[c.id], set);
        else if (c.type === "select") ctl = select(c.options, cfg.vars[c.id] ?? "", set);
        root.append(row(c.label, ctl));
      }
    }
    root.append(h("div", { class: "btns" }, btn("Look komplett zurücksetzen", () => {
      update((c) => c.vars = { theme: "" });
      app.rerender();
    }, "danger")));
    return root;
  }
  function layoutTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const update = (fn) => app.store.update(fn, "panel");
    const { layoutPresets: layoutPresets3, LAYOUT_PAGES: LAYOUT_PAGES3, orderGroups: orderGroups3, topbarModes: topbarModes3 } = site.presets;
    root.append(h("h3", { text: "Presets pro Seite" }));
    for (const [page, label] of LAYOUT_PAGES3) {
      const opts = [["", "Standard"], ...layoutPresets3.filter((p) => p.pages.includes(page)).map((p) => [p.id, p.label])];
      root.append(row(label, select(opts, cfg.layout.presets[page] || "", (v) => update((c) => v ? c.layout.presets[page] = v : delete c.layout.presets[page]))));
    }
    root.append(h("h3", { text: "Kopfzeile" }));
    root.append(row("Verhalten beim Scrollen", select(topbarModes3, cfg.layout.topbar, (v) => update((c) => c.layout.topbar = v))));
    for (const [gid, g] of Object.entries(orderGroups3)) {
      root.append(h("h3", { text: `Reihenfolge: ${g.label}` }));
      const current2 = cfg.layout.order[gid] || [];
      const enabled = current2.length > 0;
      let list = enabled ? current2.slice() : g.items.map(([id]) => id);
      const labels = Object.fromEntries(g.items);
      for (const [id] of g.items) if (!list.includes(id)) list.push(id);
      const box = h("div", { class: "orderlist" });
      const save2 = () => update((c) => c.layout.order[gid] = list.slice());
      const draw = () => {
        box.replaceChildren();
        list.forEach((id, i) => {
          const up2 = btn("↑", () => {
            if (i === 0) return;
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            save2();
            draw();
          }, "tiny");
          const down = btn("↓", () => {
            if (i === list.length - 1) return;
            [list[i + 1], list[i]] = [list[i], list[i + 1]];
            save2();
            draw();
          }, "tiny");
          box.append(h("div", { class: "item" }, h("span", { text: labels[id] || id }), up2, down));
        });
      };
      draw();
      root.append(
        row("Eigene Reihenfolge", toggle(enabled, (v) => {
          update((c) => v ? c.layout.order[gid] = list.slice() : delete c.layout.order[gid]);
          app.rerender();
        }), { note: "Buttons, die YouTube ins ⋯-Menü schiebt, erscheinen nicht" }),
        enabled ? box : h("div")
      );
    }
    if (site.id !== "youtube") return root;
    root.append(h("h3", { text: "Freie Zonen" }));
    root.append(h("p", { class: "hint", text: "Nicht umgesetzt: Freies Umhängen von Bereichen per display: contents stört YouTubes JavaScript-Playergröße und das automatische Umsortieren bei schmalen Fenstern. Stattdessen gibt es die festen Presets „Kino“ und „Fokus“ für die Videoseite." }));
    return root;
  }
  function behaviorTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const update = (fn) => app.store.update(fn, "panel");
    for (const b of site.behaviors) {
      const value = cfg.behavior[b.id] ?? b.default;
      const set = (v) => update((c) => c.behavior[b.id] = v);
      const badges = b.radical ? [badge("radikal", "radical")] : [];
      if (b.type === "toggle") root.append(row(b.label, toggle(value, set), { note: b.description, badges }));
      else if (b.type === "select") root.append(row(b.label, select(b.options, value, set), { note: b.description, badges }));
      else if (b.type === "textarea") root.append(row(b.label, textarea(value, set, "kevlar_example_flag=true"), { note: b.description, badges, stack: true }));
    }
    return root;
  }
  function filterTab(app) {
    const cfg = app.store.config;
    const f = cfg.filters;
    const root = h("div");
    const update = (fn) => app.store.update(fn, "panel");
    root.append(
      row("Filter aktiv", toggle(f.enabled, (v) => update((c) => c.filters.enabled = v))),
      row("Darstellung", segmented([["dim", "Dimmen"], ["collapse", "Einklappen"], ["hide", "Aus"]], f.mode, (v) => update((c) => c.filters.mode = v)), { note: "Tipp: neue Regeln erst dimmen, dann ausblenden" }),
      row("Seiten", chips(site.filters.pages, f.pages, (v) => update((c) => c.filters.pages = v)), { stack: true })
    );
    const onPage3 = f.enabled && f.pages.includes(app.nav.page);
    const reasons = Object.entries(filterStats.reasons).map(([k, v]) => `${k}: ${v}`).join(", ");
    root.append(h("p", { class: "hint", text: onPage3 ? `Diese Seite: ${filterStats.checked} Kacheln geprüft, ${filterStats.hits} gefiltert${reasons ? ` (${reasons})` : ""}` : "Auf dieser Seite nicht aktiv" }));
    root.append(h("h3", { text: "Typen" }));
    root.append(
      row("Shorts", toggle(f.shorts, (v) => update((c) => c.filters.shorts = v))),
      row("Livestreams", toggle(f.live, (v) => update((c) => c.filters.live = v)))
    );
    root.append(h("h3", { text: "Kanäle" }));
    root.append(
      row("Blockieren", lines(f.channels.block, (v) => update((c) => c.filters.channels.block = v), "@handle\nUCxxxxxxxxxxxxxxxxxxxxxx\nKanalname"), { stack: true, note: "Eine Zeile pro Kanal: @handle, Kanal-ID oder exakter Name" }),
      row("Nur diese erlauben", lines(f.channels.allowOnly, (v) => update((c) => c.filters.channels.allowOnly = v), "leer = aus"), { stack: true, note: "Positivliste: alles andere wird gefiltert" })
    );
    root.append(h("h3", { text: "Titel" }));
    const regexErr = h("div", { class: "err" });
    const showErr = (list) => {
      const errs = compileRules2({ ...f, title: { ...f.title, regex: list } }).errors;
      regexErr.textContent = errs.join(" · ");
    };
    root.append(
      row("Stichwörter", lines(f.title.keywords, (v) => update((c) => c.filters.title.keywords = v), "reaction\ngone wrong"), { stack: true, note: "Enthält-Suche, eine Zeile pro Stichwort" }),
      row("Reguläre Ausdrücke", h("div", null, lines(f.title.regex, (v) => {
        showErr(v);
        update((c) => c.filters.title.regex = v);
      }, "^\\[?(SHOCKING|INSANE)"), regexErr), { stack: true }),
      row("Groß/klein beachten", toggle(f.title.caseSensitive, (v) => update((c) => c.filters.title.caseSensitive = v)))
    );
    showErr(f.title.regex);
    root.append(h("h3", { text: "Dauer, Alter, Gesehen" }));
    root.append(
      row("Kürzer als (Sekunden)", number(f.duration.minSec, (v) => update((c) => c.filters.duration.minSec = v), { min: 0, placeholder: "aus" }), { note: "61 filtert alles bis 1 Minute" }),
      row("Länger als (Minuten)", number(f.duration.maxSec != null ? f.duration.maxSec / 60 : null, (v) => update((c) => c.filters.duration.maxSec = v == null ? null : v * 60), { min: 0, placeholder: "aus" })),
      row("Älter als (Tage)", number(f.age.maxDays, (v) => update((c) => c.filters.age.maxDays = v), { min: 0, placeholder: "aus" }), { note: "Liest „vor 3 Jahren“ – nur Deutsch und Englisch" }),
      row("Gesehene filtern", toggle(f.watched.hide, (v) => update((c) => c.filters.watched.hide = v)), { note: "Braucht Anmeldung" }),
      row("Gilt als gesehen ab %", number(f.watched.minPercent, (v) => update((c) => c.filters.watched.minPercent = v ?? 90), { min: 1, max: 100 }))
    );
    return root;
  }
  function featuresTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const results = runChecks().filter((r) => r.id.startsWith("feature."));
    for (const m of app.features) {
      const st = cfg.features[m.id];
      const health = results.find((r) => r.id === `feature.${m.id}`);
      const settings = h("div", { class: "settings" });
      const draw = () => {
        settings.replaceChildren();
        if (!app.store.config.features[m.id].enabled) return;
        for (const [key, def] of Object.entries(m.settings || {})) {
          const value = app.store.config.features[m.id][key];
          settings.append(row(def.label, settingControl(def, value, (v) => app.store.update((c) => c.features[m.id][key] = v, "panel")), { stack: def.type === "multi" }));
        }
      };
      const head = h(
        "div",
        { class: "head" },
        health ? h("span", { class: `dot ${health.status}`, title: health.detail }) : h("span", { class: "dot" }),
        h("span", { class: "title", text: m.label }),
        badge(m.stability),
        toggle(st.enabled, (v) => {
          app.store.update((c) => c.features[m.id].enabled = v, "panel");
          draw();
        })
      );
      const card = h("div", { class: "card" }, head, h("div", { class: "desc" }, m.description, health && h("div", { class: "hint", text: health.detail })), settings);
      draw();
      root.append(card);
    }
    return root;
  }
  function profilesTab(app) {
    const root = h("div", { class: "profiles" });
    const st = app.store;
    root.append(h("h3", { text: "Profile" }));
    for (const p of st.profiles()) {
      const t = templateById2[p.template];
      const actions2 = h(
        "div",
        { class: "btns", style: { margin: 0 } },
        p.active ? badge("aktiv") : btn("Aktivieren", () => st.setActive(p.id), "tiny primary"),
        btn("Umbenennen", () => {
          const input = h("input", { type: "text", value: p.name });
          const r = rowEl.querySelector(".label b");
          r.replaceWith(input);
          input.focus();
          input.select();
          const done2 = () => {
            st.renameProfile(p.id, input.value);
            app.rerender();
          };
          input.addEventListener("keydown", (e) => e.key === "Enter" && done2());
          input.addEventListener("blur", done2);
        }, "tiny"),
        t && btn("Zurücksetzen", () => confirmInline(actions2, `${site.label}-Teil des Profils auf die Vorlage zurücksetzen?`, () => st.resetProfile(p.id)), "tiny"),
        btn("Löschen", () => confirmInline(actions2, `„${p.name}“ löschen?`, () => {
          if (!st.deleteProfile(p.id)) app.flash("Das letzte Profil kann nicht gelöscht werden");
          app.rerender();
        }), "tiny danger")
      );
      const rowEl = row(h("b", { text: p.name }), actions2, { note: t?.description, stack: true });
      root.append(rowEl);
    }
    const nameInput = h("input", { type: "text", placeholder: "Name für neues Profil" });
    root.append(
      h("div", { class: "row", style: { gap: "6px" } }, nameInput, btn("Kopie des aktiven anlegen", () => {
        st.createProfile(nameInput.value || `${st.data.profiles[st.activeId].name} Kopie`);
        app.rerender();
      }))
    );
    root.append(h("h3", { text: "Tastenkürzel" }));
    for (const a of listActions()) {
      const b = btn(keyFor(a.id) || "—", () => {
        b.textContent = "Taste drücken …";
        b.classList.add("rec");
        const onKey = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const combo = comboFromEvent(e);
          if (["Ctrl", "Alt", "Shift", "Meta"].includes(combo)) return;
          window.removeEventListener("keydown", onKey, true);
          b.classList.remove("rec");
          const value = e.key === "Escape" ? "" : e.key === "Backspace" ? "" : combo;
          st.updateSettings((s) => {
            s.hotkeys ||= {};
            s.hotkeys[a.id] = value;
          });
          app.applyHotkeys();
          b.textContent = value || "—";
        };
        window.addEventListener("keydown", onKey, true);
      }, "kbd");
      root.append(row(a.label, b, { note: a.id === "panel.toggle" ? "Esc/Backspace entfernt ein Kürzel" : void 0 }));
    }
    root.append(row("ytx-Button in der Kopfzeile", toggle(st.settings.panelButton !== false, (v) => st.updateSettings((s) => s.panelButton = v))));
    root.append(h("h3", { text: "Export / Import" }));
    const out = h("textarea", { readonly: true, style: { minHeight: "90px" } });
    let all = false;
    const fill = () => out.value = st.exportJson(all);
    fill();
    const inp = h("textarea", { placeholder: "JSON hier einfügen", style: { minHeight: "70px" } });
    root.append(
      row("Alle Profile exportieren", toggle(false, (v) => {
        all = v;
        fill();
      })),
      out,
      h("div", { class: "btns" }, btn("Export kopieren", async () => app.flash(await app.copyText(out.value) ? "Kopiert" : "Kopieren fehlgeschlagen"))),
      inp,
      h(
        "div",
        { class: "btns" },
        btn("Importieren", () => {
          try {
            app.flash(st.importJson(inp.value));
            app.rerender();
          } catch (e) {
            app.flash(`Import fehlgeschlagen: ${e.message}`);
          }
        }, "primary"),
        btn("Alles zurücksetzen", () => confirmInline(root.lastChild, "Alle Profile und Einstellungen löschen?", () => {
          st.resetAll();
          app.rerender();
        }), "danger")
      )
    );
    return root;
  }
  function confirmInline(container, text, yes) {
    const box = h("div", { class: "btns", style: { width: "100%" } }, h("span", { class: "muted", text }), btn("Ja", () => {
      box.remove();
      yes();
    }, "tiny danger"), btn("Nein", () => box.remove(), "tiny"));
    container.after(box);
  }
  function diagnoseTab(app) {
    const root = h("div");
    const body = h("div");
    let onlyProblems = app.ui.onlyProblems ?? true;
    const draw = () => {
      body.replaceChildren();
      const results = runChecks();
      const sum = summarize2(results);
      body.append(h("div", { class: "summary" }, ...["ok", "warn", "fail", "skip"].map((k) => h("span", null, h("span", { class: `dot ${k}`, style: { display: "inline-block", marginRight: "4px" } }), h("b", { text: String(sum[k] || 0) }), { ok: "ok", warn: "Warnung", fail: "Fehler", skip: "n/a" }[k]))));
      let group = null;
      let box = null;
      for (const r of results) {
        if (onlyProblems && (r.status === "ok" || r.status === "skip")) continue;
        if (r.group !== group) {
          group = r.group;
          box = h("div");
          body.append(h("h3", { text: group }), box);
        }
        box.append(h("div", { class: "status" }, h("span", { class: `dot ${r.status}` }), h("div", { class: "txt" }, r.label, h("small", { text: r.detail }))));
      }
      if (onlyProblems && !sum.warn && !sum.fail) body.append(h("p", { class: "muted", text: "Keine Probleme auf dieser Seite." }));
      const errs = log.entries().filter((e) => e.level !== "info");
      if (errs.length) {
        body.append(h("h3", { text: "Log" }), h("div", { class: "log", text: errs.slice(-25).map((e) => `${new Date(e.t).toLocaleTimeString("de-DE")} ${e.level} ${e.msg}${e.n > 1 ? ` ×${e.n}` : ""}`).join("\n") }));
      }
    };
    const meta = () => ({ version: app.version, site: site.id, seite: app.nav.page, url: location.href, profil: app.store.activeId, ...capabilities(), sweeps: `${sweepStats.runs} (${sweepStats.lastMs} ms)`, css: JSON.stringify(cssStats()), events: Array.from(app.nav.eventsSeen).join(",") });
    root.append(
      h(
        "div",
        { class: "btns" },
        btn("Neu prüfen", draw, "primary"),
        btn("Bericht kopieren", async () => app.flash(await app.copyText(reportText(runChecks(), meta())) ? "Bericht kopiert" : "Kopieren fehlgeschlagen"))
      ),
      row("Nur Probleme zeigen", toggle(onlyProblems, (v) => {
        onlyProblems = app.ui.onlyProblems = v;
        draw();
      })),
      body
    );
    draw();
    root.refreshCounts = draw;
    return root;
  }
  function registerCoreChecks(registerCheck2, app) {
    registerCheck2("core", "Grundlagen", "Grundlagen", () => {
      const c = capabilities();
      return [
        { id: "core.polymer", label: `Polymer-Daten lesbar (${site.appHost})`, status: c.appFound ? c.polymerData ? "ok" : "fail" : "skip", detail: c.polymerData ? "ok" : "Script läuft vermutlich in isolierter Welt – @sandbox / @inject-into prüfen" },
        { id: "core.player", label: "Player-API", status: document.querySelector("#movie_player") ? c.playerApi ? "ok" : "fail" : "skip", detail: c.playerApi ? "getPlayerResponse verfügbar" : "Kein Player auf dieser Seite" },
        { id: "core.storage", label: "Speicher", status: "ok", detail: c.gmStorage ? "GM_setValue" : "localStorage (Fallback, pro Browser-Profil)" },
        { id: "core.nav", label: "Navigations-Events", status: app.nav.eventsSeen.size ? "ok" : "skip", detail: app.nav.eventsSeen.size ? Array.from(app.nav.eventsSeen).join(", ") : "Noch keine yt-navigate Events gesehen (normal direkt nach dem Laden)" },
        { id: "core.sweep", label: "Observer", status: sweepStats.lastMs > 80 ? "warn" : "ok", detail: `${sweepStats.runs} Durchläufe · letzter ${sweepStats.lastMs} ms` }
      ];
    });
    registerCheck2(
      "anchors",
      "Anker",
      "Anker",
      () => mountStatus().map((m) => {
        const a = [].concat(m.anchor).map((id) => getAnchorStatus().get(id)).find(Boolean);
        return { id: `mount.${m.id}`, label: `${m.id} → ${[].concat(m.anchor).join(" | ")}`, status: m.ok ? "ok" : "skip", detail: m.ok ? `eingefügt (${a?.sel || ""})` : "nicht eingefügt (Anker fehlt oder auf dieser Seite nicht nötig)" };
      })
    );
  }

  // src/features/music/logic/stats.js
  var pad = (n) => String(n).padStart(2, "0");
  function weekKey(ts) {
    const d = new Date(ts);
    const day = (d.getDay() + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 3);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const week = 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
    return `${d.getFullYear()}-W${pad(week)}`;
  }
  var monthKey = (ts) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  };
  function top(map, n) {
    return [...map.values()].sort((a, b) => b.listenedSec - a.listenedSec || b.plays - a.plays).slice(0, n);
  }
  function computeStats(plays = [], { from = 0, to = Infinity, groupBy = "week", limit = 10 } = {}) {
    const list = plays.filter((p) => p.startedAt >= from && p.startedAt <= to);
    const songs = /* @__PURE__ */ new Map();
    const artists = /* @__PURE__ */ new Map();
    const albums = /* @__PURE__ */ new Map();
    const series = /* @__PURE__ */ new Map();
    const byHour = Array.from({ length: 24 }, () => ({ plays: 0, listenedSec: 0 }));
    const byWeekday = Array.from({ length: 7 }, () => ({ plays: 0, listenedSec: 0 }));
    const totals = { plays: 0, listenedSec: 0, completes: 0, skips: 0, quickSkips: 0, liked: 0, songs: 0, artists: 0 };
    const add = (map, key, init, p) => {
      let v = map.get(key);
      if (!v) {
        v = { ...init, plays: 0, listenedSec: 0, skips: 0, completes: 0 };
        map.set(key, v);
      }
      v.plays++;
      v.listenedSec += p.listenedSec || 0;
      if (p.skipped) v.skips++;
      if (p.completed) v.completes++;
      return v;
    };
    for (const p of list) {
      totals.plays++;
      totals.listenedSec += p.listenedSec || 0;
      if (p.completed) totals.completes++;
      if (p.skipped) totals.skips++;
      if (p.quickSkip) totals.quickSkips++;
      if (p.liked) totals.liked++;
      add(songs, p.videoId, { videoId: p.videoId, title: p.title, artists: p.artists || [] }, p);
      const a = p.artists?.[0];
      if (a) add(artists, artistKey(a), { key: artistKey(a), id: a.id || null, name: a.name }, p);
      if (p.album?.id) add(albums, p.album.id, { id: p.album.id, name: p.album.name, artists: p.artists || [] }, p);
      const k = groupBy === "month" ? monthKey(p.startedAt) : weekKey(p.startedAt);
      add(series, k, { period: k }, p);
      const d = new Date(p.startedAt);
      byHour[d.getHours()].plays++;
      byHour[d.getHours()].listenedSec += p.listenedSec || 0;
      byWeekday[(d.getDay() + 6) % 7].plays++;
      byWeekday[(d.getDay() + 6) % 7].listenedSec += p.listenedSec || 0;
    }
    totals.songs = songs.size;
    totals.artists = artists.size;
    totals.skipRate = totals.plays ? totals.skips / totals.plays : 0;
    const seriesList = [...series.values()].sort((a, b) => a.period < b.period ? -1 : 1).map((s) => ({ ...s, skipRate: s.plays ? s.skips / s.plays : 0 }));
    return {
      totals,
      topSongs: top(songs, limit),
      topArtists: top(artists, limit),
      topAlbums: top(albums, limit),
      series: seriesList,
      byHour,
      byWeekday,
      highSkip: [...songs.values()].filter((s) => s.skips >= 3 && s.skips / s.plays >= 0.6).sort((a, b) => b.skips - a.skips).slice(0, limit)
    };
  }

  // src/panel/musicTabs.js
  var up = (fn) => music.updatePrefs(fn);
  function async(root, fn) {
    const box = h("div", null, h("p", { class: "muted", text: "lädt …" }));
    root.append(box);
    Promise.resolve().then(fn).then((node) => box.replaceChildren(...[].concat(node || []))).catch((e) => box.replaceChildren(h("p", { class: "err", text: `Fehler: ${e.message}` })));
    return box;
  }
  function when(ts) {
    return ts ? new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—";
  }
  function listItem(label, sub, ...actions2) {
    return h("div", { class: "row" }, h("div", { class: "label" }, label, sub && h("small", { text: sub })), ...actions2);
  }
  function musicTab(app) {
    const p = music.prefs();
    const root = h("div");
    const session = music.session();
    root.append(h("h3", { text: "Entdecken" }));
    root.append(
      row("Bekannt ⟷ Entdecken", range({ min: 0, max: 100, step: 5, unit: "", placeholder: 50 }, Math.round(p.discovery * 100), (v) => up((x) => x.discovery = v == null ? 0.5 : v / 100)), { note: "0 = fast nur Bekanntes, 100 = passende, aber neue Künstler" }),
      row("Begründungen zeigen", toggle(p.explain, (v) => up((x) => x.explain = v)), { note: "„Ähnlich zu …“, „Genre: …“, „Lange nicht gehört“" }),
      row(
        "Session (nur dieser Tab)",
        select([["", "Keine"], ...SESSION_PRESETS.map((s) => [s.id, s.label])], session?.presetId || "", (v) => {
          music.setSession(v || null);
          app.rerender();
        }),
        { note: session ? SESSION_PRESETS.find((s) => s.id === session.presetId)?.description : "Überschreibt Entdecken-Regler und Filter vorübergehend, das Profil bleibt unverändert" }
      )
    );
    root.append(h("h3", { text: "Blocklisten" }));
    root.append(
      row("Titelbegriffe", lines(p.blocklist.terms, (v) => up((x) => x.blocklist.terms = v), DEFAULT_TERMS.join("\n")), { stack: true, note: "Ganze Wörter, Groß/klein egal. Gilt für Empfehlungen und Auto-Skip" }),
      h("div", { class: "btns" }, btn("Standardbegriffe", () => {
        up((x) => x.blocklist.terms = [.../* @__PURE__ */ new Set([...x.blocklist.terms, ...DEFAULT_TERMS])]);
        app.rerender();
      }, "tiny"))
    );
    const artistBox = h("div");
    const drawArtists = () => {
      const cur = music.prefs().blocklist.artists;
      artistBox.replaceChildren(
        ...cur.map((a) => listItem(a.name, a.id || "nur Name", btn("✕", () => {
          up((x) => x.blocklist.artists = x.blocklist.artists.filter((y) => artistKey(y) !== artistKey(a)));
          drawArtists();
        }, "tiny")))
      );
      if (!cur.length) artistBox.append(h("p", { class: "muted", text: "Keine Künstler blockiert. Im Mix-Fenster über ⋯ oder hier per Name." }));
    };
    drawArtists();
    const addArtist = h("input", { type: "text", placeholder: "Künstlername" });
    root.append(
      h("div", { class: "label", style: { marginTop: "8px" } }, "Künstler"),
      artistBox,
      h("div", { class: "btns" }, addArtist, btn("Blockieren", () => {
        const name = addArtist.value.trim();
        if (!name) return;
        up((x) => x.blocklist.artists.push({ id: null, name }));
        addArtist.value = "";
        drawArtists();
      }, "tiny"))
    );
    const songs = music.prefs().blocklist.songs;
    if (songs.length) {
      root.append(h("div", { class: "label", style: { marginTop: "8px" } }, "Songs"));
      for (const s of songs) root.append(listItem(s.title || s.videoId, s.artists?.map((a) => a.name).join(", "), btn("✕", () => {
        up((x) => x.blocklist.songs = x.blocklist.songs.filter((y) => y.videoId !== s.videoId));
        app.rerender();
      }, "tiny")));
    }
    root.append(row("Fassungen in Empfehlungen ausblenden", chips(VERSION_TAGS.map(([id, , label]) => [id, label]), p.hideVersions, (v) => up((x) => x.hideVersions = v)), { stack: true }));
    root.append(h("h3", { text: "Smart Queue" }));
    const sq = p.smartQueue;
    const sqRow = (key, label, note) => row(label, toggle(sq[key], (v) => up((x) => x.smartQueue[key] = v)), { note });
    root.append(
      sqRow("autoSkip", "Automatisch überspringen", "Feature „Smart Queue“ muss an sein. Titel, die du selbst in der Warteschlange anklickst, werden nie übersprungen"),
      sqRow("markOnly", "Nur markieren, nie springen"),
      sqRow("skipBlocked", "Blockierte Künstler, Songs, Titelbegriffe"),
      sqRow("skipHighSkip", "Titel mit hoher Skip-Quote", "Mindestens 3 Skips und 60 % aller Wiedergaben"),
      sqRow("skipDuplicates", "Andere Fassung eines gerade gehörten Songs"),
      sqRow("skipRecentlyPlayed", "In den letzten 2 Stunden gespielt")
    );
    root.append(h("h3", { text: "Neuerscheinungen" }));
    const rl = p.releases;
    const status = h("span", { class: "muted" });
    music.getMeta("lastReleaseCheck").then((r) => status.textContent = r ? `Zuletzt ${when(r.at)}: ${r.checked}/${r.artists} geprüft, ${r.fresh} neu` : "Noch nie geprüft").catch(() => {
    });
    root.append(
      row("Im Hintergrund prüfen", toggle(rl.enabled, (v) => up((x) => x.releases.enabled = v))),
      row("Höchstens alle (Stunden)", number(rl.intervalHours, (v) => up((x) => x.releases.intervalHours = v ?? 24), { min: 6, max: 336 }), { note: "Pro Künstler eine normale Seitenabfrage, mit 2 s Abstand" }),
      row("Max. Künstler pro Durchlauf", number(rl.maxArtists, (v) => up((x) => x.releases.maxArtists = v ?? 25), { min: 1, max: 100 })),
      row("Meistgehörte Künstler mitprüfen", toggle(rl.includeTopArtists, (v) => up((x) => x.releases.includeTopArtists = v)), { note: "Sonst nur favorisierte" }),
      row("Gilt als neu (Tage)", number(rl.maxAgeDays, (v) => up((x) => x.releases.maxAgeDays = v ?? 60), { min: 7, max: 730 })),
      h("div", { class: "btns" }, btn(releaseCheckRunning() ? "prüft …" : "Jetzt prüfen", async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        const r = await checkReleases({ force: true, onProgress: (n, t) => b.textContent = `prüft ${n}/${t}` }).catch((err) => ({ error: err.message }));
        b.disabled = false;
        b.textContent = "Jetzt prüfen";
        status.textContent = r.error ? `Fehler: ${r.error}` : `${r.checked} geprüft, ${r.fresh} neu${r.errors?.length ? `, ${r.errors.length} Fehler` : ""}`;
      }, "tiny"), status)
    );
    root.append(h("h3", { text: "Favoriten" }));
    async(root, async () => {
      const favs = await music.favorites.all();
      if (!favs.length) return h("p", { class: "muted", text: "Noch keine Favoriten. ★ in der Playerleiste oder auf Künstler-, Album- und Playlist-Seiten." });
      const label = { artist: "Künstler", song: "Song", album: "Album", playlist: "Playlist" };
      return favs.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)).map((f) => {
        const w = select([["0.5", "½×"], ["1", "1×"], ["1.5", "1½×"], ["2", "2×"], ["3", "3×"]], String(f.weight ?? 1), (v) => music.favorites.setWeight(f.key, Number(v)));
        const open = f.type === "artist" ? btn("↗", () => navigateEndpoint(endpoints.browse(f.id, null, "ARTIST")), "tiny") : null;
        return listItem(h("span", null, badge(label[f.type]), " ", f.name), f.artists?.map((a) => a.name).join(", "), open, w, btn("✕", async () => {
          await music.favorites.remove(f.key);
          app.rerender();
        }, "tiny"));
      });
    });
    root.append(h("h3", { text: "Feedback" }));
    async(root, async () => {
      const fb = (await music.feedback.all()).sort((a, b) => (b.ts || 0) - (a.ts || 0));
      if (!fb.length) return h("p", { class: "muted", text: "Noch kein Feedback. „Mehr davon“ / „Weniger davon“ im Mix-Fenster oder im ★-Menü." });
      return fb.slice(0, 60).map(
        (f) => listItem(`${f.type === "artist" ? "Künstler" : "Song"}: ${f.name || f.id}`, `${f.value > 0 ? "+" : ""}${f.value}${f.ignore ? " · ignoriert" : ""}`, btn("✕", async () => {
          await music.feedback.remove(f.key);
          app.rerender();
        }, "tiny"))
      );
    });
    root.append(h("h3", { text: "Gewichtung" }));
    const labels = { complete: "Komplett gehört", repeat: "Wiederholt", like: "Like", partial: "Teilweise gehört", skip: "Übersprungen (früh zählt voll)", favoriteArtist: "Favorisierter Künstler", favoriteSong: "Favorisierter Song", favoriteAlbum: "Favorisiertes Album", favoritePlaylist: "Favorisierte Playlist", feedback: "Feedback pro Stufe" };
    for (const k of Object.keys(DEFAULT_WEIGHTS)) root.append(row(labels[k] || k, number(p.weights[k], (v) => up((x) => x.weights[k] = v ?? DEFAULT_WEIGHTS[k]), { step: 0.1, min: -10, max: 10 })));
    root.append(
      row("Halbwertszeit (Tage)", number(p.halfLifeDays, (v) => up((x) => x.halfLifeDays = v ?? 120), { min: 7, max: 3650 }), { note: "Wie schnell alte Wiedergaben an Gewicht verlieren" }),
      h("div", { class: "btns" }, btn("Gewichte zurücksetzen", () => {
        up((x) => {
          x.weights = { ...DEFAULT_WEIGHTS };
          x.halfLifeDays = defaultPrefs().halfLifeDays;
        });
        app.rerender();
      }, "tiny"))
    );
    root.append(h("h3", { text: "Metadaten-Quellen" }));
    root.append(h("p", { class: "hint", text: "Lokal reicht für alles. Externe Quellen sind freiwillig, aus und schicken Künstlernamen an den jeweiligen Dienst." }));
    for (const st of metadata.status(p)) {
      const ctl = toggle(st.enabled, (v) => {
        up((x) => x.providers[st.id].enabled = v);
        app.rerender();
      });
      root.append(row(h("span", null, st.label, st.external ? badge("extern") : badge("lokal")), ctl, { note: `${st.note}${st.enabled && !st.available ? " · nicht verfügbar (Schlüssel/Modell fehlt oder kein GM_xmlhttpRequest)" : ""}${st.lastError ? ` · Fehler: ${st.lastError}` : ""}` }));
      if (st.id === "lastfm" && st.enabled) root.append(row("Last.fm API-Key", textarea(p.providers.lastfm.apiKey, (v) => up((x) => x.providers.lastfm.apiKey = v.trim()))));
      if (st.id === "ollama" && st.enabled) {
        root.append(
          row("Ollama URL", textarea(p.providers.ollama.url, (v) => up((x) => x.providers.ollama.url = v.trim()))),
          row("Modell", textarea(p.providers.ollama.model, (v) => up((x) => x.providers.ollama.model = v.trim()), "z. B. llama3.2"))
        );
      }
    }
    return root;
  }
  function musicDataTab(app) {
    const p = music.prefs();
    const root = h("div");
    root.append(h("h3", { text: "Hörverlauf" }));
    root.append(
      row("Hörverlauf pausieren", toggle(p.history.paused, (v) => up((x) => x.history.paused = v)), { note: "Während der Pause wird nichts gespeichert, das Profil bleibt" }),
      row("Erst speichern ab (Sekunden)", number(p.history.minListenSec, (v) => up((x) => x.history.minListenSec = v ?? 5), { min: 0, max: 120 })),
      row("Kontext speichern", toggle(p.history.recordContext, (v) => up((x) => x.history.recordContext = v)), { note: "Seite, Playlist und Session, aus der gehört wurde" }),
      row("Aufbewahren (Tage)", number(p.history.retentionDays, (v) => up((x) => x.history.retentionDays = v), { min: 1, max: 3650, placeholder: "unbegrenzt" }), { note: "Ältere Einträge werden täglich gelöscht" }),
      h("div", { class: "btns" }, btn("Aufbewahrung jetzt anwenden", async () => app.flash(`${await music.history.applyRetention()} Einträge gelöscht`), "tiny"))
    );
    root.append(h("h3", { text: "Einträge" }));
    const search = h("input", { type: "search", placeholder: "Titel oder Künstler filtern" });
    const listBox = h("div");
    let limit = 60;
    const draw = async () => {
      const all = await music.history.recent(2e3);
      const q2 = search.value.trim().toLowerCase();
      const hits = q2 ? all.filter((r) => `${r.title} ${(r.artists || []).map((a) => a.name).join(" ")}`.toLowerCase().includes(q2)) : all;
      listBox.replaceChildren(h("p", { class: "muted", text: `${all.length}${all.length >= 2e3 ? "+" : ""} Einträge${q2 ? ` · ${hits.length} Treffer` : ""}` }));
      for (const r of hits.slice(0, limit)) {
        const flags = [r.completed ? "✓ komplett" : r.skipped ? `⏭ bei ${formatDuration(r.skipAtSec || 0)}${r.quickSkip ? " (früh)" : ""}` : `${Math.round((r.percent || 0) * 100)} %`, r.repeat && "↻", r.liked && "♥"].filter(Boolean).join(" · ");
        const sub = `${when(r.startedAt)} · ${(r.artists || []).map((a) => a.name).join(", ")} · ${formatDuration(r.listenedSec || 0)} gehört · ${flags}`;
        const menu = btn("⋯", () => {
          const box = h(
            "div",
            { class: "btns", style: { width: "100%" } },
            btn("Song nicht ins Profil", async () => app.flash(await music.act("excludeSong", r)), "tiny"),
            r.artists?.[0] && btn(`${r.artists[0].name} nicht ins Profil`, async () => app.flash(await music.act("excludeArtist", r)), "tiny"),
            btn("Eintrag löschen", async () => {
              await music.history.remove(r.id);
              draw();
            }, "tiny danger")
          );
          item.after(box);
        }, "tiny");
        const item = listItem(r.title || r.videoId, sub, btn("✕", async () => {
          await music.history.remove(r.id);
          draw();
        }, "tiny"), menu);
        listBox.append(item);
      }
      if (hits.length > limit) listBox.append(h("div", { class: "btns" }, btn("Mehr zeigen", () => {
        limit += 100;
        draw();
      }, "tiny")));
    };
    search.addEventListener("input", () => draw());
    root.append(search, listBox);
    draw().catch((e) => listBox.replaceChildren(h("p", { class: "err", text: e.message })));
    root.append(h("div", { class: "btns" }, btn("Gesamten Verlauf löschen", (e) => {
      const box = h("div", { class: "btns" }, h("span", { class: "muted", text: "Wirklich alle Hör-Einträge löschen? Favoriten und Feedback bleiben." }), btn("Ja, löschen", async () => {
        await music.history.clear();
        app.flash("Verlauf gelöscht");
        app.rerender();
      }, "tiny danger"), btn("Nein", () => box.remove(), "tiny"));
      e.currentTarget.parentElement.after(box);
    }, "danger")));
    root.append(h("h3", { text: "Vom Profil ausgeschlossen" }));
    const ex = p.excluded;
    if (!ex.artists.length && !ex.songs.length) root.append(h("p", { class: "muted", text: "Nichts ausgeschlossen. Ausgeschlossenes bleibt im Verlauf, zählt aber nicht für Empfehlungen und Statistik-Profil." }));
    for (const a of ex.artists) root.append(listItem(`Künstler: ${a.name}`, null, btn("✕", () => {
      up((x) => x.excluded.artists = x.excluded.artists.filter((y) => artistKey(y) !== artistKey(a)));
      app.rerender();
    }, "tiny")));
    for (const s of ex.songs) root.append(listItem(`Song: ${s.title || s.videoId}`, s.artists?.map((a) => a.name).join(", "), btn("✕", () => {
      up((x) => x.excluded.songs = x.excluded.songs.filter((y) => y.videoId !== s.videoId));
      app.rerender();
    }, "tiny")));
    const exName = h("input", { type: "text", placeholder: "Künstlername ausschließen" });
    root.append(h("div", { class: "btns" }, exName, btn("Ausschließen", () => {
      const name = exName.value.trim();
      if (!name) return;
      up((x) => x.excluded.artists.push({ id: null, name }));
      app.rerender();
    }, "tiny")));
    root.append(h("h3", { text: "Export / Import" }));
    const out = h("textarea", { readonly: true, style: { minHeight: "70px" }, placeholder: "Export erscheint hier" });
    const replace = { v: false };
    const inp = h("textarea", { placeholder: "Sicherung (JSON) hier einfügen", style: { minHeight: "70px" } });
    const file = h("input", { type: "file", accept: "application/json,.json" });
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (f) inp.value = await f.text();
    });
    root.append(
      h(
        "div",
        { class: "btns" },
        btn("Exportieren", async () => {
          const dump = await music.exportData();
          out.value = JSON.stringify(dump);
          app.flash(await app.copyText(out.value) ? `Export kopiert (${Math.round(out.value.length / 1024)} KB)` : "Export unten markieren und kopieren");
        }, "primary"),
        btn("Als Datei speichern", async () => {
          const dump = await music.exportData();
          const blob = new Blob([JSON.stringify(dump, null, 1)], { type: "application/json" });
          const a = h("a", { href: URL.createObjectURL(blob), download: `ytx-music-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json` });
          document.body.append(a);
          a.click();
          setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
          }, 1e3);
        })
      ),
      out,
      file,
      inp,
      row("Vorhandene Daten ersetzen", toggle(false, (v) => replace.v = v), { note: "Aus: zusammenführen" }),
      h("div", { class: "btns" }, btn("Importieren", async () => {
        try {
          const names = await music.importData(JSON.parse(inp.value), { replace: replace.v });
          app.flash(`Importiert: ${names.join(", ")}`);
          app.rerender();
        } catch (e) {
          app.flash(`Import fehlgeschlagen: ${e.message}`);
        }
      }, "primary"))
    );
    root.append(h("h3", { text: "Speicher" }));
    async(root, async () => {
      const db2 = music.db();
      const sizes = await db2.sizes();
      const cache4 = await catalog.cacheInfo();
      return [
        listItem("IndexedDB", `${db2.status.name} v${db2.status.version} · ${db2.status.open ? "offen" : "geschlossen"}${db2.status.upgradedFrom != null ? ` · migriert von v${db2.status.upgradedFrom}` : ""}`),
        listItem("Einträge", Object.entries(sizes).map(([k, v]) => `${k}: ${v}`).join(" · ")),
        listItem("Seiten-Cache", `${cache4.count} Seiten · neuester ${when(cache4.newest)} · ${catalog.stats.requests} Abrufe in dieser Sitzung`, btn("Cache leeren", async () => {
          await catalog.clearCache();
          app.rerender();
        }, "tiny"))
      ];
    });
    return root;
  }
  function musicStatsTab(app) {
    const root = h("div");
    const ranges = [
      ["7", "Letzte 7 Tage"],
      ["30", "Letzte 30 Tage"],
      ["month", "Dieser Monat"],
      ["year", "Dieses Jahr"],
      ["all", "Alles"]
    ];
    app.ui.statsRange ||= "30";
    const body = h("div");
    root.append(
      row("Zeitraum", select(ranges, app.ui.statsRange, (v) => {
        app.ui.statsRange = v;
        draw();
      })),
      body
    );
    const bars2 = (list, labelFn, valueFn) => {
      const max = Math.max(1, ...list.map(valueFn));
      return h(
        "div",
        { style: { display: "flex", alignItems: "flex-end", gap: "2px", height: "70px", margin: "6px 0 2px" } },
        ...list.map((x, i) => h("div", { title: `${labelFn(x, i)}: ${Math.round(valueFn(x) / 60)} min`, style: { flex: "1", minWidth: "3px", height: `${Math.max(2, valueFn(x) / max * 70)}px`, background: "var(--accent)", borderRadius: "2px 2px 0 0", opacity: valueFn(x) ? "1" : ".25" } }))
      );
    };
    async function draw() {
      body.replaceChildren(h("p", { class: "muted", text: "rechnet …" }));
      const now = /* @__PURE__ */ new Date();
      const r = app.ui.statsRange;
      const from = r === "all" ? 0 : r === "month" ? new Date(now.getFullYear(), now.getMonth(), 1).getTime() : r === "year" ? new Date(now.getFullYear(), 0, 1).getTime() : Date.now() - Number(r) * 864e5;
      const plays = await music.history.list({ from });
      const st = computeStats(plays, { from, groupBy: r === "year" || r === "all" ? "month" : "week", limit: 10 });
      const t = st.totals;
      body.replaceChildren();
      if (!t.plays) return body.append(h("p", { class: "muted", text: "Noch keine Hör-Einträge in diesem Zeitraum. Feature „Hörverlauf“ muss an sein." }));
      body.append(
        h(
          "div",
          { class: "summary", style: { flexWrap: "wrap" } },
          h("span", null, h("b", { text: formatDuration(t.listenedSec) }), "gehört"),
          h("span", null, h("b", { text: String(t.plays) }), "Wiedergaben"),
          h("span", null, h("b", { text: String(t.songs) }), "Songs"),
          h("span", null, h("b", { text: String(t.artists) }), "Künstler"),
          h("span", null, h("b", { text: `${Math.round(t.skipRate * 100)} %` }), "Skip-Quote")
        )
      );
      const top2 = (title, list, fmt) => {
        body.append(h("h3", { text: title }));
        list.forEach((x, i) => body.append(listItem(`${i + 1}. ${fmt(x)}`, `${x.plays}× · ${formatDuration(x.listenedSec)}${x.skips ? ` · ${x.skips} Skips` : ""}`)));
      };
      top2("Top-Songs", st.topSongs, (x) => `${x.title} – ${(x.artists || []).map((a) => a.name).join(", ")}`);
      top2("Top-Künstler", st.topArtists, (x) => x.name);
      if (st.topAlbums.length) top2("Top-Alben", st.topAlbums, (x) => x.name);
      body.append(h("h3", { text: "Verlauf" }), bars2(st.series, (x) => x.period, (x) => x.listenedSec), h("div", { class: "hint", text: `${st.series[0]?.period || ""} … ${st.series.at(-1)?.period || ""}` }));
      body.append(h("h3", { text: "Tageszeit" }), bars2(st.byHour, (x, i) => `${i} Uhr`, (x) => x.listenedSec), h("div", { class: "hint", text: "0 Uhr … 23 Uhr" }));
      const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      body.append(h("h3", { text: "Wochentag" }), bars2(st.byWeekday, (x, i) => days[i], (x) => x.listenedSec), h("div", { class: "hint", text: days.join(" · ") }));
      if (st.highSkip.length) top2("Oft übersprungen", st.highSkip, (x) => `${x.title} – ${(x.artists || []).map((a) => a.name).join(", ")}`);
      body.append(h("div", { class: "btns" }, btn("Als Text kopieren", async () => {
        const label = ranges.find(([v]) => v === r)?.[1];
        const text = [
          `Mein ytx Music Rückblick · ${label}`,
          `${formatDuration(t.listenedSec)} gehört · ${t.plays} Wiedergaben · ${t.songs} Songs · ${t.artists} Künstler · Skip-Quote ${Math.round(t.skipRate * 100)} %`,
          "",
          "Top-Songs",
          ...st.topSongs.map((x, i) => `${i + 1}. ${x.title} – ${(x.artists || []).map((a) => a.name).join(", ")} (${x.plays}×)`),
          "",
          "Top-Künstler",
          ...st.topArtists.map((x, i) => `${i + 1}. ${x.name} (${formatDuration(x.listenedSec)})`)
        ].join("\n");
        app.flash(await app.copyText(text) ? "Rückblick kopiert" : "Kopieren fehlgeschlagen");
      })));
    }
    draw().catch((e) => body.replaceChildren(h("p", { class: "err", text: e.message })));
    return root;
  }

  // src/panel/index.js
  var ALL_TABS = {
    display: ["Anzeige", displayTab],
    look: ["Look", lookTab],
    layout: ["Layout", layoutTab],
    behavior: ["Verhalten", behaviorTab],
    filters: ["Filter", filterTab],
    features: ["Features", featuresTab],
    music: ["Musik", musicTab],
    musicData: ["Verlauf & Daten", musicDataTab],
    musicStats: ["Statistik", musicStatsTab],
    profiles: ["Profile", profilesTab],
    diagnose: ["Diagnose", diagnoseTab]
  };
  var TABS2 = site.panelTabs.map((id) => [id, ...ALL_TABS[id]]);
  function createPanel(app) {
    const host2 = h("ytx-panel", { "data-ytx-own": "" });
    const shadow = host2.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.append(style);
    const profileSelect = h("select", { title: "Aktives Profil" });
    const closeBtn = h("button", { class: "iconbtn", title: "Schließen (Alt+Y)", text: "✕" });
    const nav2 = h("nav", { role: "tablist" });
    listen(nav2, "wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      nav2.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });
    const main = h("main");
    const status = h("span");
    const footInfo = h("span");
    const panel = h("div", { class: "panel", hidden: true }, h("header", null, h("span", { class: "logo", text: site.id === "music" ? "ytx ♫" : "ytx" }), profileSelect, closeBtn), nav2, main, h("footer", null, status, footInfo));
    shadow.append(panel);
    let tab = app.store.settings[`panelTab.${site.id}`] || app.store.settings.panelTab || "display";
    if (!TABS2.some(([id]) => id === tab)) tab = "display";
    let content = null;
    let flashTimer = null;
    let countTimer = null;
    const tabButtons = /* @__PURE__ */ new Map();
    for (const [id, label] of TABS2) {
      const b = h("button", { type: "button", role: "tab", "aria-selected": String(id === tab), text: label });
      b.addEventListener("click", () => select2(id));
      tabButtons.set(id, b);
      nav2.append(b);
    }
    function fillProfiles() {
      profileSelect.replaceChildren(...app.store.profiles().map((p) => h("option", { value: p.id, text: p.name, selected: p.active })));
    }
    profileSelect.addEventListener("change", () => app.store.setActive(profileSelect.value));
    closeBtn.addEventListener("click", () => close());
    function select2(id) {
      tab = id;
      for (const [k, b] of tabButtons) b.setAttribute("aria-selected", String(k === id));
      app.store.updateSettings((s) => s[`panelTab.${site.id}`] = id);
      render2();
    }
    function render2() {
      if (panel.hidden) return;
      const scroll = main.scrollTop;
      const def = TABS2.find(([id]) => id === tab) || TABS2[0];
      try {
        content = def[2](app);
      } catch (e) {
        app.log.error(`panel ${tab}`, e);
        content = h("p", { class: "err", text: `Tab konnte nicht gezeichnet werden: ${e.message}` });
      }
      main.replaceChildren(content);
      main.scrollTop = scroll;
      fillProfiles();
      updateFooter();
    }
    function updateFooter() {
      const s = summarize2(runChecks());
      footInfo.textContent = `v${app.version} · ${s.fail ? `${s.fail} Fehler · ` : ""}${s.warn ? `${s.warn} Warnungen` : "Diagnose ok"}`;
    }
    app.rerender = render2;
    app.flash = (text) => {
      status.textContent = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => status.textContent = "", 3500);
    };
    function open() {
      if (!host2.isConnected) document.documentElement.append(host2);
      panel.hidden = false;
      render2();
      clearInterval(countTimer);
      countTimer = setInterval(() => {
        if (panel.hidden) return;
        if ((tab === "display" || tab === "diagnose") && !shadow.activeElement) content?.refreshCounts?.();
        updateFooter();
      }, 3e3);
    }
    function close() {
      panel.hidden = true;
      clearInterval(countTimer);
    }
    function toggle2() {
      panel.hidden ? open() : close();
    }
    app.store.subscribe((cfg, reason) => {
      if (panel.hidden) return;
      if (reason === "panel") {
        fillProfiles();
        return;
      }
      if (reason !== "settings" && !reason.startsWith("bucket:")) render2();
    });
    listen(shadow, "keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key !== "Escape") e.stopPropagation();
    });
    for (const type of ["keyup", "keypress"]) listen(shadow, type, (e) => e.stopPropagation());
    document.documentElement.append(host2);
    onDispose(() => {
      clearInterval(countTimer);
      host2.remove();
    });
    return { open, close, toggle: toggle2, render: render2, select: select2, shadow, get isOpen() {
      return !panel.hidden;
    } };
  }
  function mastheadButton(app, panel) {
    return app.mount({
      id: "top.ytx",
      anchor: "top.buttons",
      position: "prepend",
      when: () => app.store.settings.panelButton !== false,
      create: () => {
        const b = button({ label: "ytx", title: "ytx Einstellungen (Alt+Y)", small: true, onClick: () => panel.toggle() });
        b.style.margin = "0 8px";
        return b;
      }
    });
  }

  // src/main.js
  var VERSION = package_default.version;
  function boot() {
    if (pageWindow.__ytx?.destroy) pageWindow.__ytx.destroy();
    const api = {
      version: VERSION,
      site: site.id,
      debug: site.debug,
      store,
      nav,
      panel: null,
      sweep: sweepNow,
      feature: featureInstance,
      log: () => log.entries(),
      diagnose: () => runChecks(),
      destroy() {
        disposeAll();
        if (pageWindow.__ytx === api) delete pageWindow.__ytx;
      }
    };
    pageWindow.__ytx = api;
    initNav();
    site.boot?.();
    store.init();
    const cfg = store.config;
    initDisplay();
    applyDisplay(cfg);
    applyVars(cfg);
    initLayout(() => store.config);
    applyLayout(cfg);
    initUiCss();
    let sweepIds = 0;
    const sweepHook = (fn) => onSweep(`hook${++sweepIds}`, fn);
    initBehavior({ nav, state: store.state, onSweep: sweepHook });
    applyBehavior(cfg);
    initTagger();
    if (site.filters) {
      initFilters();
      applyFilters(cfg);
    }
    initFeatures(site.features, (m, settings) => {
      const cleanups = [];
      return {
        settings,
        nav,
        mount,
        copyText,
        log,
        state: store.state,
        onSweep: (fn) => {
          const off = sweepHook(fn);
          cleanups.push(off);
          return off;
        },
        css: (text) => text ? setCss(`feature.${m.id}`, text) : removeCss(`feature.${m.id}`),
        action: (id, fn) => {
          const hk = (m.hotkeys || []).find((x) => x[0] === id);
          cleanups.push(registerAction(id, hk?.[1] || id, fn, hk?.[2] || ""));
        },
        cleanup: () => {
          for (const fn of cleanups.splice(0)) fn();
          removeCss(`feature.${m.id}`);
        }
      };
    });
    applyFeatures(cfg);
    store.subscribe((c, reason) => {
      if (reason === "settings" || reason.startsWith("bucket:")) {
        setBindings(store.settings.hotkeys);
        requestSweep();
        return;
      }
      applyDisplay(c);
      applyVars(c);
      applyLayout(c);
      applyBehavior(c);
      if (site.filters) applyFilters(c);
      applyFeatures(c);
      requestSweep();
    });
    initHotkeys();
    setBindings(store.settings.hotkeys);
    initMenuDismiss();
    onSweep("css", ensureCss);
    onSweep("nav", checkNav);
    const app = {
      version: VERSION,
      store,
      nav,
      site,
      features: site.features,
      ui: {},
      log,
      mount,
      copyText,
      applyHotkeys: () => setBindings(store.settings.hotkeys),
      rerender: () => {
      },
      flash: () => {
      }
    };
    registerCoreChecks(registerCheck, app);
    startObserver();
    whenBody(() => {
      const panel = createPanel(app);
      api.panel = panel;
      const btn2 = mastheadButton(app, panel);
      onDispose(() => btn2.destroy());
      registerAction("panel.toggle", "ytx-Panel öffnen/schließen", () => panel.toggle(), "Alt+Y");
      registerAction("profile.cycle", "Nächstes Profil", () => toast(`Profil: ${store.cycleProfile()}`), "Alt+P");
      sweepNow();
    });
    log.info(`ytx ${VERSION} gestartet auf ${site.label} · ${nav.page}`);
  }
  try {
    if (window.top === window.self) boot();
  } catch (e) {
    console.error("[ytx] start fehlgeschlagen", e);
  }
})();
