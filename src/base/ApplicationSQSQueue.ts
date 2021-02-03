import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { SqsQueue } from '../../.gen/providers/aws';

export interface ApplicationSQSQueueProps {
  /**
   * Name of the sqs queue
   */
  name?: string;
  /**
   * The number of seconds Amazon SQS retains a message.
   */
  messageRetentionSeconds?: number;

  /**
   * How many times a message can be received before it goes to a dead letter queue
   * If not set or set to 0 this will instead max messages constantly retry
   */
  maxReceiveCount?: number;
  maxMessageSize?: number;
  delaySeconds?: number;
  visibilityTimeoutSeconds?: number;

  tags?: { [key: string]: string };
}

/**
 * Creates an SQS Queue with a dead letter queue
 */
export class ApplicationSQSQueue extends Resource {
  public readonly sqsQueue: SqsQueue;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationSQSQueueProps
  ) {
    super(scope, name);
    this.sqsQueue = this.createSQSQueue(config);
  }

  private createSQSQueue(config: ApplicationSQSQueueProps) {
    //Have to use the any type because SqsQueueConfig marks the properties as readonly 🤦🏼‍
    const sqsConfig: any = {
      name: config.name,
      messageRetentionSeconds: config.messageRetentionSeconds,
      maxMessageSize: config.maxMessageSize,
      delaySeconds: config.delaySeconds,
      visibilityTimeoutSeconds: config.visibilityTimeoutSeconds,
      tags: config.tags,
      fifoQueue: false,
    };

    if (config.maxReceiveCount && config.maxReceiveCount > 0) {
      const deadLetterQueue = this.createDeadLetterSQSQueue(config);
      sqsConfig.redrivePolicy = JSON.stringify({
        maxReceiveCount: config.maxReceiveCount,
        deadLetterTargetArn: deadLetterQueue.arn,
      });
    }

    return new SqsQueue(this, `sqs_queue`, config);
  }

  /**
   * Create a dead letter queue
   * @param config
   * @private
   */
  private createDeadLetterSQSQueue(config: ApplicationSQSQueueProps) {
    return new SqsQueue(this, `redrive_sqs_queue`, {
      name: `${config.name}-Deadletter`,
      tags: config.tags,
      fifoQueue: false,
    });
  }
}
