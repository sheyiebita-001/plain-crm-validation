const COMPLAINTS = [
  'Started at $40/month. Three years in we’re paying $8,400/year and can’t leave.',
  'Every contact you add increases the bill. Growth gets punished, not rewarded.',
  'The features you actually use are gated behind enterprise tiers.',
];

export function ProblemSection() {
  return (
    <section id="problem" className="border-t border-neutral-200 px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-serif text-2xl tracking-tight text-neutral-900 sm:text-3xl">
          The complaints we keep hearing
        </h2>
        <ul className="mt-8 space-y-6">
          {COMPLAINTS.map((complaint) => (
            <li
              key={complaint}
              className="border-l-2 border-teal-700 pl-5 text-lg leading-relaxed text-neutral-700"
            >
              &ldquo;{complaint}&rdquo;
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
