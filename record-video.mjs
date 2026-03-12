// record-video.mjs — High-quality frame capture + ffmpeg compilation
// Captures PNG screenshots at 30fps, then stitches with ffmpeg for perfect quality
// Usage: node record-video.mjs
// Output: chart-demo.mp4

import { chromium } from "playwright";
import { mkdirSync, rmSync, readdirSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const PORT = 3001;
const URL = `http://localhost:${PORT}/chart-light.html`;
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const FRAMES_DIR = "./frames";

// Clean & create frames dir
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

let frameNum = 0;

async function captureFrames(page, durationMs) {
  const count = Math.ceil(durationMs / FRAME_MS);
  for (let i = 0; i < count; i++) {
    const name = String(frameNum++).padStart(5, "0");
    await page.screenshot({ path: join(FRAMES_DIR, `${name}.png`), type: "png" });
  }
}

// Capture frames while performing an action over time
async function captureWhile(page, durationMs, actionFn) {
  const endTime = Date.now() + durationMs;
  if (actionFn) await actionFn();
  while (Date.now() < endTime) {
    const name = String(frameNum++).padStart(5, "0");
    await page.screenshot({ path: join(FRAMES_DIR, `${name}.png`), type: "png" });
  }
}

// Smooth scroll with frame capture
async function smoothZoom(page, deltaPerStep, steps, centerX, centerY) {
  await page.mouse.move(centerX, centerY);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, deltaPerStep);
    const name = String(frameNum++).padStart(5, "0");
    await page.screenshot({ path: join(FRAMES_DIR, `${name}.png`), type: "png" });
    // Small delay to let Three.js render
    await page.waitForTimeout(16);
  }
}

// Smooth pan with frame capture
async function smoothPan(page, startX, startY, endX, endY, steps) {
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "middle" });
  const dx = (endX - startX) / steps;
  const dy = (endY - startY) / steps;
  for (let i = 0; i <= steps; i++) {
    await page.mouse.move(startX + dx * i, startY + dy * i);
    const name = String(frameNum++).padStart(5, "0");
    await page.screenshot({ path: join(FRAMES_DIR, `${name}.png`), type: "png" });
    await page.waitForTimeout(16);
  }
  await page.mouse.up({ button: "middle" });
}

console.log("Launching browser...");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2, // 2x resolution → 2800x1800 frames
});
const page = await context.newPage();

console.log(`Navigating to ${URL}...`);
await page.goto(URL, { waitUntil: "networkidle" });

// === CHOREOGRAPHY ===

// 0-3s: Page loads, SMS auto-selected (500ms timer in HTML), auto-rotate
console.log("0-3s: Page loads, SMS auto-selected, auto-rotate");
await page.waitForTimeout(600); // let SMS auto-click fire
await captureFrames(page, 3000);

// 3-5s: Hold on SMS results
console.log("3-5s: Viewing SMS results — embeddings fail on acronym");
await captureFrames(page, 2000);

// 5-7s: Zoom in smoothly
console.log("5-7s: Zoom in");
await smoothZoom(page, -30, 40, 700, 450);
await captureFrames(page, 500);

// 7-8s: Zoom back out
console.log("7-8s: Zoom back out");
await smoothZoom(page, 25, 30, 700, 450);
await captureFrames(page, 500);

// 8-10s: Click UZF
console.log("8-10s: Click UZF");
await page.click('button[data-query="UZF"]');
await captureFrames(page, 2000);

// 10-12s: Click "groundwater recharge" — embeddings work
console.log("10-12s: Click 'groundwater recharge'");
await page.click('button[data-query="groundwater recharge"]');
await captureFrames(page, 2000);

// 12-14s: Pan around
console.log("12-14s: Pan around");
await smoothPan(page, 700, 450, 850, 350, 40);
await captureFrames(page, 500);

// 14-16s: Click "unsaturated zone flow" — embeddings nail it
console.log("14-16s: Click 'unsaturated zone flow'");
await page.click('button[data-query="unsaturated zone flow"]');
await captureFrames(page, 2000);

// 16-18s: Zoom in on results
console.log("16-18s: Zoom in on results");
await smoothZoom(page, -25, 35, 700, 450);
await captureFrames(page, 500);

// 18-20s: Zoom out + final auto-rotate beauty shot
console.log("18-20s: Final zoom out + auto-rotate");
await smoothZoom(page, 30, 35, 700, 450);
await captureFrames(page, 1500);

await context.close();
await browser.close();

const totalFrames = readdirSync(FRAMES_DIR).length;
console.log(`\nCaptured ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s at ${FPS}fps)`);

// Compile with ffmpeg
console.log("Compiling with ffmpeg...");
const ffmpegCmd = [
  "ffmpeg", "-y",
  "-framerate", String(FPS),
  "-i", `${FRAMES_DIR}/%05d.png`,
  "-c:v", "libx264",
  "-preset", "slow",        // better compression
  "-crf", "18",              // high quality (lower = better, 18 is visually lossless)
  "-pix_fmt", "yuv420p",     // LinkedIn compatibility
  "-vf", "scale=1400:900",   // downscale from 2x to 1x for crisp result
  "chart-demo.mp4",
].join(" ");

execSync(ffmpegCmd, { stdio: "inherit", cwd: process.cwd() });

// Clean up frames
rmSync(FRAMES_DIR, { recursive: true, force: true });

console.log("\nDone! chart-demo.mp4 is ready.");
