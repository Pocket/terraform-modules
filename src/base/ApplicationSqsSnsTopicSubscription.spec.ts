import { Testing } from 'cdktf';
import { sqs } from '@cdktf/provider-aws';
import { ApplicationSqsSnsTopicSubscription } from './ApplicationSqsSnsTopicSubscription';

describe('ApplicationSqsSnsTopicSubscription', () => {
  const getConfig = (stack) => ({
    name: 'test-sns-subscription',
    snsTopicArn: 'arn:aws:sns:TopicName',
    sqsQueue: new sqs.SqsQueue(stack, 'sqs', {
      name: 'test-sqs',
    }),
  });

  const getConfigWithDlq = (stack) => ({
    name: 'test-sns-subscription',
    snsTopicArn: 'arn:aws:sns:TopicName',
    sqsQueue: new sqs.SqsQueue(stack, 'sqs', {
      name: 'test-sqs',
    }),
    snsDlq: new sqs.SqsQueue(stack, 'dlq', {
      name: 'test-sqs-dlq',
    }),
  });

  it('renders an SQS SNS subscription without tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationSqsSnsTopicSubscription(
        stack,
        'sqs-sns-subscription',
        getConfig(stack)
      );
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an SQS SNS subscription with tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationSqsSnsTopicSubscription(stack, 'sqs-sns-subscription', {
        ...getConfig(stack),
        tags: { hello: 'there' },
      });
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an SQS SNS subscription witg dlq passed', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationSqsSnsTopicSubscription(stack, 'sqs-sns-subscription', {
        ...getConfigWithDlq(stack),
        tags: { hello: 'there' },
      });
    });
    expect(synthed).toMatchSnapshot();
  });
});
