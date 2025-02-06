import { describe, it, expect } from 'vitest';
import { atomic } from '@/atomic';
import { transaction } from '@/transaction';
import { getCurrentTransactionContext } from '@/context';

describe('Transaction Context', () => {
    it('should throw an error when no transaction context is provided', async () => {
        const atomicOperation = atomic(
            async (val: number) => val * 2,
            async (result: number, val: number) => {},
        );

        await expect(atomicOperation(5)).rejects.toThrowError(
            'Cannot find current transaction context',
        );
    });

    it('should clean up the transaction context after successful and failed transactions', async () => {
        await transaction(async () => {
            return 'success';
        });
        expect(getCurrentTransactionContext()).toBeUndefined();

        try {
            await transaction(async () => {
                throw new Error('Failure transaction');
            });
        } catch (err) {
            // expected error
        }
        expect(getCurrentTransactionContext()).toBeUndefined();
    });
});
