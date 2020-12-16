import { Testing, TerraformStack } from 'cdktf';
import {
  PocketEventBridgeWithLambdaTarget,
  PocketEventBridgeWithLambdaTargetProps,
} from './PocketEventBridgeWithLambdaTarget';
import { LAMBDA_RUNTIMES } from '../base/ApplicationVersionedLambda';

const config: PocketEventBridgeWithLambdaTargetProps = {
  name: 'test-event-bridge-lambda',
  eventRule: {
    pattern: {
      source: ['aws.states'],
      'detail-type': ['Step Functions Execution Status Change'],
    },
  },
  lambda: {
    runtime: LAMBDA_RUNTIMES.PYTHON38,
    handler: 'index.handler',
  },
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
    lambda: { ...config.lambda, description: 'Test description' },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with rule description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    eventRule: { ...config.eventRule, description: 'Test description' },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with event bus name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    eventRule: { ...config.eventRule, eventBusName: 'test-bus' },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: { ...config.lambda, timeout: 300 },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with environment variables', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      environment: {
        my: 'var',
        IS: 'good',
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with vpc config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      vpcConfig: {
        subnetIds: ['1', '2'],
        securityGroupIds: ['sec1', 'sec2'],
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with s3 bucket', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      s3Bucket: 'test-bucket',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with log retention', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      logRetention: 10,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with execution policy', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      executionPolicyStatements: [
        {
          effect: 'Allow',
          actions: ['*'],
          resources: ['*'],
        },
      ],
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with code deploy', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      codeDeploy: {
        deploySnsTopicArn: 'arn:test',
        detailType: 'FULL',
        region: 'us-east-1',
        accountId: 'test-account',
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge and lambda target with alarms', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketEventBridgeWithLambdaTarget(stack, 'test-event-bridge-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      alarms: {
        invocations: {
          period: 60,
          threshold: 1,
        },
        errors: {
          period: 60,
          threshold: 1,
        },
        throttles: {
          period: 60,
          threshold: 1,
        },
        concurrentExecutions: {
          period: 60,
          threshold: 1,
        },
        duration: {
          period: 60,
          threshold: 1,
        },
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

const testAlarmValidation = (alarmType: string) => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const eventBridgeLambdaConfig = {
    ...config,
    lambda: {
      ...config.lambda,
      alarms: {
        [alarmType]: {
          period: 60,
          threshold: 1,
          datapointsToAlarm: 2,
        },
      },
    },
  };

  expect(
    () =>
      new PocketEventBridgeWithLambdaTarget(
        stack,
        'test-event-bridge-lambda',
        eventBridgeLambdaConfig
      )
  ).toThrow(Error);
};

test('it validates alarms config', () => {
  testAlarmValidation('invocations');
  testAlarmValidation('throttles');
  testAlarmValidation('concurrentExecutions');
  testAlarmValidation('errors');
  testAlarmValidation('duration');
});
