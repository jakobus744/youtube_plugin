package io.github.jakobus744.ytx;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

// neue app versionen kommen als github release mit apk datei
// die app fragt nach und installiert ueber den paket installer von android
final class AppUpdater {

    static final String ACTION_INSTALL = "io.github.jakobus744.ytx.INSTALL_STATUS";
    private static final String LATEST = "https://api.github.com/repos/jakobus744/youtube_plugin/releases/latest";
    private static final long EVERY = 12L * 3600 * 1000;

    // nur die zuletzt angelegte installer sitzung darf antworten
    static volatile int sessionId = -1;
    private static boolean busy;
    private static String waitingForPermission;

    private AppUpdater() {}

    // hoechstens alle 12 stunden, egal ob youtube oder music gestartet wird
    static void maybeCheck(Activity a) {
        SharedPreferences prefs = a.getSharedPreferences("app", Activity.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (busy || now - prefs.getLong("updateCheckedAt", 0) < EVERY) return;
        prefs.edit().putLong("updateCheckedAt", now).apply();
        busy = true;
        new Thread(() -> {
            try {
                JSONObject rel = new JSONObject(get(LATEST));
                String version = rel.optString("tag_name", "").replaceFirst("^v", "");
                String apk = null;
                JSONArray assets = rel.optJSONArray("assets");
                for (int i = 0; assets != null && i < assets.length(); i++) {
                    JSONObject as = assets.getJSONObject(i);
                    if (as.optString("name").endsWith(".apk")) apk = as.optString("browser_download_url");
                }
                if (apk != null && newer(version, BuildConfig.VERSION_NAME)) {
                    String url = apk;
                    a.runOnUiThread(() -> offer(a, version, url));
                }
            } catch (Exception ignored) {
                // kein netz oder noch kein release, beim naechsten mal wieder
            } finally {
                busy = false;
            }
        }).start();
    }

    private static void offer(Activity a, String version, String url) {
        if (a.isFinishing()) return;
        new AlertDialog.Builder(a, R.style.Theme_Ytx_Dialog)
                .setTitle(a.getString(R.string.update_title, version))
                .setMessage(a.getString(R.string.update_text, BuildConfig.VERSION_NAME))
                .setPositiveButton(R.string.update_install, (d, w) -> install(a, url))
                .setNegativeButton(R.string.update_later, null)
                .show();
    }

    // android fragt beim ersten mal ob ytx apps installieren darf
    static void install(Activity a, String url) {
        if (!a.getPackageManager().canRequestPackageInstalls()) {
            waitingForPermission = url;
            Toast.makeText(a, R.string.update_allow, Toast.LENGTH_LONG).show();
            a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return;
        }
        Toast.makeText(a, R.string.update_loading, Toast.LENGTH_LONG).show();
        new Thread(() -> {
            try {
                PackageInstaller pi = a.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(a.getPackageName());
                int id = pi.createSession(params);
                sessionId = id;
                try (PackageInstaller.Session s = pi.openSession(id)) {
                    HttpURLConnection c = open(url);
                    try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("ytx.apk", 0, c.getContentLengthLong())) {
                        byte[] buf = new byte[1 << 16];
                        for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
                        s.fsync(out);
                    }
                    // antwort geht an einen nicht exportierten empfaenger, nie an die offene activity
                    Intent status = new Intent(a, InstallReceiver.class).setAction(ACTION_INSTALL).setPackage(a.getPackageName());
                    PendingIntent pending = PendingIntent.getBroadcast(a, id, status, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
                    s.commit(pending.getIntentSender());
                }
            } catch (Exception e) {
                new Handler(Looper.getMainLooper()).post(() -> Toast.makeText(a, a.getString(R.string.update_failed, e.getMessage()), Toast.LENGTH_LONG).show());
            }
        }).start();
    }

    // nach der freigabe in den einstellungen weitermachen
    static void resume(Activity a) {
        String url = waitingForPermission;
        if (url != null && a.getPackageManager().canRequestPackageInstalls()) {
            waitingForPermission = null;
            install(a, url);
        }
    }

    static boolean newer(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p = i < x.length ? num(x[i]) : 0;
            int q = i < y.length ? num(y[i]) : 0;
            if (p != q) return p > q;
        }
        return false;
    }

    private static int num(String s) {
        try { return Integer.parseInt(s.replaceAll("\\D.*", "")); } catch (NumberFormatException e) { return 0; }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "ytx-app");
        return c;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = open(url);
        c.setRequestProperty("Accept", "application/vnd.github+json");
        try (InputStream in = c.getInputStream(); java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        }
    }
}
