package de.knaba.mobile;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** Actual bounded executor behavior; no Android provider or device claim. */
public final class ErpMediaIoTest {
    private static int assertions;
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); assertions++; }
    public static void main(String[] args) throws Exception {
        ErpMediaIo queue = new ErpMediaIo();
        Object activeOwner = new Object(), cancelledOwner = new Object(), currentOwner = new Object();
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1), settled = new CountDownLatch(8);
        AtomicInteger active = new AtomicInteger(), maximum = new AtomicInteger(), cancelledRuns = new AtomicInteger(), completed = new AtomicInteger();
        Runnable next = () -> {
            int count = active.incrementAndGet(); maximum.accumulateAndGet(count, Math::max);
            completed.incrementAndGet(); active.decrementAndGet(); settled.countDown();
        };
        try {
            check(queue.submit(activeOwner, () -> {
                int count = active.incrementAndGet(); maximum.accumulateAndGet(count, Math::max); entered.countDown();
                try { if (!release.await(3, TimeUnit.SECONDS)) throw new AssertionError("Provider did not settle"); }
                catch (InterruptedException interrupted) { throw new AssertionError(interrupted); }
                finally { active.decrementAndGet(); settled.countDown(); }
            }), "first provider accepted");
            check(entered.await(1, TimeUnit.SECONDS), "first provider is actually running");
            check(queue.submit(cancelledOwner, cancelledRuns::incrementAndGet), "first old screen job queued");
            check(queue.submit(cancelledOwner, cancelledRuns::incrementAndGet), "second old screen job queued");
            for (int i = 0; i < 5; i++) check(queue.submit(currentOwner, next), "bounded waiting slot accepted");
            check(!queue.submit(currentOwner, () -> { throw new AssertionError("Rejected work executed"); }), "ninth active-or-waiting job rejected");
            check(queue.cancel(cancelledOwner) == 2, "cancel removes old queued operations before they can open providers");
            check(queue.submit(currentOwner, next) && queue.submit(currentOwner, next), "cancel releases exactly two slots");
            check(!queue.submit(currentOwner, next), "replacement queue still capped at eight total jobs");
            check(queue.cancel(activeOwner) == 0 && completed.get() == 0, "active provider drains rather than allowing an overlapping lane");
            release.countDown();
            check(settled.await(2, TimeUnit.SECONDS), "all current jobs settle after old provider releases");
            check(cancelledRuns.get() == 0, "cancelled operations never open a provider or hold a runnable in the queue");
            check(maximum.get() == 1 && active.get() == 0 && completed.get() == 7, "only one job is active across all owners");
            System.out.println("PASS media IO coordinator: " + assertions + " assertions; one active plus seven waiting, cancellation purges queued jobs");
        } finally { release.countDown(); queue.cancel(cancelledOwner); queue.cancel(currentOwner); }
    }
}
