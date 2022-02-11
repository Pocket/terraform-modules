import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridge } from '@cdktf/provider-aws';
import { CloudwatchEventTargetDeadLetterConfig } from '@cdktf/provider-aws/lib/eventbridge/cloudwatch-event-target';

export type Target = {
  arn: string;
  deadLetterArn?: string;
  targetId?: string;
  dependsOn: TerraformResource;
};

export interface ApplicationEventBridgeRuleProps {
  name: string;
  description?: string;
  eventBusName?: string;
  eventPattern: { [key: string]: any };
  targets?: Target[];
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

    if (this.config.targets) {
      if (this.config.targets.length > 5) {
        throw new Error('each rule can have only 5 targets');
      }
      this.config.targets.forEach((t) => {
        new eventbridge.CloudwatchEventTarget(this, 'event-bridge-target', {
          rule: rule.name,
          targetId: t.targetId,
          arn: t.arn,
          deadLetterConfig: t.deadLetterArn ? { arn: t.deadLetterArn } : null,
          dependsOn: [t.dependsOn, rule],
        });
      });
    }

    return rule;
  }
}
