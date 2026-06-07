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
    <div className="auth-page-background flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthFormCard mode="login" />
    </div>
  );
}
