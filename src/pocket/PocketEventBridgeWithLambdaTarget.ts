import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { ApplicationEventBridgeRule } from '../base/ApplicationEventBridgeRule';
import {
  ApplicationVersionedLambda,
  LAMBDA_RUNTIMES,
} from '../base/ApplicationVersionedLambda';
import {
  DataAwsIamPolicyDocumentStatement,
  LambdaFunctionVpcConfig,
  LambdaPermission,
} from '../../.gen/providers/aws';
import { ApplicationLambdaCodeDeploy } from '../base/ApplicationLambdaCodeDeploy';

export interface PocketEventBridgeWithLambdaTargetProps {
  name: string;
  lambdaDescription?: string;
  ruleDescription?: string;
  eventBusName?: string;
  eventPattern: { [key: string]: any };
  runtime: LAMBDA_RUNTIMES;
  handler: string;
  timeout?: number;
  environment?: { [key: string]: string };
  vpcConfig?: LambdaFunctionVpcConfig;
  executionPolicyStatements?: DataAwsIamPolicyDocumentStatement[];
  logRetention?: number;
  s3Bucket?: string;
  tags?: { [key: string]: string };
  codeDeploy?: {
    deploySnsTopicArn?: string;
    detailType?: 'BASIC' | 'FULL';
    region: string;
    accountId: string;
  };
}

export class PocketEventBridgeWithLambdaTarget extends Resource {
  constructor(
    scope: Construct,
    name: string,
    config: PocketEventBridgeWithLambdaTargetProps
  ) {
    super(scope, name);

    const lambda = new ApplicationVersionedLambda(this, 'lambda', {
      name: config.name,
      description: config.lambdaDescription,
      runtime: config.runtime,
      handler: config.handler,
      timeout: config.timeout,
      environment: config.environment,
      vpcConfig: config.vpcConfig,
      executionPolicyStatements: config.executionPolicyStatements,
      logRetention: config.logRetention,
      s3Bucket: config.s3Bucket ?? `pocket-${config.name.toLowerCase()}`,
      tags: config.tags,
    });

    const eventBridgeRule = new ApplicationEventBridgeRule(
      this,
      'event-bridge-rule',
      {
        name: config.name,
        description: config.ruleDescription,
        eventBusName: config.eventBusName,
        eventPattern: config.eventPattern,
        target: {
          targetId: 'lambda',
          arn: lambda.versionedLambda.arn,
          dependsOn: lambda.versionedLambda,
        },
        tags: config.tags,
      }
    );

    new LambdaPermission(this, 'lambda-permission', {
      action: 'lambda:InvokeFunction',
      functionName: lambda.versionedLambda.functionName,
      qualifier: lambda.versionedLambda.name,
      principal: 'events.amazonaws.com',
      sourceArn: eventBridgeRule.rule.arn,
      dependsOn: [lambda.versionedLambda, eventBridgeRule.rule],
    });

    if (config.codeDeploy) {
      new ApplicationLambdaCodeDeploy(this, 'lambda-code-deploy', {
        name: config.name,
        deploySnsTopicArn: config.codeDeploy.deploySnsTopicArn,
        detailType: config.codeDeploy.detailType,
        region: config.codeDeploy.region,
        accountId: config.codeDeploy.accountId,
      });
    }
  }
}
