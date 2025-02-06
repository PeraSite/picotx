# picotx
![npm package minimized gzipped size](https://img.shields.io/bundlejs/size/%40perasite%2Fpicotx)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/perasite/picotx/test.yml)
![Codecov](https://img.shields.io/codecov/c/github/PeraSite/picotx)
![NPM Version](https://img.shields.io/npm/v/%40perasite%2Fpicotx)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A minimal TypeScript library for creating atomic transactions for any asynchronous function.

It simplifies rollback mechanics by automatically or explicitly managing compensation functions, and supports nested transactions and error aggregation.

## Installation


```
npm install picotx
pnpm install picotx
```

## Features

- **Atomic Transactions:** Execute a series of operations as a single unit.
- **Compensation Functions:** Automatically or explicitly register rollback (compensation) functions.
- **Nested Transactions:** Support for nested transactions enabling complex workflows.
- **Error Aggregation:** Aggregate multiple rollback errors into a single `AggregateError`.


## How to use

### Defining Atomic actions
Firstly, define the action and rollback(a.k.a. compensation) function using `atomic` and `atomicExplicit` functions.

Action functions are used to perform the actual operation, while
Compensation functions are used to revert the changes made by the action function.

Compensation function takes the result of the action function and the original input value as arguments.
So it can revert the changes made by the action function.

`atomic` automatically resolves current transaction context using global state, while `atomicExplicit` requires an explicit transaction context to be passed.

```typescript
import { atomic, atomicExplicit } from 'picotx';

const action = async (val: number) => val + 1;
const compensate = async (result: number, val: number) => {
  console.log(`Reverting: result ${result} from value ${val}`);
};

const atomicAction = atomic(action, compensate);
const atomicExplicitAction = atomicExplicit(action, compensate);
```

### Defining Transactions

Transactions are used to execute a series of operations as a single unit. It automatically manages rollback mechanics and error handling.

It can be defined using the `transaction` function.
You can use ctx to access the current transaction context and pass it to the atomic action. But this is optional when using `atomic` function.

`transaction` function returns whatever the inside function returns.
```typescript
async function runTransaction() {
    const result = await transaction(async () => {
        return await atomicAction(5); // Without explicit context
    });
    console.log(result); // Expected output: 6
}

async function runExplicitTransaction() {
    const result = await transaction(async (ctx) => {
        return await atomicExplicitAction(ctx)(5); // With explicit context and currying
    });
    console.log(result); // Expected output: 6
}
```

### Aggregating Errors
When errors occur during a rollback, they are aggregated into a single `AggregateError`.

```typescript
import { transaction, atomic } from 'picotx';

const action = async (val: number) => {
    return val + 1;
};

const compensate = async (result: number, val: number) => {
    console.log(`Reverting: result ${result} from value ${val}`);
    throw new Error('Error 1');
};

const atomicAction = atomic(action, compensate);

async function runTransaction() {
    try {
        await transaction(async () => {
            await atomicAction(5);
        });
    } catch (error) {
        console.error(error); // Expected output: AggregateError: Error 1
    }
}
```

## Real-world Usage
The most useful use case of picotx is when calling an series of external API in order and needing to rollback changes if an error occurs.

For example, when processing a subscription payment:

```typescript

// Step 1: Charge payment API
const chargePayment = async (amount: number) => {
    console.log(`Charging payment of $${amount}`);
    // simulate successful charge and return charge information
    return { paymentId: 'charge_123', amount };
};

// Compensation for charge: refund payment API
const refundPayment = async (result: { paymentId: string; amount: number }) => {
    console.log(
        `Refunding payment of $${result.amount} for paymentId ${result.paymentId}`,
    );
};

// Step 2: Schedule next month payment API
const scheduleNextPayment = async (date: Date) => {
    console.log(`Scheduling payment on ${date.toISOString()}`);
    // simulate scheduling result
    return { scheduleId: 'schedule_456', scheduledDate: date };
};

// Compensation for schedule: cancel scheduled payment API
const cancelScheduledPayment = async (result: { scheduleId: string }) => {
    console.log(
        `Canceling scheduled payment with scheduleId ${result.scheduleId}`,
    );
};

// Step 3: Insert subscription record into DB
const insertSubscriptionRecord = async (data: {
    paymentId: string;
    scheduleId: string;
    amount: number;
}) => {
    console.log(
        `Inserting transaction record into DB: ${JSON.stringify(data)}`,
    );
    // simulate DB insertion, return DB record identifier
    return { subscriptionId: 'db_789' };
};

// Compensation for DB insert: remove record from DB
const deleteSubscriptionRecord = async (result: { subscriptionId: string }) => {
    console.log(`Deleting DB record with recordId ${result.subscriptionId}`);
};

const atomicCharge = atomic(chargePayment, refundPayment);
const atomicSchedule = atomic(scheduleNextPayment, cancelScheduledPayment);
const atomicInsert = atomic(insertSubscriptionRecord, deleteSubscriptionRecord);

async function processSubscription(amount: number) {
    return transaction(async () => {
        // Execute payment charge
        const paymentResult = await atomicCharge(amount);

        // Compute next month for scheduling the payment
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const scheduleResult = await atomicSchedule(nextMonth);

        // Insert transaction record into DB
        return await atomicInsert({
            paymentId: paymentResult.paymentId,
            scheduleId: scheduleResult.scheduleId,
            amount,
        });
    });
}

processSubscription(100)
    .then((record) => {
        console.log('Subscription processed successfully:', record);
    })
    .catch((err) => {
        console.error('Subscription processing failed:', err);
    });
```

When charging, scheduling, or inserting a record fails, it will automatically rollback the changes made by the previous successful operations.

## License

picotx is released under the [MIT License](LICENSE).
