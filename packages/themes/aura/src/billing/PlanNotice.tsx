import { Link, paths, useT } from "@kinnd/core";

import { FormError } from "../components/Form";
import { Icon } from "../components/Icon";
import { billingErrorText, isPlanError } from "./errors";

// Shown where a plan limit stops something (a Single can't invite, custody
// planning needs a Circle, storage is full …): what's needed, and a way to
// the plans. Either give the API error, or the text to show.
export function PlanNotice({ error, text }: { error?: unknown; text?: string }) {
  const { t } = useT("billing");
  const message = text ?? billingErrorText(error, t);
  return (
    <div role="status" className="p-space-md rounded-[24px] bg-peach text-on-surface flex items-start gap-3">
      <Icon name="workspace_premium" className="text-[20px] shrink-0" />
      <div className="flex flex-col gap-2 min-w-0">
        <p className="font-body-md text-body-md">{message}</p>
        <Link to={paths.billing.checkout()} className="font-label-md text-label-md underline underline-offset-4 self-start">
          {t("seePlans")}
        </Link>
      </div>
    </div>
  );
}

/**
 * A failed action's message: plan limits (a Circle needed, children or
 * storage full) as a PlanNotice with the way to the plans, anything else as
 * the usual form error.
 */
export function ActionError({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null;
  if (isPlanError(error)) return <PlanNotice error={error} />;
  return <FormError message={error instanceof Error && error.message ? error.message : fallback} />;
}
