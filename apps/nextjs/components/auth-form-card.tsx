"use client";

import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormCardProps = {
  mode: "login" | "sign-up";
};

async function imageFileToDataUrl(file: File): Promise<string> {
  const source = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare profile picture.");

    context.drawImage(
      image,
      (image.naturalWidth - size) / 2,
      (image.naturalHeight - size) / 2,
      size,
      size,
      0,
      0,
      512,
      512,
    );
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(source);
  }
}

async function uploadProfilePicture(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/users/profile-picture", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Could not upload profile picture.");
  }
}

export function AuthFormCard({ mode }: AuthFormCardProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(
    null,
  );
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
          phoneNumber: phoneNumber.trim(),
          birthday,
          email: email.trim(),
          password,
          image: profilePicture ?? undefined,
        } as Parameters<typeof authClient.signUp.email>[0] & {
          birthday?: string;
          phoneNumber?: string;
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

    if (isSignUp && profilePictureFile) {
      await uploadProfilePicture(profilePictureFile).catch(() => undefined);
    }

    startTransition(() => {
      router.replace("/calendar");
      router.refresh();
    });
  };

  return (
    <Card className="w-full max-w-md border border-divider bg-content1/95 shadow-xl shadow-primary/10">
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
            <>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-divider bg-default-50 p-3">
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;

                    try {
                      setError(null);
                      setProfilePicture(await imageFileToDataUrl(file));
                      setProfilePictureFile(file);
                    } catch {
                      setProfilePicture(null);
                      setProfilePictureFile(null);
                      setError("Could not prepare that profile picture.");
                    }
                  }}
                />
                {profilePicture ? (
                  <img
                    alt="Selected profile"
                    className="h-14 w-14 rounded-xl object-cover"
                    src={profilePicture}
                  />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-default-200 text-xl text-foreground-500">
                    +
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    Profile picture
                  </span>
                  <span className="block text-xs text-foreground-500">
                    {profilePicture ? "Choose a different photo" : "Optional"}
                  </span>
                </span>
              </label>
              <Input
                label="Name"
                value={name}
                onValueChange={setName}
                isRequired
                autoComplete="name"
              />
              <Input
                label="Phone number (optional)"
                type="tel"
                value={phoneNumber}
                onValueChange={setPhoneNumber}
                autoComplete="tel"
              />
              <Input
                label="Birthday"
                type="date"
                value={birthday}
                onValueChange={setBirthday}
                isRequired
                max={new Date().toISOString().slice(0, 10)}
              />
            </>
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
              !email.trim() ||
              !password ||
              (isSignUp && (!name.trim() || !birthday))
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
