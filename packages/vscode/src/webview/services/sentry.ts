// Sentry is not used in the VS Code build; keep the same export surface as the
// Chrome extension so callers (abstract-bot.ts etc.) stay unmodified.
const Sentry = {
  captureException(_error: unknown, _context?: unknown) {
    // no-op
  },
  captureMessage(_message: string, _context?: unknown) {
    // no-op
  },
  setUser(_user: unknown) {
    // no-op
  },
}

export { Sentry }
