import { Resource } from 'cdktf';
import {
  AlbListener,
  CloudfrontDistribution,
  CloudwatchDashboard,
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

  constructor(
    scope: Construct,
    name: string,
    config: PocketALBApplicationProps
  ) {
    super(scope, name);

    config = PocketALBApplication.validateConfig(config);

    // use default auto-scaling config, but update any user-provided values
    config.autoscalingConfig = {
      ...DEFAULT_AUTOSCALING_CONFIG,
      ...config.autoscalingConfig,
    };

    const pocketVPC = new PocketVPC(this, `pocket_vpc`);

    //Setup the Base DNS stack for our application which includes a hosted SubZone
    this.baseDNS = new ApplicationBaseDNS(this, `base_dns`, {
      domain: config.domain,
      tags: config.tags,
    });

    const { alb, albRecord, albCertificate } = this.createALB(
      config,
      pocketVPC
    );
    this.alb = alb;

    if (config.cdn) {
      this.createCDN(config, albRecord);
    }

    const ecsService = this.createECSService(
      config,
      pocketVPC,
      alb,
      albCertificate
    );

    this.createCloudwatchDashboard(
      alb.alb.arnSuffix,
      ecsService.ecs.service.name,
      ecsService.ecs.service.cluster,
      config.autoscalingConfig.scaleOutThreshold,
      config.autoscalingConfig.scaleInThreshold,
      config.prefix
    );
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
   * @param config
   * @param pocketVPC
   * @private
   */
  private createALB(
    config: PocketALBApplicationProps,
    pocketVPC: PocketVPC
  ): {
    alb: ApplicationLoadBalancer;
    albRecord: Route53Record;
    albCertificate: ApplicationCertificate;
  } {
    //Create our application Load Balancer
    const alb = new ApplicationLoadBalancer(this, `application_load_balancer`, {
      vpcId: pocketVPC.vpc.id,
      prefix: config.prefix,
      alb6CharacterPrefix: config.alb6CharacterPrefix,
      subnetIds: config.internal
        ? pocketVPC.privateSubnetIds
        : pocketVPC.publicSubnetIds,
      internal: config.internal,
      tags: config.tags,
    });

    //When the app uses a CDN we set the ALB to be direct.app-domain
    //Then the CDN is our main app.
    const albDomainName = config.cdn
      ? `direct.${config.domain}`
      : config.domain;

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
      tags: config.tags,
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
   * @param config
   * @param albRecord
   * @private
   */
  private createCDN(
    config: PocketALBApplicationProps,
    albRecord: Route53Record
  ): void {
    //Create the certificate for the CDN
    const cdnCertificate = new ApplicationCertificate(this, `cdn_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: config.domain,
      tags: config.tags,
    });

    //Create the CDN
    const cdn = new CloudfrontDistribution(this, `cloudfront_distribution`, {
      comment: `CDN for direct.${config.domain}`,
      enabled: true,
      aliases: [config.domain],
      priceClass: 'PriceClass_200',
      tags: config.tags,
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
      name: config.domain,
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
   * @param config
   * @param pocketVPC
   * @param alb
   * @param albCertificate
   * @private
   */
  private createECSService(
    config: PocketALBApplicationProps,
    pocketVPC: PocketVPC,
    alb: ApplicationLoadBalancer,
    albCertificate: ApplicationCertificate
  ): { ecs: ApplicationECSService } {
    const ecsCluster = new ApplicationECSCluster(this, 'ecs_cluster', {
      prefix: config.prefix,
      tags: config.tags,
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
      prefix: config.prefix,
      shortName: config.alb6CharacterPrefix,
      ecsClusterArn: ecsCluster.cluster.arn,
      ecsClusterName: ecsCluster.cluster.name,
      useCodeDeploy: config.codeDeploy.useCodeDeploy,
      codeDeploySnsNotificationTopicArn:
        config.codeDeploy.snsNotificationTopicArn,
      albConfig: {
        containerPort: config.exposedContainer.port,
        containerName: config.exposedContainer.name,
        healthCheckPath: config.exposedContainer.healthCheckPath,
        listenerArn: httpsListener.arn,
        albSecurityGroupId: alb.securityGroup.id,
      },
      vpcId: pocketVPC.vpc.id,
      containerConfigs: config.containerConfigs,
      privateSubnetIds: pocketVPC.privateSubnetIds,
      ecsIamConfig: config.ecsIamConfig,
      tags: config.tags,
    };

    if (config.taskSize) {
      ecsConfig = {
        ...config.taskSize,
        ...ecsConfig,
      };
    }

    const ecsService = new ApplicationECSService(
      this,
      'ecs_service',
      ecsConfig
    );

    new ApplicationAutoscaling(this, 'autoscaling', {
      prefix: config.prefix,
      targetMinCapacity: config.autoscalingConfig.targetMinCapacity,
      targetMaxCapacity: config.autoscalingConfig.targetMaxCapacity,
      ecsClusterName: ecsCluster.cluster.name,
      ecsServiceName: ecsService.service.name,
      scalableDimension: 'ecs:service:DesiredCount',
      stepScaleInAdjustment: config.autoscalingConfig.stepScaleInAdjustment,
      stepScaleOutAdjustment: config.autoscalingConfig.stepScaleOutAdjustment,
      scaleInThreshold: config.autoscalingConfig.scaleInThreshold,
      scaleOutThreshold: config.autoscalingConfig.scaleOutThreshold,
      tags: config.tags,
    });

    return {
      ecs: ecsService,
    };
  }

  /**
   * Create a Cloudwatch dashboard JSON object
   *
   * @param albArnSuffix
   * @param ecsServiceName
   * @param ecsServiceClusterName
   * @param scaleOutThreshold
   * @param scaleInThreshold
   * @param prefix
   */
  private createCloudwatchDashboard(
    albArnSuffix: string,
    ecsServiceName: string,
    ecsServiceClusterName: string,
    scaleOutThreshold: number,
    scaleInThreshold: number,
    prefix: string
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
                  value: 3,
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
                  value: scaleOutThreshold,
                },
                {
                  color: '#c5b0d5',
                  label: 'CPU scale in',
                  value: scaleInThreshold,
                },
              ],
            },
            title: 'Service Load',
          },
        },
      ],
    };

    return new CloudwatchDashboard(this, 'cloudwatch-dashboard', {
      dashboardName: `${prefix}-ALBDashboard`,
      dashboardBody: JSON.stringify(dashboardJSON),
    });
  }
}
