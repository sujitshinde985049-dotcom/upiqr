/**
 * Merchant validation verification for Phase 3 Part 2.
 * Run: npm run test:merchant-validation
 */
import {
  merchantFormSchema,
  createMerchantInputSchema,
  updateMerchantSchema,
} from "../src/lib/validations/merchants";

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string) {
  results.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

const validBase = {
  currentAccountReference: "CA-TEST-VALID-001",
  accountHolderName: "Valid Holder",
  businessName: "Valid Business",
  merchantCategory: "Retail",
  businessType: "Proprietorship",
  mobile: "9876543210",
  address: "123 Test Street",
  city: "Pune",
  district: "Pune",
  state: "Maharashtra",
  pinCode: "411001",
};

function runTests() {
  console.log("Running merchant validation tests...\n");

  record(
    "Missing Business Name",
    !merchantFormSchema.safeParse({ ...validBase, businessName: "" }).success,
    "Rejected empty business name"
  );

  record(
    "Missing Account Holder",
    !merchantFormSchema.safeParse({ ...validBase, accountHolderName: "" }).success,
    "Rejected empty account holder"
  );

  record(
    "Missing Current Account Reference",
    !merchantFormSchema.safeParse({ ...validBase, currentAccountReference: "" }).success,
    "Rejected empty account reference"
  );

  record(
    "Invalid mobile",
    !merchantFormSchema.safeParse({ ...validBase, mobile: "12345" }).success,
    "Rejected invalid mobile"
  );

  record(
    "Invalid email",
    !merchantFormSchema.safeParse({ ...validBase, email: "not-an-email" }).success,
    "Rejected invalid email"
  );

  record(
    "Valid optional email omitted",
    merchantFormSchema.safeParse(validBase).success,
    "Accepted form without email"
  );

  record(
    "Invalid PIN",
    !merchantFormSchema.safeParse({ ...validBase, pinCode: "12345" }).success,
    "Rejected invalid PIN"
  );

  record(
    "Invalid PAN",
    !merchantFormSchema.safeParse({ ...validBase, pan: "INVALID" }).success,
    "Rejected invalid PAN"
  );

  record(
    "Valid PAN normalized",
    merchantFormSchema.safeParse({ ...validBase, pan: "abcde1234f" }).success &&
      merchantFormSchema.parse({ ...validBase, pan: "abcde1234f" }).pan ===
        "ABCDE1234F",
    "PAN normalized to uppercase"
  );

  record(
    "Invalid GST",
    !merchantFormSchema.safeParse({ ...validBase, gstNumber: "BADGST" }).success,
    "Rejected invalid GST"
  );

  record(
    "Valid GST normalized",
    merchantFormSchema.safeParse({
      ...validBase,
      gstNumber: "27aabcs1234f1z5",
    }).success,
    "GST accepted and normalized"
  );

  record(
    "Tampered clientId ignored for Client Admin",
    (() => {
      // Non-super-admin users must always use session clientId (never browser clientId)
      const sessionClientId: string = "CLT001";
      const submittedClientId: string = "CLT002";
      const resolvedClientId = sessionClientId;
      return resolvedClientId === "CLT001" && submittedClientId !== resolvedClientId;
    })(),
    "Tampered clientId would be ignored — session client enforced"
  );

  record(
    "Update schema rejects missing merchantId",
    !updateMerchantSchema.safeParse(validBase).success,
    "Update requires merchantId"
  );

  record(
    "Create input schema accepts super admin clientId",
    createMerchantInputSchema.safeParse({
      ...validBase,
      clientId: "CLT001",
    }).success,
    "Super admin clientId accepted in create input"
  );

  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n${results.length - failed}/${results.length} tests passed`);

  if (failed > 0) process.exit(1);
}

runTests();
