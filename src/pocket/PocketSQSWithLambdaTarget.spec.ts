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
    sqsQueue: {
      maxReceiveCount: 3,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a plain sqs queue with a deadletter and lambda target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketSQSWithLambdaTarget(stack, 'test-sqs-lambda', {
    ...config,
    sqsQueue: {
      maxReceiveCount: 3,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
