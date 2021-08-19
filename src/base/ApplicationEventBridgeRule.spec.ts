import { Testing, TerraformStack } from 'cdktf';
import {
  ApplicationEventBridgeRule,
  ApplicationEventBridgeRuleProps,
} from './ApplicationEventBridgeRule';
import { SqsQueue } from '@cdktf/provider-aws';

const config: ApplicationEventBridgeRuleProps = {
  name: 'Test-EventBridge',
  eventPattern: {
    source: ['aws.states'],
    'detail-type': ['Step Functions Execution Status Change'],
  },
};

test('renders an event bridge without a target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge with sqs target', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  const sqs = new SqsQueue(stack, 'test-queue', {
    name: 'Test-SQS-Queue',
  });

  new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
    ...config,
    target: {
      dependsOn: sqs,
      arn: sqs.arn,
      targetId: 'sqs',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge with description', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
    ...config,
    description: 'Test description',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge with event bus name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
    ...config,
    eventBusName: 'test-bus',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an event bridge with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
    ...config,
    tags: {
      my: 'tag',
      for: 'test',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
