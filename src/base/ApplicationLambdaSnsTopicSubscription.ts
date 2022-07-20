import { Resource, TerraformResource } from 'cdktf';
import { Construct } from 'constructs';
import { sqs, sns, iam, lambdafunction } from '@cdktf/provider-aws';
import { SnsTopicSubscriptionConfig } from '@cdktf/provider-aws/lib/sns';

/** The config props type of [[`ApplicationLambdaSnsTopicSubscription]] */
export interface ApplicationLambdaSnsTopicSubscriptionProps {
  /** The prefix used to help identify related resources */
  name: string;
  /** The SNS topic to subscribe the Lambda to */
  snsTopicArn: string;
  /** The Lambda that should be invoked by incoming messages to the SNS topic */
  lambda: lambdafunction.DataAwsLambdaFunction | lambdafunction.LambdaFunction;
  /** Tags to apply to the resource(s), where applicable (in this case only the DLQ for the SNS) */
  tags?: { [key: string]: string };
  /** Optional list of resource dependencies */
  dependsOn?: TerraformResource[];
}

/**
 * Creates an SNS to Lambda subscription with a DLQ for any messages
 * that failed to send to the Lambda (e.g. due to permissions error).
 * Automatically adds policies/permissions for the SNS topic to send
 * messages to the DLQ and invoke the Lambda function.
 *
 * Artifacts:
 *  * {@link https://www.terraform.io/docs/providers/aws/r/sns_topic_subscription aws_sns_topic_subscription} Resource to subscribe Lambda to SNS topic
 *  * {@link https://www.terraform.io/docs/providers/aws/r/sqs_queue aws_sqs_queue} Resource (DLQ for the SNS topic)
 *  * {@link https://www.terraform.io/docs/providers/aws/r/sqs_queue_policy aws_sqs_queue_policy} Resource policy for SNS to send messages to DLQ
 *  * {@link https://www.terraform.io/docs/providers/aws/r/lambda_permission aws_lambda_permission} Resource permission for SNS to invoke Lambda
 */
export class ApplicationLambdaSnsTopicSubscription extends Resource {
  public readonly snsTopicSubscription: sns.SnsTopicSubscription;

  constructor(
    scope: Construct,
    private name: string,
    private config: ApplicationLambdaSnsTopicSubscriptionProps
  ) {
    super(scope, name);

    const snsTopicDlq = this.createSqsSubscriptionDlq();
    this.snsTopicSubscription = this.createSnsTopicSubscription(snsTopicDlq);
    this.createDlqPolicy(snsTopicDlq);
    this.createLambdaPolicy();
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
        this.config.lambda.arn,
        ...(this.config.dependsOn ? this.config.dependsOn : []),
      ],
    } as SnsTopicSubscriptionConfig);
  }

  /**
   * Grant permissions for SNS topic to invoke lambda
   * Cannot be applied to an alias; must use the base lambda function
   */
  private createLambdaPolicy(): void {
    new lambdafunction.LambdaPermission(
      this,
      `${this.name}-lambda-permission`,
      {
        principal: 'sns.amazonaws.com',
        action: 'lambda:InvokeFunction',
        functionName: this.config.lambda.functionName,
        sourceArn: this.config.snsTopicArn,
      }
    );
  }

  /**
   * Create IAM policies to allow SNS write to the dead-letter queue
   * @param snsTopicDlq the SQS resource (used as DLQ) to grant permissions on
   * @private
   */
  private createDlqPolicy(snsTopicDlq: sqs.SqsQueue): void {
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
