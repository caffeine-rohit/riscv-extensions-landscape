import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// ---------------------------------------------------------------------------
// Helpers (mirroring sync_instructions.mjs style)
// ---------------------------------------------------------------------------

function die(message) {
  console.error(message);
  process.exit(1);
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escape = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\') {
      if (inSingle || inDouble || inTemplate) escape = true;
      continue;
    }
    if (inSingle) { if (ch === "'") inSingle = false; continue; }
    if (inDouble) { if (ch === '"') inDouble = false; continue; }
    if (inTemplate) { if (ch === '`') inTemplate = false; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }

    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return i;
  }
  return -1;
}

function extractExtensionInstructions(jsxText) {
  const marker = 'const extensionInstructions =';
  const markerIndex = jsxText.indexOf(marker);
  if (markerIndex === -1) die(`Could not find \`${marker}\` in src/risc_v_visualizer.jsx`);

  const braceStart = jsxText.indexOf('{', markerIndex);
  if (braceStart === -1) die('Could not find opening `{` for extensionInstructions object');

  const braceEnd = findMatchingBrace(jsxText, braceStart);
  if (braceEnd === -1) die('Could not find closing `}` for extensionInstructions object');

  const objectLiteral = jsxText.slice(braceStart, braceEnd + 1);
  const sandbox = {};
  return vm.runInNewContext(`(${objectLiteral})`, sandbox, { timeout: 1000 });
}

function buildExtensionIndex(extensionsCatalog) {
  const index = new Map();
  for (const [category, entries] of Object.entries(extensionsCatalog)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.id;
      if (!id) continue;
      index.set(id, { category, entry });
    }
  }
  return index;
}

/** rv_zvkn → Zvkn, rv_smrnmi → Smrnmi */
function rvTagToCatalogId(tag) {
  const stripped = tag.slice('rv_'.length);
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

// ---------------------------------------------------------------------------
// Load files
// ---------------------------------------------------------------------------

const workspaceRoot = process.cwd();
const instrDictPath  = path.join(workspaceRoot, 'src', 'instr_dict.json');
const catalogPath    = path.join(workspaceRoot, 'src', 'riscv_extensions.json');
const visualizerPath = path.join(workspaceRoot, 'src', 'risc_v_visualizer.jsx');
const outputPath     = path.join(workspaceRoot, 'COVERAGE.md');

const instrDict         = JSON.parse(fs.readFileSync(instrDictPath, 'utf8'));
const extensionsCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const visualizerSource  = fs.readFileSync(visualizerPath, 'utf8');

// ---------------------------------------------------------------------------
// STEP 2 – Catalog extensions
// ---------------------------------------------------------------------------

const extIndex = buildExtensionIndex(extensionsCatalog);   // Map<id, {category, entry}>

const allExtensions = [];   // { id, category, count }
for (const [id, { category, entry }] of extIndex) {
  const count = entry.instructions ? Object.keys(entry.instructions).length : 0;
  allExtensions.push({ id, category, count });
}

const totalExtensions     = allExtensions.length;
const withInstructions    = allExtensions.filter(e => e.count > 0).length;
const withoutInstructions = totalExtensions - withInstructions;
const coveragePct         = totalExtensions > 0
  ? ((withInstructions / totalExtensions) * 100).toFixed(1)
  : '0.0';

// ---------------------------------------------------------------------------
// STEP 3 – JSX registered keys
// ---------------------------------------------------------------------------

const extensionInstructions = extractExtensionInstructions(visualizerSource);
const jsxKeys = new Set(Object.keys(extensionInstructions));

// ---------------------------------------------------------------------------
// STEP 4 – instr_dict tags
// ---------------------------------------------------------------------------

/** Map<tag, Set<mnemonic>> */
const tagMap = new Map();
for (const [mnemonic, details] of Object.entries(instrDict)) {
  if (!Array.isArray(details.extension)) continue;
  for (const tag of details.extension) {
    if (!tagMap.has(tag)) tagMap.set(tag, new Set());
    tagMap.get(tag).add(mnemonic);
  }
}

// ---------------------------------------------------------------------------
// STEP 5 – Classify rv_ tags
// ---------------------------------------------------------------------------

const readyToMap       = [];   // { tag, catalogId, instrCount }
const missingFromCatalog = []; // { tag, derivedId, instrCount }

for (const [tag, mnemonics] of tagMap) {
  if (!tag.startsWith('rv_')) continue;

  const derivedId   = rvTagToCatalogId(tag);
  const instrCount  = mnemonics.size;
  const inCatalog   = extIndex.has(derivedId);
  const inJsx       = jsxKeys.has(derivedId);

  if (inCatalog && !inJsx) {
    readyToMap.push({ tag, catalogId: derivedId, instrCount });
  } else if (!inCatalog) {
    missingFromCatalog.push({ tag, derivedId, instrCount });
  }
}

readyToMap.sort((a, b) => a.catalogId.localeCompare(b.catalogId));
missingFromCatalog.sort((a, b) => a.tag.localeCompare(b.tag));

// ---------------------------------------------------------------------------
// STEP 5 – NEEDS RESEARCH (in catalog with 0 instructions, no rv_ tag maps to it)
// ---------------------------------------------------------------------------

const mappedCatalogIds = new Set(
  [...tagMap.keys()]
    .filter(t => t.startsWith('rv_'))
    .map(rvTagToCatalogId)
);

const needsResearch = allExtensions
  .filter(e => e.count === 0 && !mappedCatalogIds.has(e.id))
  .sort((a, b) => a.id.localeCompare(b.id));

// ---------------------------------------------------------------------------
// Build report lines (shared between console and markdown)
// ---------------------------------------------------------------------------

const consoleLines = [];
const mdLines      = [];

function both(consoleLine, mdLine) {
  consoleLines.push(consoleLine);
  mdLines.push(mdLine ?? consoleLine);
}
function bothRaw(line) { both(line, line); }

// Header
bothRaw('');
both('=== RISC-V Extensions Landscape - Coverage Report ===', '# RISC-V Extensions Landscape — Coverage Report');
bothRaw('');

// SUMMARY
both('SUMMARY', '## Summary');
both('-------', '');
both(`Total extensions in catalog: ${totalExtensions}`, `| Metric | Value |`);
both(`Extensions with instructions > 0: ${withInstructions}`, `|--------|-------|`);
both(`Extensions with 0 instructions: ${withoutInstructions}`, `| Total extensions in catalog | ${totalExtensions} |`);
both(`Overall coverage: ${coveragePct}%`, `| Extensions with instructions > 0 | ${withInstructions} |`);
both(`Extensions registered in JSX: ${jsxKeys.size}`, `| Extensions with 0 instructions | ${withoutInstructions} |`);
mdLines.push(`| Overall coverage | ${coveragePct}% |`);
mdLines.push(`| Extensions registered in JSX | ${jsxKeys.size} |`);
bothRaw('');

// READY TO MAP
const readyHeader = 'READY TO MAP (rv_ tag in instr_dict → catalog ID matched → NOT yet in JSX)';
both(readyHeader, '## Ready to Map');
both('-'.repeat(readyHeader.length), '');
both('(rv_ tag in instr_dict has a matching catalog ID and is NOT yet registered in extensionInstructions)', '');
bothRaw('');

if (readyToMap.length === 0) {
  bothRaw('  (none)');
} else {
  mdLines.push('| Catalog ID | rv_ Tag | Instruction Count |');
  mdLines.push('|------------|---------|-------------------|');
  for (const { tag, catalogId, instrCount } of readyToMap) {
    consoleLines.push(`  READY: ${catalogId} ← ${tag} | ${instrCount} instructions`);
    mdLines.push(`| ${catalogId} | \`${tag}\` | ${instrCount} |`);
  }
}
bothRaw('');

// MISSING FROM CATALOG
const missingHeader = 'MISSING FROM CATALOG (rv_ tag exists in instr_dict, no catalog entry found)';
both(missingHeader, '## Missing From Catalog');
both('-'.repeat(missingHeader.length), '');
both('(These rv_ tags have instructions but no matching entry in riscv_extensions.json)', '');
bothRaw('');

if (missingFromCatalog.length === 0) {
  bothRaw('  (none)');
} else {
  mdLines.push('| rv_ Tag | Instruction Count | Suggested Catalog ID |');
  mdLines.push('|---------|-------------------|----------------------|');
  for (const { tag, derivedId, instrCount } of missingFromCatalog) {
    consoleLines.push(`  MISSING: ${tag} | ${instrCount} instructions | suggested ID: ${derivedId}`);
    mdLines.push(`| \`${tag}\` | ${instrCount} | ${derivedId} |`);
  }
}
bothRaw('');

// NEEDS RESEARCH
const researchHeader = 'NEEDS RESEARCH (in catalog with 0 instructions, no rv_ tag match found)';
both(researchHeader, '## Needs Research');
both('-'.repeat(researchHeader.length), '');
both('(These extensions have no instructions populated and no instr_dict tag maps to them)', '');
bothRaw('');

if (needsResearch.length === 0) {
  bothRaw('  (none)');
} else {
  mdLines.push('| Catalog ID | Category |');
  mdLines.push('|------------|----------|');
  for (const { id, category } of needsResearch) {
    consoleLines.push(`  RESEARCH: ${id} (category: ${category})`);
    mdLines.push(`| ${id} | ${category} |`);
  }
}
bothRaw('');

// ---------------------------------------------------------------------------
// STEP 5 – Print to console
// ---------------------------------------------------------------------------

for (const line of consoleLines) console.log(line);

// ---------------------------------------------------------------------------
// STEP 6 – Write COVERAGE.md
// ---------------------------------------------------------------------------

const mdContent = mdLines.join('\n') + '\n';
fs.writeFileSync(outputPath, mdContent, 'utf8');
console.log(`\nReport written to ${path.relative(workspaceRoot, outputPath)}`);
