import { Construct } from 'constructs';

import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
} from './PocketVersionedLambda';
import {
  ApplicationSQSQueue,
  ApplicationSQSQueueProps,
} from '../base/ApplicationSQSQueue';
import { ApplicationVersionedLambda } from '../base/ApplicationVersionedLambda';
import { LambdaEventSourceMapping } from '../../.gen/providers/aws';

export interface PocketSQSWithLambdaTargetProps
  extends PocketVersionedLambdaProps {
  sqsQueue: ApplicationSQSQueueProps;
  batchSize?: number;
}

/**
 * Extends the base pocket versioned lambda class to add a sqs based trigger on top of the lambda
 */
export class PocketSQSWithLambdaTarget extends PocketVersionedLambda {
  public readonly sqsQueue: ApplicationSQSQueue;

  constructor(
    scope: Construct,
    name: string,
    protected readonly config: PocketSQSWithLambdaTargetProps
  ) {
    super(scope, name, config);
    this.sqsQueue = this.createSqsQueue({
      ...config.sqsQueue,
      tags: config.tags,
    });
    this.createEventSourceMapping(this.lambda, this.sqsQueue);
  }

  /**
   * Creates the sqs queue to use with the lambda target
   * @private
   */
  private createSqsQueue(
    sqsQueueConfig: ApplicationSQSQueueProps
  ): ApplicationSQSQueue {
    return new ApplicationSQSQueue(this, 'lambda_sqs_queue', sqsQueueConfig);
  }

  private createEventSourceMapping(
    lambda: ApplicationVersionedLambda,
    sqsQueue: ApplicationSQSQueue
  ) {
    return new LambdaEventSourceMapping(this, `lambda_event_source_mapping`, {
      eventSourceArn: sqsQueue.sqsQueue.arn,
      functionName: lambda.versionedLambda.arn,
    });
  }
}
