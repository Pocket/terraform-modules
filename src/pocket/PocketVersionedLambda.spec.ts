import { Testing, TerraformStack } from 'cdktf';
import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
} from './PocketVersionedLambda';
import { LAMBDA_RUNTIMES } from '../base/ApplicationVersionedLambda';

const config: PocketVersionedLambdaProps = {
  name: 'test-lambda',
  lambda: {
    runtime: LAMBDA_RUNTIMES.PYTHON38,
    handler: 'index.handler',
  },
};

test('renders a lambda target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda target with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    tags: {
      my: 'tags',
      for: 'test',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with lambda description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    lambda: { ...config.lambda, description: 'Test description' },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    lambda: { ...config.lambda, timeout: 300 },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with environment variables', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
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

test('renders a lambda with vpc config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
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

test('renders a lambda with s3 bucket', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      s3Bucket: 'test-bucket',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with log retention', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      logRetention: 10,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with execution policy', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
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

test('renders a lambda with code deploy', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
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

test('renders a lambda with alarms', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
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

test('it can treat missing data as breaching', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVersionedLambda(stack, 'test-lambda', {
    ...config,
    lambda: {
      ...config.lambda,
      alarms: {
        invocations: {
          period: 60,
          threshold: 1,
          treatMissingData: 'breaching',
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
      new PocketVersionedLambda(stack, 'test-lambda', eventBridgeLambdaConfig)
  ).toThrow(Error);
};

test('it validates alarms config', () => {
  testAlarmValidation('invocations');
  testAlarmValidation('throttles');
  testAlarmValidation('concurrentExecutions');
  testAlarmValidation('errors');
  testAlarmValidation('duration');
});
