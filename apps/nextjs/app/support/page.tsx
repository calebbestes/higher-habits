import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support | Higher Habits",
  description: "Get help with Higher Habits.",
};

export default function SupportPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Higher Habits
          </p>
          <h1 className="text-4xl font-black tracking-tight">Support</h1>
          <p className="text-sm text-foreground-500">
            We&apos;re here to help.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Contact Us</h2>
          <p>
            Questions, bug reports, or feedback? Email us at{" "}
            <a
              className="font-semibold text-primary underline"
              href="mailto:estes.caleb.b@gmail.com"
            >
              estes.caleb.b@gmail.com
            </a>{" "}
            and we&apos;ll get back to you as soon as we can.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Common Questions</h2>
          <p>
            <span className="font-semibold">How do I delete my account?</span>{" "}
            Open Higher Habits, go to Settings, and choose Delete Account. This
            permanently removes your account and associated app data.
          </p>
          <p>
            <span className="font-semibold">How is my data handled?</span> Your
            progress is private unless you choose to share it. See our{" "}
            <a className="font-semibold text-primary underline" href="/privacy">
              Privacy Policy
            </a>{" "}
            for details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Response Time</h2>
          <p>
            We typically respond to support requests within a few business days.
          </p>
        </section>
      </div>
    </main>
  );
}
