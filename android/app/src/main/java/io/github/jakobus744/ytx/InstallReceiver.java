package io.github.jakobus744.ytx;

import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.widget.Toast;

// antwort des paket installers, nicht exportiert, nur unsere eigene sitzung zaehlt
public class InstallReceiver extends BroadcastReceiver {

    @Override
    @SuppressWarnings("deprecation")
    public void onReceive(Context ctx, Intent intent) {
        if (!AppUpdater.ACTION_INSTALL.equals(intent.getAction())) return;
        int session = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
        if (session < 0 || session != AppUpdater.sessionId) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm == null || !fromSystem(ctx, confirm)) return;
            confirm.removeFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(confirm);
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Toast.makeText(ctx, ctx.getString(R.string.update_failed, msg != null ? msg : String.valueOf(status)), Toast.LENGTH_LONG).show();
        }
    }

    // die bestaetigung darf nur zu einer system app fuehren, dem installer von android
    private static boolean fromSystem(Context ctx, Intent confirm) {
        PackageManager pm = ctx.getPackageManager();
        ComponentName cn = confirm.resolveActivity(pm);
        if (cn == null) return false;
        try {
            ApplicationInfo info = pm.getApplicationInfo(cn.getPackageName(), 0);
            return (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
