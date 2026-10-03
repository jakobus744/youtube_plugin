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
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;
import org.mozilla.geckoview.OrientationController;

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

    private FrameLayout root;
    private GeckoView view;
    private GeckoSession session;
    private boolean canGoBack;
    private boolean fullscreen;
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

        session = new GeckoSession(new GeckoSessionSettings.Builder()
                .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
                .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
                .build());
        installDelegates();
        session.open(runtime);
        view.setSession(session);

        String url = urlFrom(getIntent());
        if (url == null) url = lastUrl();
        session.loadUri(url != null ? url : homeUrl());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = urlFrom(intent);
        if (url != null) session.loadUri(url);
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (session != null) session.setActive(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        YtxRuntime.setListener(this);
        if (session != null) session.setFocused(true);
        // vollbild videos duerfen das handy drehen
        YtxRuntime.get(this).getOrientationController().setDelegate(new OrientationController.OrientationDelegate() {
            @Override
            public GeckoResult<AllowOrDeny> onOrientationLock(int orientation) {
                runOnUiThread(() -> setRequestedOrientation(orientation));
                return GeckoResult.allow();
            }

            @Override
            public void onOrientationUnlock() {
                runOnUiThread(() -> setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED));
            }
        });
    }

    @Override
    protected void onPause() {
        if (session != null) session.setFocused(false);
        super.onPause();
    }

    @Override
    protected void onStop() {
        if (session != null) session.setActive(false);
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (session != null) session.close();
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

    private void installDelegates() {
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override
            public void onCanGoBack(GeckoSession s, boolean value) {
                canGoBack = value;
            }

            @Override
            public void onLocationChange(GeckoSession s, String url, List<ContentPermission> perms, Boolean hasUserGesture) {
                currentUrl = url;
                if (url != null && url.startsWith("https://")) prefs().edit().putString("lastUrl", url).putLong("lastAt", System.currentTimeMillis()).apply();
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
                setFullscreen(full);
            }

            @Override
            public void onCrash(GeckoSession s) {
                Toast.makeText(MainActivity.this, R.string.crashed, Toast.LENGTH_SHORT).show();
                restart();
            }

            @Override
            public void onKill(GeckoSession s) {
                restart();
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
        session.close();
        session = new GeckoSession(new GeckoSessionSettings.Builder()
                .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
                .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
                .build());
        installDelegates();
        session.open(YtxRuntime.get(this));
        view.setSession(session);
        session.loadUri(url);
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
        if (!full) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
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
