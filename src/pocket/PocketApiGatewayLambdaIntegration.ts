import { APIGateway, LambdaFunction } from '@cdktf/provider-aws';
import { Resource } from '@cdktf/provider-null';
import { Construct } from 'constructs';

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
  routes: ApiGatewayLambdaRoute[];
  accountId: string;
  region: string;
}

interface InitializedGatewayRoute {
  resource: APIGateway.ApiGatewayResource;
  method: APIGateway.ApiGatewayMethod;
  integration: APIGateway.ApiGatewayIntegration;
  permission: LambdaFunction.LambdaPermission;
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
    // do the deployment after everything is initialized but before adding lambda permissions??
    // https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/api_gateway_deployment
    this.createLambdaIntegrations(config);
  }
  // loop over routes and generate methods
  /**
   * Generate aws proxy routes handled by aws lambda
   * @param routes
   */
  private createLambdaIntegrations(config: PocketApiGatewayProps) {
    this.routes = config.routes.map((route: ApiGatewayLambdaRoute) => {
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
          httpMethod: method.httpMethod,
          resourceId: resource.id,
          restApiId: this.apiGatewayRestApi.id,
          type: 'AWS_PROXY',
          uri: lambda.lambda.versionedLambda.invokeArn,
        }
      );
      const permission = new LambdaFunction.LambdaPermission(
        this,
        `${resource.path}-allow-gateway-lambda-invoke`,
        {
          functionName: lambda.lambda.versionedLambda.functionName,
          action: 'lambda:InvokeFunction',
          principal: 'apigateway.amazonaws.com',
          sourceArn: `arn:aws:execute-api:${config.region}:${config.accountId}:${this.apiGatewayRestApi.id}/*/${method.httpMethod}${resource.path}`,
        }
      );
      return { resource, method, integration, permission };
    });
  }
}
