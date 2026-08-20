/**
 * User validation verification for Phase 3 Part 3.
 * Run: npm run test:user-validation
 */
import {
  createClientUserSchema,
  createMerchantUserSchema,
  userPasswordSchema,
  updateUserStatusInputSchema,
} from "../src/lib/validations/users";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

const validClientUser = {
  name: "Test User",
  email: "test.user@example.com",
  role: "client_operator" as const,
  password: "TempPass1",
  status: "active" as const,
};

const validMerchantUser = {
  name: "Merchant Test User",
  email: "merchant.test@example.com",
  password: "TempPass1",
  status: "active" as const,
  merchantId: "MCH001",
};

function runTests() {
  console.log("Running user validation tests...\n");

  record(
    "Missing name",
    !createClientUserSchema.safeParse({ ...validClientUser, name: "" }).success,
    "Rejected empty name"
  );

  record(
    "Invalid email",
    !createClientUserSchema.safeParse({
      ...validClientUser,
      email: "bad-email",
    }).success,
    "Rejected invalid email"
  );

  record(
    "Weak password",
    !userPasswordSchema.safeParse("weak").success,
    "Rejected weak password"
  );

  record(
    "Valid password",
    userPasswordSchema.safeParse("TempPass1").success,
    "Accepted valid password"
  );

  record(
    "Valid client user",
    createClientUserSchema.safeParse(validClientUser).success,
    "Accepted valid client user input"
  );

  record(
    "Valid merchant user",
    createMerchantUserSchema.safeParse(validMerchantUser).success,
    "Accepted valid merchant user input"
  );

  record(
    "Update status requires userId",
    !updateUserStatusInputSchema.safeParse({ status: "active" }).success,
    "Rejected status update without userId"
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);
  if (failed > 0) process.exit(1);
}

runTests();
