// Dependency-free import/layout check: enforces barrel imports and the flat
// domain module structure described in AGENTS.md.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = join(import.meta.dir, "..");
const apiRoot = join(root, "api");
const domainRoot = join(apiRoot, "domain");
const servicesRoot = join(apiRoot, "app", "services");

const errors: string[] = [];
// Matches static imports, dynamic imports, and side-effect imports.
const specifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

/** Returns every `.ts` file under a directory, recursively. */
function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return walk(path);
    }

    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function report(file: string, message: string): void {
  errors.push(`${relative(root, file)}: ${message}`);
}

/** Rejects deep domain/service imports and relative imports across domain modules. */
function checkDeepImport(file: string, specifier: string): void {
  for (const barrel of ["@/domain/", "@/app/services/"]) {
    if (!specifier.startsWith(barrel)) {
      continue;
    }

    const target = specifier.slice(barrel.length);

    if (target.includes("/")) {
      report(
        file,
        `deep import "${specifier}" is not allowed; import from the module index`,
      );
    }
  }

  if (file.startsWith(domainRoot + sep) && specifier.startsWith("../")) {
    report(
      file,
      `relative import "${specifier}" crosses domain modules; use the module index`,
    );
  }
}

/** Scans one file for import specifiers that violate the rules. */
function checkSourceFile(file: string): void {
  const source = readFileSync(file, "utf8");

  for (const match of source.matchAll(specifierPattern)) {
    const specifier = match[1];

    if (specifier) {
      checkDeepImport(file, specifier);
    }
  }
}

/** Verifies each domain module is flat, has a barrel, and names repositories correctly. */
function checkDomainLayout(): void {
  const modules = readdirSync(domainRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );

  for (const module of modules) {
    const moduleDirectory = join(domainRoot, module.name);

    if (!existsSync(join(moduleDirectory, "index.ts"))) {
      report(moduleDirectory, "domain module is missing index.ts");
    }

    const entries = readdirSync(moduleDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        report(
          join(moduleDirectory, entry.name),
          "domain modules must stay flat; move repositories to domain/repositories",
        );
      }

      if (
        module.name !== "repositories" &&
        entry.isFile() &&
        entry.name.endsWith(".repository.ts") &&
        !entry.name.startsWith("I")
      ) {
        report(
          join(moduleDirectory, entry.name),
          "repository interfaces must be named I<Entity>.repository.ts",
        );
      }

      if (
        module.name === "repositories" &&
        entry.isFile() &&
        entry.name.endsWith(".repository.ts") &&
        entry.name.startsWith("I")
      ) {
        report(
          join(moduleDirectory, entry.name),
          "repository classes must not use the I<Entity> interface prefix",
        );
      }
    }
  }

  if (!existsSync(join(servicesRoot, "index.ts"))) {
    report(servicesRoot, "app/services is missing index.ts");
  }
}

// Check application code and scripts; generated or third-party code is excluded.
for (const directory of [apiRoot, join(root, "scripts")]) {
  for (const file of walk(directory)) {
    checkSourceFile(file);
  }
}

checkDomainLayout();

if (errors.length > 0) {
  console.error("Import/layout check failed:\n");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

console.log("Import and domain layout checks passed.");
