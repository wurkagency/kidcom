// Shared by SignupPage and ResetPasswordPage's strength meters — a coarse,
// client-side-only heuristic (this app has no server-side password-strength
// policy beyond the 8-character minimum both routes already enforce), so
// it's presented as a glance-value hint, not a hard gate beyond that.
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  return { score: score as 0 | 1 | 2 | 3 | 4, label: labels[score] };
}
