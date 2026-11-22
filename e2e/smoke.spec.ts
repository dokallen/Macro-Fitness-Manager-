import { expect, test } from "@playwright/test";

test("app loads and the login page renders without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  // Signed-out visitors to the app root are sent to the login page.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);

  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();

  // Give hydration and any late client-side errors time to surface.
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
