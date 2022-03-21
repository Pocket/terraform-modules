import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import {
  ApplicationEventBridgeRule,
  Target,
} from '../base/ApplicationEventBridgeRule';

export type PocketEventBridgeTargets = {
  targetId: string;
  arn: string;
  terraformResource: TerraformResource;
  deadLetterArn?: string;
};

export interface PocketEventBridgeProps {
  eventRule: {
    name: string;
    description?: string;
    eventBusName?: string;
    pattern: { [key: string]: any };
  };
  targets?: PocketEventBridgeTargets[];
  tags?: { [key: string]: string };
}

/**
 * class to role out event bridge rule with multiple AWS resources as targets
 * Note: the targets need to be created prior and passed to this function.
 * This class does not handle IAM, they have to be handled at the consuming function
 */
export class PocketEventBridgeRuleWithMultipleTargets extends Resource {
  private eventBridgeRule: ApplicationEventBridgeRule;
  constructor(
    scope: Construct,
    name: string,
    protected readonly config: PocketEventBridgeProps
  ) {
    super(scope, name);
    this.eventBridgeRule = this.createEventBridgeRule(config.targets);
  }

  public getEventBridge() {
    return this.eventBridgeRule;
  }

  /**
   * Creates the actual rule for event bridge to trigger the given target.
   * @param eventRuleTargets
   * @private
   */
  private createEventBridgeRule(
    eventRuleTargets?: any
  ): ApplicationEventBridgeRule {
    const eventRuleConfig = this.config.eventRule;
    const targets: Target[] = [];

    eventRuleTargets.forEach((t) =>
      targets.push({
        targetId: t.targetId,
        arn: t.arn,
        dependsOn: t.terraformResource,
        deadLetterArn: t.deadLetterArn,
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
