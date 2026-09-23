import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, useT } from "@kidcom/core";

import { Icon } from "../components/Icon";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

// The "Mobile Phone" field of docs/design/aura/kidcom_sign_up: a flag + dial
// code pill (shadcn Select) beside the national number.

/** Country select + national number, as on the signup screen. */
export function PhoneNumberField({
  countryIso,
  onCountryChange,
  value,
  onChange,
  invalid,
}: {
  countryIso: string;
  onCountryChange: (iso: string) => void;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const { t } = useT("auth");
  const country = PHONE_COUNTRIES.find((c) => c.iso === countryIso) ?? DEFAULT_PHONE_COUNTRY;
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-label-md text-label-md text-on-surface" htmlFor="phone">
        {t("signup.phone")}
      </Label>
      <div className="flex items-center gap-2">
        <Select value={countryIso} onValueChange={onCountryChange}>
          <SelectTrigger aria-label={t("signup.country")} className="font-title-md">
            <SelectValue>
              <span className="text-[18px] leading-none">{country.flag}</span>
              <span className="font-medium text-body-md text-on-surface">{`+${country.dial}`}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {PHONE_COUNTRIES.map((c) => (
              <SelectItem key={c.iso} value={c.iso}>
                <span className="text-[18px] leading-none">{c.flag}</span>
                <span>{t(`countries.${c.iso}`)}</span>
                <span className="text-secondary">{`+${c.dial}`}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 flex items-center">
          <Icon name="call" className="absolute left-4 text-secondary text-[20px] pointer-events-none" />
          <input
            className="w-full h-12 pl-12 pr-4 rounded-full bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline outline-none focus:bg-surface-container focus:text-on-surface transition-all aria-invalid:ring-2 aria-invalid:ring-error"
            id="phone"
            type="tel"
            autoComplete="tel-national"
            inputMode="tel"
            required
            placeholder={country.example}
            aria-invalid={invalid || undefined}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
      {invalid && <p className="px-4 font-label-sm text-label-sm text-error">{t("errors.PHONE_INVALID")}</p>}
    </div>
  );
}

