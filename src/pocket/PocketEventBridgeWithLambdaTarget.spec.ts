import { Testing, TerraformStack } from 'cdktf';
import { PocketEventBridgeWithLambdaTarget } from './PocketEventBridgeWithLambdaTarget';

const config = {
  name: 'test-event-bridge-lambda',
  eventPattern: {
    source: ['aws.states'],
    'detail-type': ['Step Functions Execution Status Change'],
  },
  runtime: 'python3.8',
};

test('renders an event bridge and lambda target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(
    stack,
    'test-event-bridge-lambda',
    config
  );

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    tags: {
      my: 'tags',
      for: 'test',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with lambda description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambdaDescription: 'Test description',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with rule description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    ruleDescription: 'Test description',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with event bus name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    eventBusName: 'test-bus',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    timeout: 300,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with environment variables', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    environment: {
      my: 'var',
      is: 'good',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with vpc config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    vpcConfig: {
      subnetIds: ['1', '2'],
      securityGroupIds: ['sec1', 'sec2'],
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with s3 bucket', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    s3Bucket: 'test-bucket',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with log retention', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    logRetention: 10,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with execution policy', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    executionPolicyStatements: [
      {
        effect: 'Allow',
        actions: ['*'],
        resources: ['*'],
      },
    ],
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
