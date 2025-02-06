import { TransactionContext, getCurrentTransactionContext } from '@/context';

export type AtomicFunction<A extends any[], R> = (...args: A) => Promise<R>;

/**
 * Creates an atomic function that automatically retrieves the current transaction context.
 *
 * @template A - The type of the arguments for the action.
 * @template R - The return type of the action.
 * @param action - The asynchronous action to execute.
 * @param compensation - The asynchronous compensation (rollback) function to execute if needed.
 * @returns An atomic function that accepts the action arguments.
 */
export function atomic<A extends any[], R>(
    action: (...args: A) => Promise<R>,
    compensation: (result: R, ...args: A) => Promise<void>,
): AtomicFunction<A, R> {
    return async (...args: A): Promise<R> => {
        const ctx = getCurrentTransactionContext();
        if (!ctx) {
            throw new Error('Cannot find current transaction context');
        }
        const result = await action(...args);
        ctx.compensations.push(() => compensation(result, ...args));
        return result;
    };
}

export type ExplicitAtomicFunction<A extends any[], R> = (
    ctx: TransactionContext,
) => (...args: A) => Promise<R>;

/**
 * Creates an atomic function that requires an explicit transaction context.
 *
 * @template A - The type of the arguments for the action.
 * @template R - The return type of the action.
 * @param action - The asynchronous action to execute.
 * @param compensation - The asynchronous compensation (rollback) function to execute if needed.
 * @returns A curried atomic function that must first be invoked with a transaction context and then the action arguments.
 */
export function atomicExplicit<A extends any[], R>(
    action: (...args: A) => Promise<R>,
    compensation: (result: R, ...args: A) => Promise<void>,
): ExplicitAtomicFunction<A, R> {
    return (ctx: TransactionContext) =>
        async (...args: A): Promise<R> => {
            const result = await action(...args);
            ctx.compensations.push(() => compensation(result, ...args));
            return result;
        };
}
