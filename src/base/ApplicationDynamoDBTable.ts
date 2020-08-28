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

    this.dynamodb = new DynamodbTable(this, `dynamodb_table`, {
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
        ApplicationDynamoDBTableCapacityType.Read,
        config.tags
      );
    }

    if (config.writeCapacity) {
      ApplicationDynamoDBTable.setupAutoscaling(
        this,
        config.prefix,
        config.writeCapacity,
        this.dynamodb,
        ApplicationDynamoDBTableCapacityType.Write,
        config.tags
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
   * @param tags
   * @private
   */
  private static setupAutoscaling(
    scope: Construct,
    prefix,
    config: ApplicationDynamoDBTableAutoScaleProps,
    dynamoDB: DynamodbTable,
    capacityType: ApplicationDynamoDBTableCapacityType,
    tags?: { [key: string]: string }
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
          dynamoDB.arn,
          tags
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
   * @param tags
   * @private
   */
  private static createAutoScalingRole(
    scope: Construct,
    capacityType: ApplicationDynamoDBTableCapacityType,
    prefix: string,
    dynamoDBARN: string,
    tags?: { [key: string]: string }
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

    // In a perfect world we would be using a IamServiceLinkedRole, but Amazon is very amazon.
    // Amazon doesn't allow a custom suffix for dynamodb application autoscaling, so we need to use an IAM Role.
    // The unfortunate piece is that Amazon will overwrite the role we set below with an account wide DynamoDB autoscale role.
    // Hopefully one day we can fix this and limit the application autoscale role. But today is not that day

    // const role = new IamServiceLinkedRole(scope, `${capacityType}_role`, {
    //   awsServiceName: 'dynamodb.application-autoscaling.amazonaws.com',
    //   customSuffix: `${prefix}-${capacityType}`,
    //   description: `Autoscaling Service Role for ${prefix}-${capacityType}`,
    // });

    const role = new IamRole(scope, `${capacityType}_role`, {
      name: `${prefix}-${capacityType}-AutoScalingRole`,
      tags: tags,
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
            },
          ],
        }
      ).json,
    });

    new IamRolePolicyAttachment(scope, `${capacityType}_role_attachment`, {
      policyArn: policy.arn,
      role: role.name,
      dependsOn: [role, policy],
    });

    return role.arn;
  }
}
