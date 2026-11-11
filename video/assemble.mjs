// Builds the final video from recorded frames, the timing plan and (when present) the voice-over.
//
//   node video/assemble.mjs <buildDir> <out.mp4>
//
// - Frames become a constant 30 fps clip per scene. While a payment settles the page is static, so
//   that wait is shortened to WAIT_KEEP seconds and marked on screen ("waiting shortened").
// - Each scene lasts at least as long as its narration (the last frame is held if needed).
// - Scenes are joined with short crossfades; subtitles are burned in (ASS, Inter); voice lines are
//   placed at the same times as their subtitles.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const BUILD = process.argv[2];
const OUT = process.argv[3] ?? join(BUILD, "tare-demo.mp4");
const FPS = 30, XFADE = 0.5, LEAD = 0.45, WAIT_KEEP = 1.1;
const timing = JSON.parse(readFileSync(join(BUILD, "timing.json"), "utf8"));
const run = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
mkdirSync(join(BUILD, "clips"), { recursive: true });

// ---------- 1. frames → clip per scene ----------
const clips = [];
for (const scene of timing.scenes) {
  const dir = join(BUILD, "rec", scene.id);
  if (!existsSync(join(dir, "frames.json"))) throw new Error(`scene ${scene.id} not recorded`);
  const { frames, markers } = JSON.parse(readFileSync(join(dir, "frames.json"), "utf8"));
  const t0 = markers.find((m) => m.name === "start").t, t1 = markers.find((m) => m.name === "end").t;
  // waits to shorten: [wait-start + WAIT_KEEP, wait-end - 0.15]
  const cuts = [];
  markers.forEach((m, i) => {
    if (m.name !== "wait-start") return;
    const end = markers.slice(i).find((x) => x.name === "wait-end");
    if (end && end.t - m.t > WAIT_KEEP + 0.4) cuts.push([m.t + WAIT_KEEP, end.t - 0.15]);
  });
  const removed = (t) => cuts.reduce((s, [a, b]) => s + (t <= a ? 0 : Math.min(t, b) - a), 0);
  const inCut = (t) => cuts.some(([a, b]) => t > a && t < b);
  // timeline of (file, start) in output seconds
  const pts = [];
  let last = frames.filter((f) => f.t <= t0).at(-1) ?? frames[0];
  pts.push({ file: last.file, at: 0 });
  for (const f of frames) {
    if (f.t <= t0 || f.t > t1 || inCut(f.t)) continue;
    pts.push({ file: f.file, at: f.t - t0 - removed(f.t) });
  }
  const length = t1 - t0 - removed(t1);
  let list = "";
  for (let i = 0; i < pts.length; i++) {
    const d = Math.max(1 / FPS, (i + 1 < pts.length ? pts[i + 1].at : length) - pts[i].at);
    list += `file '${pts[i].file}'\nduration ${d.toFixed(4)}\n`;
  }
  list += `file '${pts.at(-1).file}'\n`;
  const listFile = join(BUILD, "clips", `${scene.id}.txt`);
  writeFileSync(listFile, list);
  const need = Math.max(length, scene.speech + LEAD + 0.6);
  const clip = join(BUILD, "clips", `${scene.id}.mp4`);
  run(["-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p,tpad=stop_mode=clone:stop_duration=${Math.max(0, need - length + 0.1).toFixed(2)}`,
    "-t", need.toFixed(2), "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", String(FPS), clip]);
  clips.push({ id: scene.id, file: clip, duration: probe(clip), cuts: cuts.map(([a, b]) => [a - t0 - removed(a), b - a]) });
}

// ---------- 2. join with crossfades; scene start times ----------
let filter = "", prev = "0:v", offset = 0;
const starts = [0];
for (let i = 1; i < clips.length; i++) {
  offset += clips[i - 1].duration - XFADE;
  starts.push(offset);
  const out = i === clips.length - 1 ? "vj" : `x${i}`;
  filter += `[${prev}][${i}:v]xfade=transition=fade:duration=${XFADE}:offset=${offset.toFixed(3)}[${out}];`;
  prev = out;
}
const total = offset + clips.at(-1).duration;

// ---------- 3. subtitles (ASS) + voice placement ----------
const ts = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = (s % 60).toFixed(2).padStart(5, "0"); return `${h}:${String(m).padStart(2, "0")}:${sec}`; };
let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Inter Display,46,&H00F6F6F6,&H000000FF,&H00000000,&H9E000000,0,0,0,0,100,100,0,0,4,0,0,2,180,180,64,1
Style: Note,JetBrains Mono,26,&H00A3A3A3,&H000000FF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,4,0,0,9,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const voice = [];
timing.scenes.forEach((scene, i) => {
  let t = starts[i] + LEAD;
  for (const line of scene.lines) {
    ass += `Dialogue: 0,${ts(t)},${ts(t + line.seconds + 0.1)},Sub,,0,0,0,,${line.text.replace(/\n/g, " ")}\n`;
    if (line.audio) voice.push({ file: line.audio, at: t });
    t += line.seconds + line.gap;
  }
  for (const [at, cut] of clips[i].cuts) {
    ass += `Dialogue: 1,${ts(starts[i] + at)},${ts(starts[i] + at + 2.2)},Note,,0,0,0,,waiting for settlement shortened by ${cut.toFixed(1)} s\n`;
  }
});
const assFile = join(BUILD, "subtitles.ass");
writeFileSync(assFile, ass);
// plain SRT too, for players and uploads
let srt = "", n = 1;
for (const l of ass.split("\n").filter((l) => l.startsWith("Dialogue: 0,"))) {
  const [, start, end] = l.split(",");
  const toSrt = (x) => { const [h, m, s] = x.split(":"); const [sec, cs] = s.split("."); return `${h.padStart(2, "0")}:${m}:${sec.padStart(2, "0")},${cs}0`; };
  srt += `${n++}\n${toSrt(start)} --> ${toSrt(end)}\n${l.split(",,0,0,0,,")[1]}\n\n`;
}
writeFileSync(OUT.replace(/\.mp4$/, ".srt"), srt);

// ---------- 4. render ----------
const inputs = clips.flatMap((c) => ["-i", c.file]);
let afilter = "", amix = "";
voice.forEach((v, k) => {
  inputs.push("-i", v.file);
  afilter += `[${clips.length + k}:a]adelay=${Math.round(v.at * 1000)}|${Math.round(v.at * 1000)},aformat=channel_layouts=stereo[a${k}];`;
  amix += `[a${k}]`;
});
const vf = `${filter}[vj]subtitles=${assFile}:fontsdir=/usr/share/fonts[v]`;
if (!voice.length) inputs.push("-f", "lavfi", "-t", total.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo"); // silent track until the voice exists
const args = [...inputs, "-filter_complex", voice.length ? `${vf};${afilter}${amix}amix=inputs=${voice.length}:normalize=0,alimiter=limit=0.95[a]` : vf,
  "-map", "[v]", "-map", voice.length ? "[a]" : `${clips.length}:a`, "-c:a", "aac", "-b:a", "192k",
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-t", total.toFixed(2), OUT];
run(args);
console.log(`${OUT}: ${probe(OUT).toFixed(1)} s, ${clips.length} scenes, voice lines: ${voice.length}`);
