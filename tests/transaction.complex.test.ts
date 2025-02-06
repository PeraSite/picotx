import { describe, it, expect, vi } from 'vitest';
import { transaction } from '@/transaction';
import { atomic, atomicExplicit } from '@/atomic';

describe('Complex Transactions', () => {
    it('should support mixing explicit and auto modes in a single transaction', async () => {
        const autoAction = vi.fn(async (val: number) => val + 3);
        const autoCompensation = vi.fn(async (result: number, val: number) => {
            /* no-op */
        });
        const explicitAction = vi.fn(async (val: number) => val * 5);
        const explicitCompensation = vi.fn(
            async (result: number, val: number) => {},
        );

        const autoAtomic = atomic(autoAction, autoCompensation);
        const explicitAtomic = atomicExplicit(
            explicitAction,
            explicitCompensation,
        );

        const result = await transaction(async (ctx) => {
            const res1 = await autoAtomic(7);
            const res2 = await explicitAtomic(ctx)(4);
            return res1 + res2;
        });

        expect(result).toBe(30);
        expect(autoAction).toHaveBeenCalledWith(7);
        expect(explicitAction).toHaveBeenCalledWith(4);
        expect(autoCompensation).not.toHaveBeenCalled();
        expect(explicitCompensation).not.toHaveBeenCalled();
    });

    it('should aggregate multiple compensation failures into an AggregateError', async () => {
        const compSpy1 = vi.fn(async () => {
            throw new Error('Compensation failure 1');
        });
        const compSpy2 = vi.fn(async () => {
            throw new Error('Compensation failure 2');
        });

        const atomic1 = atomic(
            async (val: number) => val + 1,
            async (result: number, val: number) => {
                await compSpy1();
            },
        );
        const atomic2 = atomic(
            async (val: number) => val * 2,
            async (result: number, val: number) => {
                await compSpy2();
            },
        );

        let errorThrown: any;

        try {
            await transaction(async () => {
                await atomic1(3);
                await atomic2(5);
                throw new Error('Main error');
            });
        } catch (err) {
            errorThrown = err;
        }

        expect(errorThrown).toBeDefined();
        expect(errorThrown).toBeInstanceOf(AggregateError);
        const aggregatedErrors = errorThrown.errors;
        expect(aggregatedErrors).toHaveLength(2);
        expect(aggregatedErrors[0].message).toBe('Compensation failure 2');
        expect(aggregatedErrors[1].message).toBe('Compensation failure 1');
    });

    it('should execute compensation functions for nested transactions with inner failure', async () => {
        const callOrder: string[] = [];

        const outerAtomic = atomic(
            async (val: number) => val + 10,
            async (result: number, val: number) => {
                callOrder.push(`outer compensation: ${result}`);
            },
        );
        const innerAtomic = atomic(
            async (val: number) => val * 2,
            async (result: number, val: number) => {
                callOrder.push(`inner compensation: ${result}`);
            },
        );

        let errorThrown: any;
        try {
            await transaction(async () => {
                await outerAtomic(5);
                await transaction(async () => {
                    await innerAtomic(3);
                    throw new Error('Inner failure');
                });
            });
        } catch (err) {
            errorThrown = err;
        }

        expect(errorThrown).toBeDefined();
        expect(errorThrown.message).toBe('Inner failure');
        expect(callOrder).toEqual([
            'inner compensation: 6',
            'outer compensation: 15',
        ]);
    });
});
