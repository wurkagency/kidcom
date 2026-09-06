export function PlaceholderScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <section className="px-container-padding pt-6 flex flex-col gap-2">
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">
        {title}
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
      <div className="mt-section-margin bg-surface-container rounded-lg p-6 text-on-surface-variant font-body-md text-body-md">
        This screen is scaffolded — built out in a later chunk against the Stitch
        design source.
      </div>
    </section>
  );
}
