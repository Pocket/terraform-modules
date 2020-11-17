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
  constructor(
    scope: Construct,
    name: string,
    config: ApplicationAutoscalingProps
  ) {
    super(scope, name);

    const autoscalingIamRole = new IamRole(this, `autoscaling_role`, {
      name: `${config.prefix}-AutoScalingRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        this,
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

    new IamRolePolicy(this, `autoscaling_role_policy`, {
      name: `${config.prefix}-AutoScalingPolicy`,
      role: autoscalingIamRole.id,
      policy: new DataAwsIamPolicyDocument(this, `role_policy`, {
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

    const applicationAutoscaling = new AppautoscalingTarget(
      this,
      `autoscaling_target`,
      {
        maxCapacity: config.targetMaxCapacity,
        minCapacity: config.targetMinCapacity,
        resourceId: `service/${config.ecsClusterName}/${config.ecsServiceName}`,
        roleArn: autoscalingIamRole.arn,
        scalableDimension: 'ecs:service:DesiredCount',
        serviceNamespace: 'ecs',
      }
    );

    const applicationScaleOut = new AppautoscalingPolicy(
      this,
      `scale_out_policy`,
      {
        name: `${config.prefix}-ScaleOutPolicy`,
        policyType: 'StepScaling',
        resourceId: applicationAutoscaling.resourceId,
        scalableDimension: applicationAutoscaling.scalableDimension,
        serviceNamespace: applicationAutoscaling.serviceNamespace,

        stepScalingPolicyConfiguration: [
          {
            adjustmentType: 'ChangeInCapacity',
            cooldown: 60,
            metricAggregationType: 'Average',

            stepAdjustment: [
              {
                metricIntervalLowerBound: '0',
                scalingAdjustment: config.stepScaleOutAdjustment,
              },
            ],
          },
        ],
        dependsOn: [applicationAutoscaling],
      }
    );

    const applicationScaleIn = new AppautoscalingPolicy(
      this,
      `scale_in_policy`,
      {
        name: `${config.prefix}-ScaleInPolicy`,
        policyType: 'StepScaling',
        resourceId: applicationAutoscaling.resourceId,
        scalableDimension: applicationAutoscaling.scalableDimension,
        serviceNamespace: applicationAutoscaling.serviceNamespace,

        stepScalingPolicyConfiguration: [
          {
            adjustmentType: 'ChangeInCapacity',
            cooldown: 60,
            metricAggregationType: 'Average',

            stepAdjustment: [
              {
                metricIntervalUpperBound: '0',
                scalingAdjustment: config.stepScaleInAdjustment,
              },
            ],
          },
        ],
        dependsOn: [applicationAutoscaling],
      }
    );

    const scaleOutAlarm = new CloudwatchMetricAlarm(this, `scale_out_alarm`, {
      alarmName: `${config.prefix} Service High CPU`,
      alarmDescription: 'Alarm to add capacity if CPU is high',
      comparisonOperator: 'GreaterThanThreshold',
      evaluationPeriods: 2,
      threshold: config.scaleOutThreshold,
      statistic: 'Average',
      period: 60,
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      treatMissingData: 'notBreaching',
      dimensions: {},
      alarmActions: [applicationScaleOut.arn],
      tags: config.tags,
    });

    // This override is related to CDK bug: https://github.com/hashicorp/terraform-cdk/issues/235
    // CDK does not respect the case of keys and causing
    // wrong synthesizing. For dimensions it will be:
    // { cluster_name: 'testapp-', service_name: 'testapp-' }
    // instead of:
    // { ClusterName: 'testapp-', ServiceName: 'testapp-' }

    scaleOutAlarm.addOverride('dimensions', {
      ClusterName: config.ecsClusterName,
      ServiceName: config.ecsServiceName,
    });

    const scaleInAlarm = new CloudwatchMetricAlarm(this, `scale_in_alarm`, {
      alarmName: `${config.prefix} Service Low CPU`,
      alarmDescription: 'Alarm to reduce capacity if container CPU is low',
      comparisonOperator: 'LessThanThreshold',
      evaluationPeriods: 2,
      threshold: config.scaleInThreshold,
      statistic: 'Average',
      period: 60,
      namespace: 'AWS/ECS',
      metricName: 'CPUUtilization',
      treatMissingData: 'notBreaching',
      dimensions: {},
      alarmActions: [applicationScaleIn.arn],
      tags: config.tags,
    });

    // This override is related to CDK bug: https://github.com/hashicorp/terraform-cdk/issues/235
    scaleInAlarm.addOverride('dimensions', {
      ClusterName: config.ecsClusterName,
      ServiceName: config.ecsServiceName,
    });
  }
}
