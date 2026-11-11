# Demo video

`tare-demo.mp4` (1:50, 1080p, not committed) is built entirely from this folder:

| Step | Command | What it does |
|---|---|---|
| 1 | `python3 video/voice.py <build> <kokoro model dir> af_heart 0.95` | Female voice-over, one WAV per line of `script.json`, with [Kokoro](https://github.com/thewh1teagle/kokoro-onnx) (open source, runs locally) |
| 2 | `node video/timing.mjs <build>` | Line timings from the voice (or estimates before it exists) |
| 3 | `npm run app` (TARE_PAYMENT_RAIL=x402-direct), then `node video/record.cjs <build> all` | Records each scene from Chrome at 1600x900: slides, the live console (real Kite testnet payments), the receipt page, a fresh agent's real CLI output and the live check page |
| 4 | `node video/assemble.mjs <build> <build>/tare-demo.mp4` | Desktop browser frame on white, crossfades, voice, burned-in subtitles; also writes the `.srt` |

Every hash in the video is a real Kite testnet settlement, the same run published on the site. The
wait while a payment settles is shortened on screen, and the video says so.
