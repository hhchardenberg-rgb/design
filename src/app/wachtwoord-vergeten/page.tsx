import type { Metadata } from "next";
import Image from "next/image";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Wachtwoord vergeten" };

export default function ForgotPasswordPage() {
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
          <h1 className="text-xl font-bold">Wachtwoord vergeten</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vul je e-mailadres in. Als er een account bij hoort, sturen we een link om een nieuw wachtwoord in te
            stellen.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
