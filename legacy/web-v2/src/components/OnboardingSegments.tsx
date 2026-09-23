// Discrete N-segment progress bar shared by the onboarding steps that use
// this style in their own Stitch mockup (invite_co_parent, Onboarding -
// Choose Your Plan) — distinct from OnboardingProgress.tsx's continuous-fill
// bar (create_your_account, tell_us_about_your_child use that one instead).
// Previously duplicated inline in OnboardingInvitePage; factored out here so
// the new Plan step doesn't duplicate it a third time.
export function OnboardingSegments({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  label: string;
}) {
  return (
    <div className="w-full px-container-padding py-6">
      <div className="flex gap-2 w-full justify-between mb-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full flex-1 ${
              i < step ? "bg-primary" : "bg-surface-container-highest"
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between items-center text-label-sm font-label-sm text-outline px-1 mt-1">
        <span>
          Step {step} of {total}
        </span>
        <span>{label}</span>
      </div>
    </div>
  );
}
