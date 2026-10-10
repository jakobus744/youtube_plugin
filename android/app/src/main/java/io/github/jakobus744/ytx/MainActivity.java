package io.github.jakobus744.ytx;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSession.PermissionDelegate.ContentPermission;
import org.mozilla.geckoview.GeckoSession.PromptDelegate;
import org.mozilla.geckoview.GeckoSession.PromptDelegate.PromptResponse;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.OrientationController;
import org.mozilla.geckoview.WebRequestError;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// youtube in einer eigenen app: gecko engine ohne browser oberflaeche, ytx laeuft immer mit
public class MainActivity extends Activity implements YtxRuntime.Listener {

    private static final Pattern RGB = Pattern.compile("rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)");
    // bleibt in der app: youtube und google anmeldung
    private static final Pattern INSIDE = Pattern.compile("(^|\\.)(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|ytimg\\.com|googlevideo\\.com|gstatic\\.com|googleusercontent\\.com|google\\.[a-z.]+)$");

    private static final int REQ_FILE = 41;
    private GeckoResult<PromptResponse> pendingFile;
    private PromptDelegate.FilePrompt pendingFilePrompt;

    private FrameLayout root;
    private GeckoView view;
    private GeckoSession session;
    // laufendes video im kleinen fenster, daneben laedt die hauptansicht weiter
    private GeckoSession mini;
    private GeckoView miniView;
    private FrameLayout miniBox;
    private String lastBrowse;
    private boolean pip;
    private boolean pipWanted;
    private float miniTx;
    private float miniTy;
    private float dragBaseX;
    private float dragBaseY;
    private final java.util.Map<GeckoSession, String> urls = new java.util.HashMap<>();
    // vorbereitete leere sitzung, damit das verkleinern nicht ruckelt
    private GeckoSession spare;
    // sitzungen in denen gerade medien laufen, sie bleiben auch im hintergrund aktiv
    // youtube und music laufen im selben prozess und teilen den dienst, darum gilt der zustand fuer beide
    private static final java.util.Set<GeckoSession> playing = new java.util.HashSet<>();
    private static final java.util.Map<GeckoSession, org.mozilla.geckoview.MediaSession> medias = new java.util.HashMap<>();
    // sitzung die zuletzt abgespielt hat, ihr gehoeren die tasten der benachrichtigung
    private static GeckoSession lastPlayed;
    private static boolean paused;
    private boolean canGoBack;
    private boolean fullscreen;
    // die seite sperrt beim vollbild knopf auf quer, wie in der youtube app loest einmal quer und dann hochkant halten die sperre
    private OrientationEventListener orientWatch;
    private boolean pageLocked;
    private boolean seenLand;
    private String currentUrl;

    // ---------- was die activity zeigt ----------

    protected String homeUrl() {
        return "https://m.youtube.com/";
    }

    protected String prefsName() {
        return "youtube";
    }

    // gehoert eine seite in diese activity (youtube oder music)
    protected boolean ownsHost(String host) {
        return host != null && !host.startsWith("music.");
    }

    // ---------- lebenszyklus ----------

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        GeckoRuntime runtime = YtxRuntime.get(this);

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF0F0F0F);
        view = new GeckoView(this);
        root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        setupEdgeToEdge();
        setupBack();
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED && !prefs().getBoolean("askedNotif", false)) {
            prefs().edit().putBoolean("askedNotif", true).apply();
            requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 7);
        }

        session = newSession();
        view.setSession(session);

        String url = urlFrom(getIntent());
        if (url == null) url = lastUrl();
        session.loadUri(url != null ? url : homeUrl());
        // erst wenn die seite steht, eine leere sitzung fuers verkleinern vorbereiten
        view.postDelayed(() -> {
            if (spare == null && !isFinishing()) {
                spare = newSession();
                spare.loadUri("about:blank");
            }
        }, 6000);
    }

    private GeckoSession newSession() {
        GeckoSession s = new GeckoSession(new GeckoSessionSettings.Builder()
                .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
                .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
                .build());
        installDelegates(s);
        s.setMediaSessionDelegate(new org.mozilla.geckoview.MediaSession.Delegate() {
            @Override
            public void onActivated(GeckoSession gs, org.mozilla.geckoview.MediaSession ms) {
                medias.put(gs, ms);
            }

            @Override
            public void onMetadata(GeckoSession gs, org.mozilla.geckoview.MediaSession ms, org.mozilla.geckoview.MediaSession.Metadata m) {
                PlaybackService.title = m.title != null ? m.title : "";
                PlaybackService.artist = m.artist != null ? m.artist : "";
                PlaybackService.art = null;
                if (m.artwork != null) {
                    m.artwork.getBitmap(256).accept(bmp -> {
                        PlaybackService.art = bmp;
                        updateService();
                    }, e -> {
                    });
                }
                updateService();
            }

            @Override
            public void onPlay(GeckoSession gs, org.mozilla.geckoview.MediaSession ms) {
                playing.add(gs);
                lastPlayed = gs;
                paused = false;
                updateService();
            }

            @Override
            public void onPause(GeckoSession gs, org.mozilla.geckoview.MediaSession ms) {
                // pause bleibt in der benachrichtigung stehen, damit man wieder starten kann
                if (gs == lastPlayed) paused = true;
                updateService();
            }

            @Override
            public void onStop(GeckoSession gs, org.mozilla.geckoview.MediaSession ms) {
                playing.remove(gs);
                updateService();
            }

            @Override
            public void onDeactivated(GeckoSession gs, org.mozilla.geckoview.MediaSession ms) {
                playing.remove(gs);
                medias.remove(gs);
                updateService();
            }
        });
        s.open(YtxRuntime.get(this));
        return s;
    }

    // dienst haelt die app am leben solange medien laufen, mit benachrichtigung
    private void updateService() {
        runOnUiThread(() -> {
            Intent i = new Intent(this, PlaybackService.class);
            updatePip();
            if (playing.isEmpty()) {
                stopService(i);
                return;
            }
            PlaybackService.owner = getClass();
            PlaybackService.playing = !paused;
            PlaybackService.control = this::mediaKey;
            startForegroundService(i);
        });
    }

    // tasten der benachrichtigung, des sperrbildschirms und der kopfhoerer
    private void mediaKey(String what) {
        runOnUiThread(() -> {
            GeckoSession gs = lastPlayed != null && medias.containsKey(lastPlayed) ? lastPlayed : (playing.isEmpty() ? null : playing.iterator().next());
            org.mozilla.geckoview.MediaSession ms = gs != null ? medias.get(gs) : null;
            if (ms == null) return;
            if ("next".equals(what)) ms.nextTrack();
            else if ("pause".equals(what)) ms.pause();
            else if ("play".equals(what)) ms.play();
            else if ("prev".equals(what)) ms.previousTrack();
            else if (paused) {
                ms.play();
            } else {
                ms.pause();
            }
        });
    }

    // aufgewaermte sitzung nehmen und eine neue vorbereiten
    private GeckoSession takeSession() {
        GeckoSession s = spare != null ? spare : newSession();
        spare = null;
        view.postDelayed(() -> {
            if (spare == null && !isFinishing()) {
                spare = newSession();
                spare.loadUri("about:blank");
            }
        }, 1500);
        return s;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = urlFrom(intent);
        // nur die startseite angefragt: app ist schon offen, nichts neu laden
        if (url != null && url.replaceAll("/+$", "").equals(homeUrl().replaceAll("/+$", ""))) return;
        if (url != null) session.loadUri(url);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (session != null) session.setActive(true);
        if (mini != null) mini.setActive(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        YtxRuntime.setListener(this);
        if (session != null) session.setFocused(true);
        AppUpdater.resume(this);
        AppUpdater.maybeCheck(this);
        // vollbild videos duerfen das handy drehen
        YtxRuntime.get(this).getOrientationController().setDelegate(new OrientationController.OrientationDelegate() {
            @Override
            public GeckoResult<AllowOrDeny> onOrientationLock(int orientation) {
                runOnUiThread(() -> {
                    setRequestedOrientation(orientation);
                    watchOrientation(true);
                });
                return GeckoResult.allow();
            }

            @Override
            public void onOrientationUnlock() {
                runOnUiThread(() -> {
                    watchOrientation(false);
                    setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                });
            }
        });
    }

    private void watchOrientation(boolean on) {
        pageLocked = on;
        seenLand = false;
        if (!on) {
            if (orientWatch != null) orientWatch.disable();
            return;
        }
        if (orientWatch == null) {
            orientWatch = new OrientationEventListener(this) {
                @Override
                public void onOrientationChanged(int deg) {
                    if (!pageLocked || deg == ORIENTATION_UNKNOWN) return;
                    boolean land = (deg > 60 && deg < 120) || (deg > 240 && deg < 300);
                    boolean upright = deg < 25 || deg > 335;
                    if (land) seenLand = true;
                    else if (upright && seenLand) {
                        // hochkant gedreht: die seite merkt das und beendet das vollbild
                        pageLocked = false;
                        disable();
                        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    }
                }
            };
        }
        if (orientWatch.canDetectOrientation()) orientWatch.enable();
    }

    @Override
    protected void onActivityResult(int req, int code, Intent data) {
        super.onActivityResult(req, code, data);
        if (req != REQ_FILE || pendingFile == null) return;
        GeckoResult<PromptResponse> res = pendingFile;
        PromptDelegate.FilePrompt p = pendingFilePrompt;
        pendingFile = null;
        pendingFilePrompt = null;
        if (code != RESULT_OK || data == null) {
            res.complete(p.dismiss());
        } else if (data.getClipData() != null && data.getClipData().getItemCount() > 1) {
            Uri[] uris = new Uri[data.getClipData().getItemCount()];
            for (int i = 0; i < uris.length; i++) uris[i] = data.getClipData().getItemAt(i).getUri();
            res.complete(p.confirm(this, uris));
        } else if (data.getData() != null) {
            res.complete(p.confirm(this, data.getData()));
        } else {
            res.complete(p.dismiss());
        }
    }

    // app verlassen waehrend ein video laeuft: kleines fenster ueber anderen apps
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        // bei musik gibt es kein video, dort reicht die benachrichtigung
        if (Build.VERSION.SDK_INT >= 31 || !pipWanted || isInPictureInPictureMode()) return;
        try {
            enterPictureInPictureMode(new android.app.PictureInPictureParams.Builder().setAspectRatio(new android.util.Rational(16, 9)).build());
        } catch (RuntimeException ignored) {
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean in, android.content.res.Configuration cfg) {
        super.onPictureInPictureModeChanged(in, cfg);
        pip = in;
        if (miniBox == null || mini == null) return;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) miniBox.getLayoutParams();
        if (in) {
            view.setVisibility(View.INVISIBLE);
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.height = FrameLayout.LayoutParams.MATCH_PARENT;
            lp.setMargins(0, 0, 0, 0);
        } else {
            view.setVisibility(View.VISIBLE);
            lp.width = dp(240);
            lp.height = dp(135);
            lp.setMargins(0, 0, dp(10), dp(86));
        }
        miniBox.setLayoutParams(lp);
        miniBox.setTranslationX(in ? 0 : miniTx);
        miniBox.setTranslationY(in ? 0 : miniTy);
        // die flaeche zeichnet nach dem groessenwechsel oft nicht neu
        for (int ms : new int[]{50, 300, 800}) {
            miniBox.postDelayed(() -> {
                if (mini == null) return;
                mini.setActive(true);
                miniView.requestLayout();
                miniBox.requestLayout();
            }, ms);
        }
    }

    @Override
    protected void onPause() {
        if (session != null) session.setFocused(false);
        super.onPause();
    }

    @Override
    protected void onStop() {
        // wo medien laufen bleibt die sitzung aktiv, damit der ton weiterlaeuft
        if (session != null && !playing.contains(session)) session.setActive(false);
        if (mini != null && !playing.contains(mini)) mini.setActive(false);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (mini != null) mini.close();
        if (spare != null) spare.close();
        if (session != null) session.close();
        // nur die eigenen sitzungen abmelden, die andere app spielt vielleicht noch
        playing.remove(session);
        playing.remove(mini);
        playing.remove(spare);
        if (playing.isEmpty()) stopService(new Intent(this, PlaybackService.class));
        super.onDestroy();
    }

    // ---------- links ----------

    private String urlFrom(Intent intent) {
        if (intent == null) return null;
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) return normalize(intent.getData().toString());
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text == null) return null;
            Matcher m = Pattern.compile("https?://\\S+").matcher(text);
            return m.find() ? normalize(m.group()) : null;
        }
        return null;
    }

    // desktop links auf die mobilseite, music bleibt music
    private static String normalize(String url) {
        Uri u = Uri.parse(url);
        String host = u.getHost();
        if (host == null) return url;
        if (host.equals("youtu.be")) {
            String id = u.getLastPathSegment();
            return id == null ? "https://m.youtube.com/" : "https://m.youtube.com/watch?v=" + id + (u.getQueryParameter("t") != null ? "&t=" + u.getQueryParameter("t") : "");
        }
        if (host.equals("www.youtube.com") || host.equals("youtube.com")) return u.buildUpon().authority("m.youtube.com").build().toString();
        return url;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(prefsName(), Context.MODE_PRIVATE);
    }

    // beim naechsten kaltstart dort weitermachen, aber nicht nach einem halben tag
    private String lastUrl() {
        SharedPreferences p = prefs();
        if (System.currentTimeMillis() - p.getLong("lastAt", 0) > 6 * 3600 * 1000L) return null;
        return p.getString("lastUrl", null);
    }

    // haeufige ursachen in einem satz
    private static String hint(WebRequestError e) {
        String t = null;
        if (e.code == WebRequestError.ERROR_UNKNOWN_HOST) t = "Der Servername wird nicht gefunden. Ein VPN (z. B. WireGuard zum Pi) oder ein DNS Server, der nicht antwortet, ist die häufigste Ursache. VPN ausschalten und neu laden.";
        else if (e.code == WebRequestError.ERROR_NET_TIMEOUT || e.code == WebRequestError.ERROR_CONNECTION_REFUSED) t = "Keine Verbindung. WLAN, mobile Daten oder VPN prüfen.";
        return t == null ? "" : "<p style='color:#aaa;margin:0 0 20px;font-size:14px'>" + escape(t) + "</p>";
    }

    private static String escape(String t) {
        return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private void openOutside(String uri) {
        try {
            Intent i = uri.startsWith("intent:") ? Intent.parseUri(uri, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    // ---------- delegates ----------

    private void installDelegates(GeckoSession session) {
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override
            public void onCanGoBack(GeckoSession s, boolean value) {
                if (s == MainActivity.this.session) canGoBack = value;
            }

            @Override
            public void onLocationChange(GeckoSession s, String url, List<ContentPermission> perms, Boolean hasUserGesture) {
                // jede sitzung merkt sich ihre seite, damit sie nach dem vergroessern bekannt ist
                if (url != null) urls.put(s, url);
                if (s != MainActivity.this.session) return;
                currentUrl = url;
                // letzte seite die kein video ist, dorthin geht es beim verkleinern zurueck
                if (url != null && url.startsWith("https://") && !url.contains("/watch")) lastBrowse = url;
                if (url != null && url.contains("/watch") && mini != null) closeMini();
                updatePip();
                if (url != null && url.startsWith("https://")) prefs().edit().putString("lastUrl", url).putLong("lastAt", System.currentTimeMillis()).apply();
            }

            // statt weissem bildschirm eine seite mit grund und neu laden
            @Override
            public GeckoResult<String> onLoadError(GeckoSession s, String uri, WebRequestError error) {
                // adresse nur als https link, alles maskiert, kein script in der seite
                String target = uri != null && uri.startsWith("https://") ? uri : "https://m.youtube.com/";
                String html = "<meta name='viewport' content='width=device-width,initial-scale=1'><body style='margin:0;background:#0f0f0f;color:#f1f1f1;font:16px sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center'>"
                        + "<div style='padding:24px'><h2 style='margin:0 0 8px'>Seite nicht erreichbar</h2><p style='color:#aaa;margin:0 0 20px;word-break:break-all'>Fehler " + error.code + " (Kategorie " + error.category + ")<br>" + escape(target) + "</p>" + hint(error)
                        + "<a href=\"" + escape(target) + "\" style='display:inline-block;padding:12px 28px;border-radius:24px;background:#f1f1f1;color:#0f0f0f;text-decoration:none'>Neu laden</a></div>";
                return GeckoResult.fromValue("data:text/html;charset=utf-8," + Uri.encode(html));
            }

            @Override
            public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession s, LoadRequest req) {
                Uri u = Uri.parse(req.uri);
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
                if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob") || scheme.equals("moz-extension")) return GeckoResult.allow();
                if (!scheme.equals("http") && !scheme.equals("https")) {
                    // vnd.youtube und intent links nicht an die youtube app geben, alles andere schon
                    if (scheme.startsWith("vnd.youtube") || req.uri.contains("package=com.google.android.youtube")) return GeckoResult.deny();
                    runOnUiThread(() -> openOutside(req.uri));
                    return GeckoResult.deny();
                }
                String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
                if (!INSIDE.matcher(host).find()) {
                    runOnUiThread(() -> openOutside(req.uri));
                    return GeckoResult.deny();
                }
                // music links aus youtube heraus im music fenster oeffnen und umgekehrt
                if (req.target == TARGET_WINDOW_NEW || (host.endsWith("youtube.com") && !ownsHost(host) && req.hasUserGesture)) {
                    if (host.endsWith("youtube.com") && !ownsHost(host)) {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(req.uri), MainActivity.this, host.startsWith("music.") ? MusicActivity.class : MainActivity.class);
                        runOnUiThread(() -> startActivity(i));
                    } else {
                        s.loadUri(req.uri);
                    }
                    return GeckoResult.deny();
                }
                return GeckoResult.allow();
            }

            @Override
            public GeckoResult<GeckoSession> onNewSession(GeckoSession s, String uri) {
                s.loadUri(uri);
                return null;
            }
        });

        session.setContentDelegate(new GeckoSession.ContentDelegate() {
            @Override
            public void onFullScreen(GeckoSession s, boolean full) {
                if (s == MainActivity.this.session) setFullscreen(full);
            }

            @Override
            public void onCrash(GeckoSession s) {
                if (s == mini) {
                    closeMini();
                    return;
                }
                Toast.makeText(MainActivity.this, R.string.crashed, Toast.LENGTH_SHORT).show();
                restart();
            }

            @Override
            public void onKill(GeckoSession s) {
                if (s == mini) closeMini();
                else restart();
            }
        });

        session.setPermissionDelegate(new GeckoSession.PermissionDelegate() {
            @Override
            public GeckoResult<Integer> onContentPermissionRequest(GeckoSession s, ContentPermission perm) {
                switch (perm.permission) {
                    case PERMISSION_AUTOPLAY_AUDIBLE:
                    case PERMISSION_AUTOPLAY_INAUDIBLE:
                    case PERMISSION_PERSISTENT_STORAGE:
                    case PERMISSION_MEDIA_KEY_SYSTEM_ACCESS:
                    case PERMISSION_STORAGE_ACCESS:
                        return GeckoResult.fromValue(ContentPermission.VALUE_ALLOW);
                    default:
                        return GeckoResult.fromValue(ContentPermission.VALUE_DENY);
                }
            }
        });

        session.setPromptDelegate(new Prompts());
    }

    private void restart() {
        String url = currentUrl != null ? currentUrl : homeUrl();
        view.releaseSession();
        session.close();
        session = newSession();
        view.setSession(session);
        session.loadUri(url);
    }

    // ---------- mini player ----------

    @Override
    public void onApp(String action) {
        runOnUiThread(() -> {
            if ("minimize".equals(action)) minimize();
            else if ("expand".equals(action)) expand();
            else if ("close".equals(action)) closeMini();
            else if ("fsOn".equals(action)) setFullscreen(true);
            else if ("af1".equals(action) || "af0".equals(action)) {
                PlaybackService.respectFocus = "af1".equals(action);
                updateService();
            }
            else if ("fsOff".equals(action) && fullscreen) setFullscreen(false);
            else if (action != null && action.startsWith("openyt:")) openInYoutubeApp(action.substring(7));
        });
    }

    // aktuelles video in der offiziellen app, dort laesst es sich herunterladen und offline schauen
    private void openInYoutubeApp(String id) {
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) return;
        String url = "https://www.youtube.com/watch?v=" + id;
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage("com.google.android.youtube");
        try {
            startActivity(i);
        } catch (android.content.ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_youtube_app, Toast.LENGTH_SHORT).show();
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    // das video bleibt in seiner sitzung und spielt weiter, die hauptansicht geht zur vorherigen seite
    private void minimize() {
        if (session == null || fullscreen) return;
        if (currentUrl == null || !currentUrl.contains("/watch")) return;
        // nur ein kleines fenster, ein neues video ersetzt das alte
        closeMini();
        if (miniBox == null) {
            miniBox = new FrameLayout(this) {
                private float downX;
                private float downY;
                private boolean dragging;

                // gecko meldet beruehrungen als eigene, deshalb hier trotzdem abfangen sobald gezogen wird
                @Override
                public void requestDisallowInterceptTouchEvent(boolean disallow) {
                }

                @Override
                public boolean onInterceptTouchEvent(android.view.MotionEvent e) {
                    switch (e.getActionMasked()) {
                        case android.view.MotionEvent.ACTION_DOWN:
                            downX = e.getRawX();
                            downY = e.getRawY();
                            dragging = false;
                            dragBaseX = miniTx;
                            dragBaseY = miniTy;
                            break;
                        case android.view.MotionEvent.ACTION_MOVE:
                            if (!dragging && Math.hypot(e.getRawX() - downX, e.getRawY() - downY) > dp(10)) dragging = true;
                            break;
                        default:
                            break;
                    }
                    return dragging;
                }

                @Override
                public boolean onTouchEvent(android.view.MotionEvent e) {
                    if (e.getActionMasked() == android.view.MotionEvent.ACTION_MOVE) {
                        moveMini(dragBaseX + e.getRawX() - downX, dragBaseY + e.getRawY() - downY);
                    } else if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP || e.getActionMasked() == android.view.MotionEvent.ACTION_CANCEL) {
                        dragging = false;
                    }
                    return true;
                }
            };
            miniBox.setBackgroundColor(0xFF000000);
            miniBox.setElevation(dp(8));
            miniView = new GeckoView(this);
            miniBox.addView(miniView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
            FrameLayout.LayoutParams glp = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, dp(26), android.view.Gravity.TOP);
            // rechts bleibt das kreuz der seite frei
            glp.rightMargin = dp(48);
            miniBox.addView(makeGrip(), glp);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(dp(240), dp(135), android.view.Gravity.BOTTOM | android.view.Gravity.END);
            lp.setMargins(0, 0, dp(10), dp(86));
            root.addView(miniBox, lp);
        }
        GeckoSession video = session;
        view.releaseSession();
        session = takeSession();
        view.setSession(session);
        session.loadUri(lastBrowse != null ? lastBrowse : homeUrl());
        canGoBack = false;
        mini = video;
        miniView.setSession(mini);
        miniBox.setTranslationX(miniTx);
        miniBox.setTranslationY(miniTy);
        miniBox.setVisibility(View.VISIBLE);
        updatePip();
    }

    // oberer streifen: ziehen verschiebt das kleine fenster, antippen holt das video zurueck
    private View makeGrip() {
        FrameLayout grip = new FrameLayout(this);
        View bar = new View(this);
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setColor(0xB0FFFFFF);
        d.setCornerRadius(dp(2));
        bar.setBackground(d);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(dp(36), dp(4), android.view.Gravity.CENTER_HORIZONTAL | android.view.Gravity.TOP);
        blp.topMargin = dp(8);
        grip.addView(bar, blp);
        final float[] st = new float[5];
        grip.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case android.view.MotionEvent.ACTION_DOWN:
                    st[0] = e.getRawX();
                    st[1] = e.getRawY();
                    st[2] = miniBox.getTranslationX();
                    st[3] = miniBox.getTranslationY();
                    st[4] = 0;
                    return true;
                case android.view.MotionEvent.ACTION_MOVE: {
                    float dx = e.getRawX() - st[0];
                    float dy = e.getRawY() - st[1];
                    if (st[4] == 0 && Math.hypot(dx, dy) < dp(8)) return true;
                    st[4] = 1;
                    moveMini(st[2] + dx, st[3] + dy);
                    return true;
                }
                case android.view.MotionEvent.ACTION_UP:
                    if (st[4] == 0) expand();
                    return true;
                default:
                    return true;
            }
        });
        return grip;
    }

    // im bild bleiben: links und oben nicht ueber den rand, rechts und unten bis zum rand
    private void moveMini(float x, float y) {
        int left = root.getWidth() - miniBox.getWidth() - dp(10);
        int top = root.getHeight() - miniBox.getHeight() - dp(86);
        miniTx = Math.max(-left, Math.min(dp(10), x));
        miniTy = Math.max(-top, Math.min(dp(86), y));
        miniBox.setTranslationX(miniTx);
        miniBox.setTranslationY(miniTy);
    }

    // ab android 12 geht das bild in bild von selbst beim verlassen der app, nicht schon bei einem screenshot
    private void updatePip() {
        runOnUiThread(() -> {
            boolean on = !homeUrl().contains("music.") && !playing.isEmpty() && (mini != null || (currentUrl != null && currentUrl.contains("/watch")));
            pipWanted = on;
            if (Build.VERSION.SDK_INT >= 31) {
                try {
                    setPictureInPictureParams(new android.app.PictureInPictureParams.Builder()
                            .setAspectRatio(new android.util.Rational(16, 9))
                            .setAutoEnterEnabled(on)
                            .build());
                } catch (RuntimeException ignored) {
                }
            }
        });
    }

    // tippen auf das kleine fenster holt das video zurueck, die hauptansicht wird dabei geschlossen
    private void expand() {
        if (mini == null) return;
        GeckoSession video = mini;
        mini = null;
        miniView.releaseSession();
        miniBox.setVisibility(View.GONE);
        GeckoSession old = session;
        view.releaseSession();
        view.setSession(video);
        session = video;
        old.close();
        canGoBack = true;
        currentUrl = urls.get(video);
        updatePip();
    }

    private void closeMini() {
        if (mini == null) return;
        GeckoSession video = mini;
        mini = null;
        miniView.releaseSession();
        miniBox.setVisibility(View.GONE);
        video.close();
        updatePip();
    }

    // ---------- dialoge der seite: alert, confirm, prompt, auswahllisten, teilen ----------

    private class Prompts implements PromptDelegate {
        private AlertDialog.Builder dialog() {
            return new AlertDialog.Builder(MainActivity.this, R.style.Theme_Ytx_Dialog);
        }

        @Override
        public GeckoResult<PromptResponse> onAlertPrompt(GeckoSession s, AlertPrompt p) {
            GeckoResult<PromptResponse> res = new GeckoResult<>();
            dialog().setTitle(p.title).setMessage(p.message)
                    .setPositiveButton(R.string.ok, (d, w) -> res.complete(p.dismiss()))
                    .setOnCancelListener(d -> res.complete(p.dismiss()))
                    .show();
            return res;
        }

        @Override
        public GeckoResult<PromptResponse> onButtonPrompt(GeckoSession s, ButtonPrompt p) {
            GeckoResult<PromptResponse> res = new GeckoResult<>();
            dialog().setTitle(p.title).setMessage(p.message)
                    .setPositiveButton(R.string.ok, (d, w) -> res.complete(p.confirm(ButtonPrompt.Type.POSITIVE)))
                    .setNegativeButton(R.string.cancel, (d, w) -> res.complete(p.confirm(ButtonPrompt.Type.NEGATIVE)))
                    .setOnCancelListener(d -> res.complete(p.dismiss()))
                    .show();
            return res;
        }

        @Override
        public GeckoResult<PromptResponse> onTextPrompt(GeckoSession s, TextPrompt p) {
            GeckoResult<PromptResponse> res = new GeckoResult<>();
            EditText input = new EditText(MainActivity.this);
            input.setInputType(InputType.TYPE_CLASS_TEXT);
            if (p.defaultValue != null) input.setText(p.defaultValue);
            FrameLayout box = new FrameLayout(MainActivity.this);
            int pad = Math.round(20 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad / 2, pad, 0);
            box.addView(input);
            dialog().setTitle(p.title != null ? p.title : p.message).setMessage(p.title != null ? p.message : null).setView(box)
                    .setPositiveButton(R.string.ok, (d, w) -> res.complete(p.confirm(input.getText().toString())))
                    .setNegativeButton(R.string.cancel, (d, w) -> res.complete(p.dismiss()))
                    .setOnCancelListener(d -> res.complete(p.dismiss()))
                    .show();
            return res;
        }

        @Override
        public GeckoResult<PromptResponse> onChoicePrompt(GeckoSession s, ChoicePrompt p) {
            GeckoResult<PromptResponse> res = new GeckoResult<>();
            // gruppen (optgroup) flach machen, trenner und deaktivierte weglassen
            List<ChoicePrompt.Choice> flat = new ArrayList<>();
            flatten(p.choices, flat);
            CharSequence[] labels = new CharSequence[flat.size()];
            boolean[] checked = new boolean[flat.size()];
            int selected = -1;
            for (int i = 0; i < flat.size(); i++) {
                labels[i] = flat.get(i).label;
                checked[i] = flat.get(i).selected;
                if (checked[i] && selected < 0) selected = i;
            }
            AlertDialog.Builder b = dialog().setTitle(p.title).setOnCancelListener(d -> res.complete(p.dismiss()));
            if (p.type == ChoicePrompt.Type.MULTIPLE) {
                b.setMultiChoiceItems(labels, checked, (d, i, on) -> checked[i] = on)
                        .setPositiveButton(R.string.ok, (d, w) -> {
                            List<String> ids = new ArrayList<>();
                            for (int i = 0; i < flat.size(); i++) if (checked[i]) ids.add(flat.get(i).id);
                            res.complete(p.confirm(ids.toArray(new String[0])));
                        })
                        .setNegativeButton(R.string.cancel, (d, w) -> res.complete(p.dismiss()));
            } else {
                b.setSingleChoiceItems(labels, selected, (d, i) -> {
                    res.complete(p.confirm(flat.get(i)));
                    d.dismiss();
                });
            }
            b.show();
            return res;
        }

        private void flatten(ChoicePrompt.Choice[] list, List<ChoicePrompt.Choice> out) {
            if (list == null) return;
            for (ChoicePrompt.Choice c : list) {
                if (c.items != null) flatten(c.items, out);
                else if (!c.separator && !c.disabled) out.add(c);
            }
        }

        // farbfeld der seite, etwa im ytx theme: palette plus eingabe als hex
        @Override
        public GeckoResult<PromptResponse> onColorPrompt(GeckoSession s, ColorPrompt p) {
            GeckoResult<PromptResponse> res = new GeckoResult<>();
            ColorPicker picker = new ColorPicker(MainActivity.this, p.defaultValue);
            dialog().setTitle(p.title != null ? p.title : getString(R.string.pick_color)).setView(picker.view())
                    .setPositiveButton(R.string.ok, (d, w) -> res.complete(p.confirm(picker.value())))
                    .setNegativeButton(R.string.cancel, (d, w) -> res.complete(p.dismiss()))
                    .setOnCancelListener(d -> res.complete(p.dismiss()))
                    .show();
            return res;
        }

        // dateiauswahl, etwa fuer den import von profilen und musikdaten
        @Override
        public GeckoResult<PromptResponse> onFilePrompt(GeckoSession s, FilePrompt p) {
            if (pendingFile != null) pendingFile.complete(pendingFilePrompt.dismiss());
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
            if (p.type == FilePrompt.Type.MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            pendingFile = new GeckoResult<>();
            pendingFilePrompt = p;
            try {
                startActivityForResult(pick, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                pendingFile.complete(p.dismiss());
            }
            return pendingFile;
        }

        @Override
        public GeckoResult<PromptResponse> onSharePrompt(GeckoSession s, SharePrompt p) {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            String text = p.uri != null ? p.uri : p.text;
            if (p.text != null && p.uri != null && !p.text.isEmpty()) text = p.text + "\n" + p.uri;
            send.putExtra(Intent.EXTRA_TEXT, text);
            if (p.title != null) send.putExtra(Intent.EXTRA_SUBJECT, p.title);
            try {
                startActivity(Intent.createChooser(send, getString(R.string.share)));
                return GeckoResult.fromValue(p.confirm(SharePrompt.Result.SUCCESS));
            } catch (ActivityNotFoundException e) {
                return GeckoResult.fromValue(p.confirm(SharePrompt.Result.FAILURE));
            }
        }
    }

    // ---------- zurueck ----------

    private void setupBack() {
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (fullscreen) session.exitFullScreen();
        else if (canGoBack) session.goBack();
        // kein verlauf mehr, aber nicht auf der startseite: erst dorthin, dann erst app schliessen
        // spielt etwas, wuerde das neue laden der startseite die wiedergabe abbrechen
        else if (playing.isEmpty() && currentUrl != null && !currentUrl.replaceAll("[?#].*$", "").replaceAll("/+$", "").equals(homeUrl().replaceAll("/+$", ""))) session.loadUri(homeUrl());
        else moveTaskToBack(true);
    }

    // ---------- leisten, farbe, vollbild ----------

    private void setupEdgeToEdge() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                if (fullscreen) {
                    v.setPadding(0, 0, 0, 0);
                } else {
                    Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                    v.setPadding(i.left, i.top, i.right, i.bottom);
                }
                return WindowInsets.CONSUMED;
            });
        }
    }

    private void setFullscreen(boolean full) {
        fullscreen = full;
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                if (full) {
                    c.hide(WindowInsets.Type.systemBars());
                    c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                } else {
                    c.show(WindowInsets.Type.systemBars());
                }
            }
            root.requestApplyInsets();
        } else {
            legacyFullscreen(w, full);
        }
        if (!full) {
            watchOrientation(false);
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @SuppressWarnings("deprecation")
    private static void legacyFullscreen(Window w, boolean full) {
        View d = w.getDecorView();
        d.setSystemUiVisibility(full
                ? View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                : 0);
    }

    // farbe der seite (ytx theme) fuer status- und navigationsleiste
    @Override
    public void onTheme(String bg, String host) {
        if (!ownsHost(host)) return;
        Matcher m = RGB.matcher(bg == null ? "" : bg);
        if (!m.find()) return;
        int r = Integer.parseInt(m.group(1));
        int g = Integer.parseInt(m.group(2));
        int b = Integer.parseInt(m.group(3));
        int color = Color.rgb(r, g, b);
        boolean light = (0.299 * r + 0.587 * g + 0.114 * b) > 160;
        runOnUiThread(() -> applyBarColor(color, light));
    }

    @SuppressWarnings("deprecation")
    private void applyBarColor(int color, boolean light) {
        root.setBackgroundColor(color);
        Window w = getWindow();
        if (Build.VERSION.SDK_INT < 35) {
            w.setStatusBarColor(color);
            w.setNavigationBarColor(color);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            if (c != null) c.setSystemBarsAppearance(light ? mask : 0, mask);
        } else {
            View d = w.getDecorView();
            int flags = d.getSystemUiVisibility();
            flags = light ? flags | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : flags & ~(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            d.setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onUpdated(String version) {
        runOnUiThread(() -> Toast.makeText(this, getString(R.string.updated, version), Toast.LENGTH_LONG).show());
    }
}
