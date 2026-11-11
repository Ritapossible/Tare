"""Female voice-over for the demo, one WAV per narration line, with Kokoro (open source, runs locally).

    python3 video/voice.py <buildDir> <modelDir> [voice] [speed]

Writes <buildDir>/audio/<scene>-<n>.wav. Subtitles keep the script's spelling; SAY maps the few words
a speech model would misread to how they are spoken.
"""
import json, re, sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

SAY = {
    r"\bx402\b": "x four oh two",
    r"\bSERV\b": "Serve",
    r"\bPieverse\b": "Pie-verse",
    r"\bKite testnet\b": "Kite test-net",
}


def spoken(text: str) -> str:
    for pattern, said in SAY.items():
        text = re.sub(pattern, said, text)
    return text


def main() -> None:
    build, models = Path(sys.argv[1]), Path(sys.argv[2])
    voice = sys.argv[3] if len(sys.argv) > 3 else "af_heart"
    speed = float(sys.argv[4]) if len(sys.argv) > 4 else 0.95
    script = json.loads((Path(__file__).parent / "script.json").read_text())
    tts = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    out = build / "audio"
    out.mkdir(parents=True, exist_ok=True)
    total = 0.0
    for scene in script["scenes"]:
        for i, line in enumerate(scene["lines"], 1):
            samples, rate = tts.create(spoken(line), voice=voice, speed=speed, lang="en-us")
            samples = np.asarray(samples, dtype=np.float32)
            # trim leading/trailing near-silence so timing follows the words, keep a short tail
            loud = np.where(np.abs(samples) > 0.01)[0]
            if loud.size:
                samples = samples[max(0, loud[0] - int(0.03 * rate)): loud[-1] + int(0.12 * rate)]
            sf.write(out / f"{scene['id']}-{i}.wav", samples, rate)
            total += len(samples) / rate
            print(f"{scene['id']}-{i}: {len(samples) / rate:.2f} s  {spoken(line)}")
    print(f"{total:.1f} s of narration, voice {voice}, speed {speed}")


if __name__ == "__main__":
    main()
