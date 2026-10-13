import type { Metadata } from "next";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profiel" };

export default function ProfilePage() {
  return <ProfileForm />;
}
