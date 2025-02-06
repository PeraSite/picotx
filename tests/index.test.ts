import { transaction, atomic, atomicExplicit } from '@/index';
import { describe, expect, it } from 'vitest';

describe('atomic', () => {
    it('should be defined', () => {
        expect(atomic).toBeDefined();
    });
});

describe('atomicExplicit', () => {
    it('should be defined', () => {
        expect(atomicExplicit).toBeDefined();
    });
});

describe('transaction', () => {
    it('should be defined', () => {
        expect(transaction).toBeDefined();
    });
});
