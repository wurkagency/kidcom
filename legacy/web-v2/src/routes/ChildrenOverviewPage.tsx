import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AccessRole, ChildFamilyMember, SubscriptionDto, SubscriptionTier } from "@kidcom/shared";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

const TIER_LABELS: Record<SubscriptionTier, string> = {
  FREE: "Free",
  PARENTS: "Parents",
  FAMILY: "Family",
};

function compactAge(birthday: string): string {
  const years = Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 86400000));
  const date = new Date(birthday).toLocaleDateString(undefined, {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${years} yrs • ${date}`;
}

// Aura's mockup (docs/Themes/Aura/kidcom_children) groups children by the
// viewer's own access role (PARENT vs. GUARDIAN/FAMILY) and shows a
// permission line + Edit/View affordance per child — all real, drawn from
// each child's ChildAccess row, not invented. The mockup's multi-select
// checkboxes ("Select all", per-child checkboxes with no visible bulk
// action) don't map to any real bulk operation this app has, so they're
// left out rather than built as decoration — see the PRODUCT.md-adjacent
// audit notes for that open question.
export function ChildrenOverviewPage() {
  const { user, children } = useAuth();
  useHeaderConfig({ title: "Children", backTo: "/" }, []);

  const [roleByChildId, setRoleByChildId] = useState<Record<string, AccessRole>>({});
  const [subscription, setSubscription] = useState<SubscriptionDto | null>(null);
  const selfId = user?.id;

  useEffect(() => {
    if (!selfId) return;
    let cancelled = false;
    Promise.all(
      children.map(async (child) => {
        const res = await apiGet<{ members: ChildFamilyMember[] }>(`/children/${child.id}/family`);
        return { childId: child.id, members: res.members };
      })
    ).then((results) => {
      if (cancelled) return;
      setRoleByChildId((prev) => {
        const next = { ...prev };
        for (const { childId, members } of results) {
          const mine = members.find((m) => m.userId === selfId);
          if (mine) next[childId] = mine.role;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [children, selfId]);

  useEffect(() => {
    apiGet<SubscriptionDto>("/billing/status")
      .then(setSubscription)
      .catch(() => setSubscription(null));
  }, []);

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-section-margin">
        <h1 className="font-display-lg text-display-lg text-on-surface">Children</h1>
        <div className="bg-surface-container rounded-lg p-6 flex flex-col gap-3">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You haven't added a child yet.
          </p>
          <Link
            to="/onboarding/child"
            className="self-start bg-primary text-on-primary font-label-md text-label-md py-2 px-5 rounded-full"
          >
            Add a child
          </Link>
        </div>
      </section>
    );
  }

  const myChildren = children.filter((c) => roleByChildId[c.id] === "PARENT");
  const familyChildren = children.filter((c) => roleByChildId[c.id] && roleByChildId[c.id] !== "PARENT");
  const pending = children.filter((c) => !roleByChildId[c.id]);

  function ChildRow({ child }: { child: (typeof children)[number] }) {
    const role = roleByChildId[child.id];
    const readOnly = role === "FAMILY";
    return (
      <Link
        key={child.id}
        to={`/children/${child.id}`}
        className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm flex items-center gap-3.5"
      >
        <Avatar
          name={`${child.firstName} ${child.lastName}`}
          avatarAssetId={child.profileImageUrl}
          kind="child"
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <p className="font-title-md text-title-md text-on-surface truncate">
            {child.firstName} {child.lastName}
          </p>
          <p className="font-label-sm text-label-sm text-on-surface-variant truncate mb-1">
            {compactAge(child.birthday)}
          </p>
          {readOnly && (
            <div className="flex items-center gap-1.5 text-on-surface-variant font-micro-meta text-micro-meta">
              <Icon name="visibility" className="text-[13px]" />
              <span>Read-only permissions</span>
            </div>
          )}
        </div>
        <span
          className="flex items-center justify-center w-8 h-8 rounded-full bg-surface-container text-on-surface shrink-0"
          aria-label={readOnly ? "View details" : "Edit profile"}
        >
          <Icon name={readOnly ? "visibility" : "edit"} className="text-[16px]" />
        </span>
      </Link>
    );
  }

  return (
    <div className="flex flex-col w-full px-container-padding pt-6 pb-32 gap-section-margin">
      <div>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">Children</h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">
          Manage child profiles and see who else has access.
        </p>
      </div>

      {myChildren.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-title-md text-title-md text-on-surface">My children</h2>
            <span className="font-micro-meta text-micro-meta px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container uppercase tracking-wider font-semibold">
              {myChildren.length} {myChildren.length === 1 ? "CHILD" : "CHILDREN"}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {myChildren.map((c) => (
              <ChildRow key={c.id} child={c} />
            ))}
          </div>
        </div>
      )}

      {familyChildren.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-title-md text-title-md text-on-surface">Children in family</h2>
            <span className="font-micro-meta text-micro-meta px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant uppercase tracking-wider font-semibold">
              {familyChildren.length} {familyChildren.length === 1 ? "CHILD" : "CHILDREN"}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {familyChildren.map((c) => (
              <ChildRow key={c.id} child={c} />
            ))}
          </div>
        </div>
      )}

      {pending.map((c) => (
        <ChildRow key={c.id} child={c} />
      ))}

      <div className="flex flex-col items-center text-center p-6 bg-surface-container-low rounded-2xl">
        <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center mb-3">
          <Icon name="person_add" className="text-[24px]" />
        </div>
        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-1">Connect child</h3>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-xs mb-4">
          Add a newborn, sibling profile, or accept an invitation code from a co-parent.
        </p>
        <Link
          to="/onboarding/child"
          className="w-full flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform mb-2.5"
        >
          <Icon name="add_circle" className="text-[18px]" />
          <span>Create or Link Profile</span>
        </Link>
        {subscription && (
          <span className="font-micro-meta text-micro-meta text-on-surface-variant uppercase tracking-wider">
            Included in your {TIER_LABELS[subscription.tier]} subscription tier
          </span>
        )}
      </div>
    </div>
  );
}
