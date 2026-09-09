import { Link } from "react-router-dom";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { useAuth } from "../lib/AuthContext";

// No Stitch mockup exists for this screen (checked every folder under
// docs/stitch_splitkid/ — there's no "children_overview"/"kids_overview").
// Built fresh instead, following the card-list visual language already used
// by ListsPage/ChildProfilePage rather than translating a mockup file. This
// is the destination of the bottom nav's "Kids" tab (see BottomNav.tsx) —
// each card links straight into that child's existing profile page.
export function ChildrenOverviewPage() {
  const { children } = useAuth();

  if (children.length === 0) {
    return (
      <section className="px-container-padding pt-6 flex flex-col gap-section-margin">
        <h1 className="font-display-lg text-display-lg text-on-surface">Kids</h1>
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
      <h1 className="font-display-lg text-display-lg text-on-surface">Kids</h1>
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
        className="w-full py-3.5 px-4 rounded-full bg-growth-green text-on-primary font-label-md text-label-md shadow-md hover:brightness-110 transition-all flex items-center justify-center gap-2"
      >
        <Icon name="add" className="text-base" />
        <span className="font-semibold">Add new kid</span>
      </Link>
    </div>
  );
}
