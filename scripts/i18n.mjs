#!/usr/bin/env node
// Translation tooling for packages/core/locales (en-US is the source).
//
//   npm run i18n:check    Fails if code uses a key missing from en-US, or if a
//                         locale has keys en-US doesn't. Reports translation
//                         coverage per locale.
//   npm run i18n:export   Writes i18n/export/<locale>.json: every en-US string
//                         the locale lacks, flat ("ns:key.path"), with
//                         {{placeholders}} wrapped in <span translate="no">
//                         so machine translation (e.g. Google Translate, HTML
//                         mode) leaves them intact.
//   npm run i18n:import   Reads i18n/import/<locale>.json (same shape, now
//                         translated), verifies every placeholder survived,
//                         and merges into packages/core/locales/<locale>/.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LOCALES_DIR = join(ROOT, "packages/core/locales");
const SOURCE = "en-US";
const CODE_DIRS = ["packages/core/src", "packages/themes", "apps/web/src"].map((d) => join(ROOT, d));

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file, data) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function setDeep(obj, path, value) {
  const parts = path.split(".");
  let node = obj;
  for (const part of parts.slice(0, -1)) node = node[part] ??= {};
  node[parts.at(-1)] = value;
}

function loadLocale(locale) {
  const dir = join(LOCALES_DIR, locale);
  const flat = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const ns = file.slice(0, -5);
    for (const [k, v] of Object.entries(flatten(readJson(join(dir, file))))) flat[`${ns}:${k}`] = v;
  }
  return flat;
}

const locales = () => readdirSync(LOCALES_DIR).filter((d) => statSync(join(LOCALES_DIR, d)).isDirectory());
const placeholders = (s) => [...String(s).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
// i18next plural/context suffixes resolve to the base key in code.
const baseKey = (key) => key.replace(/(_ordinal)?_(zero|one|two|few|many|other)$/, "");

function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "ui") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** Static keys used in code: t("a.b") within a file whose useT("ns") names the namespace. */
function usedKeys() {
  const used = new Set();
  let dynamic = 0;
  for (const file of CODE_DIRS.flatMap((d) => sourceFiles(d))) {
    const src = readFileSync(file, "utf8");
    const scopes = [...src.matchAll(/useT\(\s*"([\w-]+)"\s*\)/g)].map((m) => ({ at: m.index, ns: m[1] }));
    if (scopes.length === 0) continue;
    for (const m of src.matchAll(/\bt\(\s*(["'`])([^"'`]+)\1/g)) {
      if (m[1] === "`" && m[2].includes("${")) {
        dynamic++;
        continue;
      }
      // The namespace of the nearest useT() above this call (one per component).
      const ns = scopes.filter((s) => s.at < m.index).at(-1)?.ns ?? scopes[0].ns;
      used.add(m[2].includes(":") ? m[2] : `${ns}:${m[2]}`);
    }
  }
  return { used, dynamic };
}

function check() {
  const source = loadLocale(SOURCE);
  const sourceBase = new Set(Object.keys(source).map(baseKey));
  let failed = false;

  const { used, dynamic } = usedKeys();
  const missing = [...used].filter((k) => !sourceBase.has(k));
  if (missing.length) {
    failed = true;
    console.error(`✖ ${missing.length} key(s) used in code but missing from ${SOURCE}:\n  ${missing.join("\n  ")}`);
  } else {
    console.log(`✓ ${used.size} static keys used in code all exist in ${SOURCE} (${dynamic} dynamic key expressions not checked)`);
  }

  for (const locale of locales().filter((l) => l !== SOURCE)) {
    const target = loadLocale(locale);
    const extra = Object.keys(target).filter((k) => !(k in source));
    if (extra.length) {
      failed = true;
      console.error(`✖ ${locale}: ${extra.length} key(s) not in ${SOURCE}: ${extra.join(", ")}`);
    }
    const bad = Object.keys(target).filter(
      (k) => k in source && placeholders(target[k]).join() !== placeholders(source[k]).join(),
    );
    if (bad.length) {
      failed = true;
      console.error(`✖ ${locale}: placeholder mismatch in ${bad.join(", ")}`);
    }
    const done = Object.keys(source).filter((k) => typeof target[k] === "string" && target[k] !== "").length;
    console.log(`  ${locale}: ${done}/${Object.keys(source).length} translated`);
  }
  if (failed) process.exit(1);
}

const protect = (s) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, '<span translate="no">{{$1}}</span>');
const unprotect = (s) => s.replace(/<span translate="no">\s*(\{\{[\w.]+\}\})\s*<\/span>/g, "$1");

function exportUntranslated() {
  const source = loadLocale(SOURCE);
  const outDir = join(ROOT, "i18n/export");
  mkdirSync(outDir, { recursive: true });
  for (const locale of locales().filter((l) => l !== SOURCE)) {
    const target = loadLocale(locale);
    const todo = Object.fromEntries(
      Object.entries(source)
        .filter(([k]) => !(typeof target[k] === "string" && target[k] !== ""))
        .map(([k, v]) => [k, protect(String(v))]),
    );
    writeJson(join(outDir, `${locale}.json`), todo);
    console.log(`${locale}: ${Object.keys(todo).length} string(s) → i18n/export/${locale}.json`);
  }
}

function importTranslations() {
  const source = loadLocale(SOURCE);
  const inDir = join(ROOT, "i18n/import");
  for (const locale of locales().filter((l) => l !== SOURCE)) {
    const file = join(inDir, `${locale}.json`);
    if (!existsSync(file)) continue;
    const incoming = readJson(file);
    const byNs = {};
    for (const [fullKey, raw] of Object.entries(incoming)) {
      if (!(fullKey in source)) throw new Error(`${locale}: unknown key ${fullKey}`);
      const value = unprotect(String(raw));
      if (placeholders(value).join() !== placeholders(source[fullKey]).join()) {
        throw new Error(`${locale}: placeholders changed in ${fullKey}: "${value}"`);
      }
      const [ns, key] = fullKey.split(/:(.*)/s);
      (byNs[ns] ??= []).push([key, value]);
    }
    for (const [ns, entries] of Object.entries(byNs)) {
      const nsFile = join(LOCALES_DIR, locale, `${ns}.json`);
      const data = existsSync(nsFile) ? readJson(nsFile) : {};
      for (const [key, value] of entries) setDeep(data, key, value);
      writeJson(nsFile, data);
    }
    console.log(`${locale}: merged ${Object.keys(incoming).length} string(s)`);
  }
}

const command = process.argv[2];
if (command === "check") check();
else if (command === "export") exportUntranslated();
else if (command === "import") importTranslations();
else {
  console.error("usage: node scripts/i18n.mjs <check|export|import>");
  process.exit(1);
}
