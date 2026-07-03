import { afterEach, describe, expect, test, vi } from "vitest";
import { picsumProvider } from "@/services/images/picsum";

function mockFetchList() {
  return vi.fn(async (url: string | URL) => {
    return {
      ok: true,
      status: 200,
      json: async () => [
        { id: "10", author: "Ada", width: 3000, height: 2000 },
        { id: "11", author: "Grace", width: 3000, height: 2000 },
      ],
    } as unknown as Response & { url: typeof url };
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("picsum provider", () => {
  test("maps the list API into puzzle images", async () => {
    vi.stubGlobal("fetch", mockFetchList());
    const images = await picsumProvider.curated(undefined, 1);
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({
      id: "picsum-10",
      provider: "picsum",
      author: "Ada",
    });
    expect(images[0]!.url).toContain("/id/10/");
    expect(images[0]!.thumbUrl).toContain("/id/10/");
  });

  test("different categories fetch different pages", async () => {
    const fetchMock = mockFetchList();
    vi.stubGlobal("fetch", fetchMock);
    await picsumProvider.curated("ocean", 1);
    await picsumProvider.curated("animals", 1);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).not.toBe(urls[1]);
  });

  test("same category is a stable page (deterministic browsing)", async () => {
    const fetchMock = mockFetchList();
    vi.stubGlobal("fetch", fetchMock);
    await picsumProvider.curated("ocean", 1);
    await picsumProvider.curated("ocean", 1);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe(urls[1]);
  });

  test("throws ProviderError with rateLimited on 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429 }) as Response));
    await expect(picsumProvider.curated(undefined, 1)).rejects.toMatchObject({ rateLimited: true });
  });

  test("is always available (keyless fallback guarantee)", () => {
    expect(picsumProvider.isAvailable()).toBe(true);
  });
});
