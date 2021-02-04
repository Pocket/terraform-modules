import { TerraformStack, Testing } from 'cdktf';
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
