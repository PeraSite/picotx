import {
    pushTransactionContext,
    popTransactionContext,
    TransactionContext,
} from '@/context';

/**
 * Executes a transactional operation by managing a global transaction context.
 * If the provided callback function expects an argument, it is called with the transaction context.
 * Otherwise, the function is invoked without arguments.
 *
 * @template T - The type of the transaction result.
 * @param fn - The asynchronous function containing transactional logic.
 *        If it declares a parameter, it will be called with the transaction context.
 * @returns A promise that resolves to the transaction result.
 */
export async function transaction<T>(
    fn: ((ctx: TransactionContext) => Promise<T>) | (() => Promise<T>),
): Promise<T> {
    const ctx: TransactionContext = { compensations: [] };
    pushTransactionContext(ctx);

    try {
        let result: T;
        if (fn.length > 0) {
            // Explicit mode: pass the transaction context
            result = await (fn as (ctx: TransactionContext) => Promise<T>)(ctx);
        } else {
            // Auto mode: do not pass any argument
            result = await (fn as () => Promise<T>)();
        }
        popTransactionContext();
        return result;
    } catch (error) {
        const rollbackErrors = [];
        for (const rollback of ctx.compensations.reverse()) {
            try {
                await rollback();
            } catch (rollbackError) {
                rollbackErrors.push(rollbackError);
            }
        }
        popTransactionContext();
        if (rollbackErrors.length > 0) {
            throw new AggregateError(
                rollbackErrors,
                'One or more rollbacks failed',
            );
        }
        throw error;
    }
}
