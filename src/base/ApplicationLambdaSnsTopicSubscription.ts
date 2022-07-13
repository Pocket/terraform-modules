import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { sqs, sns, iam, lambdafunction } from '@cdktf/provider-aws';
import { SnsTopicSubscriptionConfig } from '@cdktf/provider-aws/lib/sns';

export interface ApplicationLambdaSnsTopicSubscriptionProps {
  name: string;
  snsTopicArn: string;
  lambda: lambdafunction.DataAwsLambdaFunction;
  tags?: { [key: string]: string };
  dependsOn?: TerraformResource[];
}

/**
 * Creates an SNS to Lambda subscription
 */
export class ApplicationLambdaSnsTopicSubscription extends Resource {
  public readonly snsTopicSubscription: sns.SnsTopicSubscription;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationLambdaSnsTopicSubscriptionProps
  ) {
    super(scope, name);

    const snsTopicDlq = this.createSqsSubscriptionDlq();
    this.snsTopicSubscription = this.createSnsTopicSubscription(snsTopicDlq);
    this.createPoliciesForSnsToSqs(snsTopicDlq);
  }

  /**
   * Create a dead-letter queue for failed SNS messages
   * @private
   */
  private createSqsSubscriptionDlq(): sqs.SqsQueue {
    return new sqs.SqsQueue(this, 'sns-topic-dlq', {
      name: `${this.config.name}-SNS-Topic-DLQ`,
      tags: this.config.tags,
    });
  }

  /**
   * Create an SNS subscription for Lambda
   * @param snsTopicDlq the DLQ for messages that failed to be processed
   * @private
   */
  private createSnsTopicSubscription(
    snsTopicDlq: sqs.SqsQueue
  ): sns.SnsTopicSubscription {
    return new sns.SnsTopicSubscription(this, 'sns-subscription', {
      topicArn: this.config.snsTopicArn,
      protocol: 'lambda',
      endpoint: this.config.lambda.arn,
      redrivePolicy: JSON.stringify({
        deadLetterTargetArn: snsTopicDlq.arn,
      }),
      dependsOn: [
        snsTopicDlq,
        this.config.lambda,
        ...(this.config.dependsOn ? this.config.dependsOn : []),
      ],
    } as SnsTopicSubscriptionConfig);
  }

  /**
   * Create IAM policies to allow SNS write to the dead-letter queue
   * @param snsTopicDlq
   * @private
   */
  private createPoliciesForSnsToSqs(snsTopicDlq: sqs.SqsQueue): void {
    const queue = { name: 'sns-dlq', resource: snsTopicDlq };
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
      }
    ).json;

    new sqs.SqsQueuePolicy(this, `${queue.name}-policy`, {
      queueUrl: queue.resource.url,
      policy: policy,
    });
  }
}
