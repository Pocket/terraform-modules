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
import {
  DataAwsIamPolicyDocument,
  IamRole,
  IamRolePolicy,
  LambdaEventSourceMapping,
} from '../../.gen/providers/aws';

export interface PocketSQSWithLambdaTargetProps
  extends PocketVersionedLambdaProps {
  sqsQueue?: {
    messageRetentionSeconds?: number;
    maxReceiveCount?: number;
    maxMessageSize?: number;
    delaySeconds?: number;
    visibilityTimeoutSeconds?: number;
  };
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
      name: `${config.name}-Queue`,
      tags: config.tags,
    });
    this.createSQSExecutionPolicyOnLambda(
      this.lambda.lambdaExecutionRole,
      this.sqsQueue
    );
    this.createEventSourceMapping(this.lambda, this.sqsQueue, config);
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
    sqsQueue: ApplicationSQSQueue,
    config: PocketSQSWithLambdaTargetProps
  ) {
    return new LambdaEventSourceMapping(this, `lambda_event_source_mapping`, {
      eventSourceArn: sqsQueue.sqsQueue.arn,
      functionName: lambda.versionedLambda.arn,
      batchSize: config.batchSize,
    });
  }

  /**
   * Allow the Lambda to access the sqs queue
   * @param executionRole
   * @param sqsQueue
   * @private
   */
  private createSQSExecutionPolicyOnLambda(
    executionRole: IamRole,
    sqsQueue: ApplicationSQSQueue
  ): IamRolePolicy {
    return new IamRolePolicy(this, 'execution-role-policy', {
      name: `${this.config.name}-ExecutionRolePolicy`,
      policy: new DataAwsIamPolicyDocument(this, `sqs_lambda_policy`, {
        statement: [
          {
            effect: 'Allow',
            actions: [
              'sqs:SendMessage',
              'sqs:ReceiveMessage',
              'sqs:DeleteMessage',
              'sqs:GetQueueAttributes',
              'sqs:ChangeMessageVisibility',
            ],
            resources: [sqsQueue.sqsQueue.arn],
          },
        ],
      }).json,
      role: executionRole.name,
      dependsOn: [executionRole],
    });
  }
}
