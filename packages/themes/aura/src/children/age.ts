import { dateKey } from "@kidcom/core";

/** Completed years on the Copenhagen calendar today. */
export function childAge(birthday: string, today = dateKey()): number {
  const b = birthday.slice(0, 10);
  let age = Number(today.slice(0, 4)) - Number(b.slice(0, 4));
  if (today.slice(5) < b.slice(5)) age--;
  return Math.max(0, age);
}
