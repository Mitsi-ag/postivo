export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    try {
      startScheduler();
    } catch (err) {
      // A boot-time scheduler failure must be loud, not silent — without the
      // scheduler nothing ever publishes.
      console.error('[postivo] scheduler failed to start:', err);
    }
  }
}
