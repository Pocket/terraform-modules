import { Testing } from 'cdktf';
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

describe('AplicationEventBridgeRule', () => {
  it('renders an event bridge without a target', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', config);
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an event bridge with sqs target', () => {
    const synthed = Testing.synthScope((stack) => {
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
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an event bridge with description', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
        ...config,
        description: 'Test description',
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an event bridge with event bus name', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
        ...config,
        eventBusName: 'test-bus',
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an event bridge with tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationEventBridgeRule(stack, 'test-event-bridge-rule', {
        ...config,
        tags: {
          my: 'tag',
          for: 'test',
        },
      });
    });
    expect(synthed).toMatchSnapshot();
  });
});
