import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const blogDirectory = path.join(projectDirectory, 'blog');
const outputDirectory = path.join(
  projectDirectory,
  '.generated',
  'crud-beyond-docs',
);

function readFrontMatter(source) {
  return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function hasCrudTag(frontMatter) {
  const lines = frontMatter.split(/\r?\n/);
  const tagsLineIndex = lines.findIndex((line) => /^tags\s*:/.test(line));
  if (tagsLineIndex === -1) {
    return false;
  }

  const inlineTags = lines[tagsLineIndex].replace(/^tags\s*:\s*/, '');
  if (inlineTags) {
    return inlineTags
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
      .includes('crud');
  }

  for (const line of lines.slice(tagsLineIndex + 1)) {
    if (/^\S/.test(line)) {
      break;
    }
    if (line.match(/^\s+-\s+(.+)$/)?.[1]?.trim() === 'crud') {
      return true;
    }
  }

  return false;
}

fs.rmSync(outputDirectory, {recursive: true, force: true});
fs.mkdirSync(outputDirectory, {recursive: true});

for (const filename of fs.readdirSync(blogDirectory)) {
  if (!/\.(?:md|mdx)$/.test(filename)) {
    continue;
  }

  const sourcePath = path.join(blogDirectory, filename);
  const source = fs.readFileSync(sourcePath, 'utf8');
  if (!hasCrudTag(readFrontMatter(source))) {
    continue;
  }

  const docsSource = filename.includes('crud-beyond-intro.')
    ? source.replace(/^---\r?\n/, '---\nslug: /\n')
    : source;
  fs.writeFileSync(path.join(outputDirectory, filename), docsSource);
}
