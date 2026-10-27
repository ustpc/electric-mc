// Prints the ID Chrome gives an unpacked extension loaded from a folder: the
// first 32 hex digits of the SHA-256 of its absolute path, with 0-f spelled a-p.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';

export function unpackedId(path) {
  const hex = createHash('sha256').update(path).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

if (process.argv[2]) console.log(unpackedId(realpathSync(process.argv[2])));
