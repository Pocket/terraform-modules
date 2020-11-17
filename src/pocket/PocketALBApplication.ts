import { Resource } from 'cdktf';
import {
  AlbListener,
  CloudfrontDistribution,
  CloudwatchDashboard,
  CloudwatchMetricAlarm,
  CloudwatchMetricAlarmConfig,
  Route53Record,
} from '../../.gen/providers/aws';
import { Construct } from 'constructs';
import {
  ApplicationAutoscaling,
  ApplicationBaseDNS,
  ApplicationCertificate,
  ApplicationECSCluster,
  ApplicationECSContainerDefinitionProps,
  ApplicationECSIAMProps,
  ApplicationECSService,
  ApplicationECSServiceProps,
  ApplicationLoadBalancer,
} from '..';
import { PocketVPC } from './PocketVPC';

export interface PocketALBApplicationProps {
  prefix: string;
  alb6CharacterPrefix: string;
  internal?: boolean;
  domain: string;
  cdn?: boolean;
  codeDeploy: {
    useCodeDeploy: boolean;
    snsNotificationTopicArn?: string;
  };
  tags?: { [key: string]: string };
  containerConfigs: ApplicationECSContainerDefinitionProps[];
  exposedContainer: {
    port: number;
    name: string;
    healthCheckPath: string;
  };
  taskSize?: {
    cpu: number;
    memory: number;
  };
  ecsIamConfig: ApplicationECSIAMProps;
  autoscalingConfig?: {
    targetMinCapacity?: number;
    targetMaxCapacity?: number;
    stepScaleInAdjustment?: number;
    stepScaleOutAdjustment?: number;
    scaleInThreshold?: number;
    scaleOutThreshold?: number;
  };
  dashboard?: {
    requestCountThreshold: number;
  };
  alarms?: {
    http5xxError?: {
      threshold?: number;
      actions?: string[];
    };
    httpLatency?: {
      threshold?: number;
      actions?: string[];
    };
    customAlarms?: CloudwatchMetricAlarmConfig[];
  };
}

interface CreateALBReturn {
  alb: ApplicationLoadBalancer;
  albRecord: Route53Record;
  albCertificate: ApplicationCertificate;
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

export class PocketALBApplication extends Resource {
  public readonly alb: ApplicationLoadBalancer;
  public readonly baseDNS: ApplicationBaseDNS;
  private readonly config: PocketALBApplicationProps;
  private readonly pocketVPC: PocketVPC;

  constructor(
    scope: Construct,
    name: string,
    config: PocketALBApplicationProps
  ) {
    super(scope, name);

    this.config = PocketALBApplication.validateConfig(config);

    // use default auto-scaling config, but update any user-provided values
    this.config.autoscalingConfig = {
      ...DEFAULT_AUTOSCALING_CONFIG,
      ...config.autoscalingConfig,
    };

    this.pocketVPC = new PocketVPC(this, `pocket_vpc`);

    //Setup the Base DNS stack for our application which includes a hosted SubZone
    this.baseDNS = new ApplicationBaseDNS(this, `base_dns`, {
      domain: config.domain,
      tags: config.tags,
    });

    const { alb, albRecord, albCertificate } = this.createALB();
    this.alb = alb;

    if (config.cdn) {
      this.createCDN(albRecord);
    }

    const ecsService = this.createECSService(alb, albCertificate);

    this.createCloudwatchDashboard(
      alb.alb.arnSuffix,
      ecsService.ecs.service.name,
      ecsService.ecs.service.cluster
    );

    this.createCloudwatchAlarms();
  }

  /**
   * Validate the Configuration
   *
   * @param config
   * @private
   */
  private static validateConfig(
    config: PocketALBApplicationProps
  ): PocketALBApplicationProps {
    if (config.cdn === undefined) {
      //Set a default of cached to false
      config.cdn = false;
    }

    if (config.internal === undefined) {
      //Set a default of internal to false
      config.internal = false;
    }

    if (config.internal && config.cdn) {
      throw Error('You can not have a cached ALB and have it be internal.');
    }

    return config;
  }

  /**
   * Creates the ALB stack and certificates
   * @private
   */
  private createALB(): CreateALBReturn {
    //Create our application Load Balancer
    const alb = new ApplicationLoadBalancer(this, `application_load_balancer`, {
      vpcId: this.pocketVPC.vpc.id,
      prefix: this.config.prefix,
      alb6CharacterPrefix: this.config.alb6CharacterPrefix,
      subnetIds: this.config.internal
        ? this.pocketVPC.privateSubnetIds
        : this.pocketVPC.publicSubnetIds,
      internal: this.config.internal,
      tags: this.config.tags,
    });

    //When the app uses a CDN we set the ALB to be direct.app-domain
    //Then the CDN is our main app.
    const albDomainName = this.config.cdn
      ? `direct.${this.config.domain}`
      : this.config.domain;

    //Sets up the record for the ALB.
    const albRecord = new Route53Record(this, `alb_record`, {
      name: albDomainName,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: alb.alb.dnsName,
          zoneId: alb.alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
      setIdentifier: '1',
    });

    //Creates the Certificate for the ALB
    const albCertificate = new ApplicationCertificate(this, `alb_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: albDomainName,
      tags: this.config.tags,
    });

    return {
      alb,
      albRecord,
      albCertificate,
    };
  }

  /**
   * Create the CDN if the ALB is backed by one.
   *
   * @param albRecord
   * @private
   */
  private createCDN(albRecord: Route53Record): void {
    //Create the certificate for the CDN
    const cdnCertificate = new ApplicationCertificate(this, `cdn_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: this.config.domain,
      tags: this.config.tags,
    });

    //Create the CDN
    const cdn = new CloudfrontDistribution(this, `cloudfront_distribution`, {
      comment: `CDN for direct.${this.config.domain}`,
      enabled: true,
      aliases: [this.config.domain],
      priceClass: 'PriceClass_200',
      tags: this.config.tags,
      origin: [
        {
          domainName: albRecord.fqdn,
          originId: 'Alb',
          customOriginConfig: [
            {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: 'https-only',
              originSslProtocols: ['TLSv1.1', 'TLSv1.2'],
            },
          ],
        },
      ],
      defaultCacheBehavior: [
        {
          targetOriginId: 'Alb',
          viewerProtocolPolicy: 'redirect-to-https',
          compress: true,
          allowedMethods: [
            'GET',
            'HEAD',
            'OPTIONS',
            'PUT',
            'POST',
            'PATCH',
            'DELETE',
          ],
          cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          forwardedValues: [
            {
              queryString: true,
              headers: ['Accept', 'Origin', 'Authorization'], //This is important for apollo because it serves different responses based on this
              cookies: [
                {
                  forward: 'none',
                },
              ],
            },
          ],
        },
      ],
      viewerCertificate: [
        {
          acmCertificateArn: cdnCertificate.arn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.1_2016',
        },
      ],
      restrictions: [
        {
          geoRestriction: [
            {
              restrictionType: 'none',
            },
          ],
        },
      ],
    });

    //When cached the CDN must point to the Load Balancer
    new Route53Record(this, `cdn_record`, {
      name: this.config.domain,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: cdn.domainName,
          zoneId: cdn.hostedZoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
      setIdentifier: '2',
    });
  }

  /**
   * Create the ECS service and attach it to the ALB
   * @param alb
   * @param albCertificate
   * @private
   */
  private createECSService(
    alb: ApplicationLoadBalancer,
    albCertificate: ApplicationCertificate
  ): { ecs: ApplicationECSService; cluster: ApplicationECSCluster } {
    const ecsCluster = new ApplicationECSCluster(this, 'ecs_cluster', {
      prefix: this.config.prefix,
      tags: this.config.tags,
    });

    new AlbListener(this, 'listener_http', {
      loadBalancerArn: alb.alb.arn,
      port: 80,
      protocol: 'HTTP',
      defaultAction: [
        {
          type: 'redirect',
          redirect: [
            { port: '443', protocol: 'HTTPS', statusCode: 'HTTP_301' },
          ],
        },
      ],
    });

    const httpsListener = new AlbListener(this, 'listener_https', {
      loadBalancerArn: alb.alb.arn,
      port: 443,
      protocol: 'HTTPS',
      sslPolicy: 'ELBSecurityPolicy-TLS-1-1-2017-01',
      defaultAction: [
        {
          type: 'fixed-response',
          fixedResponse: [
            {
              // To keep things dry we use a default status code here and append a rule for our target group.
              // This is because our ECSService is responsible for creating our target group because CodeDeploy requires
              // 2 target groups and knowing the names of them both
              contentType: 'text/plain',
              statusCode: '503',
              messageBody: '',
            },
          ],
        },
      ],
      certificateArn: albCertificate.arn,
    });

    let ecsConfig: ApplicationECSServiceProps = {
      prefix: this.config.prefix,
      shortName: this.config.alb6CharacterPrefix,
      ecsClusterArn: ecsCluster.cluster.arn,
      ecsClusterName: ecsCluster.cluster.name,
      useCodeDeploy: this.config.codeDeploy.useCodeDeploy,
      codeDeploySnsNotificationTopicArn: this.config.codeDeploy
        .snsNotificationTopicArn,
      albConfig: {
        containerPort: this.config.exposedContainer.port,
        containerName: this.config.exposedContainer.name,
        healthCheckPath: this.config.exposedContainer.healthCheckPath,
        listenerArn: httpsListener.arn,
        albSecurityGroupId: alb.securityGroup.id,
      },
      vpcId: this.pocketVPC.vpc.id,
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
      stepScaleInAdjustment: this.config.autoscalingConfig
        .stepScaleInAdjustment,
      stepScaleOutAdjustment: this.config.autoscalingConfig
        .stepScaleOutAdjustment,
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
   * @param albArnSuffix
   * @param ecsServiceName
   * @param ecsServiceClusterName
   */
  private createCloudwatchDashboard(
    albArnSuffix: string,
    ecsServiceName: string,
    ecsServiceClusterName: string
  ): CloudwatchDashboard {
    // don't love having this big ol' JSON object here, but it is the simplest way to achieve the result
    const dashboardJSON = {
      widgets: [
        {
          type: 'metric',
          x: 0,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/ApplicationELB',
                'HTTPCode_Target_4XX_Count',
                'LoadBalancer',
                albArnSuffix,
                {
                  yAxis: 'left',
                  color: '#ff7f0e',
                },
              ],
              [
                '.',
                'RequestCount',
                '.',
                '.',
                {
                  yAxis: 'right',
                  color: '#1f77b4',
                },
              ],
              [
                '.',
                'HTTPCode_Target_5XX_Count',
                '.',
                '.',
                {
                  color: '#d62728',
                },
              ],
              [
                '.',
                'HTTPCode_Target_2XX_Count',
                '.',
                '.',
                {
                  yAxis: 'right',
                  color: '#2ca02c',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: 'us-east-1',
            period: 60,
            stat: 'Sum',
            annotations: {
              horizontal: [
                {
                  color: '#17becf',
                  label: 'RequestCountThreshold',
                  value: this.config.dashboard?.requestCountThreshold ?? 5000,
                },
              ],
            },
            title: 'ALB Requests',
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/ApplicationELB',
                'TargetResponseTime',
                'LoadBalancer',
                albArnSuffix,
                {
                  label: 'Average',
                  color: '#aec7e8',
                },
              ],
              [
                '...',
                {
                  stat: 'p95',
                  label: 'p95',
                  color: '#ffbb78',
                },
              ],
              [
                '...',
                {
                  stat: 'p99',
                  label: 'p99',
                  color: '#98df8a',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: 'us-east-1',
            stat: 'Average',
            period: 60,
          },
        },
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
                  stat: 'Sum',
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
            region: 'us-east-1',
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

    return new CloudwatchDashboard(this, 'cloudwatch-dashboard', {
      dashboardName: `${this.config.prefix}-ALBDashboard`,
      dashboardBody: JSON.stringify(dashboardJSON),
    });
  }

  private createCloudwatchAlarms(): void {
    const defaultAlarms: CloudwatchMetricAlarmConfig[] = [
      {
        alarmName: `${this.config.prefix}-Alarm-HTTP5xxErrorRate`,
        metricQuery: [
          {
            id: 'requests',
            metric: [
              {
                metricName: 'RequestCount',
                namespace: 'AWS/ApplicationELB',
                period: 60,
                stat: 'Sum',
                unit: 'Count',
                dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
              },
            ],
          },
          {
            id: 'errors',
            metric: [
              {
                metricName: 'HTTPCode_ELB_5XX_Count',
                namespace: 'AWS/ApplicationELB',
                period: 60,
                stat: 'Sum',
                unit: 'Count',
                dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
              },
            ],
          },
          {
            id: 'expression',
            expression: 'errors/requests*100',
            label: 'HTTP 5xx Error Rate',
            returnData: true,
          },
        ],
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 5,
        threshold: this.config.alarms?.http5xxError?.threshold ?? 5,
        insufficientDataActions: [],
        alarmActions: this.config.alarms?.http5xxError?.actions ?? [],
        okActions: this.config.alarms?.http5xxError?.actions ?? [],
        tags: this.config.tags,
      },
      {
        alarmName: `${this.config.prefix}-Alarm-HTTPResponseTime`,
        namespace: 'AWS/ApplicationELB',
        metricName: 'TargetResponseTime',
        dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
        period: 300,
        evaluationPeriods: 1,
        statistic: 'Average',
        comparisonOperator: 'GreaterThanThreshold',
        threshold: this.config.alarms?.httpLatency?.threshold ?? 300,
        alarmDescription: 'Detecting slower-than-average HTTP response times',
        insufficientDataActions: [],
        alarmActions: this.config.alarms?.httpLatency?.actions ?? [],
        okActions: this.config.alarms?.httpLatency?.actions ?? [],
        tags: this.config.tags,
      },
    ];

    if (this.config.alarms?.customAlarms) {
      defaultAlarms.push(...this.config.alarms.customAlarms);
    }

    this.createAlarms(defaultAlarms);
  }

  private createAlarms(alarms: CloudwatchMetricAlarmConfig[]): void {
    alarms.forEach((alarmConfig) => {
      // Deep copy the alarm configurations to a new object to enable deletion of properties since they are
      // readonly on the original objects interface
      const alarmConfigCopy = JSON.parse(JSON.stringify(alarmConfig));

      // Delete the dimensions properties from the copied config
      // We have to delete the dimensions before overriding the them later
      // because simply overriding the value does not produce the
      // desired terraform JSON, see below
      // \\"dimensions\\": {
      //    \\"load_balancer\\": \\"test_alb\\"
      //    \\"LoadBalancer\\": \\"test_alb\\"
      // }
      delete alarmConfigCopy.dimensions;
      alarmConfigCopy.metricQuery?.forEach((query) => {
        query.metric?.forEach((metric) => delete metric.dimensions);
      });

      // Create the alarm using the copied config that excludes the dimensions properties
      const alarm = new CloudwatchMetricAlarm(
        this,
        alarmConfig.alarmName.toLowerCase(),
        {
          ...alarmConfigCopy,
          alarmName: `${this.config.prefix}-${alarmConfig.alarmName}`,
        }
      );

      // Use the escape hatch to add dimensions if any from the origin config
      if (alarmConfig.dimensions) {
        alarm.addOverride(`dimensions`, alarmConfig.dimensions);
      }
      alarmConfig.metricQuery?.forEach((query, metricQueryIndex) => {
        query.metric?.forEach((metric, metricIndex) => {
          if (metric.dimensions) {
            alarm.addOverride(
              `metric_query.${metricQueryIndex}.metric.${metricIndex}.dimensions`,
              metric.dimensions
            );
          }
        });
      });
    });
  }
}
