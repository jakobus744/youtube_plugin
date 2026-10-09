package io.github.jakobus744.ytx;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

// android startet verknuepfungen mit "aufgabe leeren", das wuerde die laufende wiedergabe beenden
// diese unsichtbare zwischenstation holt stattdessen die vorhandene app nach vorne
public class ShortcutActivity extends Activity {

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri data = getIntent() != null ? getIntent().getData() : null;
        boolean music = data != null && data.getHost() != null && data.getHost().startsWith("music.");
        Intent i = new Intent(this, music ? MusicActivity.class : MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String path = data != null ? data.getPath() : null;
        // startseite heisst nur oeffnen, sonst die seite laden
        if (data == null || path == null || path.isEmpty() || path.equals("/")) i.setAction(Intent.ACTION_MAIN);
        else i.setAction(Intent.ACTION_VIEW).setData(data);
        startActivity(i);
        finish();
    }
}
