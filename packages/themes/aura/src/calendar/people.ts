import type { CategoryDto, ChildFamilyMember } from "@kidcom/shared";
import { useT } from "@kidcom/core";

// How the calendar screens name people and categories.

const PARENT_SHORT = new Set(["FATHER", "MOTHER", "STEP_FATHER", "STEP_MOTHER"]);

/**
 * "Mom" / "Dad" for parents (as the design writes "MOM’S" / "Handled by Dad"),
 * otherwise the person's first name. Unknown or removed → "Former member".
 */
export function usePersonName() {
  const { t } = useT("calendar");
  return (member: ChildFamilyMember | undefined | null): string => {
    if (!member) return t("people.formerMember");
    if (PARENT_SHORT.has(member.relationship)) return t(`people.relationship.${member.relationship}`);
    return member.firstName;
  };
}

/** "Mormor (Inger)" — relationship with first name, for requests and notes. */
export function usePersonWithRelationship() {
  const { t } = useT("calendar");
  const name = usePersonName();
  return (member: ChildFamilyMember | undefined | null): string => {
    if (!member) return t("people.formerMember");
    if (PARENT_SHORT.has(member.relationship)) return name(member);
    return t("people.withRelationship", { relationship: t(`people.relationship.${member.relationship}`), name: member.firstName });
  };
}

export const findMember = (members: ChildFamilyMember[], userId: string | null | undefined) =>
  userId ? members.find((m) => m.userId === userId) : undefined;

/** A category's display name: translated for built-in ones, the owner's name for custom ones. */
export function useCategoryName() {
  const { t } = useT("categories");
  return (category: CategoryDto | undefined | null): string =>
    !category ? t("none") : category.key ? t(`system.${category.key}`) : (category.name ?? t("none"));
}
