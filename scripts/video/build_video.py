#!/usr/bin/env python3
"""Assemble the silent captioned demo video (+ a music version with the CC BY credit, loudnorm -16 LUFS).
Same pipeline/style as n8n-automation-hub: 1280x720, 120 px caption band under the screen, gradient title cards.
Inputs: tmp/video/scene_*.webm + times.json from `node scripts/video/record.mjs`. Uses system ffmpeg + Pillow."""
import json, os, re, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
V = os.path.join(ROOT, "tmp", "video"); PROFILE = "/home/usuario/Documentos/Projects/portfolio-profile"
OUTDIR = os.path.join(PROFILE, "videos"); MUSIC = os.path.join(PROFILE, "showreel", "music.mp3")
W, H, FPS, BAND = 1280, 720, 25, 120
FB, FR = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
CREDIT = 'Music: "Wallpaper" by Kevin MacLeod (incompetech.com), CC BY 4.0'
REPO = "github.com/alfiochoa/market-desk"
f = lambda p, s: ImageFont.truetype(p, s)
TIMES = json.load(open(os.path.join(V, "times.json")))


def sh(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: print(" ".join(map(str, cmd))[:300], "\n", r.stderr[-1800:], file=sys.stderr); raise SystemExit(1)
    return r.stderr


def fit(d, text, path, size, maxw):
    while size > 12 and d.textlength(text, font=f(path, size)) > maxw: size -= 1
    return f(path, size)


def caption_png(name, title, sub):
    im = Image.new("RGB", (W, BAND), (15, 23, 42)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 8, BAND], fill=(45, 212, 191))
    d.text((40, 20), title, font=fit(d, title, FB, 34, W - 80), fill=(255, 255, 255))
    d.text((40, 70), sub, font=fit(d, sub, FR, 22, W - 80), fill=(186, 200, 220))
    p = os.path.join(V, f"cap_{name}.png"); im.save(p); return p


def gradient(w, h):
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * .6 + y / h * .4); px[x, y] = (int(17 + 14 * t), int(22 + 40 * t), int(40 + 62 * t))
    return im


def card_png(name, lines, small=None, credit=None):
    im = gradient(W, H); d = ImageDraw.Draw(im)
    fonts = [fit(d, t, p, s, W - 180) for t, p, s, c, g in lines]
    total = sum(fo.size + g for fo, (_, _, _, _, g) in zip(fonts, lines)); y = (H - total) / 2 - 10
    for fo, (t, p, s, c, g) in zip(fonts, lines):
        d.text(((W - d.textlength(t, font=fo)) / 2, y), t, font=fo, fill=c); y += fo.size + g
    if small:
        fo = fit(d, small, FR, 18, W - 160); d.text(((W - d.textlength(small, font=fo)) / 2, H - 64), small, font=fo, fill=(148, 163, 184))
    if credit:
        fo = fit(d, credit, FR, 17, W - 160); d.text(((W - d.textlength(credit, font=fo)) / 2, H - 100), credit, font=fo, fill=(148, 163, 184))
    p = os.path.join(V, f"card_{name}.png"); im.save(p); return p


def seg_card(png, dur, out):
    sh(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-t", f"{dur}", "-i", png, "-vf",
        f"fps={FPS},fade=t=in:d=0.4,fade=t=out:st={dur-0.4}:d=0.4,format=yuv420p", "-c:v", "libx264", "-crf", "18", out])


def seg_screen(src, speed, dur, caps, out):
    """caps: [(start, end, title, sub)] in OUTPUT seconds. Screen is 1280x600 on top, caption band below: captions never cover content."""
    ins = ["-i", src]; chain = [f"[0:v]setpts=PTS/{speed},fps={FPS},scale={W}:{H-BAND}:flags=lanczos,pad={W}:{H}:0:0:color=0x0f172a[b0]"]
    for i, (a, b, t, s) in enumerate(caps, 1):
        ins += ["-i", caption_png(os.path.basename(out)[:-4] + str(i), t, s)]
        chain.append(f"[b{i-1}][{i}:v]overlay=0:{H-BAND}:enable='between(t,{a},{b})'[b{i}]")
    chain.append(f"[b{len(caps)}]fade=t=in:d=0.3,fade=t=out:st={dur-0.3}:d=0.3,format=yuv420p[v]")
    sh(["ffmpeg", "-v", "error", "-y", *ins, "-filter_complex", ";".join(chain), "-map", "[v]", "-t", f"{dur}", "-c:v", "libx264", "-crf", "18", "-preset", "medium", out])


def join(parts, out):
    lst = os.path.join(V, "list.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    sh(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])
    return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]) or 0) if False else \
        float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out], capture_output=True, text=True).stdout)


def clip(name, caps, out):
    """Trim the page-load lead-in, measure the length, and overlay the captions."""
    src = os.path.join(V, f"scene_{name}.webm"); ss = max(TIMES[name] - 0.3, 0)
    trimmed = os.path.join(V, f"trim_{name}.mp4")
    sh(["ffmpeg", "-v", "error", "-y", "-ss", f"{ss:.2f}", "-i", src, "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", trimmed])
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", trimmed], capture_output=True, text=True).stdout)
    caps = [(a, min(b, dur - 0.3), t, s) for a, b, t, s in caps]
    seg_screen(trimmed, 1.0, round(dur - 0.05, 2), caps, out)
    return dur


def build(music):
    P = lambda n: os.path.join(V, n)
    WHITE, SLATE, TEAL = (255, 255, 255), (203, 213, 225), (45, 212, 191)
    hook = card_png("hook", [("Market dashboards fail quietly.", FB, 54, WHITE, 26),
                             ("One API rate-limits. A feed has no CORS headers.", FR, 28, SLATE, 8),
                             ("A panel goes blank, or looks live when it is not.", FR, 28, SLATE, 0)])
    end = card_png("end_music" if music else "end", [("Demo / educational data", FB, 52, WHITE, 30),
                                                    ("Alfredo Ochoa | AI Automation & Data Integration", FB, 30, TEAL, 22),
                                                    (REPO, FR, 30, SLATE, 0)],
                   small="Free: GitHub Pages + Actions. Not investment advice. Equities: end-of-day + delayed intraday (priority symbols), never real-time.", credit=CREDIT if music else None)
    segs = []
    def add(name, fn): out = P(f"seg_{name}.mp4"); fn(out); segs.append(out)
    add("a_hook", lambda o: seg_card(hook, 4.5, o))
    add("b_overview", lambda o: clip("overview", [(0.2, 99, "Nine widgets, one static page", "Chart, crypto, FX, macro, equities, news, portfolio, heatmap")], o))
    add("c_palette", lambda o: clip("palette", [(0.2, 9.4, "Ctrl+K: any symbol, any widget", "Equities, crypto and FX in two keystrokes"),
                                                 (9.6, 99, "Indicators written and tested in-house", "SMA, EMA, Bollinger, RSI, MACD checked against published values")], o))
    add("d_badges", lambda o: clip("badges", [(0.2, 99, "Every panel states its source", "LIVE, CACHED or SNAPSHOT, with the as-of time")], o))
    add("e_outage", lambda o: clip("outage", [(0.2, 99, "Provider down? The panel says so", "Recorded with the live APIs blocked: widgets fall back to snapshots")], o))
    add("f_portfolio", lambda o: clip("portfolio", [(0.2, 5.4, "Heatmap by daily % change", "Equity data is end-of-day; delayed, not real-time"),
                                                     (5.6, 99, "Portfolio P&L, stored only in your browser", "Average cost, realized and unrealized, on end-of-day closes")], o))
    add("g_end", lambda o: seg_card(end, 6.0, o))
    final = P("video_music_noaudio.mp4" if music else "video_silent.mp4"); dur = join(segs, final)
    name = "market-desk-music.mp4" if music else "market-desk.mp4"; dst = os.path.join(OUTDIR, name)
    if not music:
        sh(["ffmpeg", "-v", "error", "-y", "-i", final, "-c", "copy", "-an", "-movflags", "+faststart", dst])
    else:
        base = ["ffmpeg", "-hide_banner", "-y", "-t", f"{dur:.3f}", "-i", MUSIC]
        log = sh(base + ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"])
        m = json.loads(re.search(r"\{.*\}", log, re.S).group(0))
        ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:"
              f"measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        a = P("music.m4a")
        sh(base + ["-af", f"{ln},aresample=48000,afade=t=in:st=0:d=1.5,afade=t=out:st={dur-2.5:.3f}:d=2.5", "-ac", "2", "-c:a", "aac", "-b:a", "192k", a])
        sh(["ffmpeg", "-v", "error", "-y", "-i", final, "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", dst])
    print(name, f"{dur:.1f}s")


if __name__ == "__main__":
    build(False); build(True)
