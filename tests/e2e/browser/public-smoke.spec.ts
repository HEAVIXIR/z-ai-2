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


  test("login and registration fields expose accessible names without submitting data", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile-320",
      "Form accessibility smoke runs once on the mobile project.",
    );

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("textbox", { name: "موبایل / ایمیل" })).toBeVisible();
    await expect(page.getByLabel("رمز عبور", { exact: true })).toHaveAttribute("autocomplete", "current-password");

    await page.goto("/register", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("نام", { exact: true })).toBeVisible();
    await expect(page.getByLabel("نام خانوادگی", { exact: true })).toBeVisible();
    await expect(page.getByLabel("شماره موبایل", { exact: true })).toHaveAttribute("required", "");
    await expect(page.getByLabel("ایمیل", { exact: true })).toHaveAttribute("type", "email");
    await expect(page.getByLabel("رمز عبور", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByLabel("نام شرکت", { exact: true })).toBeVisible();
  });


  test("anonymous Store catalog APIs provide read-only search and filter envelopes", async ({ request }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-mobile-320",
      "Store catalog API smoke runs once against the isolated CI Store database.",
    );

    const partsResponse = await request.get(
      "/api/store/parts?q=__heavix_e2e_no_matching_part__",
    );
    expect(partsResponse.status()).toBe(200);
    expect(partsResponse.headers()["content-type"]).toContain("application/json");
    const parts = await partsResponse.json();
    expect(Array.isArray(parts.parts)).toBe(true);
    expect(typeof parts.total).toBe("number");
    expect(parts.currency).toBeTruthy();

    const categoriesResponse = await request.get("/api/store/categories");
    expect(categoriesResponse.status()).toBe(200);
    const categories = await categoriesResponse.json();
    expect(Array.isArray(categories.categories)).toBe(true);

    const brandsResponse = await request.get("/api/store/brands");
    expect(brandsResponse.status()).toBe(200);
    const brands = await brandsResponse.json();
    expect(Array.isArray(brands.brands)).toBe(true);
  });

  test("anonymous users cannot access the admin API", async ({ request }) => {
    const response = await request.get("/api/admin/users");
    expect(response.status()).toBe(401);
  });
});
