import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | float",
  description: "Privacy policy for float.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-background px-6 py-12 text-foreground">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            float
          </p>
          <h1 className="text-4xl font-black tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-foreground-500">
            Effective date: July 3, 2026
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">What We Collect</h2>
          <p>
            float collects the information needed to run your account and sync
            your goals, plans, journal entries, photos, friends, shared goals,
            notification preferences, and app settings. This may include your
            name, email address, phone number, profile photo, goal and task
            data, journal text, uploaded photos, comments, props, friend
            relationships, and device push notification tokens.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Contacts</h2>
          <p>
            If you choose to find friends from contacts, float compares contact
            emails and phone numbers with existing float accounts. Contact
            identifiers are used only for this lookup and are not stored.
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
            If you enable notifications, float uses a device push token to send
            reminders, friend activity, shared goal updates, and progress
            notifications based on your settings.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Diagnostics</h2>
          <p>
            float uses diagnostics and crash reporting to understand failures
            and improve reliability. Diagnostic reports may include device, app,
            and error details.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Advertising</h2>
          <p>
            float may show sponsored content from advertising partners such as
            Google AdMob. Ads may use app and device information to deliver,
            measure, and limit ads. float requests non-personalized ads unless
            you separately grant tracking permission where required.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Third-Party Services</h2>
          <p>
            float uses service providers for authentication, hosting, database
            storage, file storage, push notifications, crash reporting, and
            advertising. If you connect Google Calendar, float uses the Google
            Calendar access you grant to read and manage calendar events for
            planning features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">Account Deletion</h2>
          <p>
            You can delete your account in the app from Settings. Deleting your
            account permanently removes your account, associated app data, and
            uploaded photos controlled by float.
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
