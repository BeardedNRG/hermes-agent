// Placeholder for the future "agent group chat" surface (multiple agents in one
// room). Parked as opening-soon for now — see [[hermes-dashboard-merge]] notes.
// Intentionally dependency-free and static so it costs nothing to ship.
export default function GroupChatComingSoon() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <div className="text-5xl" aria-hidden>
        🚧
      </div>
      <h1 className="font-mondwest text-display text-2xl uppercase tracking-[0.12em] text-midground">
        Agent Group Chat
      </h1>
      <p className="max-w-md text-sm text-text-secondary">
        Multiple agents in one room. Opening soon.
      </p>
      <span className="mt-1 rounded-full border border-current/20 px-3 py-1 font-mondwest text-display text-xs uppercase tracking-[0.18em] text-text-tertiary">
        Coming soon
      </span>
    </div>
  );
}
