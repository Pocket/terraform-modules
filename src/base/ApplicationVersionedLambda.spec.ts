import { TerraformStack, Testing } from 'cdktf';
import {
  ApplicationVersionedLambda,
  ApplicationVersionedLambdaProps,
  LAMBDA_RUNTIMES,
} from './ApplicationVersionedLambda';

const config: ApplicationVersionedLambdaProps = {
  name: 'Test-Lambda',
  runtime: LAMBDA_RUNTIMES.PYTHON38,
  handler: 'index.handler',
  s3Bucket: 'test-bucket',
};

test('renders a versioned lambda', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    tags: {
      my: 'tag',
      for: 'test',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with environment variables', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    environment: {
      MY: 'env_var',
      for: 'test',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    timeout: 500,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    description: 'Test Description',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with execution policy statements', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
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

test('renders a versioned lambda with log retention', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    logRetention: 10,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with vpc', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    vpcConfig: {
      subnetIds: ['1', '2'],
      securityGroupIds: ['sec1', 'sec2'],
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with s3 bucket', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    s3Bucket: 'test-bucket',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a versioned lambda with publish ignored', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    usesCodeDeploy: true,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a lambda with a node v14 runtime', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationVersionedLambda(stack, 'test-versioned-lambda', {
    ...config,
    runtime: LAMBDA_RUNTIMES.NODEJS14,
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
