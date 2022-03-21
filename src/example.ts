import { Construct } from 'constructs';
import { App, TerraformResource, TerraformStack } from 'cdktf';
import { AwsProvider, lambdafunction, sqs } from '@cdktf/provider-aws';
import { PocketALBApplication } from './pocket/PocketALBApplication';
import { ApplicationECSContainerDefinitionProps } from './base/ApplicationECSContainerDefinition';
import { LocalProvider } from '@cdktf/provider-local';
import { NullProvider } from '@cdktf/provider-null';
import { ArchiveProvider } from '@cdktf/provider-archive';
import { PocketVPC } from './pocket/PocketVPC';
import { PocketEventBridgeWithLambdaTarget } from './pocket/PocketEventBridgeWithLambdaTarget';
import { LAMBDA_RUNTIMES } from './base/ApplicationVersionedLambda';
import { PocketVersionedLambda, PocketVersionedLambdaProps } from './pocket/PocketVersionedLambda';
import {
  PocketEventBridgeProps,
  PocketEventBridgeRuleWithMultipleTargets,
  PocketEventBridgeTargets
} from './pocket/PocketEventBridgeRuleWithMultipleTargets';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1'
    });
    new LocalProvider(this, 'local', {});
    new NullProvider(this, 'null', {});
    new ArchiveProvider(this, 'archive');

    const vpc = new PocketVPC(this, 'pocket-shared-vpc');

    const lambdaConfig: PocketVersionedLambdaProps = {
      name: 'test-datasync-lambda',
      lambda: {
        runtime: LAMBDA_RUNTIMES.PYTHON38,
        handler: 'index.handler'
      }
    };
    const targetLambda = new PocketVersionedLambda(
      this,
      'datasync-target-lambda',
      lambdaConfig
    );

    const targetLambdaDLQ = new sqs.SqsQueue(this, 'datasync-target-lambda-dlq', {
      name: 'datasync-target-lambda-dlq'
    });


    let eventBridgeTarget: PocketEventBridgeTargets = {
      targetId: 'datasync-lambda-id',
      arn: targetLambda.lambda.versionedLambda.arn,
      terraformResource: targetLambda.lambda.versionedLambda,
      deadLetterArn: targetLambdaDLQ.arn
    };

    const datasyncConfig: PocketEventBridgeProps = {
      eventRule: {
        name: 'test-event-bridge-rule-multiple-targets',
        pattern: {
          source: ['curation-migration-datasync-2'],
          'detail-type': ['add-scheduled-item', 'update-scheduled-item']
        }
      },
      targets: [
        { ...eventBridgeTarget }
      ]
    };

     let eventBridgeRuleObj = new PocketEventBridgeRuleWithMultipleTargets(
      this,
      'datasync-event-bridge-with-multiple-targets',
      datasyncConfig
    );

     let eventBridgeRule =  eventBridgeRuleObj.getEventBridge();

      new lambdafunction.LambdaPermission(this, 'test-datasync-lambda-Function-permission', {
        action: 'lambda:InvokeFunction',
        functionName: targetLambda.lambda.versionedLambda.functionName,
        qualifier: targetLambda.lambda.versionedLambda.name,
        principal: 'events.amazonaws.com',
        sourceArn: eventBridgeRule.rule.arn,
        dependsOn: [targetLambda.lambda.versionedLambda, eventBridgeRule.rule],
      });

      //to test dlq: setup lambda iam permission to publish to dlq.
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();
