package io.github.jakobus744.ytx;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.GridLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;

import java.util.Locale;

// farbauswahl fuer <input type="color">, gecko zeichnet keine eigene
// palette zum antippen, regler fuer helligkeit und ein hex feld
final class ColorPicker {

    private static final String[] PALETTE = {
            "#0f0f0f", "#212121", "#3a3a3a", "#606060", "#aaaaaa", "#f1f1f1",
            "#1a1625", "#2b2340", "#5b3b8c", "#9b5de5", "#c77dff", "#ff8fd8",
            "#0d1b2a", "#1b263b", "#3ea6ff", "#065fd4", "#4cc9f0", "#80ffdb",
            "#0b2014", "#2d6a4f", "#52b788", "#b7e4c7", "#e9c46a", "#f4a261",
            "#3d0c11", "#9d0208", "#e63946", "#ff0033", "#ff7b00", "#ffd60a"
    };

    private final Context ctx;
    private final LinearLayout root;
    private final View preview;
    private final EditText hex;
    private final SeekBar light;
    private int base;
    private boolean updating;

    ColorPicker(Context ctx, String initial) {
        this.ctx = ctx;
        base = parse(initial, Color.BLACK);
        root = new LinearLayout(ctx);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        root.setPadding(pad, dp(8), pad, 0);

        preview = new View(ctx);
        root.addView(preview, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(44)));

        GridLayout grid = new GridLayout(ctx);
        grid.setColumnCount(6);
        for (String c : PALETTE) {
            View sw = new View(ctx);
            GradientDrawable d = new GradientDrawable();
            d.setShape(GradientDrawable.OVAL);
            d.setColor(Color.parseColor(c));
            d.setStroke(dp(1), 0x40FFFFFF);
            sw.setBackground(d);
            sw.setOnClickListener(v -> set(Color.parseColor(c), true));
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = dp(36);
            lp.height = dp(36);
            lp.setMargins(dp(4), dp(4), dp(4), dp(4));
            grid.addView(sw, lp);
        }
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        glp.gravity = Gravity.CENTER_HORIZONTAL;
        glp.topMargin = dp(12);
        root.addView(grid, glp);

        // farbflaeche: links nach rechts der farbton, oben blass und unten kraeftig
        Spectrum spectrum = new Spectrum(ctx);
        LinearLayout.LayoutParams splp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(130));
        splp.topMargin = dp(12);
        root.addView(spectrum, splp);

        // 0 dunkel, 100 hell, 50 ist die gewaehlte farbe
        light = new SeekBar(ctx);
        light.setMax(100);
        light.setProgress(50);
        light.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int v, boolean user) { if (user) show(shade(base, v), false); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        slp.topMargin = dp(12);
        root.addView(light, slp);

        hex = new EditText(ctx);
        hex.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        hex.setSingleLine(true);
        hex.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) {}
            @Override public void afterTextChanged(Editable e) {
                if (updating) return;
                int c = parse(e.toString(), Integer.MIN_VALUE);
                if (c != Integer.MIN_VALUE) set(c, false);
            }
        });
        root.addView(hex, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        set(base, true);
    }

    View view() {
        return root;
    }

    String value() {
        return format(current);
    }

    private int current;

    private void set(int c, boolean writeHex) {
        base = c;
        light.setProgress(50);
        show(c, writeHex);
    }

    private void show(int c, boolean writeHex) {
        current = c;
        GradientDrawable d = new GradientDrawable();
        d.setCornerRadius(dp(10));
        d.setColor(c);
        d.setStroke(dp(1), 0x40FFFFFF);
        preview.setBackground(d);
        if (writeHex || !hex.hasFocus()) {
            updating = true;
            hex.setText(format(c));
            hex.setSelection(hex.getText().length());
            updating = false;
        }
    }

    private final class Spectrum extends View {
        private final android.graphics.Bitmap bmp;
        private final android.graphics.Rect dst = new android.graphics.Rect();

        Spectrum(Context c) {
            super(c);
            int w = 360;
            int h = 120;
            bmp = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888);
            float[] hsv = new float[3];
            for (int x = 0; x < w; x++) {
                for (int y = 0; y < h; y++) {
                    hsv[0] = x;
                    hsv[1] = 0.1f + 0.9f * y / (h - 1);
                    hsv[2] = 1f;
                    bmp.setPixel(x, y, Color.HSVToColor(hsv));
                }
            }
        }

        @Override
        protected void onDraw(android.graphics.Canvas canvas) {
            dst.set(0, 0, getWidth(), getHeight());
            canvas.drawBitmap(bmp, null, dst, null);
        }

        @Override
        public boolean onTouchEvent(android.view.MotionEvent e) {
            getParent().requestDisallowInterceptTouchEvent(true);
            float fx = Math.max(0f, Math.min(1f, e.getX() / Math.max(1, getWidth())));
            float fy = Math.max(0f, Math.min(1f, e.getY() / Math.max(1, getHeight())));
            float[] hsv = {fx * 359f, 0.1f + 0.9f * fy, 1f};
            set(Color.HSVToColor(hsv), true);
            return true;
        }
    }

    private static int shade(int c, int v) {
        float t = (v - 50) / 50f;
        int target = t < 0 ? Color.BLACK : Color.WHITE;
        float k = Math.abs(t);
        return Color.rgb(mix(Color.red(c), Color.red(target), k), mix(Color.green(c), Color.green(target), k), mix(Color.blue(c), Color.blue(target), k));
    }

    private static int mix(int a, int b, float k) {
        return Math.round(a + (b - a) * k);
    }

    private static int parse(String s, int fallback) {
        if (s == null) return fallback;
        String t = s.trim();
        if (!t.startsWith("#")) t = "#" + t;
        if (!t.matches("#[0-9a-fA-F]{6}")) return fallback;
        return Color.parseColor(t);
    }

    private static String format(int c) {
        return String.format(Locale.ROOT, "#%06x", c & 0xFFFFFF);
    }

    private int dp(int v) {
        return Math.round(v * ctx.getResources().getDisplayMetrics().density);
    }
}
