package de.knaba.mobile;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** One process-owned media I/O lane. A recreated Activity cannot outrun an old provider read. */
final class ErpMediaIo {
    static final ErpMediaIo SHARED = new ErpMediaIo();
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.MILLISECONDS,
        new ArrayBlockingQueue<>(7), task -> {
            Thread thread = new Thread(task, "knaba-media-io");
            thread.setDaemon(true);
            return thread;
        }, new ThreadPoolExecutor.AbortPolicy());

    private static final class Job implements Runnable {
        private Object owner;
        private Runnable operation;
        Job(Object owner, Runnable operation) { this.owner = owner; this.operation = operation; }
        synchronized boolean ownedBy(Object candidate) { return owner == candidate; }
        synchronized void clear() { owner = null; operation = null; }
        public void run() {
            final Runnable current;
            synchronized (this) { current = operation; clear(); }
            if (current != null) current.run();
        }
    }

    /** At most one running and seven waiting jobs. Rejection never runs the caller's operation. */
    synchronized boolean submit(Object owner, Runnable operation) {
        if (owner == null || operation == null) throw new IllegalArgumentException("INVALID_MEDIA_JOB");
        Job job = new Job(owner, operation);
        try { executor.execute(job); return true; }
        catch (RejectedExecutionException full) { job.clear(); return false; }
    }

    /** Release queued closures/buffers immediately; an active provider must drain before the next job. */
    synchronized int cancel(Object owner) {
        int removed = 0;
        for (Runnable queued : executor.getQueue().toArray(new Runnable[0])) {
            Job job = (Job) queued;
            if (job.ownedBy(owner) && executor.remove(job)) { job.clear(); removed++; }
        }
        return removed;
    }
}
