// Runs the unit tests. On Windows, a terminal that reports the drive letter in lower case (c:\...)
// makes the test runner load itself twice and find no tests, so the working directory is normalised first.
import { spawnSync } from 'node:child_process';

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
