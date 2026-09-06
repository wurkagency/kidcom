import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ChildGender, ChildSummary, CreateChildRequest } from "@kidcom/shared";

import { OnboardingProgress } from "../components/OnboardingProgress";
import { FormInput } from "../components/FormInput";
import { Icon } from "../components/Icon";
import { apiPost, ApiRequestError } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

const GENDERS: { value: ChildGender; label: string }[] = [
  { value: "BOY", label: "Boy" },
  { value: "GIRL", label: "Girl" },
  { value: "OTHER", label: "Other" },
];

// Matches docs/stitch_splitkid/tell_us_about_your_child/code.html. Photo
// upload from the mockup is deferred — media handling lands with the
// journal/media chunk, which is where file storage actually gets built.
export function OnboardingChildPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [gender, setGender] = useState<ChildGender>("BOY");
  const [clothingSize, setClothingSize] = useState("");
  const [shoeSize, setShoeSize] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiPost<ChildSummary>("/children", {
        firstName,
        lastName: lastName || undefined,
        gender,
        birthday,
        clothingSize: clothingSize || undefined,
        shoeSize: shoeSize || undefined,
      } satisfies CreateChildRequest);
      await refresh();
      navigate("/onboarding/invite");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface text-on-surface pb-safe">
      <OnboardingProgress
        step={2}
        title="Let's meet your child"
        subtitle="Adding their details helps personalize their journal and keep their sizes handy for everyone."
      />
      <form onSubmit={handleSubmit} className="flex-1 px-container-padding py-4 flex flex-col gap-6">
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <div className="w-32 h-32 rounded-full bg-surface-container-high flex items-center justify-center shadow-sm">
            <Icon name="add_a_photo" className="text-4xl text-on-surface-variant" />
          </div>
          <span className="font-label-md text-label-md text-on-surface-variant">
            Photo upload comes in a later chunk
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormInput
            id="first-name"
            label="First Name"
            placeholder="E.g. Leo"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
          <FormInput
            id="last-name"
            label="Last Name"
            placeholder="Optional"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <FormInput
          id="birthday"
          label="Birthday"
          icon="calendar_month"
          type="date"
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          required
        />

        <div className="flex flex-col gap-1.5">
          <label className="font-label-md text-label-md text-text-main" id="gender-label">
            Gender
          </label>
          <div
            className="flex p-1 bg-surface-container-high rounded-xl gap-1"
            role="group"
            aria-labelledby="gender-label"
          >
            {GENDERS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => setGender(g.value)}
                className={`flex-1 py-2 font-label-md text-label-md rounded-lg transition-colors text-center ${
                  gender === g.value
                    ? "bg-surface-container-lowest text-text-main shadow-sm"
                    : "text-on-surface-variant"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-container rounded-lg p-5 shadow-sm mt-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container shrink-0">
              <Icon name="checkroom" className="text-sm" />
            </div>
            <div>
              <h3 className="font-label-md text-label-md text-text-main">Current Sizes</h3>
              <p className="text-sm text-on-surface-variant leading-tight">
                Helpful for grandparents &amp; co-parents
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              id="clothing-size"
              label="Clothing"
              placeholder="E.g. 4T"
              value={clothingSize}
              onChange={(e) => setClothingSize(e.target.value)}
            />
            <FormInput
              id="shoe-size"
              label="Shoe Size"
              placeholder="E.g. 10C"
              value={shoeSize}
              onChange={(e) => setShoeSize(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="font-body-md text-body-md text-error bg-error-container rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 mt-auto pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 bg-primary text-on-primary rounded-full font-label-md text-label-md shadow-md active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span>{submitting ? "Saving…" : "Save & Continue"}</span>
            {!submitting && <span className="material-symbols-outlined text-lg">arrow_forward</span>}
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full py-3 text-on-surface-variant font-label-md text-label-md hover:text-text-main transition-colors text-center"
          >
            I'll add this later
          </button>
        </div>
      </form>
    </div>
  );
}
