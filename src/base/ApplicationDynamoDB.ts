import { Resource } from 'cdktf';
import {
  AppautoscalingPolicy,
  AppautoscalingTarget,
  DataAwsIamPolicyDocument,
  DynamodbTable,
  DynamodbTableConfig,
  IamPolicy,
  IamRole,
  IamRolePolicyAttachment,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

/**
 * Enum to determine the capacity type for autoscaling
 */
export enum ApplicationDynamoDBCapacityType {
  Read = 'ReadCapacity',
  Write = 'WriteCapacity',
}

export interface ApplicationDynamoDBAutoScaleProps {
  tracking: number;
  max: number;
  min: number;
}

//Override the default dynamo config but remove the items that we set ourselves.
export interface ApplicationDynamoDBConfig extends DynamodbTableConfig {
  name: never;
  tags: never;
  lifecycle: never;
}

export interface ApplicationDynamoDBProps {
  tags?: { [key: string]: string };
  prefix: string;
  tableConfig: ApplicationDynamoDBConfig;
  readCapacity?: ApplicationDynamoDBAutoScaleProps;
  writeCapacity?: ApplicationDynamoDBAutoScaleProps;
}

/**
 * Generates a dynamodb
 */
export class ApplicationDynamoDB extends Resource {
  public readonly dynamodb: DynamodbTable;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationDynamoDBProps
  ) {
    super(scope, name);

    this.dynamodb = new DynamodbTable(scope, `${name}_dynamodb_table`, {
      ...config.tableConfig,
      tags: config.tags,
      name: config.prefix,
      lifecycle: {
        ignoreChanges: ['read_capacity', 'write_capacity'],
      },
    });

    if (config.readCapacity) {
      ApplicationDynamoDB.setupAutoscaling(
        scope,
        name,
        config.prefix,
        config.readCapacity,
        this.dynamodb,
        ApplicationDynamoDBCapacityType.Read
      );
    }

    if (config.writeCapacity) {
      ApplicationDynamoDB.setupAutoscaling(
        scope,
        name,
        config.prefix,
        config.writeCapacity,
        this.dynamodb,
        ApplicationDynamoDBCapacityType.Write
      );
    }
  }

  /**
   * Sets up autoscaling for dynamodb on a write or read target
   * @param scope
   * @param name
   * @param prefix
   * @param config
   * @param dynamoDB
   * @param capacityType
   * @private
   */
  private static setupAutoscaling(
    scope,
    name,
    prefix,
    config: ApplicationDynamoDBAutoScaleProps,
    dynamoDB: DynamodbTable,
    capacityType: ApplicationDynamoDBCapacityType
  ) {
    const targetTracking = new AppautoscalingTarget(
      scope,
      `${name}_${capacityType}_target`,
      {
        maxCapacity: config.max,
        minCapacity: config.min,
        resourceId: `table/${dynamoDB.name}`,
        scalableDimension: `dynamodb:table:${capacityType}Units`,
        roleArn: this.createAutoScalingRole(
          scope,
          name,
          capacityType,
          prefix,
          dynamoDB.arn
        ),
        serviceNamespace: 'dynamodb',
      }
    );

    new AppautoscalingPolicy(scope, `${name}_${capacityType}_policy`, {
      name: `DynamoDB${capacityType}Utilization:${targetTracking.resourceId}`,
      policyType: 'TargetTrackingScaling',
      resourceId: targetTracking.resourceId,
      scalableDimension: targetTracking.scalableDimension,
      serviceNamespace: targetTracking.serviceNamespace,
      targetTrackingScalingPolicyConfiguration: [
        {
          predefinedMetricSpecification: [
            {
              predefinedMetricType: `DynamoDB${capacityType}Utilization`,
            },
          ],
          targetValue: config.tracking,
        },
      ],
    });
  }

  /**
   * Creates the autoscaling role necessary for DynamoDB
   * @param scope
   * @param name
   * @param capacityType
   * @param prefix
   * @param dynamoDBARN
   * @private
   */
  private static createAutoScalingRole(
    scope: Construct,
    name: string,
    capacityType: ApplicationDynamoDBCapacityType,
    prefix: string,
    dynamoDBARN: string
  ): string {
    const policy = new IamPolicy(
      scope,
      `${name}_${capacityType}_autoscaling_policy`,
      {
        name: `${prefix}-${capacityType}-AutoScalingPolicy`,
        policy: new DataAwsIamPolicyDocument(
          scope,
          `${name}_${capacityType}_policy_document`,
          {
            statement: [
              {
                effect: 'Allow',
                actions: [
                  'application-autoscaling:*',
                  'cloudwatch:DescribeAlarms',
                  'cloudwatch:PutMetricAlarm',
                ],
                resources: ['*'],
              },
              {
                effect: 'Allow',
                actions: ['dynamodb:DescribeTable', 'dynamodb:UpdateTable'],
                resources: [dynamoDBARN, `${dynamoDBARN}*`],
              },
            ],
          }
        ).json,
      }
    );

    const role = new IamRole(scope, `${name}_${capacityType}_role`, {
      name: `${prefix}-${capacityType}-AutoScalingRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        scope,
        `${name}_${capacityType}_assume_role_policy_document`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  type: 'Service',
                  identifiers: ['application-autoscaling.amazonaws.com'],
                },
              ],
              resources: ['*'],
            },
          ],
        }
      ).json,
    });

    new IamRolePolicyAttachment(
      scope,
      `${name}_${capacityType}_role_attachment`,
      {
        policyArn: policy.arn,
        role: role.name,
      }
    );

    return role.arn;
  }
}
