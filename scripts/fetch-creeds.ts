import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TREE_URL = 'https://api.github.com/repos/NonlinearFruit/Creeds.json/git/trees/master?recursive=1';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/NonlinearFruit/Creeds.json/master/';

type TreeEntry = {
  path: string;
  type: string;
};

async function main() {
  const outputDir = path.resolve(process.cwd(), 'data-source', 'creeds');
  await mkdir(outputDir, { recursive: true });

  const treeResponse = await fetch(TREE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!treeResponse.ok) {
    throw new Error(`Failed to read repository tree (${treeResponse.status})`);
  }

  const treePayload = (await treeResponse.json()) as { tree?: TreeEntry[] };
  const creedFiles = (treePayload.tree ?? []).filter((entry) => entry.type === 'blob' && /^creeds\/.*\.json$/.test(entry.path));

  let written = 0;

  for (const file of creedFiles) {
    const sourceUrl = `${RAW_BASE_URL}${file.path}`;
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${file.path} (${response.status})`);
    }

    const text = await response.text();
    const fileName = path.basename(file.path);
    const destination = path.join(outputDir, fileName);
    await writeFile(destination, text, 'utf8');
    written += 1;
  }

  console.log(`Fetched ${written} creed files into ${outputDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
