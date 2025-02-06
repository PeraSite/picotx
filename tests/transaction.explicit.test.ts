import { describe, expect, it, vi } from 'vitest';
import { transaction } from '@/transaction';
import { atomicExplicit } from '@/atomic';

describe('resolving context explicitly', () => {
    it('should commit successfully when no error occurs', async () => {
        const action = vi.fn(async (val: number) => val * 2);
        const compensation = vi.fn(async (result: number, val: number) => {});
        const atomicDoubleExplicit = atomicExplicit(action, compensation);

        const result = await transaction(async (ctx) => {
            return await atomicDoubleExplicit(ctx)(10);
        });

        expect(result).toBe(20);
        expect(action).toHaveBeenCalledWith(10);
        expect(compensation).not.toHaveBeenCalled();
    });

    it('should execute compensation functions in reverse order when transaction fails', async () => {
        const callOrder: string[] = [];

        const atomicFunc1Explicit = atomicExplicit(
            async (val: number) => val + 1,
            async (result: number, val: number) => {
                callOrder.push(`compensation1: ${result}, ${val}`);
            },
        );
        const atomicFunc2Explicit = atomicExplicit(
            async (val: number) => val * 3,
            async (result: number, val: number) => {
                callOrder.push(`compensation2: ${result}, ${val}`);
            },
        );
        const errorToThrow = new Error('Transaction error');

        await expect(
            transaction(async (ctx) => {
                await atomicFunc1Explicit(ctx)(5);
                await atomicFunc2Explicit(ctx)(2);
                throw errorToThrow;
            }),
        ).rejects.toThrowError(errorToThrow);

        expect(callOrder).toEqual([
            'compensation2: 6, 2',
            'compensation1: 6, 5',
        ]);
    });

    it('should propagate error if atomic action fails and not register compensation', async () => {
        const atomicFailExplicit = atomicExplicit(
            async (val: number) => {
                throw new Error('Action error');
            },
            async (result: number, val: number) => {},
        );

        await expect(
            transaction(async (ctx) => {
                await atomicFailExplicit(ctx)(4);
            }),
        ).rejects.toThrow('Action error');
    });

    it('should throw AggregateError if compensation functions fail during rollback', async () => {
        const atomicFuncExplicit = atomicExplicit(
            async (val: number) => val + 10,
            async (result: number, val: number) => {
                throw new Error(`Compensation failure for ${val}`);
            },
        );
        const mainError = new Error('Main failure');

        await expect(
            transaction(async (ctx) => {
                await atomicFuncExplicit(ctx)(3);
                throw mainError;
            }),
        ).rejects.toThrow(AggregateError);
    });

    it('should support nested transactions with successful inner commit', async () => {
        const outerAtomic = atomicExplicit(
            async (val: number) => val + 1,
            async (result: number, val: number) => {},
        );
        const innerAtomic = atomicExplicit(
            async (val: number) => val * 2,
            async (result: number, val: number) => {},
        );

        const result = await transaction(async (ctx) => {
            const outerResult = await outerAtomic(ctx)(5); // 5 + 1 = 6
            const innerResult = await transaction(async (innerCtx) => {
                return await innerAtomic(innerCtx)(10); // 10 * 2 = 20
            });
            return outerResult + innerResult; // 6 + 20 = 26
        });

        expect(result).toBe(26);
    });

    it('should support nested transactions with inner failure', async () => {
        const outerAtomic = atomicExplicit(
            async (val: number) => val + 1,
            async (result: number, val: number) => {},
        );
        const innerAtomic = atomicExplicit(
            async (val: number) => {
                throw new Error('Inner failure');
            },
            async (result: number, val: number) => {},
        );

        await expect(
            transaction(async (ctx) => {
                await outerAtomic(ctx)(5);
                await transaction(async (innerCtx) => {
                    await innerAtomic(innerCtx)(10);
                });
            }),
        ).rejects.toThrow('Inner failure');
    });
});
