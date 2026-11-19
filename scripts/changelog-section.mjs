#!/usr/bin/env node
// Print the CHANGELOG.md section for one version (used as GitHub Release notes).
//   node scripts/changelog-section.mjs 1.0.0
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
	console.error('usage: changelog-section.mjs <version>');
	process.exit(2);
}
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split('\n');
const start = lines.findIndex((l) =>
	new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?`).test(l)
);
if (start < 0) {
	console.error(`CHANGELOG.md has no section for ${version}`);
	process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
if (end < 0) end = lines.length;
const body = lines
	.slice(start + 1, end)
	.filter((l) => !/^\[.*\]:\s*http/.test(l))
	.join('\n')
	.trim();
console.log(body);
