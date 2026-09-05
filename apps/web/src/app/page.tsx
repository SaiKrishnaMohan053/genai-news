import { InspectionPanel } from './inspection-panel';
import { StoryInspectionPanel } from './story-inspection-panel';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
        <header className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Phase 2</p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            GenAI News
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
            Minimal inspection surface for deterministic news discovery and canonical story
            clustering.
          </p>
        </header>

        <div className="space-y-8">
          <InspectionPanel />

          <StoryInspectionPanel />
        </div>
      </div>
    </main>
  );
}
