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
export enum ApplicationDynamoDBTableCapacityType {
  Read = 'ReadCapacity',
  Write = 'WriteCapacity',
}

export interface ApplicationDynamoDBTableAutoScaleProps {
  tracking: number;
  max: number;
  min: number;
}

//Override the default dynamo config but remove the items that we set ourselves.
export type ApplicationDynamoDBTableConfig = Omit<
  DynamodbTableConfig,
  'name' | 'tags' | 'lifecycle'
>;

export interface ApplicationDynamoDBProps {
  tags?: { [key: string]: string };
  prefix: string;
  tableConfig: ApplicationDynamoDBTableConfig;
  readCapacity?: ApplicationDynamoDBTableAutoScaleProps;
  writeCapacity?: ApplicationDynamoDBTableAutoScaleProps;
}

/**
 * Generates a dynamodb
 */
export class ApplicationDynamoDBTable extends Resource {
  public readonly dynamodb: DynamodbTable;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationDynamoDBProps
  ) {
    super(scope, name);

    this.dynamodb = new DynamodbTable(scope, `dynamodb_table`, {
      ...config.tableConfig,
      tags: config.tags,
      name: config.prefix,
      lifecycle: {
        ignoreChanges: ['read_capacity', 'write_capacity'],
      },
    });

    if (config.readCapacity) {
      ApplicationDynamoDBTable.setupAutoscaling(
        this,
        config.prefix,
        config.readCapacity,
        this.dynamodb,
        ApplicationDynamoDBTableCapacityType.Read
      );
    }

    if (config.writeCapacity) {
      ApplicationDynamoDBTable.setupAutoscaling(
        this,
        config.prefix,
        config.writeCapacity,
        this.dynamodb,
        ApplicationDynamoDBTableCapacityType.Write
      );
    }
  }

  /**
   * Sets up autoscaling for dynamodb on a write or read target
   * @param scope
   * @param prefix
   * @param config
   * @param dynamoDB
   * @param capacityType
   * @private
   */
  private static setupAutoscaling(
    scope: Construct,
    prefix,
    config: ApplicationDynamoDBTableAutoScaleProps,
    dynamoDB: DynamodbTable,
    capacityType: ApplicationDynamoDBTableCapacityType
  ): void {
    const targetTracking = new AppautoscalingTarget(
      scope,
      `${capacityType}_target`,
      {
        maxCapacity: config.max,
        minCapacity: config.min,
        resourceId: `table/${dynamoDB.name}`,
        scalableDimension: `dynamodb:table:${capacityType}Units`,
        roleArn: ApplicationDynamoDBTable.createAutoScalingRole(
          scope,
          capacityType,
          prefix,
          dynamoDB.arn
        ),
        serviceNamespace: 'dynamodb',
      }
    );

    new AppautoscalingPolicy(scope, `${capacityType}_policy`, {
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
   * @param capacityType
   * @param prefix
   * @param dynamoDBARN
   * @private
   */
  private static createAutoScalingRole(
    scope: Construct,
    capacityType: ApplicationDynamoDBTableCapacityType,
    prefix: string,
    dynamoDBARN: string
  ): string {
    const policy = new IamPolicy(scope, `${capacityType}_autoscaling_policy`, {
      name: `${prefix}-${capacityType}-AutoScalingPolicy`,
      policy: new DataAwsIamPolicyDocument(
        scope,
        `${capacityType}_policy_document`,
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
    });

    const role = new IamRole(scope, `${capacityType}_role`, {
      name: `${prefix}-${capacityType}-AutoScalingRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        scope,
        `${capacityType}_assume_role_policy_document`,
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

    new IamRolePolicyAttachment(scope, `${capacityType}_role_attachment`, {
      policyArn: policy.arn,
      role: role.name,
    });

    return role.arn;
  }
}
