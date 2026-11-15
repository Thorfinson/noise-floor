/**
 * Reads single files out of a remote zip archive without downloading the archive: its directory sits at
 * the end and says where each file lies, so a few range requests are enough. Every answer must be the bytes
 * asked for (its Content-Range says so), and every file read must match the checksum (CRC-32) the archive's
 * directory gives for it.
 */
import { crc32, inflateRawSync } from 'node:zlib';

const UA = { 'User-Agent': 'sample-fetcher/1.0' };

export async function openZip(url) {
  const head = await fetch(url, { method: 'HEAD', headers: UA });
  const size = Number(head.headers.get('content-length'));
  if (!head.ok || !Number.isSafeInteger(size) || size < 22) throw new Error(`no size for ${url} (status ${head.status})`);
  // one request at a time and not too fast: the server asks for patience (429) otherwise
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
  const range = async (from, to) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { headers: { ...UA, Range: `bytes=${from}-${to}` } });
      if (r.status === 206) {
        // a part of the file, and exactly the part asked for: "bytes 100-199/12345"
        const said = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(r.headers.get('content-range') ?? '');
        if (!said || Number(said[1]) !== from || Number(said[2]) !== to || (said[3] !== '*' && Number(said[3]) !== size)) throw new Error(`asked for bytes ${from}-${to} of ${size}, got "${r.headers.get('content-range')}"`);
        const data = Buffer.from(await r.arrayBuffer());
        if (data.length !== to - from + 1) throw new Error(`asked for ${to - from + 1} bytes from ${from}, got ${data.length}`);
        await sleep(700);
        return data;
      }
      if (r.status !== 429 || attempt >= 5) throw new Error(`status ${r.status} for bytes ${from}-${to}`);
      await sleep(1000 * Math.min(90, Number(r.headers.get('retry-after')) || 20 * (attempt + 1)));
    }
  };
  const tail = await range(Math.max(0, size - 65536), size - 1);
  const e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (e < 0) throw new Error('not a zip archive');
  const cd = await range(tail.readUInt32LE(e + 16), tail.readUInt32LE(e + 16) + tail.readUInt32LE(e + 12) - 1);
  const files = new Map();
  for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50; ) {
    const n = cd.readUInt16LE(p + 28);
    const name = cd.toString('utf8', p + 46, p + 46 + n);
    files.set(name, { method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), csize: cd.readUInt32LE(p + 20), size: cd.readUInt32LE(p + 24), offset: cd.readUInt32LE(p + 42) });
    p += 46 + n + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }
  return {
    names: [...files.keys()],
    /** The contents of one file, checked against the archive's checksum for it. */
    async read(name) {
      const f = files.get(name);
      if (!f) throw new Error('not in the archive: ' + name);
      const local = await range(f.offset, f.offset + 29);
      if (local.readUInt32LE(0) !== 0x04034b50) throw new Error('no file header where the directory says: ' + name);
      const start = f.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const data = f.csize ? await range(start, start + f.csize - 1) : Buffer.alloc(0);
      if (f.method !== 0 && f.method !== 8) throw new Error(`cannot unpack ${name} (method ${f.method})`);
      const out = f.method === 8 ? inflateRawSync(data) : data;
      if (out.length !== f.size || crc32(out) !== f.crc) throw new Error(`${name} came out damaged (checksum or size does not match the archive's)`);
      return out;
    },
  };
}
