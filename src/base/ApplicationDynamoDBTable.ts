import { Resource } from 'cdktf';
import { AppAutoScaling, IAM, DynamoDB } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

/**
 * Enum to determine the capacity type for autoscaling
 */
export enum ApplicationDynamoDBTableCapacityType {
  Read = 'ReadCapacity',
  Write = 'WriteCapacity',
}

export enum ApplicationDynamoDBTableCapacityMode {
  PROVISIONED = 'PROVISIONED',
  ON_DEMAND = 'PAY_PER_REQUEST', // Confusingly, on-demand is called "PAY_PER_REQUEST" in TF and CloudFormation.
}

export interface ApplicationDynamoDBTableAutoScaleProps {
  tracking: number;
  max: number;
  min: number;
}

//Override the default dynamo config but remove the items that we set ourselves.
export type ApplicationDynamoDBTableConfig = Omit<
  DynamoDB.DynamodbTableConfig,
  'name' | 'tags' | 'lifecycle'
>;

export interface ApplicationDynamoDBProps {
  tags?: { [key: string]: string };
  prefix: string;
  tableConfig: ApplicationDynamoDBTableConfig;
  readCapacity?: ApplicationDynamoDBTableAutoScaleProps;
  writeCapacity?: ApplicationDynamoDBTableAutoScaleProps;
  // If capacityMode is ON_DEMAND, the DynamoDB table will have on-demand capacity. By default this is PROVISIONED.
  // On-demand capacity mode is capable of serving thousands of requests per second without capacity planning.
  // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html
  // The readCapacity and writeCapacity properties should not be used if capacityMode is set to ON_DEMAND.
  capacityMode?: ApplicationDynamoDBTableCapacityMode;
  // If true, the DynamoDB table will be protected from being destroyed. Enabled by default.
  preventDestroyTable?: boolean;
}

/**
 * Generates a dynamodb
 */
export class ApplicationDynamoDBTable extends Resource {
  public readonly dynamodb: DynamoDB.DynamodbTable;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationDynamoDBProps
  ) {
    super(scope, name);

    const billingMode: string = (
      config.capacityMode ?? ApplicationDynamoDBTableCapacityMode.PROVISIONED
    ).valueOf();

    this.dynamodb = new DynamoDB.DynamodbTable(this, `dynamodb_table`, {
      ...config.tableConfig,
      billingMode: billingMode,
      tags: config.tags,
      name: config.prefix,
      lifecycle: {
        ignoreChanges: ['read_capacity', 'write_capacity'],
        // Protect the table from being removed, unless preventDestroyTable is explicitly set to false.
        preventDestroy: config.preventDestroyTable !== false,
      },
    });

    if (config.readCapacity) {
      ApplicationDynamoDBTable.setupAutoscaling(
        this,
        config.prefix,
        config.readCapacity,
        this.dynamodb,
        ApplicationDynamoDBTableCapacityType.Read,
        config.tableConfig.globalSecondaryIndex,
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
        config.tableConfig.globalSecondaryIndex,
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
   * @param globalSecondaryIndexes
   * @param tags
   * @private
   */
  private static setupAutoscaling(
    scope: Construct,
    prefix,
    config: ApplicationDynamoDBTableAutoScaleProps,
    dynamoDB: DynamoDB.DynamodbTable,
    capacityType: ApplicationDynamoDBTableCapacityType,
    globalSecondaryIndexes: DynamoDB.DynamodbTableGlobalSecondaryIndex[],
    tags?: { [key: string]: string }
  ): void {
    const roleArn = ApplicationDynamoDBTable.createAutoScalingRole(
      scope,
      capacityType,
      prefix,
      dynamoDB.arn,
      tags
    );

    // create an auto scaling policy for the table
    ApplicationDynamoDBTable.createAutoScalingPolicy(
      scope,
      roleArn,
      'table',
      capacityType,
      config.min,
      config.max,
      config.tracking,
      dynamoDB
    );

    // create an auto scaling policy for each global secondary index
    if (globalSecondaryIndexes.length) {
      globalSecondaryIndexes.forEach((gsIndex) => {
        // min capacity is defined by the global secondary index
        // max capacity is inherited from the table auto scaling config
        // TODO: if we want this to be configurabe per index, we'll need to extend the third-party interface
        const minCapacity =
          capacityType === ApplicationDynamoDBTableCapacityType.Read
            ? gsIndex.readCapacity
            : gsIndex.writeCapacity;

        // create an auto scaling policy for each index
        ApplicationDynamoDBTable.createAutoScalingPolicy(
          scope,
          roleArn,
          'index',
          capacityType,
          minCapacity,
          config.max,
          config.tracking,
          dynamoDB,
          gsIndex.name
        );
      });
    }
  }

  /**
   * sets up autoscaling policy for a table or an index
   * @param scope
   * @param roleArn
   * @param policyTarget
   * @param capacityType
   * @param minCapacity
   * @param maxCapacity
   * @param tracking
   * @param dynamoDB
   * @param indexName
   * @private
   */
  private static createAutoScalingPolicy(
    scope: Construct,
    roleArn: string,
    policyTarget: 'table' | 'index',
    capacityType: ApplicationDynamoDBTableCapacityType,
    minCapacity: number,
    maxCapacity: number,
    tracking: number,
    dynamoDB: DynamoDB.DynamodbTable,
    indexName?: string
  ): void {
    let resourceId = `table/${dynamoDB.name}`;

    // if we're targeting an index, the resource id must reflect that
    if (policyTarget === 'index') {
      if (indexName) {
        resourceId += `/index/${indexName}`;
      } else {
        throw new Error(
          'you must specify an indexName when creating an index auto scaling policy'
        );
      }
    }

    const constructPrefix = `${
      indexName ? indexName : dynamoDB.name
    }_${capacityType}_${policyTarget}`;

    const targetTracking = new AppAutoScaling.AppautoscalingTarget(
      scope,
      `${constructPrefix}_target`,
      {
        maxCapacity,
        minCapacity,
        resourceId,
        scalableDimension: `dynamodb:${policyTarget}:${capacityType}Units`,
        roleArn: roleArn,
        serviceNamespace: 'dynamodb',
        dependsOn: [dynamoDB],
      }
    );

    new AppAutoScaling.AppautoscalingPolicy(
      scope,
      `${constructPrefix}_policy`,
      {
        name: `DynamoDB${capacityType}Utilization:${targetTracking.resourceId}`,
        policyType: 'TargetTrackingScaling',
        resourceId: targetTracking.resourceId,
        scalableDimension: targetTracking.scalableDimension,
        serviceNamespace: targetTracking.serviceNamespace,
        targetTrackingScalingPolicyConfiguration: {
          predefinedMetricSpecification: {
            predefinedMetricType: `DynamoDB${capacityType}Utilization`,
          },
          targetValue: tracking,
        },
        dependsOn: [targetTracking, dynamoDB],
      }
    );
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
    const policy = new IAM.IamPolicy(
      scope,
      `${capacityType}_autoscaling_policy`,
      {
        name: `${prefix}-${capacityType}-AutoScalingPolicy`,
        policy: new IAM.DataAwsIamPolicyDocument(
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
                resources: [dynamoDBARN, `${dynamoDBARN}*`], // 🏚
              },
            ],
          }
        ).json,
      }
    );

    // In a perfect world we would be using a IamServiceLinkedRole, but Amazon is very amazon.
    // Amazon doesn't allow a custom suffix for dynamodb application autoscaling, so we need to use an IAM Role.
    // The unfortunate piece is that Amazon will overwrite the role we set below with an account wide DynamoDB autoscale role.
    // Hopefully one day we can fix this and limit the application autoscale role. But today is not that day

    // const role = new IamServiceLinkedRole(scope, `${capacityType}_role`, {
    //   awsServiceName: 'dynamodb.application-autoscaling.amazonaws.com',
    //   customSuffix: `${prefix}-${capacityType}`,
    //   description: `Autoscaling Service Role for ${prefix}-${capacityType}`,
    // });

    const role = new IAM.IamRole(scope, `${capacityType}_role`, {
      name: `${prefix}-${capacityType}-AutoScalingRole`,
      tags: tags,
      assumeRolePolicy: new IAM.DataAwsIamPolicyDocument(
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

    new IAM.IamRolePolicyAttachment(scope, `${capacityType}_role_attachment`, {
      policyArn: policy.arn,
      role: role.name,
      dependsOn: [role, policy],
    });

    return role.arn;
  }
}
