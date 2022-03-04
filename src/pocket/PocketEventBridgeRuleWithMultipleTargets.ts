import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  ApplicationEventBridgeRule,
  Target,
} from '../base/ApplicationEventBridgeRule';

export interface PocketEventBridgeProps {
  eventRule: {
    name: string;
    description?: string;
    eventBusName?: string;
    pattern: { [key: string]: any };
  };
  targets: [
    {
      targetId: string;
      arn: string;
      type: string;
    }
  ];
  tags?: { [key: string]: string };
}

export class PocketEventBridgeRuleWithMultipleTargets extends Resource {
  constructor(
    scope: Construct,
    name: string,
    protected readonly config: PocketEventBridgeProps
  ) {
    super(scope, name);

    const eventBridgeRule = this.createEventBridgeRule(config.targets);
  }

  /**
   * Creates the actual rule for event bridge to trigger the given target
   * @param lambda
   * @private
   */
  private createEventBridgeRule(target?: any): ApplicationEventBridgeRule {
    const eventRuleConfig = this.config.eventRule;
    const targets: Target[] = [];

    target.forEach((t) =>
      targets.push({
        targetId: target.type,
        arn: t.versionedLambda.arn,
        dependsOn: t.versionedLambda,
      })
    );

    return new ApplicationEventBridgeRule(this, 'event-bridge-rule', {
      name: this.config.eventRule.name,
      description: eventRuleConfig.description,
      eventBusName: eventRuleConfig.eventBusName,
      eventPattern: eventRuleConfig.pattern,
      targets: targets,
      tags: this.config.tags,
    });
  }
}
