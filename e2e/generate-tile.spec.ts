import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("user generates and downloads a Digital Tile Asset from coordinates", async ({ page }) => {
  await page.route("**/api/interpreter", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 0.6,
        osm3s: { timestamp_osm_base: "2026-07-01T10:00:00Z" },
        elements: [
          { type: "node", id: 1, lat: 52.5199, lon: 13.4049 },
          { type: "node", id: 2, lat: 52.5199, lon: 13.4051 },
          { type: "node", id: 3, lat: 52.5201, lon: 13.4051 },
          { type: "node", id: 4, lat: 52.5201, lon: 13.4049 },
          { type: "node", id: 101, lat: 52.5198, lon: 13.4045 },
          { type: "node", id: 102, lat: 52.5202, lon: 13.4055 },
          { type: "node", id: 201, lat: 52.5197, lon: 13.4052 },
          { type: "node", id: 202, lat: 52.5197, lon: 13.4054 },
          { type: "node", id: 203, lat: 52.5199, lon: 13.4054 },
          { type: "node", id: 204, lat: 52.5199, lon: 13.4052 },
          {
            type: "way",
            id: 10,
            nodes: [1, 2, 3, 4, 1],
            tags: { building: "yes", height: "12" },
          },
          {
            type: "way",
            id: 100,
            nodes: [101, 102],
            tags: { highway: "residential", width: "7" },
          },
          {
            type: "way",
            id: 200,
            nodes: [201, 202, 203, 204, 201],
            tags: { natural: "water", water: "pond" },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Location").fill("52.52, 13.405");
  await page.getByRole("button", { name: "Generate tile" }).click();

  await expect(page.getByText("Tile ready")).toBeVisible();
  // The same "{count} {label}" strings now render in both the rail's Tile
  // Summary and the preview legend, so scope count assertions to the rail
  // (the <aside>, role "complementary") to keep them unambiguous.
  const summary = page.getByRole("complementary");
  await expect(summary.getByText("1 buildings")).toBeVisible();
  await expect(summary.getByText("1 road")).toBeVisible();
  await expect(summary.getByText("1 water")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GLB" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("hex-tile-52.5200-13.4050-500m.glb");
  const contents = await readFile(await download.path());
  expect(contents.subarray(0, 4).toString()).toBe("glTF");
  expect(contents.includes(Buffer.from("TileBase"))).toBe(true);
  expect(contents.includes(Buffer.from("Buildings"))).toBe(true);
  expect(contents.includes(Buffer.from("RoadSurfaces"))).toBe(true);
  expect(contents.includes(Buffer.from("WaterSurfaces"))).toBe(true);
  expect(contents.includes(Buffer.from("OpenStreetMap contributors"))).toBe(true);
});

test("user selects an address and can export an empty Tile Base", async ({ page }) => {
  await page.route("**/search?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { lat: "-33.8688", lon: "151.2093", display_name: "Sydney, New South Wales, Australia" },
      ]),
    });
  });
  await page.route("**/api/interpreter", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 0.6,
        osm3s: { timestamp_osm_base: "2026-07-01T10:00:00Z" },
        elements: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Location").fill("Sydney Opera House");
  await page.getByRole("button", { name: "Generate tile" }).click();
  await expect(page.getByText("Sydney, New South Wales, Australia")).toBeVisible();
  await page.getByText("Sydney, New South Wales, Australia").click();

  await expect(page.getByText("Tile ready")).toBeVisible();
  await expect(page.getByText("0 features")).toBeVisible();
  await expect(page.getByText("No mapped features found. Base-only export is available.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download GLB" })).toBeEnabled();
  const emptyDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GLB" }).click();
  const emptyDownload = await emptyDownloadPromise;
  const emptyContents = await readFile(await emptyDownload.path());
  expect(emptyContents.subarray(0, 4).toString()).toBe("glTF");
  // Under the eight-mesh omission contract (Task 7), empty layers like
  // WaterSurfaces are dropped; TileBase is the always-present base-only mesh.
  expect(emptyContents.includes(Buffer.from("TileBase"))).toBe(true);
});

test("shared Tile Configuration regenerates with saved colors and span", async ({ page }) => {
  await page.route("**/api/interpreter", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 0.6, elements: [] }),
    });
  });

  await page.goto("/?lat=48.137154&lon=11.576124&span=750&base=%23ccb080&buildings=%23934f36&roads=%235f6258&water=%234f8296");
  await expect(page.getByText("Tile ready")).toBeVisible();
  await expect(page.getByText("750 m")).toBeVisible();
  await expect(page.getByLabel("Tile base color")).toHaveValue("#ccb080");
  await expect(page.getByLabel("Building color")).toHaveValue("#934f36");
  await expect(page.getByLabel("Road surface color")).toHaveValue("#5f6258");
  await expect(page.getByLabel("Water surface color")).toHaveValue("#4f8296");
});

test("map-data-service failure is actionable and retryable", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/interpreter", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 429, body: "Rate limited" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 0.6, elements: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Generate tile" }).click();
  await expect(page.getByText("Map data service returned 429. Try again.")).toBeVisible();
  await page.getByRole("button", { name: "Generate tile" }).click();
  await expect(page.getByText("Tile ready")).toBeVisible();
  expect(attempts).toBe(2);
});

test("transient map-data-service timeout is retried automatically", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/interpreter", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 504, body: "Busy" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 0.6, elements: [] }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Generate tile" }).click();
  await expect(page.getByText("Tile ready")).toBeVisible();
  expect(attempts).toBe(2);
});
