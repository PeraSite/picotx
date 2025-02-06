import { describe, it, expect, vi } from 'vitest';
import { transaction } from '@/transaction';
import { atomic } from '@/atomic';

describe('resolving context automatically from global state', () => {
    it('should commit successfully when no error occurs', async () => {
        const action = vi.fn(async (val: number) => val * 2);
        const compensation = vi.fn(async (result: number, val: number) => {});
        const atomicDouble = atomic(action, compensation);

        const result = await transaction(async () => {
            return await atomicDouble(10);
        });

        expect(result).toBe(20);
        expect(action).toHaveBeenCalledWith(10);
        expect(compensation).not.toHaveBeenCalled();
    });

    it('should execute compensation functions in reverse order when transaction fails', async () => {
        const callOrder: string[] = [];

        const atomicFunc1 = atomic(
            async (val: number) => val + 1,
            async (result: number, val: number) => {
                callOrder.push(`compensation1: ${result}, ${val}`);
            },
        );
        const atomicFunc2 = atomic(
            async (val: number) => val * 3,
            async (result: number, val: number) => {
                callOrder.push(`compensation2: ${result}, ${val}`);
            },
        );
        const errorToThrow = new Error('Transaction error');

        await expect(
            transaction(async () => {
                await atomicFunc1(5);
                await atomicFunc2(2);
                throw errorToThrow;
            }),
        ).rejects.toThrowError(errorToThrow);

        expect(callOrder).toEqual([
            'compensation2: 6, 2',
            'compensation1: 6, 5',
        ]);
    });

    it('should propagate error if atomic action fails and not register compensation', async () => {
        const atomicFail = atomic(
            async (val: number) => {
                throw new Error('Action error');
            },
            async (result: number, val: number) => {},
        );

        await expect(
            transaction(async () => {
                await atomicFail(4);
            }),
        ).rejects.toThrow('Action error');
    });

    it('should throw AggregateError if compensation functions fail during rollback', async () => {
        const atomicFunc = atomic(
            async (val: number) => val + 10,
            async (result: number, val: number) => {
                throw new Error(`Compensation failure for ${val}`);
            },
        );
        const mainError = new Error('Main failure');

        await expect(
            transaction(async () => {
                await atomicFunc(3);
                throw mainError;
            }),
        ).rejects.toThrow(AggregateError);
    });

    it('should support nested transactions with successful inner commit', async () => {
        const outerAtomic = atomic(
            async (val: number) => val + 1,
            async (result: number, val: number) => {},
        );
        const innerAtomic = atomic(
            async (val: number) => val * 2,
            async (result: number, val: number) => {},
        );

        const result = await transaction(async () => {
            const outerResult = await outerAtomic(5);
            const innerResult = await transaction(async () => {
                return await innerAtomic(10);
            });
            return outerResult + innerResult;
        });

        expect(result).toBe(26);
    });

    it('should support nested transactions with inner failure', async () => {
        const outerAtomic = atomic(
            async (val: number) => val + 1,
            async (result: number, val: number) => {},
        );
        const innerAtomic = atomic(
            async (val: number) => {
                throw new Error('Inner failure');
            },
            async (result: number, val: number) => {},
        );

        await expect(
            transaction(async () => {
                await outerAtomic(5);
                await transaction(async () => {
                    await innerAtomic(10);
                });
            }),
        ).rejects.toThrow('Inner failure');
    });
});
