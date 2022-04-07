import { Testing } from 'cdktf';
import {
  PocketEventBridgeRuleWithMultipleTargets,
  PocketEventBridgeProps,
} from './PocketEventBridgeRuleWithMultipleTargets';
import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
} from './PocketVersionedLambda';
import { LAMBDA_RUNTIMES } from '../base/ApplicationVersionedLambda';
import { sqs } from '@cdktf/provider-aws';

test('renders an event bridge and multiple target', () => {
  const synthed = Testing.synthScope((stack) => {
    const lambdaConfig: PocketVersionedLambdaProps = {
      name: 'test-lambda',
      lambda: {
        runtime: LAMBDA_RUNTIMES.PYTHON38,
        handler: 'index.handler',
      },
    };
    const testLambda = new PocketVersionedLambda(
      stack,
      'test-lambda',
      lambdaConfig
    );

    const testSqs = new sqs.SqsQueue(stack, 'test-queue', {
      name: 'Test-SQS-Queue',
    });

    const testConfig: PocketEventBridgeProps = {
      eventRule: {
        name: 'test-event-bridge-rule-multiple-targets',
        pattern: {
          source: ['aws.states'],
          'detail-type': ['Step Functions Execution Status Change'],
        },
      },
      targets: [
        {
          targetId: 'test-lambda-id',
          arn: 'lambda.arn',
          terraformResource: testLambda.lambda.versionedLambda,
        },
        {
          targetId: 'test-sqs-id',
          arn: testSqs.arn,
          terraformResource: testSqs,
        },
      ],
    };

    new PocketEventBridgeRuleWithMultipleTargets(
      stack,
      'test-event-bridge-for-multiple-targets-1',
      {
        ...testConfig,
        eventRule: { ...testConfig.eventRule, description: 'Test description' },
      }
    );
  });
  expect(synthed).toMatchSnapshot();
});