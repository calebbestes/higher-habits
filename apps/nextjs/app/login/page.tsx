export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AuthFormCard } from "@/components/auth-form-card";
import { getServerSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getServerSession();

  if (session) {
    redirect("/calendar");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.22),_transparent_40%),linear-gradient(180deg,_rgba(10,12,16,1),_rgba(17,24,39,1))] px-4 py-10">
      <AuthFormCard mode="login" />
    </div>
  );
}
