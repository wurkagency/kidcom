import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ALL_RELATIONSHIP_TYPES, type RelationshipType } from "@kidcom/shared";
import { useActiveChildren, useCreateInvite, useNavigate, useSearchParams, useT } from "@kidcom/core";

import { ChildField, EditorTitle, Field, FormCard, FormError, PrimaryButton } from "../components/Form";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// Invite family (no Stitch export; DESIGN.md form parts): an email invite
// with the person's relationship to the child. Siblings get their own
// accounts from the family screen instead.

const INVITABLE = ALL_RELATIONSHIP_TYPES.filter((r) => r !== "BROTHER" && r !== "SISTER");

export function InviteScreen() {
  const navigate = useNavigate();
  return <InviteForm onDone={() => navigate(-1)} />;
}

/** Also onboarding's second step. */
export function InviteForm({ onDone, hideTitle, footer }: { onDone: () => void; hideTitle?: boolean; footer?: ReactNode }) {
  const { t } = useT("children");
  const [params] = useSearchParams();
  const { children } = useActiveChildren();
  const invitable = children.filter((c) => c.myRole !== "FAMILY");
  const [picked, setChildId] = useState<string | null>(params.get("child"));
  const childId = picked ?? invitable[0]?.id ?? "";
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<RelationshipType>("GRANDMOTHER_MAT");
  const [error, setError] = useState<string | null>(null);
  const invite = useCreateInvite();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError(t("invite.emailRequired"));
    invite.mutate(
      { childId, email: email.trim(), relationship },
      {
        onSuccess: () => {
          toast(t("invite.sent", { email: email.trim() }));
          onDone();
        },
        onError: (err) => setError(err instanceof Error ? err.message : t("edit.failed")),
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col w-full pb-6 gap-space-lg">
      {!hideTitle && <EditorTitle>{t("invite.title")}</EditorTitle>}
      {!hideTitle && <p className="font-body-md text-body-md text-secondary -mt-4">{t("invite.intro")}</p>}
      <FormCard>
        <ChildField kids={invitable} value={childId} onChange={setChildId} />
        <Field id="email" label={t("invite.email")}>
          <Input id="email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("invite.emailPlaceholder")} />
        </Field>
        <Field id="relationship" label={t("invite.relationship")} hint={t("invite.relationshipHint")}>
          <Select value={relationship} onValueChange={(v) => setRelationship(v as RelationshipType)}>
            <SelectTrigger id="relationship" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVITABLE.map((r) => (
                <SelectItem key={r} value={r}>
                  {t(`relationship.${r}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormCard>
      <FormError message={error} />
      <PrimaryButton icon="send" disabled={invite.isPending || !childId}>
        {t("invite.send")}
      </PrimaryButton>
      {footer}
    </form>
  );
}
