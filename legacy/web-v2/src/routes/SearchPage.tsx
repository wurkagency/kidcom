import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { SearchResponse } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiGet, ApiRequestError } from "../lib/api";
import { useHeaderConfig } from "../lib/HeaderContext";

const DEBOUNCE_MS = 300;

// No dedicated search-results mockup exists among the 20 Aura screens
// (every screen's header shows the same search field, but none of them
// link to a results screen) — this follows Aura's established card/list
// conventions instead of inventing a one-off layout. Real results only:
// children, journal posts, and list items the caller actually has access
// to (see apps/api/src/routes/search/index.ts's RLS-scoped query) — no
// fabricated "top result"/ranking logic, just three grouped, real lists.
export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useHeaderConfig({ title: "Search", backTo: "/" }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true });
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      apiGet<SearchResponse>(`/search?q=${encodeURIComponent(trimmed)}`)
        .then(setResults)
        .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Search failed — try again"))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const trimmed = query.trim();
  const hasAnyResults =
    results && (results.children.length > 0 || results.journalPosts.length > 0 || results.listItems.length > 0);

  return (
    <div className="flex flex-col w-full px-container-padding pt-4 pb-32 gap-section-margin">
      <div className="flex items-center gap-2 h-12 px-4 rounded-full bg-surface-container-lowest shadow-sm">
        <Icon name="search" className="text-on-surface-variant text-[20px] shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search children, moments, lists…"
          className="flex-1 bg-transparent outline-none font-body-md text-body-md text-on-surface"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear search" className="text-on-surface-variant shrink-0">
            <Icon name="close" className="text-[18px]" />
          </button>
        )}
      </div>

      {error && (
        <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">{error}</p>
      )}
      {loading && <p className="font-body-md text-body-md text-on-surface-variant">Searching…</p>}
      {!loading && trimmed.length >= 2 && results && !hasAnyResults && (
        <p className="font-body-md text-body-md text-on-surface-variant">No results for "{trimmed}".</p>
      )}
      {trimmed.length > 0 && trimmed.length < 2 && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">Keep typing…</p>
      )}

      {results && results.children.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Children</h2>
          <div className="flex flex-col gap-2">
            {results.children.map((child) => (
              <Link
                key={child.id}
                to={`/children/${child.id}`}
                className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm flex items-center gap-3"
              >
                <Avatar
                  name={`${child.firstName} ${child.lastName}`}
                  avatarAssetId={child.profileImageUrl}
                  kind="child"
                  size="md"
                />
                <span className="font-label-md text-label-md text-on-surface">
                  {child.firstName} {child.lastName}
                </span>
                <Icon name="chevron_right" className="text-on-surface-variant ml-auto" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {results && results.journalPosts.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Moments</h2>
          <div className="flex flex-col gap-2">
            {results.journalPosts.map((post) => (
              <button
                key={post.id}
                onClick={() => navigate(`/journal/${post.id}?childId=${post.childId}`)}
                className="text-left bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm flex flex-col gap-1"
              >
                <span className="font-label-md text-label-md text-on-surface">{post.title}</span>
                {post.snippet && (
                  <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">{post.snippet}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {results && results.listItems.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Lists</h2>
          <div className="flex flex-col gap-2">
            {results.listItems.map((item) => (
              <Link
                key={item.id}
                to={`/children/${item.childId}/lists/${item.id}`}
                className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm flex items-center gap-3"
              >
                <Icon name={item.type === "WISHLIST" ? "redeem" : "checkroom"} className="text-on-surface-variant" />
                <span className="font-label-md text-label-md text-on-surface">{item.title}</span>
                <Icon name="chevron_right" className="text-on-surface-variant ml-auto" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
