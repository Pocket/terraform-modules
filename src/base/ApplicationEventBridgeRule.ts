import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import {
  CloudwatchEventRule,
  CloudwatchEventTarget,
  DataAwsCallerIdentity,
  DataAwsRegion,
} from '../../.gen/providers/aws';

interface ApplicationEventBridgeRuleProps {
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
  private callerIdentity: DataAwsCallerIdentity;
  private region: DataAwsRegion;
  public readonly rule: CloudwatchEventRule;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationEventBridgeRuleProps
  ) {
    super(scope, name);

    this.region = new DataAwsRegion(this, 'region');
    this.callerIdentity = new DataAwsCallerIdentity(this, 'caller-identity');
    this.rule = this.createCloudwatchEventRule();
  }

  private createCloudwatchEventRule() {
    const rule = new CloudwatchEventRule(this, 'event-bridge-rule', {
      name: this.config.name,
      description: this.config.description,
      eventPattern: JSON.stringify(this.config.eventPattern),
      eventBusName: this.config.eventBusName ?? 'default',
      tags: this.config.tags,
    });

    if (this.config.target) {
      new CloudwatchEventTarget(this, 'event-bridge-target', {
        rule: rule.name,
        targetId: this.config.target.targetId,
        arn: this.config.target.arn,
        dependsOn: [this.config.target.dependsOn, rule],
      });
    }

    return rule;
  }
}
