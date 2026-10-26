// Packs dist-portal/ into lethal-grid-portal.zip for upload to game portals. index.html sits at
// the root of the zip, which is what CrazyGames, itch.io and GameDistribution expect.
// Uses only Node's zlib, so it runs the same on macOS, Windows and Linux.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const SRC_DIR = 'dist-portal';
const OUT_FILE = 'lethal-grid-portal.zip';
// CrazyGames allows at most 1,500 files and 50 MB at first load
const MAX_FILES = 1500;
const MAX_BYTES = 50 * 1024 * 1024;

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// MS-DOS date and time, as zip headers store them
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

let files;
try {
  files = listFiles(SRC_DIR).sort();
} catch {
  console.error(`No ${SRC_DIR}/ folder. Run "npm run build:portal" first.`);
  process.exit(1);
}
if (!files.includes(join(SRC_DIR, 'index.html'))) {
  console.error(`${SRC_DIR}/index.html is missing. Run "npm run build:portal" first.`);
  process.exit(1);
}

const { time, day } = dosDateTime(new Date());
const localParts = [];
const centralParts = [];
let offset = 0;
let rawBytes = 0;

for (const file of files) {
  const name = Buffer.from(relative(SRC_DIR, file).split(sep).join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  // Already-compressed files (images, fonts) can come out bigger; store those as they are
  const stored = packed.length >= data.length;
  const body = stored ? data : packed;
  const crc = crc32(data);
  rawBytes += data.length;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 file names
  local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(stored ? 0 : 8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);

  offset += local.length + name.length + body.length;
}

const centralDir = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDir.length, 12);
end.writeUInt32LE(offset, 16);

const zip = Buffer.concat([...localParts, centralDir, end]);
writeFileSync(OUT_FILE, zip);

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`${OUT_FILE}: ${files.length} files, ${mb(rawBytes)} MB unpacked, ${mb(zip.length)} MB zipped`);
if (files.length > MAX_FILES) console.warn(`Warning: over the ${MAX_FILES}-file portal limit`);
if (rawBytes > MAX_BYTES) console.warn(`Warning: over the ${mb(MAX_BYTES)} MB portal limit`);
