import { zip } from 'zip-a-folder';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

// Read manifest.config.ts as a text file
const manifestContent = readFileSync('manifest.config.ts', 'utf-8');

// Extract version using a regular expression
const versionMatch = manifestContent.match(/version:\s*['"]([^'"]+)['"]/);
if (!versionMatch) {
  throw new Error('Version not found in manifest.config.ts');
}
const version = versionMatch[1];

const dir = 'release';
const filename = `huddlellm-extension-v${version}.zip`;
const filepath = `${dir}/${filename}`;

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

// Create a zip file with .vite directory excluded
const output = createWriteStream(filepath);
const archive = archiver('zip', {
  zlib: { level: 9 } // Sets the compression level.
});

output.on('close', () => {
  console.log(`✅ Extension zipped to ${filepath}`);
  console.log(`${archive.pointer()} total bytes`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// Add all files from dist directory except .vite (both the directory entry
// itself and everything under it — some store validators choke if a
// directory entry ends up physically first in the zip, ahead of manifest.json)
archive.directory('dist', false, (entry) => {
  if (entry.name === '.vite' || entry.name.startsWith('.vite/')) {
    return false;
  }
  return entry;
});

await archive.finalize();