import { Testing } from 'cdktf';
import { lambdafunction } from '@cdktf/provider-aws';
import { ApplicationLambdaSnsTopicSubscription } from './ApplicationLambdaSnsTopicSubscription';

describe('ApplicationSqsSnsTopicSubscription', () => {
  const getConfig = (stack) => ({
    name: 'test-sns-subscription',
    snsTopicArn: 'arn:aws:sns:TopicName',
    lambdaArn: new lambdafunction.DataAwsLambdaFunction(stack, 'lambda', {
      functionName: 'test-lambda',
    }).arn,
  });

  it('renders an Lambda <> SNS subscription without tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLambdaSnsTopicSubscription(
        stack,
        'lambda-sns-subscription',
        getConfig(stack)
      );
    });
    expect(synthed).toMatchSnapshot();
  });

  it('renders an SQS SNS subscription with tags', () => {
    const synthed = Testing.synthScope((stack) => {
      new ApplicationLambdaSnsTopicSubscription(
        stack,
        'lambda-sns-subscription',
        {
          ...getConfig(stack),
          tags: { hello: 'there' },
        }
      );
    });
    expect(synthed).toMatchSnapshot();
  });
});
