// ==UserScript==
// @name         ytx
// @namespace    ytx.local
// @version      0.1.3
// @description  YouTube anpassen: Anzeige, Look, Layout, Verhalten, Filter, Features
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
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
    version: "0.1.3",
    description: "YouTube anpassen: Anzeige, Look, Layout, Verhalten, Filter, Features",
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
    const app = document.querySelector("ytd-app");
    return {
      polymerData: !!(app && dataOf(app)),
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

  // src/core/nav.js
  var handlers = { page: /* @__PURE__ */ new Set(), video: /* @__PURE__ */ new Set(), start: /* @__PURE__ */ new Set() };
  var nav = {
    page: "other",
    url: "",
    videoId: null,
    playlistId: null,
    eventsSeen: /* @__PURE__ */ new Set(),
    on(type, fn) {
      handlers[type].add(fn);
      return () => handlers[type].delete(fn);
    }
  };
  function pageFromUrl(href) {
    let u;
    try {
      u = new URL(href, location.origin);
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
  function emit(type, ...args) {
    for (const fn of handlers[type]) {
      try {
        fn(...args);
      } catch (e) {
        log.error(`nav ${type}`, e);
      }
    }
  }
  function checkNav() {
    const href = location.href;
    const page = pageFromUrl(href);
    const u = new URL(href);
    let videoId = page === "watch" ? u.searchParams.get("v") : null;
    if (page === "watch" && !videoId) {
      try {
        videoId = player()?.getVideoData?.()?.video_id || null;
      } catch {
      }
    }
    const playlistId = u.searchParams.get("list");
    const pageChanged = page !== nav.page || href !== nav.url;
    const videoChanged = videoId !== nav.videoId;
    nav.url = href;
    nav.playlistId = playlistId;
    if (page !== nav.page) {
      nav.page = page;
      document.documentElement.setAttribute("data-ytx-page", page);
    }
    if (videoChanged) nav.videoId = videoId;
    if (pageChanged) emit("page", page);
    if (videoChanged) emit("video", videoId);
  }
  function initNav() {
    nav.page = pageFromUrl(location.href);
    document.documentElement.setAttribute("data-ytx-page", nav.page);
    const seen2 = (e) => nav.eventsSeen.add(e.type);
    listen(document, "yt-navigate-start", (e) => {
      seen2(e);
      const url = e.detail?.url;
      emit("start", url ? pageFromUrl(url) : null, url);
    });
    for (const type of ["yt-navigate-finish", "yt-page-data-updated", "yt-player-updated"]) {
      listen(document, type, (e) => {
        seen2(e);
        checkNav();
      });
    }
    listen(window, "popstate", () => checkNav());
    checkNav();
  }

  // src/registry/targets.js
  var SH = ["show", "hide"];
  var SDH = ["show", "dim", "hide"];
  var SDC = ["show", "dim", "collapse"];
  var SDCH = ["show", "dim", "collapse", "hide"];
  var MODE_LABELS = { show: "Normal", dim: "Dimmen", collapse: "Einklappen", hide: "Aus" };
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
  var attrName = (id) => `data-ytx-d-${id.replace(/\./g, "-")}`;

  // src/registry/look.js
  var TOKEN = (name) => `--yt-sys-color-baseline--${name}`;
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

  // src/registry/presets.js
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

  // src/core/scheduler.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function debounce(fn, wait = 150, maxWait = 0) {
    let timer = null;
    let first = 0;
    const run2 = () => {
      timer = null;
      first = 0;
      fn();
    };
    const call2 = () => {
      const now = Date.now();
      if (!first) first = now;
      clearTimeout(timer);
      if (maxWait && now - first >= maxWait) return run2();
      timer = setTimeout(run2, wait);
    };
    call2.cancel = () => {
      clearTimeout(timer);
      timer = null;
      first = 0;
    };
    call2.flush = () => {
      if (timer) {
        clearTimeout(timer);
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

  // src/behaviors/index.js
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

  // src/core/config.js
  var SCHEMA = 2;
  var FILTER_PAGES = [
    ["home", "Startseite"],
    ["subscriptions", "Abos"],
    ["search", "Suche"],
    ["watch", "Empfehlungen auf Videoseite"],
    ["channel", "Kanal"],
    ["playlist", "Playlists"]
  ];
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
  function emptyConfig() {
    return {
      schema: SCHEMA,
      display: {},
      vars: { theme: "" },
      layout: { presets: {}, order: {}, topbar: "", zones: null },
      behavior: {},
      filters: defaultFilters(),
      features: {}
    };
  }
  var isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
  var strList = (x) => Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean) : [];
  var numOrNull = (x) => x === "" || x === null || x === void 0 || !isFinite(Number(x)) ? null : Number(x);
  function normalize(raw, featureManifests3 = []) {
    const src = isObj(raw) ? raw : {};
    const cfg = emptyConfig();
    if (isObj(src.display)) {
      for (const [id, mode] of Object.entries(src.display)) {
        const t = targetById[id];
        if (t && t.modes.includes(mode) && mode !== "show") cfg.display[id] = mode;
      }
    }
    if (isObj(src.vars)) {
      if (themes.some((t) => t.id === src.vars.theme)) cfg.vars.theme = src.vars.theme;
      for (const [id, v] of Object.entries(src.vars)) {
        if (id === "theme") continue;
        const c = controlById[id];
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
          const p = presetById[id];
          if (p && p.pages.includes(page)) cfg.layout.presets[page] = id;
        }
      }
      if (isObj(src.layout.order)) {
        for (const [gid, list] of Object.entries(src.layout.order)) {
          const g = orderGroups[gid];
          if (!g) continue;
          const known = new Set(g.items.map(([id]) => id));
          const clean = strList(list).filter((id) => known.has(id));
          if (clean.length) cfg.layout.order[gid] = [...new Set(clean)];
        }
      }
      if (topbarModes.some(([v]) => v === src.layout.topbar)) cfg.layout.topbar = src.layout.topbar;
      if (isObj(src.layout.zones)) cfg.layout.zones = src.layout.zones;
    }
    if (isObj(src.behavior)) {
      for (const [id, v] of Object.entries(src.behavior)) {
        const b = behaviorById[id];
        if (!b) continue;
        if (b.type === "toggle") cfg.behavior[id] = !!v;
        else if (b.type === "select" && b.options.some(([val]) => val === v)) cfg.behavior[id] = v;
        else if (b.type === "textarea") cfg.behavior[id] = String(v ?? "");
      }
    }
    if (isObj(src.filters)) {
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
    for (const m of featureManifests3) {
      const s = isObj(srcFeatures[m.id]) ? srcFeatures[m.id] : {};
      const out = { enabled: !!s.enabled };
      for (const [key, def] of Object.entries(m.settings || {})) {
        out[key] = normalizeSetting(def, s[key]);
      }
      cfg.features[m.id] = out;
    }
    return cfg;
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

  // src/profiles/index.js
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
  function freshData() {
    const profiles = {};
    for (const t of templates) profiles[t.id] = { name: t.name, template: t.id, config: t.config() };
    return { schema: SCHEMA, active: DEFAULT_ACTIVE, profiles, settings: { hotkeys: {}, panelButton: true, panelTab: "display" } };
  }
  var MIGRATIONS = [
    [
      "thumbs-color-default",
      (d) => {
        const p = d.profiles.aufgeraeumt;
        if (p?.template === "aufgeraeumt" && p.config?.display?.["thumb.image"] === "dim") delete p.config.display["thumb.image"];
      }
    ]
  ];
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
  var featureManifests = [];
  var data = null;
  var config = null;
  var subs = /* @__PURE__ */ new Set();
  var saveSoon = debounce(() => writeRaw(KEY, data), 250, 1500);
  var runtime = readRaw(STATE_KEY) || {};
  var saveState = debounce(() => writeRaw(STATE_KEY, runtime), 500, 3e3);
  function recompute() {
    const p = data.profiles[data.active] || data.profiles[Object.keys(data.profiles)[0]];
    config = normalize(p?.config, featureManifests);
  }
  function emit2(reason) {
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
    emit2(reason);
  }
  var store = {
    init(manifests2) {
      featureManifests = manifests2;
      data = readRaw(KEY);
      if (!data || typeof data !== "object" || !data.profiles || !Object.keys(data.profiles).length) {
        data = freshData();
        writeRaw(KEY, data);
      }
      data.settings ||= { hotkeys: {}, panelButton: true, panelTab: "display" };
      for (const t of templates) {
        if (!data.profiles[t.id] && !data.deletedTemplates?.includes(t.id)) data.profiles[t.id] = { name: t.name, template: t.id, config: t.config() };
      }
      if (!data.profiles[data.active]) data.active = Object.keys(data.profiles)[0];
      migrate();
      recompute();
      const flush = () => {
        saveSoon.flush();
        saveState.flush();
      };
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
    profiles() {
      return Object.entries(data.profiles).map(([id, p]) => ({ id, name: p.name, template: p.template, active: id === data.active }));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // mutator bekommt die rohe config des aktiven profils
    update(mutator, reason = "update") {
      const p = data.profiles[data.active];
      const draft = normalize(p.config, featureManifests);
      mutator(draft);
      p.config = normalize(draft, featureManifests);
      commit(reason);
    },
    updateSettings(mutator) {
      mutator(data.settings);
      saveSoon();
      emit2("settings");
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
      emit2("profile");
    },
    deleteProfile(id) {
      if (!data.profiles[id] || Object.keys(data.profiles).length <= 1) return false;
      if (data.profiles[id].template) (data.deletedTemplates ||= []).push(data.profiles[id].template);
      delete data.profiles[id];
      if (data.active === id) data.active = Object.keys(data.profiles)[0];
      commit("profile");
      return true;
    },
    resetProfile(id) {
      const p = data.profiles[id];
      if (!p) return;
      const t = templateById[p.template];
      p.config = t ? t.config() : {};
      commit("profile");
    },
    exportJson(all = false) {
      const out = all ? data : { schema: SCHEMA, profile: { name: data.profiles[data.active].name, config: normalize(data.profiles[data.active].config, featureManifests) } };
      return JSON.stringify(out, null, 2);
    },
    importJson(text) {
      const obj = JSON.parse(text);
      if (obj.profiles && typeof obj.profiles === "object") {
        for (const [id2, p] of Object.entries(obj.profiles)) {
          if (!p || typeof p !== "object") continue;
          data.profiles[id2] = { name: String(p.name || id2), template: p.template ?? null, config: normalize(p.config, featureManifests) };
        }
        if (obj.active && data.profiles[obj.active]) data.active = obj.active;
        if (obj.settings) data.settings = { ...data.settings, ...obj.settings };
        commit("import");
        return "Alle Profile importiert";
      }
      const cfg = obj.profile?.config || obj.config || obj;
      const name = obj.profile?.name || "Importiert";
      const id = this.createProfile(name);
      data.profiles[id].config = normalize(cfg, featureManifests);
      commit("import");
      return `Profil „${name}“ importiert`;
    },
    resetAll() {
      data = freshData();
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

  // src/registry/anchors.js
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

  // src/core/mount.js
  var mounts = /* @__PURE__ */ new Map();
  var anchorStatus = /* @__PURE__ */ new Map();
  function resolveAnchor(id, root = document) {
    const a = anchors[id];
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
  function mount({ id, anchor, position = "append", create, update, when }) {
    const m = { id, anchor, position, create, update, when, node: null, host: null, ok: false };
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
      let host = null;
      for (const a of list) {
        host = resolveAnchor(a);
        if (host) break;
      }
      if (!host) {
        m.ok = false;
        return;
      }
      if (!m.node) {
        m.node = m.create();
        m.node.setAttribute("data-ytx-own", "");
        m.node.setAttribute("data-ytx-mount", m.id);
      }
      const placed = m.node.isConnected && m.host === host && isPlaced(m.node, host, m.position);
      if (!placed) {
        if (m.position === "append") host.append(m.node);
        else if (m.position === "prepend") host.prepend(m.node);
        else if (m.position === "before") host.before(m.node);
        else host.after(m.node);
        m.host = host;
      }
      m.ok = true;
      m.update?.(m.node, host);
    } catch (e) {
      m.ok = false;
      log.error(`mount ${m.id}`, e);
    }
  }
  function isPlaced(node, host, position) {
    if (position === "append" || position === "prepend") return node.parentElement === host;
    const step = position === "after" ? "nextElementSibling" : "previousElementSibling";
    let cur = host[step];
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
  function summarize(results) {
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
    for (const t of targets) {
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
    for (const t of targets) {
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
    for (const t of targets) {
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
      for (const t of targets) document.documentElement.removeAttribute(attrName(t.id));
    });
    registerCheck("display", "Anzeige", "Targets auf dieser Seite", () => {
      const results = [];
      if (invalid.size) results.push({ id: "display.invalid", label: "Ungültige Selektoren", status: "fail", detail: Array.from(invalid.keys()).join(" · ") });
      for (const t of targets) {
        if (t.pages && !t.pages.includes(nav.page)) continue;
        const n = t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0);
        const mode = current[t.id] || "show";
        const ready = !t.core || nav.page !== "watch" || document.querySelector("ytd-watch-metadata #actions ytd-menu-renderer");
        results.push({
          id: `display.${t.id}`,
          label: `${t.group} › ${t.label}`,
          status: n ? "ok" : t.core && ready ? "warn" : "skip",
          detail: `${n} Treffer · Modus ${MODE_LABELS[mode]}${n ? "" : t.core ? " · sollte immer vorhanden sein – Selektor in registry/targets.js prüfen" : " · auf dieser Seite nicht vorhanden"}`
        });
      }
      return results;
    });
  }
  function countMatches(id) {
    const t = targetById[id];
    if (!t) return 0;
    return t.sel.filter(validSelector).reduce((sum, s) => sum + qsa(s).length, 0);
  }

  // src/appliers/vars.js
  var TOKEN_SCOPE = "html:root:root, html:root:root [dark], html:root:root [light]";
  function buildVarsCss(vars) {
    const theme = themes.find((t) => t.id === vars.theme) || themes[0];
    const colors = { ...theme.values };
    for (const c of colorControls) if (vars[c.id]) colors[c.id] = vars[c.id];
    const out = [];
    const decl = [];
    for (const c of colorControls) {
      const v = colors[c.id];
      if (!v) continue;
      for (const token of c.tokens) decl.push(`${token}: ${v} !important;`);
      if (c.extra) out.push(c.extra(v));
    }
    if (decl.length) out.unshift(`${TOKEN_SCOPE} { ${decl.join(" ")} }`);
    const search = searchboxCss(colors);
    if (search) out.push(search);
    const cardText = cardTextCss(colors);
    if (cardText) out.push(cardText);
    for (const c of controls) {
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
  var presetAttr = (page) => `data-ytx-l-${page}`;
  function buildPresetCss() {
    const out = [];
    for (const p of layoutPresets) {
      for (const page of p.pages) out.push(p.css(`html[data-ytx-page="${page}"][${presetAttr(page)}="${p.id}"]`));
    }
    return out.join("\n");
  }
  var last = "";
  var scrollOff = null;
  function applyLayout(cfg) {
    const root = document.documentElement;
    const pages = new Set(layoutPresets.flatMap((p) => p.pages));
    let needResize = false;
    for (const page of pages) {
      const id = cfg.layout.presets[page];
      const name = presetAttr(page);
      if (id) {
        if (root.getAttribute(name) !== id) {
          root.setAttribute(name, id);
          needResize ||= !!presetById[id]?.resize;
        }
      } else if (root.hasAttribute(name)) {
        needResize ||= !!presetById[root.getAttribute(name)]?.resize;
        root.removeAttribute(name);
      }
    }
    const dyn = [];
    for (const [gid, list] of Object.entries(cfg.layout.order)) {
      const g = orderGroups[gid];
      if (!g || !list.length) continue;
      dyn.push(g.container);
      list.forEach((id, i) => dyn.push(g.item(id, i + 1)));
    }
    if (cfg.layout.topbar && topbarCss[cfg.layout.topbar]) dyn.push(topbarCss[cfg.layout.topbar]);
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
      res.push({ id: "layout.preset", label: `Preset auf dieser Seite (${nav.page})`, status: id ? "ok" : "skip", detail: id ? presetById[id]?.label : "keins" });
      if (cfg.layout.order["watch.actions"] && nav.page === "watch") {
        const ok = !!qs("ytd-watch-metadata #actions ytd-menu-renderer [data-ytx-btn]");
        res.push({ id: "layout.order", label: "Reihenfolge Aktionsleiste", status: ok ? "ok" : "warn", detail: ok ? "Buttons getaggt, Reihenfolge aktiv" : "Keine getaggten Buttons gefunden" });
      }
      if (nav.page === "watch" && id && presetById[id]?.resize) {
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
      () => behaviors.filter((b) => running2.has(b.id)).map((b) => {
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
    for (const b of behaviors) {
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

  // src/registry/tags.js
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
    const top = qsa(":scope > #top-level-buttons-computed > *", menu);
    const topData = d.topLevelButtons || [];
    if (top.length === topData.length) {
      top.forEach((el, i) => {
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

  // src/appliers/tagger.js
  var lastCount = /* @__PURE__ */ new Map();
  function run() {
    for (const r of tagRules) {
      if (r.pages && !r.pages.includes(nav.page)) continue;
      lastCount.set(r.id, r.run());
    }
  }
  function initTagger() {
    onSweep("tagger", run);
    run();
    onDispose(() => {
      for (const attr of ["data-ytx-btn", "data-ytx-guide", "data-ytx-guide-section", "data-ytx-top", "data-ytx-tab", "data-ytx-live"]) {
        for (const el of qsa(`[${attr}]`)) el.removeAttribute(attr);
      }
    });
    registerCheck(
      "tagger",
      "Grundlagen",
      "Tagging",
      () => tagRules.filter((r) => !r.pages || r.pages.includes(nav.page)).map((r) => {
        const n = lastCount.get(r.id) ?? 0;
        const extra = r.id === "watch.buttons" ? ` · ${qsa("ytd-watch-metadata [data-ytx-btn]").map((e) => e.getAttribute("data-ytx-btn")).join(", ")}` : "";
        return { id: `tag.${r.id}`, label: r.label, status: n ? "ok" : r.core ? "warn" : "skip", detail: `${n} Elemente getaggt${extra}` };
      })
    );
  }

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
    const pad = (n) => String(n).padStart(2, "0");
    return h2 ? `${h2}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function subtitleTime(ms, sep) {
    ms = Math.max(0, Math.round(ms));
    const pad = (n, l = 2) => String(n).padStart(l, "0");
    const h2 = Math.floor(ms / 36e5);
    const m = Math.floor(ms % 36e5 / 6e4);
    const s = Math.floor(ms % 6e4 / 1e3);
    return `${pad(h2)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1e3, 3)}`;
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

  // src/registry/paths.js
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
    const info = parseHref(href);
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
      kind: isPlaylist ? "playlist" : info.radio ? "mix" : "video",
      videoId: info.videoId || null,
      title: titleEl?.textContent.trim() || a?.getAttribute("title") || "",
      channel,
      channelUrl: channelLink?.getAttribute("href") || "",
      channelId: "",
      durationSec,
      isShort: !!info.isShort,
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
      const info = parseHref(a?.getAttribute("href"));
      let wrapper = el;
      while (wrapper.parentElement && wrapper.parentElement.id !== "contents") wrapper = wrapper.parentElement;
      return {
        el,
        wrapper,
        videoId: c.videoId,
        index: info.index ?? null,
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
  function compileRules(f) {
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
  var ATTR = "data-ytx-f";
  var seen = /* @__PURE__ */ new WeakMap();
  var rules = null;
  var version = 0;
  var filterStats = { page: "", checked: 0, hits: 0, reasons: {}, unreadable: 0 };
  var CSS = `
[${ATTR}="hide"] { display: none !important; }
[${ATTR}="dim"]:not([data-ytx-f-open]) { opacity: var(--ytx-dim-opacity, .3) !important; transition: opacity .15s ease !important; }
[${ATTR}="dim"]:not([data-ytx-f-open]):hover { opacity: 1 !important; }
[${ATTR}="collapse"]:not([data-ytx-f-open]) > :not(.ytx-fbar) { display: none !important; }
[${ATTR}="collapse"]:not([data-ytx-f-open]) { min-height: 0 !important; height: auto !important; }
.ytx-fbar { all: initial; display: none; box-sizing: border-box; width: 100%; padding: 6px 10px; margin: 2px 0 6px; border-radius: 8px; cursor: pointer;
  font: 12px/1.3 Roboto, Arial, sans-serif; color: var(--yt-sys-color-baseline--text-secondary, #aaa); background: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.06)); }
[${ATTR}="collapse"] > .ytx-fbar { display: block; }
[${ATTR}="collapse"][data-ytx-f-open] > .ytx-fbar { opacity: .6; }
[${ATTR}] [${ATTR}] { opacity: 1 !important; }
`;
  function outermostCards() {
    const out = [];
    for (const root of activePageRoots()) {
      for (const el of qsa(CARD_SELECTORS.join(", "), root)) {
        const parent = el.parentElement?.closest(CARD_PARENT);
        if (parent) continue;
        out.push(el);
      }
    }
    return out;
  }
  function clearCard(el) {
    el.removeAttribute(ATTR);
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
      for (const el of qsa(`[${ATTR}]`)) clearCard(el);
      return;
    }
    for (const el of outermostCards()) {
      const a = el.querySelector("a[href]");
      const sig = `${version}|${a?.getAttribute("href") || ""}|${el.querySelector("h3, #video-title")?.textContent || ""}`;
      if (seen.get(el) === sig) continue;
      seen.set(el, sig);
      let meta = null;
      try {
        meta = readCard(el);
      } catch (e) {
        log.warn("filter readCard", e);
      }
      filterStats.checked++;
      if (!meta || !meta.title && !meta.videoId) {
        filterStats.unreadable++;
        if (el.hasAttribute(ATTR)) clearCard(el);
        continue;
      }
      const reason = evaluate(meta, rules);
      if (!reason) {
        if (el.hasAttribute(ATTR)) clearCard(el);
        continue;
      }
      filterStats.hits++;
      filterStats.reasons[reason] = (filterStats.reasons[reason] || 0) + 1;
      el.setAttribute(ATTR, f.mode);
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
    rules = compileRules(cfg.filters);
    version++;
    sweep2();
  }
  function initFilters() {
    setCss("filters", CSS);
    onSweep("filters", sweep2);
    onDispose(() => {
      for (const el of qsa(`[${ATTR}]`)) clearCard(el);
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

  // src/features/transcript/panelSource.js
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

  // src/features/transcript/source.js
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
    let prev = null;
    try {
      prev = p.getOption?.("captions", "track");
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
      if (wasOn && prev?.languageCode) p.setOption?.("captions", "track", prev);
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

  // src/features/transcript/formats.js
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
      const prev = out[out.length - 1];
      if (prev && prev.text === s.text && s.startMs - prev.endMs < 1500) {
        prev.endMs = s.endMs;
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
      const prev = segs[i - 1];
      let title = null;
      if (useChapters) {
        const idx = chapterFor(s.startMs);
        if (idx !== chIdx) {
          chIdx = idx;
          if (idx >= 0) title = chapters[idx].title;
        }
      }
      const gap = prev ? s.startMs - prev.endMs : 0;
      const long = cur && cur.chars > maxChars && SENTENCE_END.test(prev?.text || "");
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

  // src/features/ui.js
  var CSS2 = `
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
    setCss("ui", CSS2);
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
    let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${top}px`;
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

  // src/features/transcript/index.js
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
      const currentTrack = () => chosen.get(ctx.nav.videoId) || pickTrack(tracks, s);
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
      async function copy(format = s.format, track = currentTrack(), btn2) {
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
        const track = currentTrack();
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
        const cur = currentTrack();
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
                const sb = splitButton({ label: "Transkript", icon: "⧉", title: "Transkript kopieren (Alt+T)", onMain: () => copy(s.format, currentTrack(), sb.main), onMenu: (more) => openMenu2(more) });
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
                const b = button({ label: "Kopieren", icon: "⧉", small: true, title: "Komplettes Transkript kopieren", onClick: () => copy(s.format, currentTrack(), b) });
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
        debug: { copy, buildDoc, currentTrack, tracks: () => tracks }
      };
    }
  };

  // src/features/playlist/common.js
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
  function summarize2(items, { doneThreshold = 90 } = {}) {
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

  // src/features/playlist/duration.js
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
        const sum = summarize2(data2.items, s);
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
        const all = summarize2(d.items.map((i) => ({ ...i, unavailable: !i.durationSec })), s);
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

  // src/features/playlist/dimWatched.js
  var ATTR2 = "data-ytx-watched";
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
[${ATTR2}="dim"] { opacity: var(--ytx-dim-opacity, .35) !important; }
[${ATTR2}="dim"]:hover { opacity: 1 !important; }
[${ATTR2}="hide"] { display: none !important; }`);
      const clearAll = () => {
        for (const el of qsa(`[${ATTR2}]`)) el.removeAttribute(ATTR2);
      };
      const run2 = () => {
        marked = 0;
        if (ctx.nav.page === "playlist") {
          for (const it of readPlaylist().items) {
            const on = it.percent != null && it.percent >= s.threshold;
            if (on) {
              it.wrapper.setAttribute(ATTR2, s.mode);
              marked++;
            } else if (it.wrapper.hasAttribute(ATTR2)) it.wrapper.removeAttribute(ATTR2);
          }
        } else if (ctx.nav.page === "watch") {
          const d = playlistPanel.read();
          if (!d) return;
          const els = playlistPanel.itemElements();
          els.forEach((el, i) => {
            const it = d.items[i];
            const on = it && !it.selected && it.percent != null && it.percent >= s.threshold;
            if (on) {
              el.setAttribute(ATTR2, "dim");
              marked++;
            } else if (el.hasAttribute(ATTR2)) el.removeAttribute(ATTR2);
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

  // src/features/playlist/sort.js
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

  // src/features/watchExtras.js
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
      let tick = 0;
      const off = listen(document, "timeupdate", (e) => {
        if (!e.target?.closest?.("#movie_player")) return;
        const now = Date.now();
        if (now - tick < 1e3) return;
        tick = now;
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
      const done = async (text, what) => {
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
        done(link(`${meta().title} @ ${clock(t)}`, t), `Link bei ${clock(t)}`);
      };
      ctx.action("info.linkHere", () => ctx.nav.page === "watch" && linkHere());
      const open = (anchor) => {
        const m = meta();
        const hasChapters = watch.chapters().length > 0;
        showMenu(anchor, [
          { title: "Kopieren" },
          { label: "Titel mit Link", run: () => done(link(m.title), "Link") },
          { label: "Link an aktueller Stelle", sub: "Alt+L", run: linkHere },
          { label: "Kapitel (Text)", disabled: !hasChapters, run: () => done(chaptersText(false), "Kapitel") },
          { label: "Kapitel (Markdown mit Zeitlinks)", disabled: !hasChapters, run: () => done(`## ${m.title}

${chaptersText(true)}
`, "Kapitel") },
          { label: "Beschreibung", run: () => done(watch.description(m.pr), "Beschreibung") }
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

  // src/features/cardExtras.js
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

  // src/features/index.js
  var featureManifests2 = [transcript_default, copyInfo, duration_default, sort_default, dimWatched_default, endsAt, publishDate, progressBadge, proxyButtons];

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
nav { display: flex; gap: 2px; padding: 6px 8px; overflow-x: auto; border-bottom: 1px solid var(--line); scrollbar-width: none; }
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
  var PAGE_LABEL = { home: "Startseite", watch: "Videoseite", search: "Suche", playlist: "Playlist", subscriptions: "Abos", channel: "Kanal", shorts: "Shorts", history: "Verlauf", you: "Mein YouTube", feed: "Feed", other: "Sonstige" };
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
      const q = search.value.trim().toLowerCase();
      for (const group of GROUPS) {
        const items = targets.filter((t) => t.group === group).filter((t) => !q || `${t.label} ${t.id} ${t.note || ""}`.toLowerCase().includes(q)).filter((t) => !app.ui.displayOnlyPage || !t.pages || t.pages.includes(app.nav.page));
        if (!items.length) continue;
        const active = items.filter((t) => cfg.display[t.id]).length;
        const det = h("details", { open: q || app.ui.openGroups?.has(group) }, h("summary", null, group, h("span", { class: "count", text: active ? `${active} aktiv` : "" })));
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
    const theme = themes.find((t) => t.id === cfg.vars.theme) || themes[0];
    root.append(h("h3", { text: "Theme" }));
    root.append(
      row("Farbschema", select(themes.map((t) => [t.id, t.label]), cfg.vars.theme, (v) => {
        update((c) => c.vars.theme = v);
        app.rerender();
      }), { note: "Einzelne Farben unten überschreiben das Schema. Gedacht für YouTubes dunklen Modus" })
    );
    const colorsBody = h("div");
    for (const c of colorControls) {
      colorsBody.append(row(c.label, color(cfg.vars[c.id], theme.values[c.id] || "#000000", (v) => update((x) => v ? x.vars[c.id] = v : delete x.vars[c.id]))));
    }
    root.append(colorsBody);
    for (const group of LOOK_GROUPS.filter((g) => g !== "Farben")) {
      const items = controls.filter((c) => c.group === group);
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
    root.append(h("h3", { text: "Presets pro Seite" }));
    for (const [page, label] of LAYOUT_PAGES) {
      const opts = [["", "Standard"], ...layoutPresets.filter((p) => p.pages.includes(page)).map((p) => [p.id, p.label])];
      root.append(row(label, select(opts, cfg.layout.presets[page] || "", (v) => update((c) => v ? c.layout.presets[page] = v : delete c.layout.presets[page]))));
    }
    root.append(h("h3", { text: "Kopfzeile" }));
    root.append(row("Verhalten beim Scrollen", select(topbarModes, cfg.layout.topbar, (v) => update((c) => c.layout.topbar = v))));
    for (const [gid, g] of Object.entries(orderGroups)) {
      root.append(h("h3", { text: `Reihenfolge: ${g.label}` }));
      const current2 = cfg.layout.order[gid] || [];
      const enabled = current2.length > 0;
      let list = enabled ? current2.slice() : g.items.map(([id]) => id);
      const labels = Object.fromEntries(g.items);
      for (const [id] of g.items) if (!list.includes(id)) list.push(id);
      const box = h("div", { class: "orderlist" });
      const save = () => update((c) => c.layout.order[gid] = list.slice());
      const draw = () => {
        box.replaceChildren();
        list.forEach((id, i) => {
          const up = btn("↑", () => {
            if (i === 0) return;
            [list[i - 1], list[i]] = [list[i], list[i - 1]];
            save();
            draw();
          }, "tiny");
          const down = btn("↓", () => {
            if (i === list.length - 1) return;
            [list[i + 1], list[i]] = [list[i], list[i + 1]];
            save();
            draw();
          }, "tiny");
          box.append(h("div", { class: "item" }, h("span", { text: labels[id] || id }), up, down));
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
    root.append(h("h3", { text: "Freie Zonen" }));
    root.append(h("p", { class: "hint", text: "Nicht umgesetzt: Freies Umhängen von Bereichen per display: contents stört YouTubes JavaScript-Playergröße und das automatische Umsortieren bei schmalen Fenstern. Stattdessen gibt es die festen Presets „Kino“ und „Fokus“ für die Videoseite." }));
    return root;
  }
  function behaviorTab(app) {
    const cfg = app.store.config;
    const root = h("div");
    const update = (fn) => app.store.update(fn, "panel");
    for (const b of behaviors) {
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
      row("Seiten", chips(FILTER_PAGES, f.pages, (v) => update((c) => c.filters.pages = v)), { stack: true })
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
      const errs = compileRules({ ...f, title: { ...f.title, regex: list } }).errors;
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
      const t = templateById[p.template];
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
          const done = () => {
            st.renameProfile(p.id, input.value);
            app.rerender();
          };
          input.addEventListener("keydown", (e) => e.key === "Enter" && done());
          input.addEventListener("blur", done);
        }, "tiny"),
        t && btn("Zurücksetzen", () => confirmInline(actions2, "Profil auf Vorlage zurücksetzen?", () => st.resetProfile(p.id)), "tiny"),
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
      const sum = summarize(results);
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
    const meta = () => ({ version: app.version, seite: app.nav.page, url: location.href, profil: app.store.activeId, ...capabilities(), sweeps: `${sweepStats.runs} (${sweepStats.lastMs} ms)`, css: JSON.stringify(cssStats()), events: Array.from(app.nav.eventsSeen).join(",") });
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
        { id: "core.polymer", label: "Polymer-Daten lesbar (Seitenkontext)", status: c.appFound ? c.polymerData ? "ok" : "fail" : "skip", detail: c.polymerData ? "ok" : "Script läuft vermutlich in isolierter Welt – @sandbox / @inject-into prüfen" },
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

  // src/panel/index.js
  var TABS = [
    ["display", "Anzeige", displayTab],
    ["look", "Look", lookTab],
    ["layout", "Layout", layoutTab],
    ["behavior", "Verhalten", behaviorTab],
    ["filters", "Filter", filterTab],
    ["features", "Features", featuresTab],
    ["profiles", "Profile", profilesTab],
    ["diagnose", "Diagnose", diagnoseTab]
  ];
  function createPanel(app) {
    const host = h("ytx-panel", { "data-ytx-own": "" });
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadow.append(style);
    const profileSelect = h("select", { title: "Aktives Profil" });
    const closeBtn = h("button", { class: "iconbtn", title: "Schließen (Alt+Y)", text: "✕" });
    const nav2 = h("nav", { role: "tablist" });
    const main = h("main");
    const status = h("span");
    const footInfo = h("span");
    const panel = h("div", { class: "panel", hidden: true }, h("header", null, h("span", { class: "logo", text: "ytx" }), profileSelect, closeBtn), nav2, main, h("footer", null, status, footInfo));
    shadow.append(panel);
    let tab = app.store.settings.panelTab || "display";
    let content = null;
    let flashTimer = null;
    let countTimer = null;
    const tabButtons = /* @__PURE__ */ new Map();
    for (const [id, label] of TABS) {
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
      app.store.updateSettings((s) => s.panelTab = id);
      render2();
    }
    function render2() {
      if (panel.hidden) return;
      const scroll = main.scrollTop;
      const def = TABS.find(([id]) => id === tab) || TABS[0];
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
      const s = summarize(runChecks());
      footInfo.textContent = `v${app.version} · ${s.fail ? `${s.fail} Fehler · ` : ""}${s.warn ? `${s.warn} Warnungen` : "Diagnose ok"}`;
    }
    app.rerender = render2;
    app.flash = (text) => {
      status.textContent = text;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => status.textContent = "", 3500);
    };
    function open() {
      if (!host.isConnected) document.documentElement.append(host);
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
      if (reason !== "settings") render2();
    });
    listen(shadow, "keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key !== "Escape") e.stopPropagation();
    });
    for (const type of ["keyup", "keypress"]) listen(shadow, type, (e) => e.stopPropagation());
    document.documentElement.append(host);
    onDispose(() => {
      clearInterval(countTimer);
      host.remove();
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
    initTimedtextCapture();
    store.init(featureManifests2);
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
    initFilters();
    applyFilters(cfg);
    initFeatures(featureManifests2, (m, settings) => {
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
      if (reason === "settings") {
        setBindings(store.settings.hotkeys);
        requestSweep();
        return;
      }
      applyDisplay(c);
      applyVars(c);
      applyLayout(c);
      applyBehavior(c);
      applyFilters(c);
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
      features: featureManifests2,
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
    log.info(`ytx ${VERSION} gestartet auf ${nav.page}`);
  }
  try {
    if (window.top === window.self) boot();
  } catch (e) {
    console.error("[ytx] start fehlgeschlagen", e);
  }
})();
