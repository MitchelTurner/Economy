/**
 * CLI: score extraction fixtures under data/extraction-fixtures.
 * Usage: npx tsx src/extraction/run-eval.ts
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { ExtractionProvider } from './extraction.provider';
import { ExtractionResultSchema } from './extraction.schema';
import { scoreExtraction } from './eval-score';

/** Placeholder 1×1 JPEGs are not real labeled photos (SPEC §13). */
function isRealPhoto(imagePath: string | undefined): boolean {
  if (!imagePath) return false;
  try {
    return statSync(imagePath).size >= 2048;
  } catch {
    return false;
  }
}

async function main() {
  const root = resolve(__dirname, '../../../../data/extraction-fixtures');
  const provider = new ExtractionProvider(
    new ConfigService({
      EXTRACTION_PROVIDER: process.env.EXTRACTION_PROVIDER ?? 'mock',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      EXTRACTION_MODEL: process.env.EXTRACTION_MODEL,
    }),
  );

  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();

  let ok = 0;
  let realPhotos = 0;
  let mockOnly = 0;
  for (const id of dirs) {
    const dir = join(root, id);
    const expectedPath = join(dir, 'expected.json');
    if (!existsSync(expectedPath)) continue;
    const expected = ExtractionResultSchema.parse(
      JSON.parse(readFileSync(expectedPath, 'utf8')),
    );
    const imagePath = ['image.jpg', 'image.jpeg', 'image.png', 'image.webp']
      .map((f) => join(dir, f))
      .find((p) => existsSync(p));
    const real = isRealPhoto(imagePath);
    if (real) realPhotos += 1;
    else mockOnly += 1;

    // Mock scoring always uses fixture:<id> scenarios so placeholder JPEGs
    // still map to canned receipts. Live Anthropic path uses the photo bytes.
    const providerMode = process.env.EXTRACTION_PROVIDER ?? 'mock';
    const useMock =
      providerMode === 'mock' ||
      (!process.env.ANTHROPIC_API_KEY && providerMode !== 'anthropic');
    const bytes =
      useMock || !imagePath
        ? Buffer.from(`fixture:${id}`)
        : readFileSync(imagePath);

    const { result } = await provider.extract(bytes);
    const score = scoreExtraction(expected, result);
    const pass =
      score.lineRecall >= 0.9 &&
      score.linePrecision >= 0.9 &&
      score.totalAccuracy;
    if (pass) ok += 1;
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${id}  [${real ? 'real-photo' : 'mock'}] recall=${score.lineRecall.toFixed(2)} precision=${score.linePrecision.toFixed(2)} total=${score.totalAccuracy} store=${score.storeNameOk}`,
    );
  }

  console.log(`\n${ok}/${dirs.length} fixtures passed (≥0.9 P/R + total ±2¢)`);
  console.log(
    `Corpus status (SPEC §13): ${realPhotos} real photo(s), ${mockOnly} mock/synthetic — target ~30 real.`,
  );
  if (ok < dirs.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
