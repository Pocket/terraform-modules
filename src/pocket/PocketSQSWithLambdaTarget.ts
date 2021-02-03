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
  IamPolicy,
  IamRole,
  IamRolePolicyAttachment,
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
  batchWindow?: number;
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
    PocketSQSWithLambdaTarget.validateEventSourceMappingConfig(config);
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

  /**
   * Validates the event source mapping config.
   * @param config
   * @private
   */
  private static validateEventSourceMappingConfig(
    config: PocketSQSWithLambdaTargetProps
  ) {
    if (
      config.batchSize &&
      config.batchSize > 10 &&
      (!config.batchWindow || config.batchWindow < 1)
    ) {
      throw new Error(
        'Maximum batch window in seconds must be greater than 0 if maximum batch size is greater than 10'
      );
    }
  }

  /**
   * Creates the event source mapping for SQS to lambda
   * @param lambda
   * @param sqsQueue
   * @param config
   * @private
   */
  private createEventSourceMapping(
    lambda: ApplicationVersionedLambda,
    sqsQueue: ApplicationSQSQueue,
    config: PocketSQSWithLambdaTargetProps
  ) {
    return new LambdaEventSourceMapping(this, `lambda_event_source_mapping`, {
      eventSourceArn: sqsQueue.sqsQueue.arn,
      functionName: lambda.versionedLambda.arn,
      batchSize: config.batchSize,
      maximumBatchingWindowInSeconds: config.batchWindow,
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
  ): IamRolePolicyAttachment {
    const lambdaSqsPolicy = new IamPolicy(this, 'sqs-policy', {
      name: `${this.config.name}-LambdaSQSPolicy`,
      policy: new DataAwsIamPolicyDocument(this, `lambda_sqs_policy`, {
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
      dependsOn: [executionRole],
    });

    return new IamRolePolicyAttachment(
      this,
      'execution-role-policy-attachment',
      {
        role: executionRole.name,
        policyArn: lambdaSqsPolicy.arn,
        dependsOn: [executionRole, lambdaSqsPolicy],
      }
    );
  }
}
