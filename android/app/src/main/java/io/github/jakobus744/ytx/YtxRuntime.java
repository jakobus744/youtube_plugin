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
import org.mozilla.geckoview.WebExtension;

// eine gecko engine fuer beide icons, ytx als eingebaute erweiterung
final class YtxRuntime {

    private static Context appContext;
    private static final String TAG = "ytx";
    static final String EXT_URI = "resource://android/assets/ytx/";
    static final String EXT_ID = "ytx@jakobus744.github.io";

    interface Listener {
        void onTheme(String bg, String host);
        void onUpdated(String version);
        void onApp(String action);
    }

    private static GeckoRuntime runtime;
    private static Listener listener;

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
        runtime.getWebExtensionController()
                .ensureBuiltIn(EXT_URI, EXT_ID)
                .accept(YtxRuntime::onExtension, e -> Log.e(TAG, "erweiterung nicht installiert", e));
        return runtime;
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
