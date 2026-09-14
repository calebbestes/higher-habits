import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Higher Habits",
  description: "Privacy policy for Higher Habits.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Higher Habits
          </p>
          <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-foreground-500">
            Last updated: September 10, 2026
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">What We Collect</h2>
          <p>
            Higher Habits collects the information needed to run your account
            and sync your goals, plans, journal entries, photos, friends, shared
            goals, notification preferences, and app settings. This may include
            your name, email address, phone number, profile photo, goal and task
            data, journal text, uploaded photos, comments, props, friend
            relationships, and device push notification tokens.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Contacts</h2>
          <p>
            If you choose to find friends from contacts, Higher Habits compares
            contact emails and phone numbers with existing Higher Habits
            accounts. Contact identifiers are used only for this lookup and are
            not stored.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Photos and User Content</h2>
          <p>
            Photos and journal content you upload are used to show your goal
            history and, when you choose to share, to show progress to friends.
            Your progress is private unless you choose a sharing setting that
            makes it visible to friends.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Notifications</h2>
          <p>
            If you enable notifications, Higher Habits uses a device push token
            to send reminders, friend activity, shared goal updates, and
            progress notifications based on your settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Diagnostics</h2>
          <p>
            Higher Habits uses diagnostics and crash reporting to understand
            failures and improve reliability. Diagnostic reports may include
            device, app, and error details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Advertising</h2>
          <p>
            Higher Habits may show sponsored content from advertising partners
            such as Google AdMob. Ads may use app and device information to
            deliver, measure, and limit ads. Higher Habits requests
            non-personalized ads unless you separately grant tracking permission
            where required.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Third-Party Services</h2>
          <p>
            Higher Habits uses Vercel, Inc. for hosting and server execution;
            Supabase, Inc. for PostgreSQL database and file storage; Expo, Inc.
            for push notification delivery; Sentry for crash and error
            reporting; and Google LLC for Google Sign-In, the Google Calendar
            API, and Google AdMob. These providers process information on our
            behalf to provide their services to Higher Habits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Google User Data and Sharing</h2>
          <p>
            When you use Google Sign-In, Higher Habits receives your Google
            name, email address, profile image, account identifier, and
            authentication information so we can create and secure your Higher
            Habits account. When you connect Google Calendar, Higher Habits uses
            only the Google access you grant through the
            <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
              calendar.events
            </code>{" "}
            scope to read events from your primary calendar and create, update,
            or delete events created by Higher Habits. This lets you see your
            calendar alongside your plan and schedule habits, goals, and tasks.
            Higher Habits does not access your Gmail, Google Drive, contacts, or
            other Google services.
          </p>
          <p>
            Google user data is shared, transferred, or disclosed only to the
            following recipients for the purposes described here:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              Google LLC receives authentication requests and authorized
              Calendar API requests so Google Sign-In and Google Calendar
              integration can work.
            </li>
            <li>
              Vercel, Inc. processes data when it hosts and runs the Higher
              Habits server, and Supabase, Inc. stores account records, OAuth
              credentials, calendar data, and user content in the database and
              file storage used by Higher Habits.
            </li>
          </ul>
          <p>
            We do not sell Google user data, use it for advertising, or transfer
            it to advertising networks. We do not use Google user data to train
            generalized artificial-intelligence or machine-learning models. We
            limit our use of Google user data to providing the user-facing
            Google Sign-In and Google Calendar features described above. Human
            access is not permitted except with your explicit consent for a
            specific support request, when needed for security, or when required
            by law. The use of information received from Google APIs adheres to
            the Google API Services User Data Policy, including its Limited Use
            requirements. We do not disclose Google user data to any other third
            party except as required by law or to protect the security and
            rights of Higher Habits, our users, or the public.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Data Protection</h2>
          <p>
            Higher Habits protects sensitive data, including Google OAuth
            credentials, calendar data, journal entries, and photos, using
            HTTPS/TLS for data in transit; server-side storage for OAuth
            credentials so they are not placed in the client application;
            server-side secrets and authenticated API access controls; and
            user-level access checks and sharing settings. Google Calendar is
            requested with the least-privilege
            <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
              calendar.events
            </code>{" "}
            scope. Our hosting, database, and storage providers use encryption
            at rest and access controls for stored data. When you disconnect
            Google Calendar, Higher Habits revokes the Google token and removes
            the connection from your account. Account deletion removes the
            Higher Habits account data and uploaded photos under our control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Account Deletion</h2>
          <p>
            You can delete your account in the app from Settings. Deleting your
            account permanently removes your account, associated app data, and
            uploaded photos controlled by Higher Habits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Contact</h2>
          <p>
            For privacy or support questions, contact estes.caleb.b@gmail.com.
          </p>
        </section>
      </div>
    </main>
  );
}
