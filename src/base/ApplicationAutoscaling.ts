import { Resource } from 'cdktf';
import {
  AppautoscalingPolicy,
  AppautoscalingTarget,
  CloudwatchMetricAlarm,
  DataAwsIamPolicyDocument,
  IamRole,
  IamRolePolicy,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';

export interface ApplicationAutoscalingProps {
  prefix: string;
  targetMinCapacity: number;
  targetMaxCapacity: number;
  ecsClusterName: string;
  ecsServiceName: string;
  scalableDimension: string;
  stepScaleInAdjustment: number;
  stepScaleOutAdjustment: number;
  scaleInThreshold: number;
  scaleOutThreshold: number;
  tags?: { [key: string]: string };
}

/*
 * Generates an AutoScaling group
 */

export class ApplicationAutoscaling extends Resource {
  static generateIamRolePolicy(
    construct: Resource,
    config: ApplicationAutoscalingProps,
    iamRole: IamRole
  ): void {
    new IamRolePolicy(construct, `autoscaling_role_policy`, {
      name: `${config.prefix}-AutoScalingPolicy`,
      role: iamRole.id,
      policy: new DataAwsIamPolicyDocument(construct, `role_policy`, {
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

  static generateIamRole(
    construct: Resource,
    config: ApplicationAutoscalingProps
  ): IamRole {
    return new IamRole(construct, `autoscaling_role`, {
      name: `${config.prefix}-AutoScalingRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        construct,
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

  static generateAutoScalingTarget(
    construct: Resource,
    config: ApplicationAutoscalingProps,
    iamRole: IamRole
  ): AppautoscalingTarget {
    return new AppautoscalingTarget(construct, `autoscaling_target`, {
      maxCapacity: config.targetMaxCapacity,
      minCapacity: config.targetMinCapacity,
      resourceId: `service/${config.ecsClusterName}/${config.ecsServiceName}`,
      roleArn: iamRole.arn,
      scalableDimension: 'ecs:service:DesiredCount',
      serviceNamespace: 'ecs',
    });
  }

  static generateAutoSclaingPolicy(
    construct: Resource,
    config: ApplicationAutoscalingProps,
    target: AppautoscalingTarget,
    type: 'In' | 'Out'
  ): AppautoscalingPolicy {
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
      construct,
      `scale_${type.toLowerCase()}_policy`,
      {
        name: `${config.prefix}-Scale${type}Policy`,
        policyType: 'StepScaling',
        resourceId: target.resourceId,
        scalableDimension: target.scalableDimension,
        serviceNamespace: target.serviceNamespace,

        stepScalingPolicyConfiguration: [
          {
            adjustmentType: `ChangeInCapacity`,
            cooldown: 60,
            metricAggregationType: 'Average',
            stepAdjustment,
          },
        ],
        dependsOn: [target],
      }
    );
  }

  static generateCloudwatchMetricAlarm(
    construct: Resource,
    config: ApplicationAutoscalingProps,
    id: string,
    name: string,
    desc: string,
    operator: string,
    threshold: number,
    arn: string
  ): void {
    new CloudwatchMetricAlarm(construct, id, {
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

    const applicationScaleOut = ApplicationAutoscaling.generateAutoSclaingPolicy(
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
}
