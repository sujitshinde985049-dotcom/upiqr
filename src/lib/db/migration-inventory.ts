import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type MigrationEntry = {
  name: string;
  directory: string;
  sqlPath: string;
  hasSql: boolean;
};

export type DestructiveSqlFinding = {
  migration: string;
  pattern: string;
  line: number;
};

const DESTRUCTIVE_PATTERNS = [
  { name: "DROP TABLE", regex: /\bDROP\s+TABLE\b/i },
  { name: "DROP COLUMN", regex: /\bDROP\s+COLUMN\b/i },
  { name: "TRUNCATE", regex: /\bTRUNCATE\b/i },
  { name: "DROP SCHEMA", regex: /\bDROP\s+SCHEMA\b/i },
  {
    name: "ALTER TYPE destructive",
    regex: /\bALTER\s+TYPE\b[\s\S]*?\bDROP\b/i,
  },
] as const;

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

export function listMigrationDirectories(): MigrationEntry[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = join(MIGRATIONS_DIR, entry.name);
      const sqlPath = join(directory, "migration.sql");
      return {
        name: entry.name,
        directory,
        sqlPath,
        hasSql: existsSync(sqlPath),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function assertMigrationInventoryValid(entries: MigrationEntry[]): string[] {
  const issues: string[] = [];
  const names = entries.map((entry) => entry.name);

  if (entries.length === 0) {
    issues.push("No migration directories found.");
    return issues;
  }

  const unique = new Set(names);
  if (unique.size !== names.length) {
    issues.push("Duplicate migration directory names detected.");
  }

  const sorted = [...names].sort();
  if (sorted.join("|") !== names.join("|")) {
    issues.push("Migration directories are not lexicographically ordered.");
  }

  for (const entry of entries) {
    if (!entry.hasSql) {
      issues.push(`Migration ${entry.name} is missing migration.sql.`);
    }
  }

  return issues;
}

export function scanMigrationSqlForDestructiveOperations(
  entries: MigrationEntry[] = listMigrationDirectories()
): DestructiveSqlFinding[] {
  const findings: DestructiveSqlFinding[] = [];

  for (const entry of entries) {
    if (!entry.hasSql) continue;
    const content = readFileSync(entry.sqlPath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const pattern of DESTRUCTIVE_PATTERNS) {
      lines.forEach((line, index) => {
        if (pattern.regex.test(line)) {
          findings.push({
            migration: entry.name,
            pattern: pattern.name,
            line: index + 1,
          });
        }
      });
    }
  }

  return findings;
}

export function getSchemaPath(): string {
  return join(process.cwd(), "prisma", "schema.prisma");
}
