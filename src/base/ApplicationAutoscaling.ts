import { Resource } from 'cdktf';
import { appautoscaling, cloudwatch, iam } from '@cdktf/provider-aws';
const { AppautoscalingPolicy, AppautoscalingTarget } = appautoscaling;
const { CloudwatchMetricAlarm } = cloudwatch;
const { IamRole, IamRolePolicy, DataAwsIamPolicyDocument } = iam;
import { Construct } from 'constructs';

export interface ApplicationAutoscalingProps {
  ecsClusterName: string;
  ecsServiceName: string;
  prefix: string;
  scalableDimension: string;
  scaleInThreshold: number;
  scaleOutThreshold: number;
  stepScaleInAdjustment: number;
  stepScaleOutAdjustment: number;
  tags?: { [key: string]: string };
  targetMaxCapacity: number;
  targetMinCapacity: number;
}

/*
 * Generates an AutoScaling group
 */

export class ApplicationAutoscaling extends Resource {
  constructor(
    scope: Construct,
    name: string,
    config: ApplicationAutoscalingProps
  ) {
    super(scope, name);

    // set up IAM role & policy
    const iamRole = ApplicationAutoscaling.generateIamRole(this, config);
    ApplicationAutoscaling.generateIamRolePolicy(this, config, iamRole);

    // set up autoscaling target & in/out policies
    const autoScalingTarget = ApplicationAutoscaling.generateAutoScalingTarget(
      this,
      config,
      iamRole
    );

    const applicationScaleOut =
      ApplicationAutoscaling.generateAutoSclaingPolicy(
        this,
        config,
        autoScalingTarget,
        'Out'
      );

    const applicationScaleIn = ApplicationAutoscaling.generateAutoSclaingPolicy(
      this,
      config,
      autoScalingTarget,
      'In'
    );

    // set up cloudwatch alarms
    ApplicationAutoscaling.generateCloudwatchMetricAlarm(
      this,
      config,
      'scale_out_alarm',
      `${config.prefix} Service High CPU`,
      'Alarm to add capacity if container CPU is high',
      'GreaterThanThreshold',
      config.scaleOutThreshold,
      applicationScaleOut.arn
    );

    ApplicationAutoscaling.generateCloudwatchMetricAlarm(
      this,
      config,
      'scale_in_alarm',
      `${config.prefix} Service Low CPU`,
      'Alarm to reduce capacity if container CPU is low',
      'LessThanThreshold',
      config.scaleInThreshold,
      applicationScaleIn.arn
    );
  }

  /**
   * Creates an IAM Role
   * @param resource
   * @param config
   * @returns IamRole
   */
  static generateIamRole(
    resource: Resource,
    config: ApplicationAutoscalingProps
  ): iam.IamRole {
    return new IamRole(resource, `autoscaling_role`, {
      name: `${config.prefix}-AutoScalingRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        resource,
        `autoscaling_assume`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  identifiers: ['ecs.application-autoscaling.amazonaws.com'],
                  type: 'Service',
                },
              ],
            },
          ],
        }
      ).json,
    });
  }

  /**
   * Creates an IAM Role Policy
   *
   * @param resource
   * @param config
   * @param iamRole
   */
  static generateIamRolePolicy(
    resource: Resource,
    config: ApplicationAutoscalingProps,
    iamRole: iam.IamRole
  ): void {
    new IamRolePolicy(resource, `autoscaling_role_policy`, {
      name: `${config.prefix}-AutoScalingPolicy`,
      role: iamRole.id,
      policy: new DataAwsIamPolicyDocument(resource, `role_policy`, {
        statement: [
          {
            effect: 'Allow',
            actions: [
              'cloudwatch:PutMetricAlarm',
              'cloudwatch:DescribeAlarms',
              'cloudwatch:DeleteAlarms',
            ],
            resources: [
              `arn:aws:cloudwatch:*:*:alarm:/${config.ecsServiceName}*`,
            ],
          },
          {
            effect: 'Allow',
            actions: ['ecs:DescribeServices', 'ecs:UpdateService'],
            resources: [`arn:aws:ecs:*:*:service/${config.ecsServiceName}*`],
          },
        ],
      }).json,
    });
  }

  /**
   * Creates an Auto Scaling Target
   * @param resource
   * @param config
   * @param iamRole
   * @returns AppautoscalingTarget
   */
  static generateAutoScalingTarget(
    resource: Resource,
    config: ApplicationAutoscalingProps,
    iamRole: iam.IamRole
  ): appautoscaling.AppautoscalingTarget {
    return new AppautoscalingTarget(resource, `autoscaling_target`, {
      maxCapacity: config.targetMaxCapacity,
      minCapacity: config.targetMinCapacity,
      resourceId: `service/${config.ecsClusterName}/${config.ecsServiceName}`,
      roleArn: iamRole.arn,
      scalableDimension: 'ecs:service:DesiredCount',
      serviceNamespace: 'ecs',
    });
  }

  /**
   * Creates an Autoscaling Policy
   * @param resource
   * @param config
   * @param target
   * @param type
   * @returns AppautoscalingPolicy
   */
  static generateAutoSclaingPolicy(
    resource: Resource,
    config: ApplicationAutoscalingProps,
    target: appautoscaling.AppautoscalingTarget,
    type: 'In' | 'Out'
  ): appautoscaling.AppautoscalingPolicy {
    let stepAdjustment;

    if (type === 'In') {
      stepAdjustment = [
        {
          metricIntervalUpperBound: '0',
          scalingAdjustment: config.stepScaleInAdjustment,
        },
      ];
    } else {
      stepAdjustment = [
        {
          metricIntervalLowerBound: '0',
          scalingAdjustment: config.stepScaleOutAdjustment,
        },
      ];
    }

    return new AppautoscalingPolicy(
      resource,
      `scale_${type.toLowerCase()}_policy`,
      {
        name: `${config.prefix}-Scale${type}Policy`,
        policyType: 'StepScaling',
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,

        stepScalingPolicyConfiguration: {
          adjustmentType: `ChangeInCapacity`,
          cooldown: 60,
          metricAggregationType: 'Average',
          stepAdjustment,
        },
        dependsOn: [target],
      }
    );
  }

  /**
   * Creates a Cloudwatch Metric Alarm
   * @param resource
   * @param config
   * @param id
   * @param name
   * @param desc
   * @param operator
   * @param threshold
   * @param arn
   */
  static generateCloudwatchMetricAlarm(
    resource: Resource,
    config: ApplicationAutoscalingProps,
    id: string,
    name: string,
    desc: string,
    operator: string,
    threshold: number,
    arn: string
  ): void {
    new CloudwatchMetricAlarm(resource, id, {
      alarmName: name,
      alarmDescription: desc,
      comparisonOperator: operator,
      evaluationPeriods: 2,
      threshold,
      statistic: 'Average',
      period: 60,
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      treatMissingData: 'notBreaching',
      dimensions: {
        ClusterName: config.ecsClusterName,
        ServiceName: config.ecsServiceName,
      },
      alarmActions: [arn],
      tags: config.tags,
    });
  }
}
