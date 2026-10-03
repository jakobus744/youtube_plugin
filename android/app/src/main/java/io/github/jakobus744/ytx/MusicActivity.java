package io.github.jakobus744.ytx;

// zweites icon fuer youtube music, eigene aufgabe in der app uebersicht, gleiche engine
public class MusicActivity extends MainActivity {

    @Override
    protected String homeUrl() {
        return "https://music.youtube.com/";
    }

    @Override
    protected String prefsName() {
        return "music";
    }

    @Override
    protected boolean ownsHost(String host) {
        return host != null && host.startsWith("music.");
    }
}
