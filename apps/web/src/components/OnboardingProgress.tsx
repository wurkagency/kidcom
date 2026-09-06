// Progress bar header shared by the onboarding steps (create_your_account,
// tell_us_about_your_child, invite_co_parent) — mirrors each mockup's
// step-of-4 header exactly.
export function OnboardingProgress({
  step,
  total = 4,
  title,
  subtitle,
}: {
  step: number;
  total?: number;
  title: string;
  subtitle: string;
}) {
  return (
    <header className="px-container-padding py-6 flex flex-col gap-4">
      <div className="w-full h-1 bg-surface-variant rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
      <div className="flex justify-between items-end">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-text-main">
            {title}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">{subtitle}</p>
        </div>
        <span className="font-label-sm text-label-sm text-primary shrink-0">
          Step {step} of {total}
        </span>
      </div>
    </header>
  );
}
