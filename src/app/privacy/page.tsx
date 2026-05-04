import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — Try Signal Bench',
};

export default function PrivacyPage() {
  return (
    <main className="px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-3xl tracking-tight text-neutral-900 sm:text-4xl">
          Privacy
        </h1>

        <div className="mt-10 space-y-6 text-base leading-relaxed text-neutral-700">
          <p>
            This site is a research project. It exists to validate demand for a flat-priced CRM
            alternative to HubSpot before building it.
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">What we collect</h2>
          <p>
            If you fill in the form on the home page, we store: your name, email, company, current
            CRM, your written feedback on what&rsquo;s broken, your feature priorities, your
            willingness-to-pay answers, and whether you want a follow-up call. We also log basic
            technical data (IP address, user agent, UTM source) to detect form spam and understand
            traffic sources.
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">Why</h2>
          <p>
            To decide whether to build the product, who to build it for, and at what price. If we
            ship, you&rsquo;ll be on the launch list. If we don&rsquo;t, we&rsquo;ll email you once
            to say so and remove your details on request.
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">
            Lawful basis (UK GDPR &amp; PECR)
          </h2>
          <p>
            For the cold outreach that may have brought you here: legitimate interest under
            PECR&rsquo;s soft opt-in for B2B communications. For the form data you submit: consent
            (you chose to fill it in).
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">Your rights</h2>
          <p>
            You can request access to, correction of, or deletion of your data at any time. Email{' '}
            <a
              href="mailto:sheyi@trysignalbench.com"
              className="text-teal-700 hover:underline"
            >
              sheyi@trysignalbench.com
            </a>{' '}
            and we will action it within 14 days. You can unsubscribe from any email we send by
            replying &ldquo;remove&rdquo; or clicking the unsubscribe link in the email.
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">How long we keep it</h2>
          <p>
            Form responses: kept until the validation phase ends (around 8 weeks from your
            submission). If we don&rsquo;t ship the product, we delete the data. If we do, we keep
            it for the launch invitation, then delete or migrate per your choice.
          </p>

          <h2 className="pt-4 font-serif text-xl text-neutral-900">Who you are writing to</h2>
          <p>
            Sheyi A, T&amp;O Ventures &middot; United Kingdom &middot;{' '}
            <a
              href="mailto:sheyi@trysignalbench.com"
              className="text-teal-700 hover:underline"
            >
              sheyi@trysignalbench.com
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
