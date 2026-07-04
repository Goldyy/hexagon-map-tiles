import { expect, test } from "@playwright/test";

const EMPTY_RESPONSE = { version: 0.6, elements: [] };

// React tracks input values through its own setter, so a plain `el.value = …`
// is ignored. Set through the native prototype setter and dispatch `input` to
// drive the app's onChange the way a real edit would.
async function setColor(input: import("@playwright/test").Locator, value: string) {
  await input.evaluate((element, hex) => {
    const field = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(field, hex);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

test("Custom theme seeds from the active preset, persists edits, and round-trips to the URL", async ({ page }) => {
  await page.route("**/api/interpreter", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(EMPTY_RESPONSE) });
  });

  await page.goto("/?lat=52.520000&lon=13.405000&span=500");
  await expect(page.getByText("Tile ready")).toBeVisible();

  // Under a preset the palette is fixed: the editor is hidden behind a hint.
  await expect(page.getByText("Preset palettes are fixed.")).toBeVisible();
  await expect(page.getByLabel("Building color")).toHaveCount(0);

  // Entering Custom seeds the editable palette from Sandstone (buildings #b3a389).
  await page.getByRole("button", { name: "Custom" }).click();
  await expect(page.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Building color")).toHaveValue("#b3a389");

  // Editing a colour flows into React state (the hex label) and the share URL.
  await setColor(page.getByLabel("Building color"), "#123456");
  await expect(page.getByText("#123456")).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("buildings")).toBe("#123456");

  // Toggling back to a preset hides the editor but keeps the Custom edit.
  // (exact, so it doesn't also match the "Reset to Sandstone" button.)
  await page.getByRole("button", { name: "Sandstone", exact: true }).click();
  await expect(page.getByLabel("Building color")).toHaveCount(0);
  await page.getByRole("button", { name: "Custom" }).click();
  await expect(page.getByLabel("Building color")).toHaveValue("#123456");

  // Reset re-seeds from the source preset.
  await page.getByRole("button", { name: /Reset to/ }).click();
  await expect(page.getByLabel("Building color")).toHaveValue("#b3a389");
});

test("a shared URL carrying colour params opens directly in Custom mode", async ({ page }) => {
  await page.route("**/api/interpreter", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(EMPTY_RESPONSE) });
  });

  await page.goto("/?lat=52.520000&lon=13.405000&span=500&buildings=%23123456");
  await expect(page.getByText("Tile ready")).toBeVisible();
  await expect(page.getByRole("button", { name: "Custom" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Building color")).toHaveValue("#123456");
});
