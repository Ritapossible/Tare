// Narration timing for every line of video/script.json.
//
//   node video/timing.mjs [buildDir]
//
// If the voice-over exists (buildDir/audio/<scene>-<n>.wav), each line lasts as long as its audio.
// Otherwise the length is estimated at a calm speaking pace, so the video can be built and checked
// before the voice is recorded; running this again after the voice exists re-times everything.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const build = process.argv[2] ?? join(here, "build");
const WORDS_PER_SECOND = 2.55; // calm, clear narration
const GAP = 0.35; // breath between lines

export function estimate(text) {
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / WORDS_PER_SECOND + 0.25) * 100) / 100;
}

function audioSeconds(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim();
  return Number(out);
}

const script = JSON.parse(readFileSync(join(here, "script.json"), "utf8"));
const timing = { source: null, scenes: [] };
let voiced = 0;
let total = 0;
for (const scene of script.scenes) {
  const lines = scene.lines.map((text, i) => {
    const wav = join(build, "audio", `${scene.id}-${i + 1}.wav`);
    const has = existsSync(wav);
    if (has) voiced++;
    const seconds = has ? audioSeconds(wav) : estimate(text);
    return { text, seconds, gap: GAP, audio: has ? wav : null };
  });
  const speech = lines.reduce((s, l) => s + l.seconds + l.gap, 0);
  timing.scenes.push({ id: scene.id, kind: scene.kind, seller: scene.seller ?? null, afterPayment: scene.afterPayment ?? null, lines, speech: Math.round(speech * 100) / 100 });
  total += speech;
}
const allLines = script.scenes.reduce((n, s) => n + s.lines.length, 0);
timing.source = voiced === allLines ? "voice" : voiced ? "partial voice" : "estimate";
mkdirSync(build, { recursive: true });
writeFileSync(join(build, "timing.json"), JSON.stringify(timing, null, 2));
console.log(`timing from ${timing.source}: ${timing.scenes.length} scenes, ${allLines} lines, about ${Math.round(total)} s of narration`);
for (const s of timing.scenes) console.log(`  ${s.id.padEnd(12)} ${s.speech.toFixed(1)} s`);
