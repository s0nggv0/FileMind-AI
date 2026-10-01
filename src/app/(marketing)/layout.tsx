import { LandingNavbar } from "@/features/landing/landing-navbar";
import { Footer } from "@/features/landing/footer";
import { landingNavigation } from "@/mocks/landing";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-interactive bg-card p-3 focus:not-sr-only">跳到主要内容</a>
      <LandingNavbar links={landingNavigation} />
      <main id="main-content">{children}</main>
      <Footer />
    </div>
  );
}
