import type { Metadata } from "next";
import Image from "next/image";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nieuw wachtwoord instellen" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <div className="flex flex-1 items-center justify-center bg-hhc-black px-4 py-16">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-lg">
        <div className="mb-6 text-center">
          <Image
            src="/branding/hhc-logo.png"
            alt="HHC Hardenberg"
            width={76}
            height={96}
            className="mx-auto mb-3 h-24 w-auto"
            priority
          />
          <h1 className="text-xl font-bold">Nieuw wachtwoord instellen</h1>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
