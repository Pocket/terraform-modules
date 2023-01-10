import { DataAwsIamPolicyDocument } from '@cdktf/provider-aws/lib/data-aws-iam-policy-document';
import { DataAwsSqsQueue } from '@cdktf/provider-aws/lib/data-aws-sqs-queue';
import {
  SnsTopicSubscription,
  SnsTopicSubscriptionConfig,
} from '@cdktf/provider-aws/lib/sns-topic-subscription';
import { SqsQueue } from '@cdktf/provider-aws/lib/sqs-queue';
import { SqsQueuePolicy } from '@cdktf/provider-aws/lib/sqs-queue-policy';
import { TerraformMetaArguments, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';

export interface ApplicationSqsSnsTopicSubscriptionProps
  extends TerraformMetaArguments {
  name: string;
  snsTopicArn: string;
  sqsQueue: SqsQueue | DataAwsSqsQueue;
  snsDlq?: SqsQueue;
  tags?: { [key: string]: string };
  dependsOn?: TerraformResource[];
}

/**
 * Creates an SNS to SQS subscription
 */
export class ApplicationSqsSnsTopicSubscription extends Construct {
  public readonly snsTopicSubscription: SnsTopicSubscription;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationSqsSnsTopicSubscriptionProps
  ) {
    super(scope, name);

    const snsTopicDlq = this.config.snsDlq ?? this.createSqsSubscriptionDlq();
    this.snsTopicSubscription = this.createSnsTopicSubscription(snsTopicDlq);
    this.createPoliciesForSnsToSQS(snsTopicDlq);
  }

  /**
   * Create a dead-letter queue for failed SNS messages
   * @private
   */
  private createSqsSubscriptionDlq(): SqsQueue {
    return new SqsQueue(this, 'sns-topic-dql', {
      name: `${this.config.name}-SNS-Topic-DLQ`,
      tags: this.config.tags,
      provider: this.config.provider,
    });
  }

  /**
   * Create an SNS subscription for SQS
   * @param snsTopicDlq
   * @private
   */
  private createSnsTopicSubscription(
    snsTopicDlq: SqsQueue
  ): SnsTopicSubscription {
    return new SnsTopicSubscription(this, 'sns-subscription', {
      topicArn: this.config.snsTopicArn,
      protocol: 'sqs',
      endpoint: this.config.sqsQueue.arn,
      redrivePolicy: JSON.stringify({
        deadLetterTargetArn: snsTopicDlq.arn,
      }),
      dependsOn: [
        snsTopicDlq,
        ...(this.config.dependsOn ? this.config.dependsOn : []),
      ],
      provider: this.config.provider,
    } as SnsTopicSubscriptionConfig);
  }

  /**
   * Create IAM policies to allow SNS to write to the target SQS queue and a
   * dead-letter queue
   * @param snsTopicDlq
   * @private
   */
  private createPoliciesForSnsToSQS(snsTopicDlq: SqsQueue): void {
    [
      { name: 'sns-sqs', resource: this.config.sqsQueue },
      { name: 'sns-dlq', resource: snsTopicDlq },
    ].forEach((queue) => {
      const policy = new DataAwsIamPolicyDocument(
        this,
        `${queue.name}-policy-document`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sqs:SendMessage'],
              resources: [queue.resource.arn],
              principals: [
                {
                  identifiers: ['amazonaws.com'],
                  type: 'Service',
                },
              ],
              condition: [
                {
                  test: 'ArnEquals',
                  variable: 'aws:SourceArn',
                  values: [this.config.snsTopicArn],
                },
              ],
            },
          ],
          dependsOn: [queue.resource] as TerraformResource[],
          provider: this.config.provider,
        }
      ).json;

      new SqsQueuePolicy(this, `${queue.name}-policy`, {
        queueUrl: queue.resource.url,
        policy: policy,
        provider: this.config.provider,
      });
    });
  }
}
