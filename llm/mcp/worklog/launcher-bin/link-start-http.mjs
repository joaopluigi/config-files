import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const binDirectory = join(process.cwd(), 'node_modules', '.bin');
await mkdir(binDirectory, { recursive: true });
await writeFile(
  join(binDirectory, 'start:http'),
  '#!/bin/sh\nexec node "$PWD/src/runtime/http.mjs"\n',
  { mode: 0o755 },
);
