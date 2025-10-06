/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require('child_process');
const { readdir: _readdir, rmdir: _rmdir, stat: _stat, unlink: _unlink } = require('fs');
const { join } = require('path');
const { promisify } = require('util');

const readdir = promisify(_readdir);
const stat = promisify(_stat);
const unlink = promisify(_unlink);
const rmdir = promisify(_rmdir);

async function rm(p) {
  try {
    const stats = await stat(p);
    if (stats.isDirectory()) {
      await rmdir(p, { recursive: true });
    } else {
      await unlink(p);
    }
  } catch {}
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function compressWithUPX(dir) {
  return new Promise((resolve) => {
    const test = spawn('upx', ['-V'], { stdio: 'ignore', shell: true });
    let hasUPX = true;

    test.on('error', () => {
      hasUPX = false;

      resolve();
    });

    test.on('exit', async () => {
      if (!hasUPX) return resolve();

      try {
        const files = await readdir(dir);
        const exe = files.filter((f) => f.endsWith('.exe'));
        const dll = files.filter((f) => f.endsWith('.dll') && !['ffmpeg.dll', 'd3dcompiler_47.dll', 'vulkan-1.dll'].includes(f));

        const toCompress = [...exe, ...dll];

        for (const file of toCompress) {
          const filePath = join(dir, file);
          await new Promise((resolveCompress) => {
            const pr = spawn('upx', ['--best', '--lzma', filePath], {
              stdio: 'ignore',
              shell: true,
            });
            pr.on('exit', () => {
              resolveCompress();
            });
            pr.on('error', () => resolveCompress());
          });
        }
      } catch {}

      resolve();
    });
  });
}

async function getDirectorySize(dirPath) {
  let totalSize = 0;
  try {
    const walk = async (dir) => {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
          await walk(fullPath);
        } else {
          totalSize += stats.size;
        }
      }
    };
    await walk(dirPath);
  } catch {}
  return totalSize;
}

module.exports = async (ctx) => {
  const out = ctx.appOutDir;

  await getDirectorySize(out);

  const keep = new Set(['en-US.pak', 'fr.pak']);
  const locales = join(out, 'locales');
  if (await exists(locales)) {
    const entries = await readdir(locales);
    const toDelete = entries.filter((f) => !keep.has(f));
    await Promise.all(toDelete.map((f) => rm(join(locales, f))));
  }

  await rm(join(out, 'swiftshader'));
  await rm(join(out, 'vk_swiftshader'));
  await rm(join(out, 'vk_swiftshader.dll'));

  await rm(join(out, 'pdf_viewer_resources.pak'));
  await rm(join(out, 'LICENSES.chromium.html'));

  await rm(join(out, 'inspector'));

  const purge = async (p) => {
    try {
      const items = await readdir(p);
      await Promise.all(
        items.map(async (it) => {
          const fp = join(p, it);
          const stats = await stat(fp);
          if (stats.isDirectory()) {
            return purge(fp);
          }
          if (/\.(map|pdb)$/.test(it)) {
            return rm(fp);
          }
        }),
      );
    } catch {}
  };
  await purge(out);

  const optionalFiles = ['snapshot_blob.bin', 'chrome_200_percent.pak', 'gen_file_info.json', 'vulkan-1.dll'];

  for (const file of optionalFiles) {
    await rm(join(out, file));
  }

  await compressWithUPX(out);

  await getDirectorySize(out);
};
