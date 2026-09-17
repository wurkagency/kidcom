import { useNavigate } from "react-router-dom";

// Matches docs/stitch_splitkid/welcome_to_splitkid/code.html.
export function WelcomePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface-beige relative overflow-hidden font-body-md text-text-main">
      <div className="absolute -top-[15%] -left-[10%] w-[120%] h-[60%] bg-gradient-to-b from-primary-fixed-dim/20 to-transparent rounded-[100%] blur-3xl opacity-60 z-0" />
      <div className="relative z-10 flex flex-col flex-1 px-container-padding pb-safe pt-section-margin">
        <div className="flex-1 flex flex-col items-center justify-center space-y-element-gap mt-8">
          <div className="w-full max-w-sm aspect-square relative mb-4">
            <div className="absolute inset-0 rounded-[2rem] overflow-hidden transform -rotate-3 shadow-xl shadow-primary/5">
              <img src="/images/welcome-hero.jpg" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="absolute -bottom-4 -right-4 bg-surface-container-lowest rounded-full p-3 shadow-md shadow-primary/10 z-20 flex items-center justify-center">
              <span
                className="material-symbols-outlined text-growth-green text-3xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                favorite
              </span>
            </div>
          </div>
          <div className="text-center space-y-4 max-w-sm mt-8">
            <h1 className="font-display-lg text-display-lg text-on-primary-fixed-variant">
              Kidcom
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed px-4">
              Co-parenting, family collaboration and child memories in a safe space.
            </p>
          </div>
        </div>
        <div className="w-full mt-auto mb-8 space-y-4 max-w-md mx-auto">
          <button
            className="w-full bg-primary text-on-primary font-label-md text-label-md py-4 px-6 rounded-full shadow-md shadow-primary/20 flex items-center justify-center space-x-2 transition-transform active:scale-95"
            onClick={() => navigate("/signup")}
          >
            <span>Get Started</span>
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
          <button
            className="w-full bg-secondary-fixed text-on-secondary-fixed font-label-md text-label-md py-4 px-6 rounded-full flex items-center justify-center transition-transform active:scale-95"
            onClick={() => navigate("/login")}
          >
            <span>Log In</span>
          </button>
        </div>
      </div>
    </div>
  );
}
