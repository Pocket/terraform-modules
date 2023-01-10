import { Resource, TerraformMetaArguments, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { sqs, sns, iam } from '@cdktf/provider-aws';
import { SnsTopicSubscriptionConfig } from '@cdktf/provider-aws/lib/sns';

export interface ApplicationSqsSnsTopicSubscriptionProps
  extends TerraformMetaArguments {
  name: string;
  snsTopicArn: string;
  sqsQueue: sqs.SqsQueue | sqs.DataAwsSqsQueue;
  snsDlq?: sqs.SqsQueue;
  tags?: { [key: string]: string };
  dependsOn?: TerraformResource[];
}

/**
 * Creates an SNS to SQS subscription
 */
export class ApplicationSqsSnsTopicSubscription extends Resource {
  public readonly snsTopicSubscription: sns.SnsTopicSubscription;

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
  private createSqsSubscriptionDlq(): sqs.SqsQueue {
    return new sqs.SqsQueue(this, 'sns-topic-dql', {
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
    snsTopicDlq: sqs.SqsQueue
  ): sns.SnsTopicSubscription {
    return new sns.SnsTopicSubscription(this, 'sns-subscription', {
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
  private createPoliciesForSnsToSQS(snsTopicDlq: sqs.SqsQueue): void {
    [
      { name: 'sns-sqs', resource: this.config.sqsQueue },
      { name: 'sns-dlq', resource: snsTopicDlq },
    ].forEach((queue) => {
      const policy = new iam.DataAwsIamPolicyDocument(
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
                  identifiers: ['sns.amazonaws.com'],
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

      new sqs.SqsQueuePolicy(this, `${queue.name}-policy`, {
        queueUrl: queue.resource.url,
        policy: policy,
        provider: this.config.provider,
      });
    });
  }
}
