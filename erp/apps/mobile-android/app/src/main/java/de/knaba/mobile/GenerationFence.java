package de.knaba.mobile;

/** One process-wide fence shared by every native vault/API instance. */
public final class GenerationFence {
    private long generation = 0;
    public synchronized long capture() { return generation; }
    public synchronized void invalidate() { generation = Math.incrementExact(generation); }
    public synchronized void requireCurrent(long expected) {
        if (expected != generation) throw new IllegalStateException("AUTH_GENERATION_CHANGED");
    }
    public synchronized void run(long expected, Runnable callback) {
        requireCurrent(expected); callback.run();
    }
}
