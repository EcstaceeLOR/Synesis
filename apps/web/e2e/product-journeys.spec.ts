import { expect, test, type Page } from "@playwright/test";

const primaryRoutes = [
  "/app",
  "/app/intents",
  "/app/intents/new",
  "/app/mechs",
  "/app/policies",
  "/app/executions",
  "/app/treasury",
  "/app/proofs",
  "/app/settings/integrations",
  "/app/settings/security",
] as const;

const expectAccessiblePageStructure = async (page: Page) => {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
  const allButtonsNamed = await page
    .locator("button")
    .evaluateAll((buttons) =>
      buttons.every((button) =>
        Boolean(
          button.getAttribute("aria-label") ?? button.textContent?.trim(),
        ),
      ),
    );
  expect(allButtonsNamed).toBe(true);
  const idsAreUnique = await page.locator("[id]").evaluateAll((nodes) => {
    const ids = nodes.map((node) => node.id);
    return new Set(ids).size === ids.length;
  });
  expect(idsAreUnique).toBe(true);
};

test.describe("Synesis connected product journeys", () => {
  test("the command center connects navigation, the intent draft, and an intent room", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: /Value moves only/i }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Create intent/i }).click();
    await expect(page).toHaveURL(/\/app\/intents\/new$/u);

    await page.getByLabel("Amount").fill("1000000");
    await expect(page.getByText("VALIDATED", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Amount")).toHaveValue("1000000");

    await page.getByRole("link", { name: "Intents" }).first().click();
    await expect(page).toHaveURL(/\/app\/intents$/u);
    await page.getByRole("link", { name: "USDC yield rebalance" }).click();
    await expect(page).toHaveURL(/\/app\/intents\/SYN-1042$/u);
    await expect(
      page.getByRole("heading", { name: /USDC yield rebalance/i }),
    ).toBeVisible();
  });

  test("refreshes and reconnects a long-running intent without duplicating an action", async ({
    page,
  }) => {
    await page.goto("/app/intents/SYN-1042");
    await page.reload();
    await expect(page.getByText(/AWAITING/i).first()).toBeVisible();

    const approve = page.getByRole("button", { name: /Approve execution/i });
    await approve.click();
    await approve.click();
    await expect(page.getByText("Approval recorded for SYN-1042")).toHaveCount(
      1,
    );
  });

  test("keyboard command navigation reaches a connected product surface", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: /Jump to a Synesis surface/i }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Executions" }).click();
    await expect(page).toHaveURL(/\/app\/executions$/u);
  });

  for (const route of primaryRoutes) {
    test(`meets baseline accessibility structure on ${route}`, async ({
      page,
    }) => {
      await page.goto(route);
      await expectAccessiblePageStructure(page);
    });
  }
});
