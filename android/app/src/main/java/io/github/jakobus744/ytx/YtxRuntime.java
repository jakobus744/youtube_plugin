package io.github.jakobus744.ytx;

import android.content.Context;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import org.json.JSONObject;
import org.mozilla.geckoview.GeckoPreferenceController;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.WebExtension;
import org.mozilla.geckoview.WebExtensionController;

// eine gecko engine fuer beide icons, ytx als eingebaute erweiterung
final class YtxRuntime {

    private static Context appContext;
    private static final String TAG = "ytx";
    static final String EXT_URI = "resource://android/assets/ytx/";
    static final String EXT_ID = "ytx@jakobus744.github.io";
    // werbeblocker, von mozilla signiert und von dort geladen
    static final String ADBLOCK_ID = "uBlock0@raymondhill.net";
    private static final long ADBLOCK_SETTLE_MS = 500;
    static final String ADBLOCK_URL = "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi";

    interface Listener {
        void onTheme(String bg, String host);
        void onUpdated(String version);
        void onApp(String action);
    }

    private static GeckoRuntime runtime;
    private static Listener listener;
    private static boolean adblockReady;
    private static final java.util.List<Runnable> adblockWaiting = new java.util.ArrayList<>();
    private static final Handler main = new Handler(Looper.getMainLooper());

    private YtxRuntime() {}

    static synchronized GeckoRuntime get(Context ctx) {
        if (runtime != null) return runtime;
        GeckoRuntimeSettings settings = new GeckoRuntimeSettings.Builder()
                .consoleOutput(BuildConfig.DEBUG)
                .aboutConfigEnabled(false)
                .build();
        appContext = ctx.getApplicationContext();
        runtime = GeckoRuntime.create(appContext, settings);
        // das lange Druecken loest sonst nach einer halben Sekunde das Kontextmenue aus und danach kommen keine Touch Bewegungen mehr an, die Vorschau braucht sie zum Spulen
        GeckoPreferenceController.setGeckoPref("ui.click_hold_context_menus.delay", 6000, GeckoPreferenceController.PREF_BRANCH_USER)
                .accept(v -> Log.i(TAG, "long press delay gesetzt"), e -> Log.e(TAG, "long press delay", e));
        // zurueck soll auch eintraege nehmen, die die seite ohne tippen angelegt hat (music: player zuklappen)
        GeckoPreferenceController.setGeckoPref("browser.navigation.requireUserInteraction", false, GeckoPreferenceController.PREF_BRANCH_USER)
                .accept(v -> Log.i(TAG, "zurueck ohne tippen erlaubt"), e -> Log.e(TAG, "requireUserInteraction", e));
        runtime.getWebExtensionController()
                .ensureBuiltIn(EXT_URI, EXT_ID)
                .accept(YtxRuntime::onExtension, e -> Log.e(TAG, "erweiterung nicht installiert", e));
        ensureAdblock(runtime.getWebExtensionController());
        return runtime;
    }

    // die erste seite erst laden, wenn der werbeblocker laeuft, sonst fehlen ihr seine skripte bis zum naechsten neuladen
    static void whenAdblockReady(Runnable r, long maxMs) {
        if (adblockReady) {
            r.run();
            return;
        }
        adblockWaiting.add(r);
        main.postDelayed(() -> {
            if (adblockWaiting.remove(r)) r.run();
        }, maxMs);
    }

    private static void markAdblockReady() {
        adblockReady = true;
        java.util.List<Runnable> all = new java.util.ArrayList<>(adblockWaiting);
        adblockWaiting.clear();
        for (Runnable r : all) r.run();
    }

    // beim ersten start installieren, danach nur nach updates schauen
    private static void ensureAdblock(WebExtensionController c) {
        c.setAddonManagerDelegate(new WebExtensionController.AddonManagerDelegate() {
            @Override
            public void onReady(WebExtension ext) {
                if (!ADBLOCK_ID.equals(ext.id)) return;
                Log.i(TAG, "werbeblocker bereit");
                // kurz warten, bis er seine filter geladen hat
                main.postDelayed(YtxRuntime::markAdblockReady, ADBLOCK_SETTLE_MS);
            }
        });
        c.setPromptDelegate(new WebExtensionController.PromptDelegate() {
            @Override
            public GeckoResult<WebExtension.PermissionPromptResponse> onInstallPromptRequest(WebExtension ext, String[] permissions, String[] origins, String[] dataCollection) {
                boolean ok = ADBLOCK_ID.equals(ext.id);
                return GeckoResult.fromValue(new WebExtension.PermissionPromptResponse(ok, false, false));
            }

            @Override
            public GeckoResult<AllowOrDeny> onUpdatePrompt(WebExtension ext, String[] permissions, String[] origins, String[] dataCollection) {
                return GeckoResult.fromValue(ADBLOCK_ID.equals(ext.id) ? AllowOrDeny.ALLOW : AllowOrDeny.DENY);
            }
        });
        c.list().accept(list -> {
            if (list != null) {
                for (WebExtension e : list) {
                    if (!ADBLOCK_ID.equals(e.id)) continue;
                    c.update(e).accept(u -> Log.i(TAG, u == null ? "werbeblocker aktuell" : "werbeblocker aktualisiert"), err -> Log.e(TAG, "werbeblocker update", err));
                    return;
                }
            }
            c.install(ADBLOCK_URL).accept(e -> Log.i(TAG, "werbeblocker installiert " + (e == null ? "" : e.metaData.version)), err -> Log.e(TAG, "werbeblocker nicht installiert", err));
        }, err -> Log.e(TAG, "erweiterungen nicht lesbar", err));
    }

    // die zuletzt sichtbare activity bekommt farbe und update hinweise
    static void setListener(Listener l) {
        listener = l;
    }

    private static void onExtension(WebExtension ext) {
        if (ext == null) return;
        ext.setMessageDelegate(new WebExtension.MessageDelegate() {
            @Override
            public GeckoResult<Object> onMessage(String nativeApp, Object message, WebExtension.MessageSender sender) {
                if (!(message instanceof JSONObject)) return null;
                JSONObject m = (JSONObject) message;
                String type = m.optString("t");
                if ("clip".equals(type)) {
                    String text = m.optString("text");
                    new Handler(Looper.getMainLooper()).post(() -> {
                        ClipboardManager cm = (ClipboardManager) appContext.getSystemService(Context.CLIPBOARD_SERVICE);
                        if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("ytx", text));
                    });
                    return null;
                }
                if ("app".equals(type)) {
                    Listener target = listener;
                    if (target != null) target.onApp(m.optString("a"));
                    return null;
                }
                if ("log".equals(type)) {
                    Log.i("ytx-page", m.optString("text"));
                    return null;
                }
                Listener l = listener;
                if (l == null) return null;
                String t = m.optString("t");
                if ("theme".equals(t)) l.onTheme(m.optString("bg"), m.optString("host"));
                else if ("updated".equals(t)) l.onUpdated(m.optString("version"));
                return null;
            }
        }, "ytx");
    }
}
