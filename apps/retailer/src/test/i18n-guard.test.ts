// Fails when a screen shows English text that is not passed through t() / tf(). Add the string to
// src/lib/i18n-ml-screens.ts and wrap it, or (for text that should stay English, such as a brand
// name) mark the line with `// i18n-ignore`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const ROOTS = ["features", "components/kannect", "routes"];
const SKIP_FILES = [/\.test\./, /routeTree/, /language-switcher/]; // the switcher names languages in their own script
const TEXT_ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label"]);
const IGNORED_CALLS = new Set(["pageHead", "createFileRoute"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const words = (text: string) => text.trim().split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
const sentenceLike = (text: string) => /^[A-Z]/.test(text.trim()) && words(text).length >= 2;
const hasLetters = (text: string) => /[A-Za-z]{2,}/.test(text);

function calleeName(node: ts.CallExpression): string {
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression)) return `${e.expression.text}.${e.name.text}`;
  return "";
}

export function findUntranslated(path: string, source?: string): string[] {
  const text = source ?? readFileSync(path, "utf8");
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = text.split("\n");
  const out: string[] = [];

  const report = (node: ts.Node, what: string, value: string) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (/i18n-ignore/.test(lines[line] ?? "")) return;
    out.push(`${relative(SRC, path).replace(/\\/g, "/")}:${line + 1}  ${what}: ${JSON.stringify(value.trim().slice(0, 70))}`);
  };

  const visit = (node: ts.Node, translated: boolean) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isTypeNode(node)) return;
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Error") return;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (IGNORED_CALLS.has(name) || name.startsWith("console.")) return;
      const inside = translated || name === "t" || name === "tf";
      ts.forEachChild(node, (c) => visit(c, inside));
      return;
    }
    if (!translated) {
      if (ts.isJsxText(node) && hasLetters(node.text)) report(node, "JSX text", node.text);
      if (ts.isJsxAttribute(node) && TEXT_ATTRS.has(node.name.getText(sf))) {
        const init = node.initializer;
        if (init && ts.isStringLiteral(init) && hasLetters(init.text)) report(node, `attribute ${node.name.getText(sf)}`, init.text);
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const parent = node.parent;
        const isAttr = ts.isJsxAttribute(parent);
        if (!isAttr && sentenceLike(node.text)) report(node, "string", node.text);
      }
      if (ts.isTemplateExpression(node)) {
        const staticText = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ");
        if (sentenceLike(staticText.replace(/\s+/g, " ").trim()) || (words(staticText).length >= 1 && /\s[a-z]{3,}/.test(staticText) && !/^[a-z-]+$/.test(staticText.trim()))) {
          report(node, "template", staticText);
        }
      }
    }
    ts.forEachChild(node, (c) => visit(c, translated));
  };
  visit(sf, false);
  return out;
}

describe("no untranslated English on the retailer screens", () => {
  const all = ROOTS.flatMap((r) => files(join(SRC, r))).filter((f) => !SKIP_FILES.some((re) => re.test(f)));

  it("scans the screens", () => {
    expect(all.length).toBeGreaterThan(10);
  });

  describe("the guard itself", () => {
    const scan = (code: string) => findUntranslated(join(SRC, "features/probe.tsx"), code);

    it("flags JSX text, text attributes, toasts and sentence strings", () => {
      expect(scan(`const A = () => <p>Plain English</p>;`)).toHaveLength(1);
      expect(scan(`const A = () => <input placeholder="Search here" />;`)).toHaveLength(1);
      expect(scan(`const A = () => <button aria-label="Close dialog" />;`)).toHaveLength(1);
      expect(scan(`toast.error("Could not save");`)).toHaveLength(1);
      expect(scan(`const m = ok ? "Saving your bill" : "Confirm the bill";`)).toHaveLength(2);
      expect(scan("const m = `${n} item${n === 1 ? '' : 's'} left`;")).toHaveLength(1);
    });

    it("accepts text that goes through t() or tf(), and non-text strings", () => {
      expect(scan(`const A = () => <p>{t("Plain English", locale)}</p>;`)).toEqual([]);
      expect(scan(`const A = () => <p title={t("Hello there", locale)}>{tf("Joined {n} packs", { n }, locale)}</p>;`)).toEqual([]);
      expect(scan(`const A = () => <div className="flex items-center gap-2" data-x="One Two" />;`)).toEqual([]);
      expect(scan(`import { x } from "Some Module"; const k = ["shop", "orders"]; throw new Error("Not found here");`)).toEqual([]);
      expect(scan(`export const Route = createFileRoute("/x")({ head: () => pageHead("Group buys", "Join other shops today") });`)).toEqual([]);
    });

    it("lets a line opt out with i18n-ignore", () => {
      expect(scan(`const A = () => <p>Kannect Retailer</p>; // i18n-ignore`)).toEqual([]);
    });
  });

  it("reports nothing left to translate", () => {
    const findings = all.flatMap((f) => findUntranslated(f));
    expect(findings).toEqual([]);
  });
});
