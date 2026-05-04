const FOUNDER_NOTE = `I’m Sheyi. I run T&O Ventures, a small UK studio building tools for solopreneurs and small teams. I keep hearing the same complaint about HubSpot from people I talk to: started cheap, got expensive fast, can’t leave easily. So I’m researching whether enough operators want a flat-priced alternative — $197 once, $19/month, no contact tax, no surprises — that it’s worth building. This page is part of that research. If the pain is real and the price is right, I’ll ship the product. If not, I’ll move on. Either way, your input shapes the answer.`;

export function FounderNote() {
  return (
    <section id="about" className="border-t border-neutral-200 px-6 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-serif text-2xl tracking-tight text-neutral-900 sm:text-3xl">
          A note from me
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-neutral-700">{FOUNDER_NOTE}</p>
        <p className="mt-6 font-serif italic text-neutral-500">&mdash; Sheyi A</p>
      </div>
    </section>
  );
}
