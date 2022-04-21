import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider, lambdafunction, sqs } from '@cdktf/provider-aws';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import { ArchiveProvider } from '@cdktf/provider-archive';
import { PocketVPC } from './pocket/PocketVPC';
import { LAMBDA_RUNTIMES } from './base/ApplicationVersionedLambda';
import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
} from './pocket/PocketVersionedLambda';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  PocketEventBridgeTargets,
} from './pocket/PocketEventBridgeRuleWithMultipleTargets';
import { ApplicationEventBus } from './base/ApplicationEventBus';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });
    new LocalProvider(this, 'local', {});
    new NullProvider(this, 'null', {});
    new ArchiveProvider(this, 'archive');

    const vpc = new PocketVPC(this, 'pocket-shared-vpc');

    const lambdaConfig: PocketVersionedLambdaProps = {
      name: 'test-lambda',
      lambda: {
        runtime: LAMBDA_RUNTIMES.PYTHON38,
        handler: 'index.handler',
      },
    };
    const targetLambda = new PocketVersionedLambda(
      this,
      'test-target-lambda',
      lambdaConfig
    );

    const targetLambdaDLQ = new sqs.SqsQueue(this, 'test-target-lambda-dlq', {
      name: 'test-target-lambda-dlq',
    });

    const eventBridgeTarget: PocketEventBridgeTargets = {
      targetId: 'test-lambda-id',
      arn: targetLambda.lambda.versionedLambda.arn,
      terraformResource: targetLambda.lambda.versionedLambda,
      deadLetterArn: targetLambdaDLQ.arn,
    };

    const testEventBus = new ApplicationEventBus(this, 'test-event-bus', {
      name: 'test-event-bus',
    });

    const datasyncConfig: PocketEventBridgeProps = {
      eventRule: {
        name: 'test-event-bridge-rule-multiple-targets',
        pattern: {
          source: ['test-custom-bus-events'],
          'detail-type': ['add-item', 'update-item'],
        },
        eventBusName: testEventBus.bus.name,
      },
      targets: [{ ...eventBridgeTarget }],
    };

    const eventBridgeRuleObj = new PocketEventBridgeRuleWithMultipleTargets(
      this,
      'test-event-bridge-rule-multiple-targets',
      datasyncConfig
    );

    const eventBridgeRule = eventBridgeRuleObj.getEventBridge();

    new lambdafunction.LambdaPermission(
      this,
      'test-lambda-Function-permission',
      {
        action: 'lambda:InvokeFunction',
        functionName: targetLambda.lambda.versionedLambda.functionName,
        qualifier: targetLambda.lambda.versionedLambda.name,
        principal: 'events.amazonaws.com',
        sourceArn: eventBridgeRule.rule.arn,
        dependsOn: [targetLambda.lambda.versionedLambda, eventBridgeRule.rule],
      }
    );
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();
