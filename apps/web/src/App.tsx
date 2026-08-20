const principles = [
  {
    title: 'Discover projects',
    description: 'Find student-led projects that match the skills you want to practise.',
  },
  {
    title: 'Build a team',
    description: 'Recruit teammates through a clear application and membership workflow.',
  },
  {
    title: 'Show your work',
    description: 'Turn completed contributions and mentor reviews into portfolio evidence.',
  },
];

export const App = () => (
  <main className="min-h-[100dvh] bg-zinc-950 text-zinc-100">
    <section className="mx-auto flex min-h-[100dvh] max-w-7xl flex-col justify-between px-6 py-8 sm:px-10 lg:px-16">
      <nav aria-label="Primary navigation" className="flex items-center justify-between">
        <a className="text-sm font-semibold tracking-tight" href="/">
          HCMUT SkillBridge
        </a>
        <span className="text-xs text-zinc-400">Foundation preview</span>
      </nav>

      <div className="grid gap-12 py-20 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
        <div>
          <p className="mb-6 text-sm font-medium text-brand-500">Projects become experience</p>
          <h1 className="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.05em] sm:text-7xl lg:text-8xl">
            Find your next team. Build work that matters.
          </h1>
        </div>
        <p className="max-w-lg text-base leading-7 text-zinc-400 lg:pb-2">
          A student project platform for discovering opportunities, recruiting collaborators, and
          creating credible portfolio evidence.
        </p>
      </div>

      <ul className="grid gap-px overflow-hidden rounded-2xl bg-zinc-800 md:grid-cols-3">
        {principles.map((principle) => (
          <li className="bg-zinc-900 p-6 sm:p-8" key={principle.title}>
            <h2 className="text-base font-medium">{principle.title}</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{principle.description}</p>
          </li>
        ))}
      </ul>
    </section>
  </main>
);
