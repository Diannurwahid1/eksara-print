import { AppGuard } from "@/components/app-guard";
import { SiteFooter, SiteHeader } from "@/components/ui";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppGuard><SiteHeader app/><main className="app-main">{children}</main><SiteFooter/></AppGuard>;
}
