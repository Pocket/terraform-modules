import { TerraformStack, Testing } from 'cdktf';
import { LAMBDA_RUNTIMES } from '../base/ApplicationVersionedLambda';
import {
  PocketSQSWithLambdaTarget,
  PocketSQSWithLambdaTargetProps,
} from './PocketSQSWithLambdaTarget';

const config: PocketSQSWithLambdaTargetProps = {
  name: 'test-sqs-lambda',
  lambda: {
    runtime: LAMBDA_RUNTIMES.PYTHON38,
    handler: 'index.handler',
  },
};

test('renders a plain sqs queue and lambda target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
    ...config,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a plain sqs queue with a deadletter and lambda target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
    ...config,
    configForNewSqsQueue: {
      maxReceiveCount: 3,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('validates batch config errors if no batch window', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  expect(
    () =>
      new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
        ...config,
        configForNewSqsQueue: {
          maxReceiveCount: 3,
        },
        batchSize: 20,
      })
  ).toThrow(Error);
});

test('validates batch config errors if batch window is less then 1', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  expect(
    () =>
      new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
        ...config,
        configForNewSqsQueue: {
          maxReceiveCount: 3,
        },
        batchSize: 20,
        batchWindow: 0,
      })
  ).toThrow(Error);
});

test('renders a lambda triggered by an existing sqs queue', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
    ...config,
    configFromPreexistingSqsQueue: {
      name: 'my-existing-sqs',
    },
  });

  const s = Testing.synth(stack);
  expect(s).toMatchSnapshot();
});
