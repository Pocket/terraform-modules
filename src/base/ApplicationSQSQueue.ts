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
  /**
   * Max size the SQS message can be. In Bytes
   */
  maxMessageSize?: number;
  /**
   * How long should a message wait before its allowed to be visible to a worker
   */
  delaySeconds?: number;
  /**
   * Once a message is being worked on, how long can the worker hold it.
   */
  visibilityTimeoutSeconds?: number;
  /**
   * How long should a worker be allowed to long poll
   */
  receiveWaitTimeSeconds?: number;
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
    ApplicationSQSQueue.validateConfig(config);
    this.sqsQueue = this.createSQSQueue(config);
  }

  /**
   * Validates the config against the values defined in:
   * https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sqs_queue
   * @param config
   * @private
   */
  private static validateConfig(config: ApplicationSQSQueueProps): void {
    if (
      config.visibilityTimeoutSeconds &&
      (config.visibilityTimeoutSeconds < 0 ||
        config.visibilityTimeoutSeconds > 43200)
    ) {
      throw new Error(
        'Visibility timeout can not be greater then 43200 or less then 0'
      );
    }

    if (
      config.messageRetentionSeconds &&
      (config.messageRetentionSeconds > 43200 ||
        config.messageRetentionSeconds < 60)
    ) {
      throw new Error(
        'Message retention can not be greater then 1209600 or less then 60'
      );
    }

    if (
      config.maxMessageSize &&
      (config.maxMessageSize > 262144 || config.maxMessageSize < 1024)
    ) {
      throw new Error(
        'Message size can not be greater then 262144 or less then 1024'
      );
    }

    if (
      config.delaySeconds &&
      (config.delaySeconds > 900 || config.delaySeconds < 0)
    ) {
      throw new Error(
        'Delay seconds can not be greater then 900 or less then 0'
      );
    }

    if (
      config.receiveWaitTimeSeconds &&
      (config.receiveWaitTimeSeconds > 20 || config.receiveWaitTimeSeconds < 0)
    ) {
      throw new Error(
        'Receive wait time can not be greater then 20 or less then 0'
      );
    }
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

    return new SqsQueue(this, `sqs_queue`, sqsConfig);
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
