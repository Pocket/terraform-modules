import { Construct } from 'constructs';
import { ApplicationEventBridgeRule } from '../base/ApplicationEventBridgeRule';
import { ApplicationVersionedLambda } from '../base/ApplicationVersionedLambda';
import { LambdaPermission } from '@cdktf/provider-aws';
import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
} from './PocketVersionedLambda';

export interface PocketEventBridgeWithLambdaTargetProps
  extends PocketVersionedLambdaProps {
  eventRule: {
    description?: string;
    eventBusName?: string;
    pattern: { [key: string]: any };
  };
}

/**
 * Extends the base pocket versioned lambda class to add an event bridge based trigger on top of the lambda
 */
export class PocketEventBridgeWithLambdaTarget extends PocketVersionedLambda {
  constructor(
    scope: Construct,
    name: string,
    protected readonly config: PocketEventBridgeWithLambdaTargetProps
  ) {
    super(scope, name, config);

    const eventBridgeRule = this.createEventBridgeRule(this.lambda);
    this.createLambdaEventRuleResourcePermission(this.lambda, eventBridgeRule);
  }

  /**
   * Creates the approriate permission to allow aws events to invoke lambda
   * @param lambda
   * @param eventBridgeRule
   * @private
   */
  private createLambdaEventRuleResourcePermission(
    lambda: ApplicationVersionedLambda,
    eventBridgeRule: ApplicationEventBridgeRule
  ): void {
    new LambdaPermission(this, 'lambda-permission', {
      action: 'lambda:InvokeFunction',
      functionName: lambda.versionedLambda.functionName,
      qualifier: lambda.versionedLambda.name,
      principal: 'events.amazonaws.com',
      sourceArn: eventBridgeRule.rule.arn,
      dependsOn: [lambda.versionedLambda, eventBridgeRule.rule],
    });
  }

  /**
   * Creates the actual rule for event bridge to trigger the lambda
   * @param lambda
   * @private
   */
  private createEventBridgeRule(
    lambda: ApplicationVersionedLambda
  ): ApplicationEventBridgeRule {
    const eventRuleConfig = this.config.eventRule;

    return new ApplicationEventBridgeRule(this, 'event-bridge-rule', {
      name: this.config.name,
      description: eventRuleConfig.description,
      eventBusName: eventRuleConfig.eventBusName,
      eventPattern: eventRuleConfig.pattern,
      target: {
        targetId: 'lambda',
        arn: lambda.versionedLambda.arn,
        dependsOn: lambda.versionedLambda,
      },
      tags: this.config.tags,
    });
  }
}
