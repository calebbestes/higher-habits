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
            Last updated: September 16, 2026
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
            When you use Google Sign-In, Higher Habits accesses your Google
            name, email address, profile image, Google account identifier, and
            authentication information. We use this information to create,
            identify, and secure your Higher Habits account. We do not use
            Google Sign-In to access your Gmail, Google Drive, Google Contacts,
            or other Google services.
          </p>
          <p>
            When you separately connect Google Calendar, Higher Habits accesses
            the primary calendar data needed for the Calendar screen, including
            event identifiers, titles, descriptions, start and end times, time
            zones, status, recurrence, and display colors. We request only the
            access you grant through the
            <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
              calendar.events
            </code>{" "}
            and{" "}
            <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
              calendar.calendarlist.readonly
            </code>{" "}
            scopes. Higher Habits uses those permissions to read events from
            your primary calendar, read calendar and event display colors, and
            create, update, or delete events created by Higher Habits. We may
            send the title, description, date, time, time zone, recurrence, and
            color for a Higher Habits plan to Google Calendar when you choose to
            schedule it there. Calendar event content read for display is not
            intentionally stored in the Higher Habits database; we retain only
            the identifiers needed to update or delete events created by Higher
            Habits.
          </p>
          <p>
            Google user data is shared, transferred, or disclosed only to these
            specific recipients, for these specific purposes:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Google LLC</strong> receives authentication requests and
              authorized Google Calendar API requests. During calendar sync,
              Higher Habits sends plan event details to Google to create,
              update, or delete Higher Habits planning events in your Google
              Calendar, and Google returns the calendar data needed to display
              your events in Higher Habits.
            </li>
            <li>
              <strong>Vercel, Inc.</strong> processes Google account data, OAuth
              credentials, and Calendar API responses while it hosts and runs
              the Higher Habits server.
            </li>
            <li>
              <strong>Supabase, Inc.</strong> stores the Google account
              identifier, OAuth credentials, granted scopes, and Higher Habits
              records containing Google Calendar event identifiers in the
              database used by Higher Habits.
            </li>
          </ul>
          <p>
            We do not share Google user data with Sentry, Expo, Google AdMob,
            advertisers, friends, other Higher Habits users, data brokers, or
            information resellers. We do not sell Google user data, use it for
            advertising, or use it to train generalized artificial-intelligence
            or machine-learning models. We use Google user data only to provide
            or improve the user-facing Google Sign-In and Google Calendar
            features described above. Human access is prohibited except when you
            give affirmative consent to view specific data for a support
            request, when needed for security, or when required by law. We do
            not disclose Google user data to any other third party except as
            required by law, necessary to protect the security of the service or
            its users, or as part of a merger, acquisition, or sale of assets
            after obtaining your explicit prior consent. Our use of information
            received from Google APIs complies with the
            <a
              className="font-semibold text-primary underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Data Protection</h2>
          <p>
            Higher Habits protects sensitive data, including Google account
            data, OAuth credentials, calendar data, journal entries, and photos,
            using the following safeguards:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              HTTPS/TLS encrypts data in transit between the app, Higher Habits
              servers, Google, and our service providers.
            </li>
            <li>
              Google OAuth credentials are stored server-side in the protected
              database and are never placed in the web or mobile client. Server
              secrets are kept in protected server configuration, and mobile
              session credentials use Expo SecureStore.
            </li>
            <li>
              Authenticated, user-scoped API access checks prevent one user from
              accessing another user&apos;s Google connection or app data.
              Google Calendar data is requested only when the connected user
              asks to view or sync it.
            </li>
            <li>
              Google Calendar access uses the least-privilege
              <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
                calendar.events
              </code>{" "}
              and{" "}
              <code className="rounded bg-default-100 px-1 py-0.5 text-sm">
                calendar.calendarlist.readonly
              </code>{" "}
              scopes.
            </li>
            <li>
              Our hosting, database, and storage providers use encryption at
              rest and access controls for stored data. Uploaded photos use
              private storage and short-lived signed URLs.
            </li>
            <li>
              When you disconnect Google Calendar, Higher Habits revokes the
              Google access tokens and removes the local connection. Account
              deletion removes the Higher Habits account data, Google account
              connection data, event identifiers, and uploaded photos under our
              control.
            </li>
          </ul>
          <p>
            We retain Google Sign-In account information while your Higher
            Habits account is active. We retain Google Calendar OAuth
            credentials only while Google Calendar is connected and delete them
            when you disconnect or delete your account. We retain event
            identifiers only as long as needed to synchronize or remove Higher
            Habits events. Legal, security, and backup-retention requirements
            may require limited additional retention.
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
