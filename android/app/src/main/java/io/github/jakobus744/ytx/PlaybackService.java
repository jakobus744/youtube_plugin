package io.github.jakobus744.ytx;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

// haelt die app im hintergrund am leben solange ein video oder lied spielt
// ohne diesen dienst beendet android den web prozess kurz nach dem verlassen der app
// zeigt titel und steuerung in der benachrichtigung, auf dem sperrbildschirm und fuer kopfhoerer tasten
public class PlaybackService extends Service {

    private static final String CHANNEL = "playback";
    static final String ACT_TOGGLE = "ytx.toggle";
    static final String ACT_NEXT = "ytx.next";
    static final String ACT_PREV = "ytx.prev";

    // zustand der gerade aktiven medien sitzung, gesetzt von der activity
    static volatile String title = "";
    static volatile String artist = "";
    static volatile Bitmap art;
    static volatile boolean playing;
    // wird von den tasten aufgerufen: "toggle", "next", "prev"
    static volatile java.util.function.Consumer<String> control;

    private MediaSession session;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSession(this, "ytx");
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                send("toggle");
            }

            @Override
            public void onPause() {
                send("toggle");
            }

            @Override
            public void onSkipToNext() {
                send("next");
            }

            @Override
            public void onSkipToPrevious() {
                send("prev");
            }
        });
        session.setActive(true);
    }

    private void send(String what) {
        java.util.function.Consumer<String> c = control;
        if (c != null) c.accept(what);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String act = intent != null ? intent.getAction() : null;
        if (ACT_TOGGLE.equals(act)) send("toggle");
        else if (ACT_NEXT.equals(act)) send("next");
        else if (ACT_PREV.equals(act)) send("prev");
        refresh();
        return START_NOT_STICKY;
    }

    private PendingIntent action(String act) {
        return PendingIntent.getService(this, 0, new Intent(this, PlaybackService.class).setAction(act), PendingIntent.FLAG_IMMUTABLE);
    }

    private void refresh() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, getString(R.string.playing_channel), NotificationManager.IMPORTANCE_LOW));
        String t = title.isEmpty() ? getString(R.string.playing_title) : title;
        String a = artist.isEmpty() ? getString(R.string.playing_text) : artist;
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, t)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, a)
                .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, art)
                .build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_ytx_mono)
                .setContentTitle(t)
                .setContentText(a)
                .setContentIntent(open)
                .setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, getString(R.string.playing_prev), action(ACT_PREV)).build())
                .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, getString(playing ? R.string.playing_pause : R.string.playing_play), action(ACT_TOGGLE)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, getString(R.string.playing_next), action(ACT_NEXT)).build())
                .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (art != null) b.setLargeIcon(art);
        startForeground(41, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    }

    @Override
    public void onDestroy() {
        session.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
