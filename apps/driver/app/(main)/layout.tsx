import { DriverTabBar } from "../../components/driver-tab-bar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <DriverTabBar />
    </div>
  );
}
