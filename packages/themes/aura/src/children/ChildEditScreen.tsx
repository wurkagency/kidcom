import { useState, type FormEvent } from "react";
import {
  ALL_RELATIONSHIP_TYPES,
  isParentShapedRelationship,
  type ChildDetail,
  type ChildGender,
  type RelationshipType,
} from "@kidcom/shared";
import { paths, useChild, useCreateChild, useNavigate, useParams, useT, useUpdateChild } from "@kidcom/core";

import { DateField, EditorTitle, Field, FormCard, FormError, PrimaryButton } from "../components/Form";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

// Add a child / edit a child's basics (no Stitch export; DESIGN.md form
// parts). Adding as someone other than a parent (e.g. a grandparent setting
// the child up) needs a parent's contact: KidCom invites them.

const GENDERS: ChildGender[] = ["BOY", "GIRL", "OTHER"];
const segmentedGroup = "w-full flex items-center p-1 rounded-full bg-surface-container/50 border border-outline-variant/30";
// Siblings are added from the family screen as minor members, not as creators.
const CREATOR_RELATIONSHIPS = ALL_RELATIONSHIP_TYPES.filter((r) => r !== "BROTHER" && r !== "SISTER");

export function ChildEditScreen() {
  const { t } = useT("children");
  const { childId } = useParams();
  const { data: existing, isLoading } = useChild(childId);
  if (childId && !existing) return <EditorTitle>{t(isLoading ? "common:loading" : "profile.notFound")}</EditorTitle>;
  return <ChildForm key={existing?.id ?? "new"} existing={existing} />;
}

function ChildForm({ existing }: { existing?: ChildDetail }) {
  const { t } = useT("children");
  const navigate = useNavigate();
  const create = useCreateChild();
  const update = useUpdateChild(existing?.id ?? "");
  const [firstName, setFirstName] = useState(existing?.firstName ?? "");
  const [lastName, setLastName] = useState(existing?.lastName ?? "");
  const [gender, setGender] = useState<ChildGender>(existing?.gender ?? "BOY");
  const [birthday, setBirthday] = useState((existing?.birthday ?? "").slice(0, 10));
  const [clothing, setClothing] = useState(existing?.clothingSize ?? "");
  const [shoe, setShoe] = useState(existing?.shoeSize ?? "");
  const [relationship, setRelationship] = useState<RelationshipType>("MOTHER");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsParent = !existing && !isParentShapedRelationship(relationship);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) return setError(t("edit.firstNameRequired"));
    if (!birthday) return setError(t("edit.birthdayRequired"));
    if (needsParent && (!contactName.trim() || !contactEmail.trim())) return setError(t("edit.parentRequired"));
    const onError = (err: unknown) => setError(err instanceof Error ? err.message : t("edit.failed"));
    const basics = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender,
      birthday,
      ...(clothing.trim() ? { clothingSize: clothing.trim() } : {}),
      ...(shoe.trim() ? { shoeSize: shoe.trim() } : {}),
    };
    if (existing) {
      update.mutate(basics, { onSuccess: () => navigate(paths.children.profile(existing.id), { replace: true }), onError });
      return;
    }
    create.mutate(
      {
        ...basics,
        relationship,
        ...(needsParent ? { parentContact: { name: contactName.trim(), email: contactEmail.trim() } } : {}),
      },
      { onSuccess: (c) => navigate(paths.children.profile(c.id), { replace: true }), onError },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t(existing ? "edit.editTitle" : "edit.createTitle")}</EditorTitle>
      {!existing && <p className="font-body-md text-body-md text-secondary -mt-4">{t("edit.intro")}</p>}

      <FormCard>
        <div className="grid grid-cols-2 gap-3">
          <Field id="first" label={t("edit.firstName")}>
            <Input id="first" value={firstName} maxLength={80} autoComplete="off" onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field id="last" label={t("edit.lastName")}>
            <Input id="last" value={lastName} maxLength={80} autoComplete="off" onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field label={t("edit.gender")}>
          <ToggleGroup type="single" spacing={1} value={gender} onValueChange={(v) => v && setGender(v as ChildGender)} className={segmentedGroup} aria-label={t("edit.gender")}>
            {GENDERS.map((g) => (
              <ToggleGroupItem key={g} value={g} variant="segmented" className="flex-1 h-9">
                {t(`gender.${g}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <DateField id="birthday" label={t("edit.birthday")} value={birthday} onChange={setBirthday} />
      </FormCard>

      <FormCard>
        <div className="grid grid-cols-2 gap-3">
          <Field id="clothing" label={t("measure.clothing")}>
            <Input id="clothing" value={clothing} maxLength={40} onChange={(e) => setClothing(e.target.value)} placeholder={t("edit.clothingPlaceholder")} />
          </Field>
          <Field id="shoe" label={t("measure.shoe")}>
            <Input id="shoe" value={shoe} maxLength={40} onChange={(e) => setShoe(e.target.value)} placeholder={t("edit.shoePlaceholder")} />
          </Field>
        </div>
      </FormCard>

      {!existing && (
        <FormCard>
          <Field id="relationship" label={t("edit.myRelationship")}>
            <Select value={relationship} onValueChange={(v) => setRelationship(v as RelationshipType)}>
              <SelectTrigger id="relationship" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATOR_RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`relationship.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {needsParent && (
            <>
              <p className="font-body-md text-body-md text-secondary">{t("edit.parentIntro")}</p>
              <Field id="parent-name" label={t("edit.parentName")}>
                <Input id="parent-name" value={contactName} maxLength={120} onChange={(e) => setContactName(e.target.value)} />
              </Field>
              <Field id="parent-email" label={t("edit.parentEmail")}>
                <Input id="parent-email" type="email" inputMode="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
              </Field>
            </>
          )}
        </FormCard>
      )}

      <FormError message={error} />
      <PrimaryButton icon="check" disabled={create.isPending || update.isPending}>
        {t(existing ? "edit.save" : "edit.create")}
      </PrimaryButton>
    </form>
  );
}
