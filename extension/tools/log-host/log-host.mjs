// Electric MC live log helper (Chrome native messaging host).
//
// Chrome starts this program when the extension, in Developer mode, connects
// to "org.electric_mc.log", and stops it when the extension disconnects.
// Chrome sends each message on stdin as a 4-byte little-endian length
// followed by that many bytes of JSON. Each one is a log entry, appended to
// the log file as one line of JSON.
//
// The file is ../../../var/electric-mc.log from here (the repository's var/,
// which git ignores), or $ELECTRIC_MC_LOG. In Developer mode the log holds
// real manuscript data, so it must stay on this computer.
//
// Registered with Chrome by `make install-log-host` (install.sh).

import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const LOG_FILE = process.env.ELECTRIC_MC_LOG || join(here, '..', '..', '..', 'var', 'electric-mc.log');
const MAX_BYTES = 20 * 1024 * 1024;

/** Splits Chrome's length-prefixed messages out of a byte stream. */
export function makeReader(onMessage) {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break;
      const body = buf.subarray(4, 4 + len).toString('utf8');
      buf = buf.subarray(4 + len);
      onMessage(body);
    }
  };
}

/** One line per entry; the old file is kept as .1 once it passes 20 MB. */
export function append(file, json) {
  mkdirSync(dirname(file), { recursive: true });
  try {
    if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
  } catch {
    /* no file yet */
  }
  let line;
  try {
    line = JSON.stringify(JSON.parse(json));
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level: 'error', source: 'log-host', event: 'unreadable message', data: json.slice(0, 200) });
  }
  appendFileSync(file, line + '\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Nothing may be written to stdout except replies to Chrome; we send none.
  process.stdin.on('data', makeReader((json) => append(LOG_FILE, json)));
  process.stdin.on('end', () => process.exit(0));
}
