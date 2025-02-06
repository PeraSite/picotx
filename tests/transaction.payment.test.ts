import { describe, it, expect, beforeEach, vi } from 'vitest';
import { atomic } from '@/atomic';
import { transaction } from '@/transaction';

describe('payment transaction test', () => {
    const chargePayment =
        vi.fn<(userId: string, amount: number) => Promise<string>>();
    const cancelPayment = vi.fn<(paymentId: string) => Promise<void>>();
    const scheduleNextPayment =
        vi.fn<
            (
                userId: string,
                amount: number,
                scheduleAt: Date,
            ) => Promise<string>
        >();
    const cancelScheduledPayment =
        vi.fn<(scheduleId: string) => Promise<void>>();

    const insertPaymentRecord =
        vi.fn<
            (
                userId: string,
                paymentId: string,
                scheduleId: string,
                amount: number,
            ) => Promise<string>
        >();
    const deletePaymentRecord = vi.fn<(paymentId: string) => Promise<void>>();

    const chargePaymentAction = atomic(chargePayment, cancelPayment);
    const scheduleNextPaymentAction = atomic(
        scheduleNextPayment,
        cancelScheduledPayment,
    );
    const insertPaymentRecordAction = atomic(
        insertPaymentRecord,
        deletePaymentRecord,
    );

    // Clear mocks before each test
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully complete all actions when all succeed', async () => {
        // Setup mocks for success
        chargePayment.mockResolvedValue('payment_success');
        scheduleNextPayment.mockResolvedValue('schedule_success');
        insertPaymentRecord.mockResolvedValue('record_success');

        const result = await transaction(async () => {
            const paymentId = await chargePaymentAction('user1', 100);
            const scheduleId = await scheduleNextPaymentAction(
                'user1',
                100,
                new Date('2023-10-01T00:00:00Z'),
            );
            const recordId = await insertPaymentRecordAction(
                'user1',
                paymentId,
                scheduleId,
                100,
            );
            return { paymentId, scheduleId, recordId };
        });

        expect(result).toEqual({
            paymentId: 'payment_success',
            scheduleId: 'schedule_success',
            recordId: 'record_success',
        });
        expect(cancelPayment).not.toHaveBeenCalled();
        expect(cancelScheduledPayment).not.toHaveBeenCalled();
        expect(deletePaymentRecord).not.toHaveBeenCalled();
    });

    it('should cancel payment if a failure occurs after chargePayment action', async () => {
        chargePayment.mockResolvedValue('payment_success');

        const error = new Error('Simulated failure after payment');

        await expect(
            transaction(async () => {
                const paymentId = await chargePaymentAction('user1', 100);
                throw error;
            }),
        ).rejects.toThrowError(error);

        // Compensation for chargePayment should be invoked
        expect(cancelPayment).toHaveBeenCalledTimes(1);
        expect(cancelPayment).toHaveBeenCalledWith(
            'payment_success',
            'user1',
            100,
        );
        expect(cancelScheduledPayment).not.toHaveBeenCalled();
        expect(deletePaymentRecord).not.toHaveBeenCalled();
    });

    it('should cancel payment and payment schedule if a failure occurs after scheduling payment', async () => {
        chargePayment.mockResolvedValue('payment_success');
        scheduleNextPayment.mockResolvedValue('schedule_success');

        const error = new Error('Simulated failure after scheduling payment');

        await expect(
            transaction(async () => {
                const paymentId = await chargePaymentAction('user1', 100);
                const scheduleId = await scheduleNextPaymentAction(
                    'user1',
                    100,
                    new Date('2023-10-01T00:00:00Z'),
                );
                throw error;
            }),
        ).rejects.toThrowError(error);

        // Compensation functions should run in reverse order:
        expect(cancelScheduledPayment).toHaveBeenCalledTimes(1);
        expect(cancelScheduledPayment).toHaveBeenCalledWith(
            'schedule_success',
            'user1',
            100,
            expect.any(Date),
        );
        expect(cancelPayment).toHaveBeenCalledTimes(1);
        expect(cancelPayment).toHaveBeenCalledWith(
            'payment_success',
            'user1',
            100,
        );

        // Verify invocation order: cancelScheduledPayment should be called before cancelPayment
        const orderSchedule =
            cancelScheduledPayment.mock.invocationCallOrder[0];
        const orderPayment = cancelPayment.mock.invocationCallOrder[0];
        expect(orderSchedule).toBeLessThan(orderPayment);
    });

    it('should cancel payment and payment schedule if db insert fails', async () => {
        chargePayment.mockResolvedValue('payment_success');
        scheduleNextPayment.mockResolvedValue('schedule_success');
        insertPaymentRecord.mockRejectedValue(new Error('DB insert failure'));

        await expect(
            transaction(async () => {
                const paymentId = await chargePaymentAction('user1', 100);
                const scheduleId = await scheduleNextPaymentAction(
                    'user1',
                    100,
                    new Date('2023-10-01T00:00:00Z'),
                );
                await insertPaymentRecordAction(
                    'user1',
                    paymentId,
                    scheduleId,
                    100,
                );
            }),
        ).rejects.toThrow('DB insert failure');

        expect(cancelScheduledPayment).toHaveBeenCalledTimes(1);
        expect(cancelScheduledPayment).toHaveBeenCalledWith(
            'schedule_success',
            'user1',
            100,
            expect.any(Date),
        );
        expect(cancelPayment).toHaveBeenCalledTimes(1);
        expect(cancelPayment).toHaveBeenCalledWith(
            'payment_success',
            'user1',
            100,
        );
        expect(deletePaymentRecord).not.toHaveBeenCalled();
    });

    it('should not register compensation if chargePayment action fails', async () => {
        chargePayment.mockRejectedValue(new Error('Payment action failure'));

        await expect(
            transaction(async () => {
                await chargePaymentAction('user1', 100);
            }),
        ).rejects.toThrow('Payment action failure');

        expect(cancelPayment).not.toHaveBeenCalled();
    });
});
