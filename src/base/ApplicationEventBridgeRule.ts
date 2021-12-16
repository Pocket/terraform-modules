import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridge } from '@cdktf/provider-aws';

export interface ApplicationEventBridgeRuleProps {
  name: string;
  description?: string;
  eventBusName?: string;
  eventPattern: { [key: string]: any };
  target?: {
    arn: string;
    targetId?: string;
    dependsOn: TerraformResource;
  };
  tags?: { [key: string]: string };
}

export class ApplicationEventBridgeRule extends Resource {
  public readonly rule: eventbridge.CloudwatchEventRule;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationEventBridgeRuleProps
  ) {
    super(scope, name);

    this.rule = this.createCloudwatchEventRule();
  }

  private createCloudwatchEventRule() {
    const rule = new eventbridge.CloudwatchEventRule(
      this,
      'event-bridge-rule',
      {
        name: `${this.config.name}-Rule`,
        description: this.config.description,
        eventPattern: JSON.stringify(this.config.eventPattern),
        eventBusName: this.config.eventBusName ?? 'default',
        tags: this.config.tags,
      }
    );

    if (this.config.target) {
      new eventbridge.CloudwatchEventTarget(this, 'event-bridge-target', {
        rule: rule.name,
        targetId: this.config.target.targetId,
        arn: this.config.target.arn,
        dependsOn: [this.config.target.dependsOn, rule],
      });
    }

    return rule;
  }
}
