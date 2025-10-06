import { createCanvas } from 'canvas';
import decodeIco from 'decode-ico';
import fs from 'fs';
import GIFEncoder from 'gifencoder';
import path from 'path';

function parseAni(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Format ANI invalide (pas de signature RIFF)');
  }

  const frames = [];
  const rates = [];
  let seq = [];
  let numFrames = 0;

  let offset = 12;
  while (offset < buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = buffer.slice(offset + 8, offset + 8 + size);

    if (chunkId === 'anih') {
      numFrames = data.readUInt32LE(8);
    } else if (chunkId === 'icon') {
      frames.push(data);
    } else if (chunkId === 'LIST') {
      const listType = data.toString('ascii', 0, 4);
      if (listType === 'fram') {
        let subOffset = 4;
        while (subOffset + 8 <= data.length) {
          const subChunkId = data.toString('ascii', subOffset, subOffset + 4);
          const subSize = data.readUInt32LE(subOffset + 4);
          const subData = data.slice(subOffset + 8, subOffset + 8 + subSize);
          if (subChunkId === 'icon') {
            frames.push(subData);
          }
          subOffset += 8 + subSize + (subSize % 2);
        }
      }
    } else if (chunkId === 'rate') {
      for (let i = 0; i < size; i += 4) {
        rates.push(data.readUInt32LE(i));
      }
    } else if (chunkId === 'seq ') {
      for (let i = 0; i < size; i += 4) {
        seq.push(data.readUInt32LE(i));
      }
    }

    offset += 8 + size + (size % 2);
  }

  if (seq.length === 0) {
    seq = frames.length > 0 ? frames.map((_, i) => i) : Array.from({ length: numFrames }, (_, i) => i);
  }

  if (rates.length === 0) {
    rates.push(...new Array(seq.length).fill(6));
  }

  return { frames, seq, rates, numFrames };
}

async function aniToGif(aniPath, gifPath) {
  const buffer = fs.readFileSync(aniPath);
  const { frames: embeddedFrames, seq, rates } = parseAni(buffer);

  let frames = [];
  if (embeddedFrames.length > 0) {
    frames = embeddedFrames;
  } else {
    const dir = path.dirname(aniPath);
    const icoFiles = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.ico'));
    if (icoFiles.length === 0) {
      throw new Error('Aucun fichier .ico trouvé à côté du .ani (mode externe)');
    }
    icoFiles.sort();
    frames = icoFiles.map((f) => fs.readFileSync(path.join(dir, f)));
  }

  const decodedFrames = [];
  for (const buf of frames) {
    const imgs = await decodeIco(buf);
    if (!imgs || imgs.length === 0) continue;
    const best = imgs.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a), imgs[0]);
    decodedFrames.push(best);
  }

  if (decodedFrames.length === 0) throw new Error('Aucune image ICO décodée');

  const width = Math.max(...decodedFrames.map((d) => d.width));
  const height = Math.max(...decodedFrames.map((d) => d.height));

  const encoder = new GIFEncoder(width, height);
  // Ensure output directory exists
  try {
    fs.mkdirSync(path.dirname(gifPath), { recursive: true });
  } catch {}

  const out = fs.createWriteStream(gifPath);
  encoder.createReadStream().pipe(out);
  encoder.start();

  const TRANSPARENT_COLOR = 0xff00ff;
  try {
    encoder.setTransparent(TRANSPARENT_COLOR);
  } catch {
    // ignore if not supported
  }
  encoder.setRepeat(0);
  encoder.setQuality(10);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < seq.length; i++) {
    const frameIdx = seq[i] % decodedFrames.length;
    const frame = decodedFrames[frameIdx];

    const src = frame.data;
    const w = frame.width;
    const h = frame.height;
    const outBuf = new Uint8ClampedArray(w * h * 4);
    const bgR = 255,
      bgG = 0,
      bgB = 255;
    for (let p = 0, q = 0; p < src.length; p += 4, q += 4) {
      const r = src[p],
        g = src[p + 1],
        b = src[p + 2],
        a = src[p + 3] / 255;
      if (a === 0) {
        outBuf[q] = bgR;
        outBuf[q + 1] = bgG;
        outBuf[q + 2] = bgB;
        outBuf[q + 3] = 255;
      } else if (a === 1) {
        outBuf[q] = r;
        outBuf[q + 1] = g;
        outBuf[q + 2] = b;
        outBuf[q + 3] = 255;
      } else {
        outBuf[q] = Math.round(r * a + bgR * (1 - a));
        outBuf[q + 1] = Math.round(g * a + bgG * (1 - a));
        outBuf[q + 2] = Math.round(b * a + bgB * (1 - a));
        outBuf[q + 3] = 255;
      }
    }

    const imgData = ctx.createImageData(frame.width, frame.height);
    imgData.data.set(outBuf);
    ctx.clearRect(0, 0, width, height);
    ctx.putImageData(imgData, 0, 0);

    const delay = (rates[i] ?? 6) * (1000 / 60);
    encoder.setDelay(delay);
    encoder.addFrame(ctx);
  }

  encoder.finish();
  // Wait for stream to finish writing
  return new Promise((resolve, reject) => {
    out.on('finish', () => {
      resolve();
    });
    out.on('error', (err) => reject(err));
  });
}

// Support pour traitement en lot (mode parallèle)
if (process.argv[2] === '--batch') {
  const batchFile = process.argv[3];
  if (!batchFile) {
    console.error('Usage: node ani-to-gif.mjs --batch batch.json');
    process.exit(1);
  }

  const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  const promises = batch.map(({ input, output }) =>
    aniToGif(input, output)
      .then(() => console.log(`✓ Conversion terminée: ${output}`))
      .catch((err) => {
        console.error(`✗ Erreur pour ${input}:`, err.message);
        return null;
      }),
  );

  Promise.all(promises)
    .then(() => console.log('Toutes les conversions terminées'))
    .catch(() => process.exit(2));
} else {
  // Mode original (un seul fichier)
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('Usage: node ani-to-gif.mjs input.ani output.gif');
    console.error('   ou: node ani-to-gif.mjs --batch batch.json');
    process.exit(1);
  }

  aniToGif(input, output)
    .then(() => console.log(`Conversion terminée: ${output}`))
    .catch((err) => {
      console.error('Erreur pendant la conversion :', err && err.message ? err.message : err);
      process.exit(2);
    });
}
