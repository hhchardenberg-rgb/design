import { AccountTabs } from "./account-tabs";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AccountTabs />
      {children}
    </div>
  );
}
