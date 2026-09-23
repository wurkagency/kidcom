import type { ReactNode } from "react";
import type { ChildSummary } from "@kidcom/shared";
import { Link, paths, useActiveChildren, useFormat, useNavigate, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { childAge } from "./age";

// kidcom_children: every child you're connected to — pick which ones the
// app shows (the same selection as the header's child selector), open or
// edit a profile, add or connect a child. "My children" are those you're a
// parent or guardian of; "Children in family" those you follow as family.

const card = "flex items-center gap-3.5 bg-surface-container-lowest p-3.5 shadow-[0_4px_24px_rgba(0,0,0,0.03)] relative overflow-hidden transition-all duration-200 hover:shadow-md rounded";
const countPill = "font-micro-meta text-micro-meta px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold";

function SelectBox({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "shrink-0 w-6 h-6 flex items-center justify-center transition-transform active:scale-95 rounded-lg",
        checked ? "bg-primary text-on-primary shadow-xs" : "border-2 border-outline-variant/30 hover:border-secondary bg-surface-container-lowest",
      )}
    >
      {checked && <Icon name="check" className="text-[16px]" />}
    </button>
  );
}

export function ChildrenScreen() {
  const { t } = useT("children");
  const { children, filter, isSelected, selectAll, setSelection } = useActiveChildren();
  const mine = children.filter((c) => c.myRole !== "FAMILY");
  const family = children.filter((c) => c.myRole === "FAMILY");
  const allSelected = filter.kind === "all";
  const selectedCount = allSelected ? children.length : filter.childIds.length;

  const toggle = (id: string) => {
    const current = allSelected ? [] : filter.childIds;
    setSelection(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  return (
    <div className="flex flex-col w-full pb-space-lg pt-2">
      <div className="mb-space-lg">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{t("title")}</h1>
        </div>
        <p className="font-body-md text-body-md text-secondary">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-space-lg">
        {children.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between pt-1 mb-0.5">
              <h2 className="text-on-surface font-title-md text-title-md">{t("allChildren")}</h2>
              <span className={cn(countPill, "bg-secondary-container text-on-secondary-fixed")}>{t("count", { count: children.length })}</span>
            </div>
            <div className={card}>
              <SelectBox checked={allSelected} label={t("selectAll")} onClick={selectAll} />
              <div className="relative shrink-0 w-12 h-12">
                {children.slice(0, 3).map((c, i) => (
                  <PersonAvatar
                    key={c.id}
                    mediaId={c.profileImageUrl}
                    initials={c.firstName.charAt(0)}
                    className={cn(
                      "absolute w-7 h-7 shadow-sm ring-2 ring-surface-container-lowest",
                      i === 0 && "top-0 left-0 z-10",
                      i === 1 && "top-0 right-0 z-20",
                      i === 2 && "bottom-0 left-2.5 z-30",
                    )}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-title-md text-title-md text-on-surface truncate">{t("selectAll")}</h2>
                <p className="font-label-sm text-label-sm text-secondary truncate">{t("selected", { count: selectedCount })}</p>
              </div>
            </div>
          </div>
        )}

        {mine.length > 0 && (
          <Group title={t("mine")} count={mine.length} highlight>
            {mine.map((c) => (
              <ChildRow key={c.id} child={c} checked={isSelected(c.id)} onToggle={() => toggle(c.id)} showToggle={children.length > 1} />
            ))}
          </Group>
        )}

        {family.length > 0 && (
          <Group title={t("familyChildren")} count={family.length}>
            {family.map((c) => (
              <ChildRow key={c.id} child={c} checked={isSelected(c.id)} onToggle={() => toggle(c.id)} showToggle={children.length > 1} />
            ))}
          </Group>
        )}

        <div className="flex flex-col items-center text-center p-6 bg-surface-container-low transition-all rounded">
          <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-fixed flex items-center justify-center mb-3 shadow-sm">
            <Icon name="person_add" className="text-[24px]" />
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mb-1">{t("connect.title")}</h3>
          <p className="font-body-md text-body-md text-secondary max-w-xs mb-4">{t("connect.body")}</p>
          <Link
            to={paths.children.create()}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-full bg-primary-container text-on-primary font-label-md text-label-md shadow-md active:scale-98 transition-transform mb-2.5"
          >
            <Icon name="add_circle" className="text-[18px]" />
            <span>{t("connect.button")}</span>
          </Link>
          <span className="font-micro-meta text-micro-meta text-secondary uppercase tracking-wider">{t("connect.plan")}</span>
        </div>
      </div>
    </div>
  );
}

function Group({ title, count, highlight, children }: { title: string; count: number; highlight?: boolean; children: ReactNode }) {
  const { t } = useT("children");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between pt-1 mb-0.5">
        <h2 className="text-on-surface font-title-md text-title-md">{title}</h2>
        <span className={cn(countPill, highlight ? "bg-secondary-container text-on-secondary-fixed" : "bg-surface-container-high text-on-surface-variant")}>
          {t("count", { count })}
        </span>
      </div>
      {children}
    </div>
  );
}

function ChildRow({ child, checked, onToggle, showToggle }: { child: ChildSummary; checked: boolean; onToggle: () => void; showToggle: boolean }) {
  const { t } = useT("children");
  const fmt = useFormat();
  const navigate = useNavigate();
  const name = `${child.firstName} ${child.lastName}`.trim();
  return (
    <div className={card}>
      {showToggle && <SelectBox checked={checked} label={t("select", { name })} onClick={onToggle} />}
      <button type="button" onClick={() => navigate(paths.children.profile(child.id))} className="flex items-center gap-3.5 flex-1 min-w-0 text-left">
        <PersonAvatar mediaId={child.profileImageUrl} initials={child.firstName.charAt(0)} className="w-12 h-12 shadow-sm shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h2 className="font-title-md text-title-md text-on-surface truncate">{name}</h2>
          </div>
          <p className="font-label-sm text-label-sm text-secondary truncate mb-1">
            {t("ageLine", { age: t("years", { count: childAge(child.birthday) }), date: fmt.date(child.birthday, { day: "2-digit", month: "2-digit", year: "numeric" }) })}
          </p>
          {child.myRole !== "FAMILY" && !child.canEdit && (
            <div className="flex items-center gap-1.5 text-secondary text-micro-meta">
              <Icon name="visibility" className="text-[13px]" />
              <span>{t("readOnly")}</span>
            </div>
          )}
        </div>
      </button>
      <div className="flex items-center shrink-0">
        {child.canEdit ? (
          <Link
            to={paths.children.edit(child.id)}
            aria-label={t("editChild", { name })}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"
          >
            <Icon name="edit" className="text-[16px]" />
          </Link>
        ) : (
          <Link
            to={paths.children.profile(child.id)}
            aria-label={t("viewChild", { name })}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors active:scale-95"
          >
            <Icon name="visibility" className="text-[16px]" />
          </Link>
        )}
      </div>
    </div>
  );
}
