/**
 * Post-login redirect safety verification.
 * Run: npm run test:login-redirect
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_POST_LOGIN_PATH,
  resolveSafePostLoginRedirect,
} from "../src/lib/auth/safe-redirect";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

function runTests() {
  console.log("Running login redirect safety tests...\n");

  record(
    "Default login redirect",
    resolveSafePostLoginRedirect(undefined) === DEFAULT_POST_LOGIN_PATH,
    resolveSafePostLoginRedirect(undefined)
  );
  record(
    "Empty callback redirects to dashboard",
    resolveSafePostLoginRedirect("") === DEFAULT_POST_LOGIN_PATH,
    resolveSafePostLoginRedirect("")
  );
  record(
    "Root callback redirects to dashboard",
    resolveSafePostLoginRedirect("/") === DEFAULT_POST_LOGIN_PATH,
    resolveSafePostLoginRedirect("/")
  );
  record(
    "Login callback redirects to dashboard",
    resolveSafePostLoginRedirect("/login") === DEFAULT_POST_LOGIN_PATH,
    resolveSafePostLoginRedirect("/login")
  );
  record(
    "Login subpath redirects to dashboard",
    resolveSafePostLoginRedirect("/login/extra") === DEFAULT_POST_LOGIN_PATH,
    resolveSafePostLoginRedirect("/login/extra")
  );
  record(
    "Protected route callback preserved",
    resolveSafePostLoginRedirect("/reports") === "/reports",
    resolveSafePostLoginRedirect("/reports")
  );
  record(
    "Protected route query preserved",
    resolveSafePostLoginRedirect("/reports?tab=summary") === "/reports?tab=summary",
    resolveSafePostLoginRedirect("/reports?tab=summary")
  );
  record(
    "External https URL rejected",
    resolveSafePostLoginRedirect("https://evil.com") === DEFAULT_POST_LOGIN_PATH,
    "rejected"
  );
  record(
    "Protocol-relative URL rejected",
    resolveSafePostLoginRedirect("//evil.com/path") === DEFAULT_POST_LOGIN_PATH,
    "rejected"
  );
  record(
    "Traversal rejected",
    resolveSafePostLoginRedirect("/reports/../../../evil") === DEFAULT_POST_LOGIN_PATH,
    "rejected"
  );
  record(
    "Encoded protocol-relative rejected",
    resolveSafePostLoginRedirect("/%2f%2fevil.com") === DEFAULT_POST_LOGIN_PATH,
    "rejected"
  );
  record(
    "Non-path callback rejected",
    resolveSafePostLoginRedirect("reports") === DEFAULT_POST_LOGIN_PATH,
    "rejected"
  );

  const middlewareSource = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  const loginFormSource = readFileSync(
    join(process.cwd(), "src/app/login/login-form.tsx"),
    "utf8"
  );
  const homeSource = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

  record(
    "Middleware uses safe redirect helper",
    middlewareSource.includes("resolveSafePostLoginRedirect"),
    "present"
  );
  record(
    "Login form uses safe redirect helper",
    loginFormSource.includes("resolveSafePostLoginRedirect"),
    "present"
  );
  record(
    "Home page redirects to dashboard",
    homeSource.includes("DEFAULT_POST_LOGIN_PATH") ||
      homeSource.includes(DEFAULT_POST_LOGIN_PATH),
    DEFAULT_POST_LOGIN_PATH
  );
  record(
    "Login form does not redirect to raw callbackUrl",
    !loginFormSource.includes("router.push(callbackUrl)") &&
      loginFormSource.includes("router.push("),
    "sanitized"
  );
  record(
    "Dev login hint removed",
    !loginFormSource.includes("Dev: admin@mahacred.in") &&
      !loginFormSource.includes("Phase 2 — Database-backed"),
    "clean"
  );
  record(
    "Middleware still enforces session",
    middlewareSource.includes("!session?.user") &&
      middlewareSource.includes("NextResponse.redirect(loginUrl)"),
    "enforced"
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\nLogin redirect: ${passed}/${results.length} PASS${failed ? `, ${failed} FAIL` : ""}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
