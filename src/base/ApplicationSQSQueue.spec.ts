import { Testing, TerraformStack } from 'cdktf';
import {
  ApplicationSQSQueue,
  ApplicationSQSQueueProps,
} from './ApplicationSQSQueue';

test('renders an sqs queue without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationSQSQueue(stack, 'testSQS', {
    name: 'TEST',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an sqs queue with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationSQSQueue(stack, 'testSQS', {
    name: 'TEST',
    tags: {
      test: '123',
      environment: 'prod',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an sqs queue with max message size', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationSQSQueue(stack, 'testSQS', {
    name: 'TEST',
    maxMessageSize: 86753,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

const testFieldValidation = (config: ApplicationSQSQueueProps) => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const sqsConfig = {
    name: 'test',
    ...config,
  };

  expect(() => new ApplicationSQSQueue(stack, 'test-sqs', sqsConfig)).toThrow(
    Error
  );
};

test('test sqs validators', () => {
  testFieldValidation({ visibilityTimeoutSeconds: -1 });
  testFieldValidation({ visibilityTimeoutSeconds: 43201 });

  testFieldValidation({ messageRetentionSeconds: 59 });
  testFieldValidation({ messageRetentionSeconds: 43201 });

  testFieldValidation({ maxMessageSize: 234 });
  testFieldValidation({ maxMessageSize: 262145 });

  testFieldValidation({ delaySeconds: -1 });
  testFieldValidation({ delaySeconds: 901 });

  testFieldValidation({ receiveWaitTimeSeconds: -1 });
  testFieldValidation({ receiveWaitTimeSeconds: 24 });
});
