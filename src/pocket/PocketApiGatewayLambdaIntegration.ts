import { APIGateway, LambdaFunction } from '@cdktf/provider-aws';
import { Resource } from '@cdktf/provider-null';
import { Construct } from 'constructs';
import { Fn } from 'cdktf';

import { PocketVersionedLambda, PocketVersionedLambdaProps } from '..';

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
}

interface InitializedGatewayRoute {
  lambda: PocketVersionedLambda;
  resource: APIGateway.ApiGatewayResource;
  method: APIGateway.ApiGatewayMethod;
  integration: APIGateway.ApiGatewayIntegration;
}

export class PocketApiGateway extends Resource {
  private readonly config: PocketApiGatewayProps;
  private apiGatewayRestApi: APIGateway.ApiGatewayRestApi;
  private routes: InitializedGatewayRoute[];
  private apiGatewayDeployment: APIGateway.ApiGatewayDeployment;
  private apiGatewayStage: APIGateway.ApiGatewayStage;

  constructor(scope: Construct, name: string, config: PocketApiGatewayProps) {
    super(scope, name);
    this.apiGatewayRestApi = new APIGateway.ApiGatewayRestApi(
      scope,
      `api-gateway-rest`,
      {
        name: config.name,
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
    // Deployment before adding permissions so we can restrict to the stage
    this.apiGatewayDeployment = new APIGateway.ApiGatewayDeployment(
      scope,
      'api-gateway-deployment',
      {
        restApiId: this.apiGatewayRestApi.id,
        // Removing the `id` from the resources in line 51 causes:
        // `RangeError: Resolution error Maximum call stack size exceeded`
        // However, this may not suffice for proper redeployment trigger...
        // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment#terraform-resources
        triggers: {
          redeployment: Fn.sha1(
            Fn.jsonencode({
              resources: routeDependencies.map((d) => d.id),
              ...config,
            })
          ),
        },
        dependsOn: routeDependencies,
      }
    );
    this.apiGatewayStage = new APIGateway.ApiGatewayStage(
      scope,
      'api-gateway-stage',
      {
        deploymentId: this.apiGatewayDeployment.id,
        restApiId: this.apiGatewayRestApi.id,
        stageName: config.stage,
      }
    );
    this.addInvokePermissions();
  }
  private addInvokePermissions() {
    this.routes.map(({ lambda, resource, method }) => {
      const functionName = lambda.lambda.versionedLambda.functionName;
      new LambdaFunction.LambdaPermission(
        this,
        `${functionName}-allow-gateway-lambda-invoke`,
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
  // loop over routes and generate methods
  /**
   * Generate aws proxy routes handled by aws lambda
   * @param routes
   */
  private createLambdaIntegrations(config: PocketApiGatewayProps) {
    return config.routes.map((route: ApiGatewayLambdaRoute) => {
      const lambda = new PocketVersionedLambda(
        this,
        `${route.path}-lambda`,
        route.eventHandler
      );
      const resource = new APIGateway.ApiGatewayResource(this, route.path, {
        parentId: this.apiGatewayRestApi.rootResourceId,
        pathPart: route.path,
        restApiId: this.apiGatewayRestApi.id,
      });
      const method = new APIGateway.ApiGatewayMethod(
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
      const integration = new APIGateway.ApiGatewayIntegration(
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
