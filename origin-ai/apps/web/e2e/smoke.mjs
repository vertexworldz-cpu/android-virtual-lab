// End-to-end smoke test against a running stack (API :8000, web :3000) with
// an EMPTY database and at least one trained checkpoint.
//   node apps/web/e2e/smoke.mjs [screenshot-dir]
// Requires the `playwright` package and a Chromium install.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.ORIGIN_WEB_URL ?? "http://localhost:3000";
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};
const shot = async (page, name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  // --- first run: sign-in redirects to owner setup
  await page.goto(`${BASE}/`);
  await page.waitForURL("**/register");
  check("unauthenticated visit to / lands on owner setup", true);
  await shot(page, "01-setup");
  await page.getByLabel("Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("a long test password");
  await page.getByRole("button", { name: "Create owner account" }).click();
  await page.getByRole("heading", { name: /Ada\.$/ }).waitFor();
  check("owner account created and dashboard greets by name", true);
  await page.waitForTimeout(600);
  await shot(page, "02-dashboard");

  // --- chat: real streamed answer from the Origin model
  const box = page.getByLabel("Message Origin");
  await box.fill("What is 47 + 38?");
  await box.press("Enter");
  await page.waitForURL("**/chat/**");
  const regen = page.getByRole("button", { name: "Regenerate" });
  await regen.waitFor({ state: "attached", timeout: 60000 });
  const answer = (await page.locator(".prose-origin").last().innerText()).trim();
  check("chat returns a model-generated answer", answer.length > 0, JSON.stringify(answer));
  check("answer is arithmetically correct (47 + 38 = 85)", answer === "47 + 38 = 85", JSON.stringify(answer));
  await page.getByRole("heading", { level: 1, name: "What is 47 + 38?" }).waitFor({ timeout: 5000 });
  check("conversation auto-titled from first message", true);
  await shot(page, "03-chat");

  // --- follow-up, regenerate, edit
  await box.fill("Which is larger, 58 or 85?");
  await box.press("Enter");
  await page.locator(".prose-origin").nth(1).waitFor({ timeout: 60000 });
  await regen.waitFor({ state: "attached", timeout: 60000 });
  check("second turn produces a second answer", (await page.locator(".prose-origin").count()) === 2);
  await page.locator(".prose-origin").last().hover();
  await regen.click();
  await page.waitForTimeout(300);
  await regen.waitFor({ state: "attached", timeout: 60000 });
  check("regenerate keeps exactly two answers", (await page.locator(".prose-origin").count()) === 2);

  await page.getByText("What is 47 + 38?", { exact: true }).last().hover();
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByLabel("Edit message").fill("Calculate 90 - 27");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.waitForTimeout(300);
  await regen.waitFor({ state: "attached", timeout: 60000 });
  const edited = (await page.locator(".prose-origin").last().innerText()).trim();
  check("edit replaces later turns and re-answers", (await page.locator(".prose-origin").count()) === 1 && edited === "90 - 27 = 63", JSON.stringify(edited));

  // --- reload: history is persisted server-side
  await page.reload();
  await page.locator(".prose-origin").first().waitFor();
  check("conversation survives reload", (await page.locator(".prose-origin").first().innerText()).trim() === edited);

  // --- attachment upload in composer
  const file = join(tmpdir(), "origin-e2e-notes.txt");
  writeFileSync(file, "12 + 30");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText("origin-e2e-notes.txt").waitFor();
  check("file attaches in composer", true);
  await page.getByRole("button", { name: /Remove origin-e2e-notes/ }).click();

  // --- rename
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Conversation title").fill("Arithmetic checks");
  await page.getByLabel("Conversation title").press("Enter");
  await page.getByRole("heading", { level: 1, name: "Arithmetic checks" }).waitFor();
  check("rename conversation", true);

  // --- history search
  await page.goto(`${BASE}/history`);
  await page.getByLabel("Search conversations").fill("90 - 27");
  await page.getByRole("link", { name: /Arithmetic checks/ }).first().waitFor();
  check("history search finds conversation by message text", true);

  // --- projects
  await page.goto(`${BASE}/projects`);
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Name").fill("Launch site");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByRole("heading", { name: "Launch site" }).waitFor();
  check("create project", true);

  // --- files page lists the uploaded file; download works
  await page.goto(`${BASE}/files`);
  await page.getByText("origin-e2e-notes.txt").waitFor();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download origin-e2e-notes/ }).click()]);
  check("uploaded file is listed and downloads", download.suggestedFilename() === "origin-e2e-notes.txt", download.suggestedFilename());

  // --- memory
  await page.goto(`${BASE}/memory`);
  await page.getByRole("button", { name: "Add memory" }).click();
  await page.getByLabel("What should Origin remember?").fill("Prefers metric units");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByText("Prefers metric units").waitFor();
  check("add memory", true);

  // --- compute + models show real data
  await page.goto(`${BASE}/compute`);
  await page.getByRole("heading", { name: "This machine" }).waitFor();
  check("compute page reports local hardware", (await page.getByText(/cores/).count()) > 0);
  await shot(page, "04-compute");
  await page.goto(`${BASE}/models`);
  await page.getByText("Serving chat").waitFor();
  check("models page shows the serving checkpoint", true);
  await shot(page, "05-models");

  // --- planned module is labelled as not built
  await page.goto(`${BASE}/agents`);
  await page.getByText("Not built yet").waitFor();
  check("unbuilt module says so plainly", true);

  // --- admin
  await page.goto(`${BASE}/admin`);
  await page.getByText("auth.register").first().waitFor();
  check("admin shows users and audit log", true);

  // --- dark theme
  await page.goto(`${BASE}/settings`);
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  check("dark theme applies", true);
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: /Ada\.$/ }).waitFor();
  await page.waitForTimeout(500);
  await shot(page, "06-dashboard-dark");
  await page.goto(`${BASE}/settings`);
  await page.getByRole("radio", { name: "Light" }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");

  // --- sidebar collapse persists
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Expand sidebar" }).waitFor();
  check("sidebar collapse persists across reload", true);
  await page.getByRole("button", { name: "Expand sidebar" }).click();

  // --- mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "GPU & Compute" }).waitFor();
  await shot(page, "07-mobile-menu");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check("mobile: drawer opens, no horizontal overflow", !overflow);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await shot(page, "08-mobile-dashboard");
  await page.setViewportSize({ width: 1440, height: 900 });

  // --- sign out, then protected pages redirect
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.goto(`${BASE}/history`);
  await page.waitForURL("**/login");
  check("sign out; protected routes redirect to sign-in", true);
  await shot(page, "09-login");

  const unexpected = consoleErrors.filter((e) => !/401/.test(e));
  check("no unexpected browser console errors", unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
} catch (e) {
  check(`aborted: ${String(e).split("\n")[0]}`, false);
  await shot(page, "failure");
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
