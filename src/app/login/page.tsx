import Image from "next/image";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-hhc-black px-4 py-16">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-lg">
        <div className="mb-6 text-center">
          <Image
            src="/branding/hhc-mark.png"
            alt="HHC Hardenberg"
            width={72}
            height={72}
            className="mx-auto mb-3 h-[72px] w-[72px]"
            priority
          />
          <h1 className="text-xl font-bold">Design Editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Log in om clubafbeeldingen te maken.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
