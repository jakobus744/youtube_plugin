// css custom properties vererben sich in shadow dom, daher greifen youtube tokens und themes
export const PANEL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.panel {
  --bg: var(--yt-sys-color-baseline--menu-background, #212121);
  --bg2: var(--yt-sys-color-baseline--raised-background, #2a2a2a);
  --fg: var(--yt-sys-color-baseline--text-primary, #f1f1f1);
  --fg2: var(--yt-sys-color-baseline--text-secondary, #aaa);
  --line: var(--yt-sys-color-baseline--outline, rgba(255,255,255,.12));
  --hover: var(--yt-sys-color-baseline--additive-background, rgba(255,255,255,.08));
  --accent: var(--yt-sys-color-baseline--call-to-action, #3ea6ff);
  --ok: #3fb950; --warn: #d29922; --fail: #f85149; --skip: #6e7681;
  position: fixed; z-index: 2250; top: 64px; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px));
  display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
  font: 400 13px/1.4 Roboto, "Segoe UI", Arial, sans-serif; color: var(--fg); background: var(--bg);
  box-shadow: 0 8px 40px rgba(0,0,0,.45); border: 1px solid var(--line);
}
.panel[hidden] { display: none; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
header .logo { font-weight: 700; font-size: 15px; letter-spacing: .02em; }
header select { flex: 1; min-width: 0; }
.iconbtn { width: 30px; height: 30px; border: 0; border-radius: 50%; background: none; color: var(--fg2); cursor: pointer; font-size: 16px; }
.iconbtn:hover { background: var(--hover); color: var(--fg); }
nav { display: flex; gap: 2px; padding: 6px 8px; overflow-x: auto; border-bottom: 1px solid var(--line); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
nav::-webkit-scrollbar { height: 6px; }
nav::-webkit-scrollbar-track { background: transparent; }
nav::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
nav::-webkit-scrollbar-thumb:hover { background: var(--fg2); }
nav button { flex: none; padding: 6px 10px; border: 0; border-radius: 8px; background: none; color: var(--fg2); cursor: pointer; font: 500 12px/1.2 inherit; font-family: inherit; }
nav button:hover { background: var(--hover); color: var(--fg); }
nav button[aria-selected="true"] { background: var(--fg); color: var(--bg); }
main { flex: 1; overflow: auto; padding: 10px 12px 20px; }
footer { padding: 6px 12px; border-top: 1px solid var(--line); color: var(--fg2); font-size: 11px; display: flex; justify-content: space-between; gap: 8px; }
h3 { margin: 16px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--fg2); }
h3:first-child { margin-top: 4px; }
details { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; background: var(--bg2); }
details > summary { list-style: none; cursor: pointer; padding: 8px 10px; font-weight: 500; display: flex; align-items: center; gap: 8px; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: '▸'; color: var(--fg2); transition: transform .15s; }
details[open] > summary::before { transform: rotate(90deg); }
details > summary .count { margin-left: auto; color: var(--fg2); font-weight: 400; font-size: 11px; }
details > .body { padding: 2px 10px 8px; }
.row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); }
details .row:first-child, .card .row:first-child { border-top: 0; }
.row .label { flex: 1; min-width: 0; }
.row .label small { display: block; color: var(--fg2); font-size: 11px; margin-top: 1px; }
.row.stack { flex-direction: column; align-items: stretch; gap: 6px; }
.badge { display: inline-block; padding: 0 6px; border-radius: 6px; font-size: 10px; line-height: 16px; vertical-align: 1px; margin-left: 4px; background: var(--hover); color: var(--fg2); }
.badge.radical { background: rgba(248,81,73,.15); color: var(--fail); }
.badge.hits { min-width: 18px; text-align: center; }
.badge.hits.zero { opacity: .45; }
.seg { display: inline-flex; flex: none; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.seg button { border: 0; padding: 4px 8px; background: none; color: var(--fg2); cursor: pointer; font: 500 11px/1.2 inherit; font-family: inherit; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button:hover { background: var(--hover); color: var(--fg); }
.seg button[aria-pressed="true"] { background: var(--accent); color: #fff; }
.seg button[aria-pressed="true"][data-mode="hide"] { background: var(--fail); }
.seg button[aria-pressed="true"][data-mode="dim"] { background: var(--warn); color: #111; }
.seg button[aria-pressed="true"][data-mode="collapse"] { background: #8957e5; }
.seg button[aria-pressed="true"][data-mode="show"] { background: var(--hover); color: var(--fg); }
select, input[type="text"], input[type="number"], input[type="search"], textarea {
  font: inherit; color: var(--fg); background: var(--bg2); border: 1px solid var(--line); border-radius: 8px; padding: 5px 8px; min-width: 0; }
select:focus, input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
textarea { width: 100%; min-height: 64px; resize: vertical; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
input[type="number"] { width: 90px; }
input[type="search"] { width: 100%; }
input[type="color"] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer; }
input[type="range"] { width: 130px; accent-color: var(--accent); }
.val { width: 58px; text-align: right; color: var(--fg2); font-variant-numeric: tabular-nums; font-size: 12px; }
.val.set { color: var(--fg); font-weight: 500; }
.switch { position: relative; flex: none; width: 34px; height: 20px; border-radius: 10px; border: 0; background: var(--line); cursor: pointer; transition: background .15s; }
.switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s; }
.switch[aria-checked="true"] { background: var(--accent); }
.switch[aria-checked="true"]::after { transform: translateX(14px); }
.btn { border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; background: var(--bg2); color: var(--fg); cursor: pointer; font: 500 12px/1.2 inherit; font-family: inherit; }
.btn:hover { background: var(--hover); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.danger { color: var(--fail); }
.btn.tiny { padding: 2px 6px; font-size: 11px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.reset { border: 0; background: none; color: var(--fg2); cursor: pointer; font-size: 13px; padding: 2px 4px; visibility: hidden; }
.reset.on { visibility: visible; }
.reset:hover { color: var(--fg); }
.chips { display: flex; flex-wrap: wrap; gap: 4px; }
.chip { border: 1px solid var(--line); border-radius: 12px; padding: 3px 9px; background: none; color: var(--fg2); cursor: pointer; font: 500 11px/1.2 inherit; font-family: inherit; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.card { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; background: var(--bg2); }
.card > .head { display: flex; align-items: center; gap: 8px; padding: 9px 10px; }
.card > .head .title { flex: 1; font-weight: 500; }
.card > .desc { padding: 0 10px 6px; color: var(--fg2); font-size: 12px; }
.card > .settings { padding: 0 10px 8px; }
.status { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-top: 1px solid var(--line); }
.status:first-child { border-top: 0; }
.dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; background: var(--skip); }
.dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.fail { background: var(--fail); }
.status .txt { flex: 1; min-width: 0; }
.status .txt small { display: block; color: var(--fg2); font-size: 11px; word-break: break-word; }
.summary { display: flex; gap: 12px; margin: 4px 0 8px; font-size: 12px; }
.summary span b { font-size: 15px; margin-right: 3px; }
.muted { color: var(--fg2); font-size: 12px; }
.hint { color: var(--fg2); font-size: 11px; margin: 4px 0; }
.err { color: var(--fail); font-size: 11px; }
.orderlist { display: flex; flex-direction: column; gap: 4px; margin: 6px 0; }
.orderlist .item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--line); border-radius: 8px; }
.orderlist .item span { flex: 1; }
.profiles .row .label b { font-weight: 500; }
.kbd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; padding: 3px 8px; min-width: 90px; text-align: center; }
.kbd.rec { outline: 2px solid var(--accent); }
.log { font-family: ui-monospace, Consolas, monospace; font-size: 11px; white-space: pre-wrap; word-break: break-word; color: var(--fg2); max-height: 200px; overflow: auto; }
`
