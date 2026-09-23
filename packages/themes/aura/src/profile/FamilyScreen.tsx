import type { ChildFamilyMember } from "@kidcom/shared";
import { Link, paths, useChildren, useCurrentUser, useFamilies, useT } from "@kidcom/core";

import { EmptyCard } from "../calendar/Sections";
import { MenuGroup } from "../components/MenuList";
import { PersonAvatar } from "../components/PersonAvatar";
import { ScreenTitle } from "../components/ScreenTitle";
import { Icon } from "../components/Icon";
import { primaryButtonClass } from "../components/Form";

// Family (Profile menu; no Stitch export — DESIGN.md list cards): everyone
// in the family circle across your children, what they are to each child,
// and inviting someone new. Relationships are edited on the child's profile.

type Person = { member: ChildFamilyMember; roles: { childId: string; childName: string; relationship: ChildFamilyMember["relationship"] }[] };

export function FamilyScreen() {
  const { t } = useT("profile");
  const me = useCurrentUser();
  const { data: children = [], isLoading } = useChildren();
  const families = useFamilies(children.map((c) => c.id));

  const byId = new Map<string, Person>();
  for (const child of children) {
    for (const m of families.get(child.id) ?? []) {
      const p = byId.get(m.userId) ?? { member: m, roles: [] };
      p.roles.push({ childId: child.id, childName: child.firstName, relationship: m.relationship });
      byId.set(m.userId, p);
    }
  }
  // You first, then by first name.
  const people = [...byId.values()].sort((a, b) =>
    a.member.userId === me.id ? -1 : b.member.userId === me.id ? 1 : a.member.firstName.localeCompare(b.member.firstName),
  );

  const parents = people.filter((p) => p.member.role !== "FAMILY");
  const family = people.filter((p) => p.member.role === "FAMILY");

  return (
    <div className="flex flex-col w-full pb-28 gap-space-lg">
      <ScreenTitle>{t("family")}</ScreenTitle>
      <p className="-mt-6 font-body-md text-body-md text-secondary">{t("familyIntro")}</p>
      {!isLoading && children.length === 0 && <EmptyCard icon="child_care" text={t("noChildren")} to={paths.children.create()} action={t("addChild")} />}
      {parents.length > 0 && (
        <MenuGroup title={t("parents")}>
          {parents.map((p) => (
            <PersonRow key={p.member.userId} person={p} you={p.member.userId === me.id} />
          ))}
        </MenuGroup>
      )}
      {family.length > 0 && (
        <MenuGroup title={t("extendedFamily")}>
          {family.map((p) => (
            <PersonRow key={p.member.userId} person={p} you={p.member.userId === me.id} />
          ))}
        </MenuGroup>
      )}
      {children.length > 0 && (
        <Link to={paths.family.invite()} className={primaryButtonClass}>
          <Icon name="person_add" className="text-[18px]" />
          {t("invite")}
        </Link>
      )}
    </div>
  );
}

function PersonRow({ person, you }: { person: Person; you: boolean }) {
  const { t } = useT("profile");
  const m = person.member;
  return (
    <div className="flex items-center gap-3 p-3.5">
      <PersonAvatar mediaId={m.avatarUrl} initials={`${m.firstName.charAt(0)}${m.lastName.charAt(0)}`} className="w-10 h-10" />
      <div className="flex-1 min-w-0">
        <p className="font-label-md text-label-md text-on-surface truncate">
          {`${m.firstName} ${m.lastName}`.trim()}
          {you && <span className="text-secondary font-normal"> {t("you")}</span>}
        </p>
        <div className="flex flex-wrap gap-1 mt-1">
          {person.roles.map((r) => (
            <Link
              key={r.childId}
              to={paths.children.profile(r.childId)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-low font-micro-meta text-micro-meta text-on-surface-variant normal-case tracking-normal font-semibold"
            >
              {t("roleFor", { relationship: t(`children:relationship.${r.relationship}`), child: r.childName })}
            </Link>
          ))}
          {m.isMinorMember && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-peach font-micro-meta text-micro-meta text-on-surface normal-case tracking-normal font-semibold">
              <Icon name="shield_person" className="text-[12px]" />
              {t("minor")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
