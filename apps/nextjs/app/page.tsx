import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Higher Habits | Build a life you want to live",
  description:
    "Higher Habits is a habit-tracking and daily-planning app for goals, tasks, reflections, and optional Google Calendar planning.",
};

const features = [
  {
    title: "Build consistent habits",
    description:
      "Track the small actions that move your health, faith, relationships, and work forward.",
  },
  {
    title: "Turn goals into steps",
    description:
      "Break meaningful goals into checkpoints, tasks, and daily progress you can actually finish.",
  },
  {
    title: "Plan with your calendar",
    description:
      "See your Google Calendar events alongside your habits and schedule planning reminders in one place.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <section className="relative isolate">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-40 top-0 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-80 -z-10 h-96 w-96 rounded-full bg-secondary/20 blur-3xl"
        />

        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 lg:px-8">
          <Link
            className="text-xl font-black tracking-tight text-foreground"
            href="/"
          >
            Higher Habits
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-5">
            <Link
              className="text-sm font-semibold text-foreground-600 hover:text-foreground"
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-600"
              href="/login"
            >
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-20">
          <div className="max-w-2xl">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-primary">
              Make progress visible
            </p>
            <h1 className="max-w-xl text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Build habits that support the life you want.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-foreground-600 sm:text-xl">
              Higher Habits is a habit-tracking and daily-planning app. Turn
              goals into daily actions, reflect on your progress, and organize
              your time with optional Google Calendar integration.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                className="rounded-full bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-600"
                href="/sign-up"
              >
                Create your account
              </Link>
              <Link
                className="rounded-full border border-divider bg-content1 px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-content2"
                href="#google-data"
              >
                How Google data is used
              </Link>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md rounded-[2rem] border border-divider bg-content1 p-4 shadow-xl shadow-primary/10">
            <div className="rounded-[1.5rem] bg-content2 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground-500">
                    Today
                  </p>
                  <p className="mt-1 text-2xl font-black text-foreground">
                    Keep your momentum
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-bold text-primary">
                  3 of 4
                </span>
              </div>
              <div className="mt-6 space-y-3">
                {[
                  ["Morning walk", true],
                  ["Read and reflect", true],
                  ["Plan tomorrow", true],
                  ["Call a friend", false],
                ].map(([label, complete]) => (
                  <div
                    className="flex items-center gap-3 rounded-2xl bg-content1 px-4 py-3"
                    key={label as string}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black ${
                        complete
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-default-300"
                      }`}
                    >
                      {complete ? "✓" : ""}
                    </span>
                    <span className="font-semibold text-foreground">
                      {label as string}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-sm leading-6 text-foreground-500">
                Habits, goals, tasks, and calendar events in one calm place.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-divider bg-content2/60">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
              One place to follow through
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Simple tools for meaningful progress.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <article
                className="rounded-3xl border border-divider bg-content1 p-6"
                key={feature.title}
              >
                <h3 className="text-lg font-bold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-3 leading-7 text-foreground-600">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="google-data"
        className="mx-auto max-w-6xl px-6 py-20 lg:px-8"
      >
        <div className="rounded-3xl border border-divider bg-content1 p-7 sm:p-10">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary">
            Your choice, clearly explained
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            Google data is optional and used for specific features.
          </h2>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-foreground-600">
            You can use Higher Habits without connecting Google Calendar. When
            you choose Google sign-in or calendar integration, we only use the
            information needed to provide those features.
          </p>

          <div className="mt-8 grid gap-6 border-t border-divider pt-8 md:grid-cols-2">
            <div>
              <h3 className="text-lg font-bold">Google Sign-In</h3>
              <p className="mt-2 leading-7 text-foreground-600">
                Google provides your name, email address, and profile photo so
                Higher Habits can create and identify your account. We do not
                use Google sign-in to access your email or files.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold">Google Calendar</h3>
              <p className="mt-2 leading-7 text-foreground-600">
                If you connect Google Calendar, Higher Habits reads events from
                your primary calendar to show them alongside your plan. It can
                also create and update Higher Habits planning events so your
                habits, goals, and tasks can be scheduled with your day.
              </p>
            </div>
          </div>

          <p className="mt-8 text-sm leading-6 text-foreground-500">
            You can disconnect Google Calendar from Settings, and you can read
            the full details in our{" "}
            <Link
              className="font-semibold text-primary underline"
              href="/privacy"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </section>

      <footer className="border-t border-divider">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 text-sm text-foreground-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p>Higher Habits helps you make the next good action easier.</p>
          <div className="flex gap-5">
            <Link
              className="font-semibold hover:text-foreground"
              href="/privacy"
            >
              Privacy Policy
            </Link>
            <Link
              className="font-semibold hover:text-foreground"
              href="/support"
            >
              Support
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
