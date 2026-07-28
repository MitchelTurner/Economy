#!/usr/bin/env node
/**
 * Scaffold a SPEC §13 extraction fixture from _template.
 * Usage: node scripts/new-eval-fixture.mjs <store-slug-NN>
 * Example: node scripts/new-eval-fixture.mjs safeway-02
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const idArg = process.argv[2];
if (!idArg) {
  console.error('Usage: node scripts/new-eval-fixture.mjs <id>');
  console.error('Store coverage checklist is in data/extraction-fixtures/README.md');
  process.exit(1);
}

const id = idArg.startsWith('mock-') || idArg.startsWith('real-') ? idArg : `real-${idArg}`;
const root = resolve('data/extraction-fixtures');
const template = join(root, '_template');
const dest = join(root, id);

if (!existsSync(template)) {
  console.error('Missing _template/');
  process.exit(1);
}
if (existsSync(dest)) {
  console.error(`Already exists: ${dest}`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(join(template, 'expected.json'), join(dest, 'expected.json'));
const notes = readFileSync(join(template, 'notes.md'), 'utf8');
writeFileSync(
  join(dest, 'notes.md'),
  `# ${id}\n\n${notes}\n\nStore / date: \nPhotographed: \nLabeled by: \n`,
);
console.log(`Created ${dest}`);
console.log('Next: add image.jpg (≥2KB real photo), hand-label expected.json, run eval:extraction.');
