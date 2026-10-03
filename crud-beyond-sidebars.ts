import fs from 'node:fs';
import path from 'node:path';
import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const blogDirectory = path.join(process.cwd(), 'blog');
const blogFilenamePattern = /^(\d{4}-\d{2}-\d{2}-.+)\.(?:md|mdx)$/;

function readFrontMatter(source: string) {
  return source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function readTitle(frontMatter: string) {
  const value = frontMatter.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? '';
  return value
    .replace(/^(['"])(.*)\1$/, '$2')
    .replace(/^CRUD 之外\s*[-—：:]\s*/, '');
}

function hasTag(frontMatter: string, expectedTag: string) {
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
      .includes(expectedTag);
  }

  for (const line of lines.slice(tagsLineIndex + 1)) {
    if (/^\S/.test(line)) {
      break;
    }
    if (line.match(/^\s+-\s+(.+)$/)?.[1]?.trim() === expectedTag) {
      return true;
    }
  }

  return false;
}

const crudBeyondPosts = fs
  .readdirSync(blogDirectory)
  .flatMap((filename) => {
    const id = filename.match(blogFilenamePattern)?.[1];
    if (!id) {
      return [];
    }

    const frontMatter = readFrontMatter(
      fs.readFileSync(path.join(blogDirectory, filename), 'utf8'),
    );
    if (!hasTag(frontMatter, 'crud')) {
      return [];
    }

    return [{type: 'doc' as const, id, label: readTitle(frontMatter)}];
  })
  .sort((left, right) => {
    const leftIsIntro = left.id.endsWith('-crud-beyond-intro');
    const rightIsIntro = right.id.endsWith('-crud-beyond-intro');
    return Number(rightIsIntro) - Number(leftIsIntro) || left.id.localeCompare(right.id);
  });

const sidebars: SidebarsConfig = {
  crudBeyondSidebar: crudBeyondPosts,
};

export default sidebars;
