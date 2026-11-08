import { expect, test } from "@playwright/test";

const publicRoutes = [
  "/",
  "/community",
  "/listings",
  "/rentals",
  "/brands",
  "/store",
  "/login",
];

test.describe("HEAVIX public browser smoke", () => {
  for (const route of publicRoutes) {
    test(`${route} renders as a Persian RTL page`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      if (!response) throw new Error(`No document response for ${route}`);

      expect(response.status(), `HTTP status for ${route}`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "fa");
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(pageErrors, `Uncaught browser errors on ${route}`).toEqual([]);
    });
  }

  test("homepage does not introduce horizontal overflow at the active viewport", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));

    expect(
      dimensions.documentWidth,
      `document width ${dimensions.documentWidth}px exceeds viewport ${dimensions.viewportWidth}px`,
    ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });

  test("desktop rental navigation is keyboard accessible", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop-1280",
      "The desktop header navigation is hidden below the lg breakpoint.",
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const navigation = page.getByRole("navigation", { name: "منوی اصلی" });
    const rentalLink = navigation.getByRole("link", { name: "اجاره" });

    await expect(rentalLink).toBeVisible();
    await rentalLink.focus();
    await expect(rentalLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/rentals\/?$/);
  });

  test("mobile menu opens from the keyboard", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile-320",
      "This interaction is specific to the mobile navigation.",
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const menuButton = page.getByRole("button", { name: "منو" });
    await menuButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("mobile-navigation-drawer")).toBeVisible();
    await expect(
      page.getByTestId("mobile-navigation-drawer").getByRole("navigation"),
    ).toBeVisible();
  });

  test("anonymous users cannot access the admin API", async ({ request }) => {
    const response = await request.get("/api/admin/users");
    expect(response.status()).toBe(401);
  });
});
