"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormCardProps = {
  mode: "login" | "sign-up";
};

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSignUp = mode === "sign-up";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = isSignUp
      ? await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        })
      : await authClient.signIn.email({
          email: email.trim(),
          password,
        });

    setIsSubmitting(false);

    if (response.error) {
      setError(response.error.message ?? "Unable to continue.");
      return;
    }

    startTransition(() => {
      router.replace("/calendar");
      router.refresh();
    });
  };

  return (
    <Card className="w-full max-w-md border border-divider/60 bg-content1/90 shadow-2xl shadow-black/20">
      <CardHeader className="flex flex-col items-start gap-1 px-6 pt-6">
        <p className="text-2xl font-semibold text-foreground">
          {isSignUp ? "Create your account" : "Welcome back"}
        </p>
        <p className="text-sm text-foreground-500">
          {isSignUp
            ? "Sign up to keep your goals, categories, and progress separate."
            : "Sign in to get back to your goals and calendar."}
        </p>
      </CardHeader>
      <CardBody className="px-6 pb-6 pt-3">
        <form className="space-y-4" onSubmit={handleSubmit}>
          {isSignUp ? (
            <Input
              label="Name"
              value={name}
              onValueChange={setName}
              isRequired
              autoComplete="name"
            />
          ) : null}
          <Input
            label="Email"
            type="email"
            value={email}
            onValueChange={setEmail}
            isRequired
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onValueChange={setPassword}
            isRequired
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            type="submit"
            color="primary"
            className="w-full"
            isLoading={isSubmitting}
            isDisabled={
              !email.trim() || !password || (isSignUp && !name.trim())
            }
          >
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-foreground-500">
          {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
          <Link
            href={isSignUp ? "/login" : "/sign-up"}
            className="font-medium text-primary"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
