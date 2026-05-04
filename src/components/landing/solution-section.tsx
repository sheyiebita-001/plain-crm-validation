export function SolutionSection() {
  return (
    <section
      id="solution"
      className="border-t border-neutral-200 bg-stone-100 px-6 py-20 sm:py-24"
    >
      <div className="mx-auto max-w-3xl">
        <p className="font-serif text-2xl leading-snug tracking-tight text-neutral-900 sm:text-3xl">
          A flat-priced CRM. <span className="text-teal-700">$197 once</span> to set up,{' '}
          <span className="text-teal-700">$19/month</span> forever.
        </p>
        <p className="mt-6 text-lg leading-relaxed text-neutral-700 sm:text-xl">
          No contact tax. No seat tax. No 60-day cancel clauses. The CRM you wanted HubSpot to be.
        </p>
      </div>
    </section>
  );
}
