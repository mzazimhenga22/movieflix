const path = require('path');
const fs = require('fs');

const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const projectRoot = path.resolve(__dirname, '..');
const input = 'C:/Users/mzazimhenga/Downloads/1000373064.mp4';

const outDir = path.join(projectRoot, 'assets', 'videos');
const outVideo = path.join(outDir, 'startup.mp4');
const outPoster = path.join(projectRoot, 'assets', 'images', 'splash.png');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function run() {
  if (!fs.existsSync(input)) {
    throw new Error(`Missing input video: ${input}`);
  }
  ensureDir(outDir);
  ensureDir(path.dirname(outPoster));

  await new Promise((resolve, reject) => {
    // Goal: small file size (startup animation). Keep it compatible.
    ffmpeg(input)
      .outputOptions([
        '-movflags +faststart',
        '-pix_fmt yuv420p',
        '-profile:v baseline',
        '-level 3.0',
        '-vf scale=720:-2',
        '-r 30',
        '-c:v libx264',
        '-preset veryfast',
        '-crf 30',
        '-an',
      ])
      .on('error', reject)
      .on('end', resolve)
      .save(outVideo);
  });

  await new Promise((resolve, reject) => {
    ffmpeg(outVideo)
      .outputOptions([
        '-vf scale=1242:-2',
        '-vframes 1',
      ])
      .on('error', reject)
      .on('end', resolve)
      .save(outPoster);
  });

  const inSize = fs.statSync(input).size;
  const outSize = fs.statSync(outVideo).size;
  console.log(`Compressed startup video: ${inSize} -> ${outSize} bytes`);
  console.log(`Wrote: ${path.relative(projectRoot, outVideo)}`);
  console.log(`Wrote: ${path.relative(projectRoot, outPoster)}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
