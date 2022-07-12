import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { eventbridge } from '@cdktf/provider-aws';
import { CloudwatchEventTargetConfig } from '@cdktf/provider-aws/lib/eventbridge';

export type Target = {
  arn: string;
  deadLetterArn?: string;
  targetId?: string;
  // an event bridge rule may have a target that already exists. in this case,
  // we don't need a dependsOn value.
  dependsOn?: TerraformResource;
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
    if (this.config.targets?.length > 5) {
      throw new Error('AWS allows only up to 5 targets per event bridge rule');
    }
    const eventBus = this.config.eventBusName ?? 'default';
    const rule = new eventbridge.CloudwatchEventRule(
      this,
      'event-bridge-rule',
      {
        name: `${this.config.name}-Rule`,
        description: this.config.description,
        eventPattern: JSON.stringify(this.config.eventPattern),
        eventBusName: eventBus,
        tags: this.config.tags,
      }
    );

    if (this.config.targets) {
      this.config.targets.forEach((t) => {
        // this is semi-terrible.
        //
        // the CloudwatchEventTargetConfig type will not allow us to add the
        // `dependsOn` property after object creation (due to it being
        // readonly). so we create a generic object, optionally add the
        // `dependsOn` property, then later cast it as the required
        // CloudwatchEventTargetConfig type.
        const eventTargetConfig: { [key: string]: any } = {
          rule: rule.name,
          targetId: t.targetId,
          arn: t.arn,
          deadLetterConfig: t.deadLetterArn ? { arn: t.deadLetterArn } : {},
          eventBusName: eventBus,
        };

        if (t.dependsOn) {
          eventTargetConfig.dependsOn = [t.dependsOn, rule];
        }

        new eventbridge.CloudwatchEventTarget(
          this,
          `event-bridge-target-${t.targetId}`,
          // yuck!
          eventTargetConfig as CloudwatchEventTargetConfig
        );
      });
    }

    return rule;
  }
}
