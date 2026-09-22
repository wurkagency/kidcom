// Full-bleed photo hero for the auth screens (Login/Signup/Forgot/Reset),
// matching docs/Themes/Aura/kidcom_login/code.html's treatment: a warm
// family photo behind a gradient fading to the surface color, with the
// KidCom mark and tagline overlaid at the bottom.
//
// Reuses /images/welcome-hero.jpg (WelcomePage.tsx's existing photo) rather
// than a new asset — it's already a real, licensed project photo in
// exactly the register the mockup calls for, so there was no need to source
// or generate a new one.
export function AuthHero() {
  return (
    <div className="relative w-full h-56 shrink-0 overflow-hidden">
      <img src="/images/welcome-hero.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-on-surface/10 via-on-surface/5 to-surface" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-surface-container-lowest/90 backdrop-blur-md flex items-center justify-center shadow-lg mb-2">
          <img src="/logo.svg" alt="" className="w-7 h-7 object-contain" />
        </div>
        <h1 className="font-headline-sm text-headline-sm text-inverse-on-surface drop-shadow-sm">KidCom</h1>
        <p className="font-label-sm text-label-sm text-inverse-on-surface/90 mt-0.5 drop-shadow-sm">
          Family collaboration and sharing
        </p>
      </div>
    </div>
  );
}
