import { Resource } from 'cdktf';
import { cloudwatch } from '@cdktf/provider-aws';
import { Construct } from 'constructs';
import {
  ApplicationAutoscaling,
  ApplicationECSCluster,
  ApplicationECSContainerDefinitionProps,
  ApplicationECSIAMProps,
  ApplicationECSService,
  ApplicationECSServiceProps,
} from '../';
import { PocketVPC } from './PocketVPC';
import { CloudwatchMetricAlarmConfig } from '@cdktf/provider-aws/lib/cloudwatch';

export interface PocketECSApplicationAlarmProps {
  threshold?: number;
  period?: number;
  evaluationPeriods?: number;
  datapointsToAlarm?: number;
  actions?: string[];
  alarmDescription?: string;
}

export interface PocketECSApplicationProps {
  /**
   * This is the prefix for the names of all the resources
   * created by this construct.
   */
  prefix: string;

  shortName?: string;
  /**
   * Optional config to define the region for the service.
   * This is used to define the cloudwatch dashboards
   * as well as the region of the cloudwatch logs
   */
  region?: string;
  /**
   * VPC configuration for all resource that require it within
   * this construct. A default Pocket VPC will be used if not
   * provided.
   */
  vpcConfig?: {
    vpcId: string;
    privateSubnetIds: string[];
    publicSubnetIds: string[];
  };
  /**
   * Tags for all resources created by this construct.
   */
  tags?: { [key: string]: string };
  /**
   * Container definitions for the ECS task.
   */
  containerConfigs: ApplicationECSContainerDefinitionProps[];
  /**
   * ECS task size configuration.
   */
  taskSize?: {
    cpu: number;
    memory: number;
  };
  /**
   * IAM config for the ECS Service and Tasks.
   */
  ecsIamConfig: ApplicationECSIAMProps;
  /**
   * Options for configuring the autoscaling policy for
   * the ECS service created by this construct.
   */
  autoscalingConfig?: {
    targetMinCapacity?: number;
    targetMaxCapacity?: number;
    stepScaleInAdjustment?: number;
    stepScaleOutAdjustment?: number;
    scaleInThreshold?: number;
    scaleOutThreshold?: number;
  };
  /**
   * Option for defining Cloudwatch alarms
   */
  alarms?: {
    alarms?: cloudwatch.CloudwatchMetricAlarmConfig[];
  };
}

// can export if we need to use outside of this module
const DEFAULT_AUTOSCALING_CONFIG = {
  scaleOutThreshold: 45,
  scaleInThreshold: 30,
  targetMinCapacity: 1,
  targetMaxCapacity: 2,
  stepScaleInAdjustment: -1,
  stepScaleOutAdjustment: 2,
};

export class PocketECSApplication extends Resource {
  public readonly ecsService: ApplicationECSService;
  private readonly config: PocketECSApplicationProps;
  private readonly pocketVPC: PocketECSApplicationProps['vpcConfig'];

  constructor(
    scope: Construct,
    name: string,
    config: PocketECSApplicationProps
  ) {
    super(scope, name);

    this.config = PocketECSApplication.validateConfig(config);

    // use default auto-scaling config, but update any user-provided values
    this.config.autoscalingConfig = {
      ...DEFAULT_AUTOSCALING_CONFIG,
      ...config.autoscalingConfig,
    };

    this.pocketVPC = this.getVpcConfig(config);

    const ecsService = this.createECSService();
    this.ecsService = ecsService.ecs;

    this.createCloudwatchDashboard(
      ecsService.ecs.service.name,
      ecsService.cluster.cluster.name
    );

    this.createCloudwatchAlarms();
  }

  /**
   * Fall back to standard Pocket config if a custom VPC configuration has not been supplied.
   *
   * @param config
   * @private
   */
  private getVpcConfig(
    config: PocketECSApplicationProps
  ): PocketECSApplicationProps['vpcConfig'] {
    if (config.vpcConfig !== undefined) {
      return {
        vpcId: config.vpcConfig.vpcId,
        privateSubnetIds: config.vpcConfig.privateSubnetIds,
        publicSubnetIds: config.vpcConfig.publicSubnetIds,
      };
    } else {
      const pocketVpc = new PocketVPC(this, `pocket_vpc`);
      return {
        vpcId: pocketVpc.vpc.id,
        privateSubnetIds: pocketVpc.privateSubnetIds,
        publicSubnetIds: pocketVpc.publicSubnetIds,
      };
    }
  }

  /**
   * Validate the Configuration
   *
   * @param config
   * @private
   */
  private static validateConfig(
    config: PocketECSApplicationProps
  ): PocketECSApplicationProps {
    PocketECSApplication.validateAlarmsConfig(config.alarms);

    return config;
  }

  private static validateAlarmsConfig(
    config: PocketECSApplicationProps['alarms']
  ): void {
    if (!config) return;

    const alarmsToValidate = {
      http5xxErrorPercentage: 'HTTP 5xx Error',
      httpLatency: 'HTTP Latency',
      httpRequestCount: 'HTTP Request Count',
    };

    const errorMessage =
      'DatapointsToAlarm must be less than or equal to EvaluationPeriods';

    Object.keys(alarmsToValidate).forEach((key) => {
      if (
        config[key]?.datapointsToAlarm > (config[key]?.evaluationPeriods ?? 1)
      ) {
        throw new Error(`${alarmsToValidate[key]} Alarm: ${errorMessage}`);
      }
    });

    config.alarms?.forEach((alarm: cloudwatch.CloudwatchMetricAlarmConfig) => {
      if (alarm.datapointsToAlarm > alarm.evaluationPeriods) {
        throw new Error(`${alarm.alarmName}: ${errorMessage}`);
      }
    });
  }

  /**
   * Create the ECS service and attach it to the ALB
   * @private
   */
  private createECSService(): {
    ecs: ApplicationECSService;
    cluster: ApplicationECSCluster;
  } {
    const ecsCluster = new ApplicationECSCluster(this, 'ecs_cluster', {
      prefix: this.config.prefix,
      tags: this.config.tags,
    });

    let ecsConfig: ApplicationECSServiceProps = {
      useCodeDeploy: false,
      prefix: this.config.prefix,
      region: this.config.region,
      shortName: this.config.shortName,
      ecsClusterArn: ecsCluster.cluster.arn,
      ecsClusterName: ecsCluster.cluster.name,
      vpcId: this.pocketVPC.vpcId,
      containerConfigs: this.config.containerConfigs,
      privateSubnetIds: this.pocketVPC.privateSubnetIds,
      ecsIamConfig: this.config.ecsIamConfig,
      tags: this.config.tags,
    };

    if (this.config.taskSize) {
      ecsConfig = {
        ...this.config.taskSize,
        ...ecsConfig,
      };
    }

    const ecsService = new ApplicationECSService(
      this,
      'ecs_service',
      ecsConfig
    );

    new ApplicationAutoscaling(this, 'autoscaling', {
      prefix: this.config.prefix,
      targetMinCapacity: this.config.autoscalingConfig.targetMinCapacity,
      targetMaxCapacity: this.config.autoscalingConfig.targetMaxCapacity,
      ecsClusterName: ecsCluster.cluster.name,
      ecsServiceName: ecsService.service.name,
      scalableDimension: 'ecs:service:DesiredCount',
      stepScaleInAdjustment:
        this.config.autoscalingConfig.stepScaleInAdjustment,
      stepScaleOutAdjustment:
        this.config.autoscalingConfig.stepScaleOutAdjustment,
      scaleInThreshold: this.config.autoscalingConfig.scaleInThreshold,
      scaleOutThreshold: this.config.autoscalingConfig.scaleOutThreshold,
      tags: this.config.tags,
    });

    return {
      ecs: ecsService,
      cluster: ecsCluster,
    };
  }

  /**
   * Create a Cloudwatch dashboard JSON object
   *
   * @param ecsServiceName
   * @param ecsServiceClusterName
   */
  private createCloudwatchDashboard(
    ecsServiceName: string,
    ecsServiceClusterName: string
  ): cloudwatch.CloudwatchDashboard {
    // don't love having this big ol' JSON object here, but it is the simplest way to achieve the result
    const dashboardJSON = {
      widgets: [
        {
          type: 'metric',
          x: 0,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'ECS/ContainerInsights',
                'RunningTaskCount',
                'ServiceName',
                ecsServiceName,
                'ClusterName',
                ecsServiceClusterName,
                {
                  yAxis: 'right',
                  color: '#c49c94',
                },
              ],
              [
                'AWS/ECS',
                'CPUUtilization',
                '.',
                '.',
                '.',
                '.',
                {
                  color: '#f7b6d2',
                },
              ],
              [
                '.',
                'MemoryUtilization',
                '.',
                '.',
                '.',
                '.',
                {
                  color: '#c7c7c7',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: this.config.region ?? 'us-east-1',
            stat: 'Average',
            period: 60,
            annotations: {
              horizontal: [
                {
                  color: '#e377c2',
                  label: 'CPU scale out',
                  value: this.config.autoscalingConfig.scaleOutThreshold,
                },
                {
                  color: '#c5b0d5',
                  label: 'CPU scale in',
                  value: this.config.autoscalingConfig.scaleInThreshold,
                },
              ],
            },
            title: 'Service Load',
          },
        },
      ],
    };

    return new cloudwatch.CloudwatchDashboard(this, 'cloudwatch-dashboard', {
      dashboardName: `${this.config.prefix}-ALBDashboard`,
      dashboardBody: JSON.stringify(dashboardJSON),
    });
  }

  /**
   * @private
   */
  private createCloudwatchAlarms(): void {
    const alarmsConfig = this.config.alarms;

    const defaultAlarms: cloudwatch.CloudwatchMetricAlarmConfig[] = [];

    if (alarmsConfig?.alarms) {
      defaultAlarms.push(...alarmsConfig.alarms);
    }

    if (defaultAlarms.length) this.createAlarms(defaultAlarms);
  }

  /**
   * @param alarms
   * @private
   */
  private createAlarms(alarms: cloudwatch.CloudwatchMetricAlarmConfig[]): void {
    alarms.forEach((alarmConfig) => {
      new cloudwatch.CloudwatchMetricAlarm(
        this,
        alarmConfig.alarmName.toLowerCase(),
        {
          ...alarmConfig,
          alarmName: `${this.config.prefix}-${alarmConfig.alarmName}`,
        } as CloudwatchMetricAlarmConfig
      );
    });
  }
}
