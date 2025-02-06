/**
 * Represents a transaction context that accumulates compensation (rollback) functions.
 *
 * @property {Array<() => Promise<void>>} compensations - An array of functions to perform rollback operations.
 */
export interface TransactionContext {
    compensations: Array<() => Promise<void>>;
}

const transactionContextStack: TransactionContext[] = [];

export function getCurrentTransactionContext(): TransactionContext | undefined {
    return transactionContextStack[transactionContextStack.length - 1];
}

export function pushTransactionContext(ctx: TransactionContext): void {
    transactionContextStack.push(ctx);
}

export function popTransactionContext(): void {
    transactionContextStack.pop();
}
