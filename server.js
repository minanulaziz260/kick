import express from 'express';
import helmet from 'helmet';
import { nanoid } from 'nanoid';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const MAX_SECONDS = 30;
const TMP_ROOT = path.join(os.tmpdir(), 'kick-clip-downloader');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function parseTime(input) {
  if (typeof input !== 'string') return NaN;
  const parts = input.trim().split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}

function validateKickUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  const hostOk = url.hostname === 'kick.com' || url.hostname.endsWith('.kick.com');
  const pathOk = /clip|clips|video|videos/i.test(url.pathname);
  return hostOk && pathOk;
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} gagal. ${stderr || stdout}`));
    });
  });
}

app.post('/api/download', async (req, res) => {
  const { url, start, end } = req.body || {};
  const startSec = parseTime(start);
  const endSec = parseTime(end);

  if (!validateKickUrl(url)) {
    return res.status(400).json({ error: 'Masukkan URL Kick clip/video yang valid.' });
  }
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
    return res.status(400).json({ error: 'Waktu mulai/selesai tidak valid. Contoh: 00:10 ke 00:35.' });
  }
  if (endSec - startSec > MAX_SECONDS) {
    return res.status(400).json({ error: `Durasi maksimal ${MAX_SECONDS} detik.` });
  }

  const jobId = nanoid(10);
  const workDir = path.join(TMP_ROOT, jobId);
  await fs.mkdir(workDir, { recursive: true });
  const inputTemplate = path.join(workDir, 'source.%(ext)s');
  const outputPath = path.join(workDir, `kick-cut-${jobId}.mp4`);

  try {
    await run('yt-dlp', [
      '--no-playlist',
      '--merge-output-format', 'mp4',
      '-f', 'bv*+ba/best',
      '-o', inputTemplate,
      url
    ], { cwd: workDir });

    const files = await fs.readdir(workDir);
    const source = files.find((f) => f.startsWith('source.'));
    if (!source) throw new Error('File hasil unduhan tidak ditemukan.');

    await run('ffmpeg', [
      '-y',
      '-ss', String(startSec),
      '-to', String(endSec),
      '-i', path.join(workDir, source),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath
    ]);

    res.download(outputPath, `kick-cut-${startSec}-${endSec}.mp4`, async () => {
      setTimeout(() => fs.rm(workDir, { recursive: true, force: true }), 5000);
    });
  } catch (err) {
    await fs.rm(workDir, { recursive: true, force: true });
    res.status(500).json({
      error: 'Gagal memproses video. Pastikan yt-dlp dan ffmpeg sudah terinstall, URL publik, dan coba update yt-dlp.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Kick Clip Downloader jalan di http://localhost:${PORT}`);
});
