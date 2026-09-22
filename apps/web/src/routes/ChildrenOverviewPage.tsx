import { Link } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { useAuth } from "../lib/AuthContext";
import { useHeaderConfig } from "../lib/HeaderContext";

// Originally the destination of the bottom nav's "Kids" tab; that tab was
// dropped in the Aura-driven nav restructuring (see BottomNav.tsx) in favor
// of reaching this page from the header's child-avatar cluster on every tab
// root (see HeaderChildCluster.tsx) — so it needs its own back-chevron
// header now instead of the tab-root treatment Header.tsx used to give it.
export function ChildrenOverviewPage() {
  const { children } = useAuth();
  useHeaderConfig({ title: "Children", backTo: "/" }, []);

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

  return (
    <div className="flex flex-col w-full px-container-padding pt-6 pb-32 gap-section-margin">
      <h1 className="font-display-lg text-display-lg text-on-surface">Children</h1>
      <div className="flex flex-col gap-3">
        {children.map((child) => {
          const age = new Date(child.birthday).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
          return (
            <Link
              key={child.id}
              to={`/children/${child.id}`}
              className="bg-surface-container-lowest rounded-xl p-4 shadow-sm flex items-center gap-3"
            >
              <Avatar
                name={`${child.firstName} ${child.lastName}`}
                avatarAssetId={child.profileImageUrl}
                kind="child"
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <p className="font-headline-md text-headline-md text-on-surface truncate">
                  {child.firstName} {child.lastName}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
                  <Icon name="cake" className="text-[14px]" /> {age}
                </p>
              </div>
              <Icon name="chevron_right" className="text-on-surface-variant shrink-0" />
            </Link>
          );
        })}
      </div>

      <Link
        to="/onboarding/child"
        className="w-full py-3.5 px-4 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="add" className="text-base" />
        <span className="font-semibold">Add new kid</span>
      </Link>
    </div>
  );
}
