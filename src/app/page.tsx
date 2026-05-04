import { FounderNote } from '@/components/landing/founder-note';
import { Footer } from '@/components/landing/footer';
import { Hero } from '@/components/landing/hero';
import { ProblemSection } from '@/components/landing/problem-section';
import { SolutionSection } from '@/components/landing/solution-section';

export default function Home() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <SolutionSection />

      {/* Form placeholder — Batch 4b builds out feature voting, pricing survey, signup form. */}
      <section
        id="signup"
        className="border-t border-neutral-200 px-6 py-24 sm:py-32"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-serif text-lg italic text-neutral-400">
            The form goes here next.
          </p>
        </div>
      </section>

      <FounderNote />
      <Footer />
    </>
  );
}
