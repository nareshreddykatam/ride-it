import { PassengerTabBar } from "../../components/passenger-tab-bar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <PassengerTabBar />
    </div>
  );
}
