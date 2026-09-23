import { useState, type ReactNode } from "react";
import { Link, paths, useFormat, useNavigate, useSearch, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { ScreenTitle } from "../components/ScreenTitle";

// Search (no Stitch export; DESIGN.md parts): one field across everything
// the user can see — children, calendar, moments and list items — grouped,
// each result opening where it lives.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 font-label-sm text-label-sm text-secondary uppercase tracking-wider">{title}</h2>
      <div className="rounded-[28px] bg-surface-container-lowest border border-outline-variant/30 shadow-[0_2px_10px_rgba(0,0,0,0.02)] p-2 flex flex-col">{children}</div>
    </section>
  );
}

function Row({ to, icon, avatar, title, meta }: { to: string; icon?: string; avatar?: ReactNode; title: string; meta?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-container-low transition-colors">
      {avatar ?? (
        <span className="w-10 h-10 rounded-full bg-surface-container-low flex items-center justify-center text-secondary shrink-0">
          <Icon name={icon ?? "search"} className="text-[20px]" />
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block font-title-md text-title-md text-on-surface truncate">{title}</span>
        {meta && <span className="block font-label-sm text-label-sm text-secondary truncate">{meta}</span>}
      </span>
      <Icon name="chevron_right" className="text-[20px] text-secondary shrink-0" />
    </Link>
  );
}

export function SearchScreen() {
  const { t } = useT("search");
  const fmt = useFormat();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const { data, isFetching, query } = useSearch(text);
  const results = query.length >= 2 ? data : undefined;
  const total = results ? results.children.length + results.events.length + results.moments.length + results.listItems.length : 0;

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <ScreenTitle
        trailing={
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => navigate(-1)}
            className="w-11 h-11 rounded-full bg-surface-container-lowest shadow-[0_1px_6px_rgba(0,0,0,0.03)] flex items-center justify-center text-on-surface"
          >
            <Icon name="close" className="text-[20px]" />
          </button>
        }
      >
        {t("title")}
      </ScreenTitle>
      <label className="-mt-4 flex items-center gap-space-xs h-12 px-space-md rounded-full bg-surface-container-lowest shadow-[0_1px_6px_rgba(0,0,0,0.03)]">
        <Icon name="search" className="text-secondary text-[20px]" />
        <input
          autoFocus
          type="search"
          aria-label={t("placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("placeholder")}
          className="flex-1 min-w-0 bg-transparent font-body-lg text-body-lg text-on-surface placeholder:text-secondary focus:outline-none"
        />
        {isFetching && <Icon name="progress_activity" className="text-secondary text-[18px] animate-spin" />}
      </label>

      {query.length < 2 && <p className="px-1 font-body-md text-body-md text-secondary">{t("hint")}</p>}
      {results && total === 0 && !isFetching && <p className="px-1 font-body-md text-body-md text-secondary">{t("none", { query })}</p>}

      {results && results.children.length > 0 && (
        <Section title={t("children")}>
          {results.children.map((c) => (
            <Row
              key={c.id}
              to={paths.children.profile(c.id)}
              title={`${c.firstName} ${c.lastName}`.trim()}
              avatar={<PersonAvatar mediaId={c.profileImageUrl} initials={c.firstName.charAt(0)} className="w-10 h-10" />}
            />
          ))}
        </Section>
      )}
      {results && results.events.length > 0 && (
        <Section title={t("calendar")}>
          {results.events.map((e) => (
            <Row
              key={e.id}
              to={paths.events.detail(e.childId, e.id)}
              icon="calendar_today"
              title={e.title}
              meta={e.allDay ? fmt.date(e.startsAt) : `${fmt.date(e.startsAt)}, ${fmt.time(e.startsAt)}`}
            />
          ))}
        </Section>
      )}
      {results && results.moments.length > 0 && (
        <Section title={t("moments")}>
          {results.moments.map((m) => (
            <Row key={m.id} to={paths.moments.detail(m.childId, m.id)} icon="photo_library" title={m.title} meta={fmt.date(m.createdAt)} />
          ))}
        </Section>
      )}
      {results && results.listItems.length > 0 && (
        <Section title={t("lists")}>
          {results.listItems.map((i) => (
            <Row key={i.id} to={paths.lists.edit(i.childId, i.id)} icon="checklist" title={i.title} meta={t(`lists:types.${i.type}`)} />
          ))}
        </Section>
      )}
    </div>
  );
}
