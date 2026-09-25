/** Coupon codes are compared case-insensitively, ignoring spaces ("kc-ab cd" = "KC-ABCD"). */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}
