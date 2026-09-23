import type { Page, Route } from "@playwright/test";
import type { ChildSummary, PublicUser } from "@kidcom/shared";

// API fixtures mirroring the people and content in the Stitch exports
// (Charlie; children Leo, Maya, Ida), so rendered screens are comparable
// with docs/design/aura. Visual tests never touch the real API.

export type Fixture = {
  me: PublicUser | null;
  children: ChildSummary[];
  /** Media id → image bytes served from GET /api/media/:id */
  media: Record<string, Buffer>;
  /** Extra JSON routes: "GET /children/c1/moments" → body */
  routes?: Record<string, unknown>;
};

export const charlie: PublicUser = {
  id: "u-charlie",
  email: "charlie@example.com",
  firstName: "Charlie",
  lastName: "Nielsen",
  avatarUrl: "m-charlie",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  phone: "+4520123456",
  phoneVerifiedAt: "2026-01-01T00:00:00.000Z",
  pendingPhone: null,
  hasPassword: true,
  oauthProviders: [],
  themeId: "aura",
  locale: "en-US",
};

const child = (id: string, firstName: string, gender: ChildSummary["gender"], birthday: string): ChildSummary => ({
  id,
  firstName,
  lastName: "Nielsen",
  gender,
  birthday,
  profileImageUrl: null,
  clothingSize: null,
  shoeSize: null,
});

export const leo = child("c-leo", "Leo", "BOY", "2018-05-14");
export const maya = child("c-maya", "Maya", "GIRL", "2020-09-02");
export const ida = child("c-ida", "Ida", "GIRL", "2022-02-11");

export async function mockApi(page: Page, fixture: Fixture) {
  // Match on the path prefix only: a "**/api/**" glob would also swallow
  // Vite's own module requests (e.g. /@fs/.../packages/core/src/api/client.ts).
  await page.route((url) => url.pathname.startsWith("/api/"), async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, "");
    const key = `${route.request().method()} ${path}`;

    if (key === "GET /auth/me") return route.fulfill({ json: { user: fixture.me } });
    if (key === "GET /children") return route.fulfill({ json: { children: fixture.children } });

    const media = route.request().method() === "GET" && !(key in (fixture.routes ?? {})) ? path.match(/^\/media\/([^/]+)$/) : null;
    if (media) {
      const body = fixture.media[decodeURIComponent(media[1])];
      return body ? route.fulfill({ body, contentType: "image/png" }) : route.fulfill({ status: 404 });
    }

    if (fixture.routes && key in fixture.routes) return route.fulfill({ json: fixture.routes[key] });
    return route.fulfill({ status: 404, json: { error: `No fixture for ${key}` } });
  });
}
