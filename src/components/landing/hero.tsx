export function Hero() {
  return (
    <section className="px-6 py-28 sm:py-36 md:py-40">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-4xl leading-[1.1] tracking-tight text-neutral-900 sm:text-5xl md:text-6xl">
          I left HubSpot. I&rsquo;m building what they should have.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-neutral-600 sm:text-xl">
          For solo operators and small teams who want a CRM, not a billing relationship.
        </p>
        <div className="mt-10">
          <a
            href="#signup"
            className="inline-flex items-center rounded-md bg-teal-700 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-800"
          >
            Get early access
          </a>
        </div>
      </div>
    </section>
  );
}
