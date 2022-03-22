import { Resource } from 'cdktf';
import { eventbridge } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export interface ApplicationEventBusProps {
  name: string,
  tags?: { [key: string]: string };
}

export class ApplicationEventBus extends Resource {
  public readonly bus: eventbridge.CloudwatchEventBus;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationEventBusProps
  ) {
    super(scope, name);

    this.bus = this.createCloudwatchEventRule();
  }

  private createCloudwatchEventRule() : eventbridge.CloudwatchEventBus{
    return new eventbridge.CloudwatchEventBus(
      this,
      `event-bus-${this.config.name}`,
      {
        name: this.config.name,
        tags: this.config.tags
      }
    );
  }
}
