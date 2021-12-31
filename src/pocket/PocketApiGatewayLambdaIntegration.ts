import { apigateway, lambdafunction, route53 } from '@cdktf/provider-aws';
import { Resource } from '@cdktf/provider-null';
import { Construct } from 'constructs';

import {
  PocketVersionedLambda,
  PocketVersionedLambdaProps,
  ApplicationBaseDNS,
  ApplicationCertificate,
} from '..';
import ApiGatewayDeploymentConfig = apigateway.ApiGatewayDeploymentConfig;
import { Fn } from 'cdktf';

export interface ApiGatewayLambdaRoute {
  path: string;
  // The HTTP method clients use to call this method (GET, POST, etc.)
  method: string;
  // Currently not supporting authorizer
  // authorizationType: string;
  eventHandler: PocketVersionedLambdaProps;
  // TODO
  // requestParams: Map<string, any>;
}

export interface PocketApiGatewayProps {
  name: string;
  stage: string; // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_stage#stage_name
  routes: ApiGatewayLambdaRoute[];
  tags?: { [key: string]: string };
  // Should not contain lists/arrays, should only contain objects
  triggers?: ApiGatewayDeploymentConfig['triggers'];
  domain?: string;
  basePath?: string;
}

interface InitializedGatewayRoute {
  lambda: PocketVersionedLambda;
  resource: apigateway.ApiGatewayResource;
  method: apigateway.ApiGatewayMethod;
  integration: apigateway.ApiGatewayIntegration;
}

/**
 * Create an API Gateway with lambda handlers, optionally assigned
 * to a custom domain owned by the account.
 */
export class PocketApiGateway extends Resource {
  private apiGatewayRestApi: apigateway.ApiGatewayRestApi;
  private routes: InitializedGatewayRoute[];
  private apiGatewayDeployment: apigateway.ApiGatewayDeployment;
  private apiGatewayStage: apigateway.ApiGatewayStage;

  constructor(
    scope: Construct,
    name: string,
    private readonly config: PocketApiGatewayProps
  ) {
    super(scope, name);
    this.apiGatewayRestApi = new apigateway.ApiGatewayRestApi(
      scope,
      `api-gateway-rest`,
      {
        name: config.name,
        tags: config.tags,
      }
    );

    // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment
    this.routes = this.createLambdaIntegrations(config);
    const routeDependencies = this.routes.flatMap((route) => [
      route.integration,
      route.method,
      route.resource,
      route.lambda.lambda.versionedLambda,
    ]);

    // Use the current timestamp in milliseconds to trigger a redeployment if no triggers are provided.
    // If no triggers are provided, this resource will be redeployed on every "terraform apply".
    const triggers = config.triggers ?? { deployedAt: Date.now().toString() };

    // Deployment before adding permissions so we can restrict to the stage
    this.apiGatewayDeployment = new apigateway.ApiGatewayDeployment(
      scope,
      'api-gateway-deployment',
      {
        restApiId: this.apiGatewayRestApi.id,
        triggers: {
          redeployment: Fn.sha1(
            Fn.jsonencode({
              resources: routeDependencies.map((d) => d.id),
            })
          ),
          ...triggers,
        },
        lifecycle: { createBeforeDestroy: true },
        dependsOn: routeDependencies,
      }
    );
    this.apiGatewayStage = new apigateway.ApiGatewayStage(
      scope,
      'api-gateway-stage',
      {
        deploymentId: this.apiGatewayDeployment.id,
        restApiId: this.apiGatewayRestApi.id,
        stageName: config.stage,
      }
    );
    if (config.domain != null) {
      this.createRoute53Record(config);
    }
    this.addInvokePermissions();
  }

  /**
   * Sets up a custom domain name for the API gateway;
   * adds ACM Certificate and configures Route 53 Record
   * @param config
   */
  private createRoute53Record(config: PocketApiGatewayProps) {
    //Setup the Base DNS stack for our application which includes a hosted SubZone
    const baseDNS = new ApplicationBaseDNS(this, `base-dns`, {
      domain: config.domain,
      tags: config.tags,
    });

    //Creates the Certificate for API gateway
    const apiGatewayCertificate = new ApplicationCertificate(
      this,
      `api-gateway-certificate`,
      {
        zoneId: baseDNS.zoneId,
        domain: config.domain,
        tags: this.config.tags,
      }
    );

    //setup custom domain name for API gateway
    const customDomainName = new apigateway.ApiGatewayDomainName(
      this,
      `api-gateway-domain-name`,
      {
        domainName: config.domain,
        certificateArn: apiGatewayCertificate.arn,
        dependsOn: [apiGatewayCertificate.certificateValidation],
      }
    );

    new route53.Route53Record(this, `apigateway-route53-domain-record`, {
      name: customDomainName.domainName,
      type: 'A',
      zoneId: baseDNS.zoneId,
      alias: [
        {
          evaluateTargetHealth: true,
          name: customDomainName.cloudfrontDomainName,
          zoneId: customDomainName.cloudfrontZoneId,
        },
      ],
      dependsOn: [apiGatewayCertificate.certificateValidation],
    });

    new apigateway.ApiGatewayBasePathMapping(
      this,
      `api-gateway-base-path-mapping`,
      {
        apiId: this.apiGatewayRestApi.id,
        stageName: this.apiGatewayStage.stageName,
        domainName: customDomainName.domainName,
        basePath: config.basePath ?? '',
      }
    );
  }

  /**
   * Add permissions for gateway to invoke lambda functions
   */
  private addInvokePermissions() {
    this.routes.map(({ lambda, resource, method }) => {
      const friendlyUniqueId = lambda.lambda.versionedLambda.friendlyUniqueId;
      new lambdafunction.LambdaPermission(
        this,
        `${friendlyUniqueId}-allow-gateway-lambda-invoke`,
        {
          functionName: lambda.lambda.versionedLambda.functionName,
          action: 'lambda:InvokeFunction',
          principal: 'apigateway.amazonaws.com',
          // Grants access to invoke lambda on specified stage, method, resource path
          // note the resource path has a leading `/`
          sourceArn: `${this.apiGatewayRestApi.executionArn}/${this.apiGatewayStage.stageName}/${method.httpMethod}${resource.path}`,
          qualifier: lambda.lambda.versionedLambda.name,
        }
      );
    });
  }

  /**
   * Generate aws proxy routes handled by aws lambda
   * loops over routes and generate methods
   * @param config
   */
  private createLambdaIntegrations(config: PocketApiGatewayProps) {
    return config.routes.map((route: ApiGatewayLambdaRoute) => {
      const lambda = new PocketVersionedLambda(
        this,
        `${route.path}-lambda`,
        route.eventHandler
      );
      const resource = new apigateway.ApiGatewayResource(this, route.path, {
        parentId: this.apiGatewayRestApi.rootResourceId,
        pathPart: route.path,
        restApiId: this.apiGatewayRestApi.id,
      });
      const method = new apigateway.ApiGatewayMethod(
        this,
        `${route.path}-method`,
        {
          restApiId: this.apiGatewayRestApi.id,
          resourceId: resource.id,
          // authorization: route.authorizationType,
          authorization: 'NONE',
          httpMethod: route.method,
        }
      );
      const integration = new apigateway.ApiGatewayIntegration(
        this,
        `${route.path}-integration`,
        {
          httpMethod: route.method,
          integrationHttpMethod: 'POST', // lambda has to be post
          resourceId: resource.id,
          restApiId: this.apiGatewayRestApi.id,
          type: 'AWS_PROXY',
          uri: lambda.lambda.versionedLambda.invokeArn,
        }
      );
      return { lambda, resource, method, integration };
    });
  }
}