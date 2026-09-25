import { useState } from "react";
import { paths, useCreateThread, useCurrentUser, useMessageablePeople, useNavigate, useT } from "@kinnd/core";

import { EmptyCard } from "../calendar/Sections";
import { EditorTitle, FormCard, FormError, PrimaryButton } from "../components/Form";
import { Icon } from "../components/Icon";
import { PersonAvatar } from "../components/PersonAvatar";
import { cn } from "../lib/utils";
import { Checkbox } from "../ui/checkbox";

// New message (no Stitch export; DESIGN.md form parts): pick one person or
// several (a group) from everyone you share a child with. An existing
// one-to-one conversation is reopened rather than duplicated.

export function ComposeScreen() {
  const { t } = useT("messages");
  const me = useCurrentUser();
  const navigate = useNavigate();
  const people = useMessageablePeople(me.id);
  const create = useCreateThread();
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const start = () => {
    setError(null);
    create.mutate(picked, {
      onSuccess: ({ id }) => navigate(paths.messages.thread(id), { replace: true }),
      onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
    });
  };

  return (
    <div className="flex flex-col w-full pb-6 gap-space-lg">
      <EditorTitle>{t("new")}</EditorTitle>
      {people.length === 0 ? (
        <EmptyCard icon="group_add" text={t("nobody")} to={paths.family.invite()} action={t("invite")} />
      ) : (
        <FormCard className="gap-0 p-2">
          {people.map((p) => {
            const name = `${p.firstName} ${p.lastName}`.trim();
            const on = picked.includes(p.userId);
            return (
              <label
                key={p.userId}
                className={cn("flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors", on ? "bg-surface-container-low" : "hover:bg-surface-container-low/60")}
              >
                <PersonAvatar mediaId={p.avatarUrl} initials={`${p.firstName.charAt(0)}${p.lastName.charAt(0)}`} className="w-10 h-10" />
                <div className="flex-1 min-w-0">
                  <p className="font-title-md text-title-md text-on-surface truncate">{name}</p>
                  <p className="font-label-sm text-label-sm text-secondary truncate">{t(`calendar:people.relationship.${p.relationship}`)}</p>
                </div>
                <Checkbox checked={on} onCheckedChange={() => toggle(p.userId)} aria-label={t("pick", { name })} />
              </label>
            );
          })}
        </FormCard>
      )}
      <FormError message={error} />
      {people.length > 0 && (
        <PrimaryButton type="button" icon={picked.length > 1 ? "groups" : "chat"} disabled={picked.length === 0 || create.isPending} onClick={start}>
          {picked.length > 1 ? t("startGroup", { count: picked.length }) : t("start")}
        </PrimaryButton>
      )}
      <p className="flex items-center gap-2 font-label-sm text-label-sm text-secondary">
        <Icon name="lock" className="text-[14px]" />
        {t("privacy")}
      </p>
    </div>
  );
}
