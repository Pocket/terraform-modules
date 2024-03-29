import {
  CodepipelineStage,
  Codepipeline,
  CodepipelineStageAction,
} from '@cdktf/provider-aws/lib/codepipeline';
import { DataAwsIamPolicyDocument } from '@cdktf/provider-aws/lib/data-aws-iam-policy-document';
import { DataAwsKmsAlias } from '@cdktf/provider-aws/lib/data-aws-kms-alias';
import { IamRole } from '@cdktf/provider-aws/lib/iam-role';
import { IamRolePolicy } from '@cdktf/provider-aws/lib/iam-role-policy';
import { S3Bucket } from '@cdktf/provider-aws/lib/s3-bucket';
import { TerraformMetaArguments } from 'cdktf';
import { Construct } from 'constructs';
import crypto from 'crypto';

export interface PocketECSCodePipelineProps extends TerraformMetaArguments {
  prefix: string;
  artifactBucketPrefix?: string;
  source: {
    repository: string;
    branchName: string;
    codeStarConnectionArn: string;
  };
  codeBuildProjectName?: string;
  codeDeploy?: {
    applicationName?: string;
    deploymentGroupName?: string;
    appSpecPath?: string;
    taskDefPath?: string;
  };
  /** Optional stages to run before the deploy stage.
   * For CodeBuild actions, ensure that the project name starts with `prefix`.
   */
  preDeployStages?: CodepipelineStage[];
  /** Optional stages to run after the deploy stage.
   * For CodeBuild actions, ensure that the project name starts with `prefix`.
   */
  postDeployStages?: CodepipelineStage[];
  tags?: { [key: string]: string };
}

export class PocketECSCodePipeline extends Construct {
  private static DEFAULT_TASKDEF_PATH = 'taskdef.json';
  private static DEFAULT_APPSPEC_PATH = 'appspec.json';

  public readonly codePipeline: Codepipeline;
  public readonly stages: CodepipelineStage[];
  private readonly pipelineArtifactBucket: S3Bucket;
  private readonly s3KmsAlias: DataAwsKmsAlias;
  private readonly pipelineRole: IamRole;

  private readonly codeBuildProjectName: string;
  private readonly codeDeployApplicationName: string;
  private readonly codeDeployDeploymentGroupName: string;
  private readonly taskDefinitionTemplatePath: string;
  private readonly appSpecTemplatePath: string;

  constructor(
    scope: Construct,
    name: string,
    private config: PocketECSCodePipelineProps,
  ) {
    super(scope, name);

    this.codeBuildProjectName = this.getCodeBuildProjectName();
    this.codeDeployApplicationName = this.getCodeDeployApplicationName();
    this.codeDeployDeploymentGroupName =
      this.getCodeDeployDeploymentGroupName();
    this.taskDefinitionTemplatePath = this.getTaskDefinitionTemplatePath();
    this.appSpecTemplatePath = this.getAppSpecTemplatePath();

    this.s3KmsAlias = this.createS3KmsAlias();
    this.pipelineArtifactBucket = this.createArtifactBucket();
    this.pipelineRole = this.createPipelineRole();
    this.codePipeline = this.createCodePipeline();
  }

  private getPipelineName = () => `${this.config.prefix}-CodePipeline`;

  private getCodeBuildProjectName = () =>
    this.config.codeBuildProjectName ?? this.config.prefix;

  private getArtifactBucketPrefix = () =>
    this.config.artifactBucketPrefix ?? 'pocket-codepipeline';

  private getCodeDeployApplicationName = () =>
    this.config.codeDeploy?.applicationName ?? `${this.config.prefix}-ECS`;

  private getCodeDeployDeploymentGroupName = () =>
    this.config.codeDeploy?.deploymentGroupName ?? `${this.config.prefix}-ECS`;

  private getTaskDefinitionTemplatePath = () =>
    this.config.codeDeploy?.taskDefPath ??
    PocketECSCodePipeline.DEFAULT_TASKDEF_PATH;

  private getAppSpecTemplatePath = () =>
    this.config.codeDeploy?.appSpecPath ??
    PocketECSCodePipeline.DEFAULT_APPSPEC_PATH;

  /**
   * Get all stages for the pipeline, including postDeployStage if provided.
   * @private
   */
  private getStages = () => [
    this.getSourceStage(),
    ...(this.config.preDeployStages ? this.config.preDeployStages : []),
    this.getDeployStage(),
    ...(this.config.postDeployStages ? this.config.postDeployStages : []),
  ];

  private createS3KmsAlias() {
    return new DataAwsKmsAlias(this, 'kms_s3_alias', {
      name: 'alias/aws/s3',
      provider: this.config.provider,
    });
  }

  /**
   * Create a CodePipeline that runs CodeBuild and ECS CodeDeploy
   * @private
   */
  private createCodePipeline(): Codepipeline {
    return new Codepipeline(this, 'codepipeline', {
      name: this.getPipelineName(),
      roleArn: this.pipelineRole.arn,
      artifactStore: this.getArtifactStore(),
      stage: this.getStages(),
      tags: this.config.tags,
      provider: this.config.provider,
    });
  }

  /**
   * Create CodePipeline artifact s3 bucket
   * @private
   */
  private createArtifactBucket() {
    const prefixHash = crypto
      .createHash('md5')
      .update(this.config.prefix)
      .digest('hex');

    return new S3Bucket(this, 'codepipeline-bucket', {
      bucket: `${this.getArtifactBucketPrefix()}-${prefixHash}`,
      acl: 'private',
      forceDestroy: true,
      tags: this.config.tags,
      provider: this.config.provider,
    });
  }

  /**
   * Creates a CodePipeline role.
   * @private
   */
  private createPipelineRole() {
    const role = new IamRole(this, 'codepipeline-role', {
      name: `${this.config.prefix}-CodePipelineRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
        this,
        `codepipeline-assume-role-policy`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  identifiers: ['codepipeline.amazonaws.com'],
                  type: 'Service',
                },
              ],
            },
          ],
          provider: this.config.provider,
        },
      ).json,
    });

    new IamRolePolicy(this, 'codepipeline-role-policy', {
      name: `${this.config.prefix}-CodePipeline-Role-Policy`,
      role: role.id,
      policy: new DataAwsIamPolicyDocument(
        this,
        `codepipeline-role-policy-document`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['codestar-connections:UseConnection'],
              resources: [this.config.source.codeStarConnectionArn],
            },
            {
              effect: 'Allow',
              actions: [
                'codebuild:BatchGetBuilds',
                'codebuild:StartBuild',
                'codebuild:BatchGetBuildBatches',
                'codebuild:StartBuildBatch',
              ],
              resources: [
                // The * allows CodeBuild in `preDeployStages` and
                // `postDeployStages` to start, if the project name starts with
                // `this.config.prefix`.
                `arn:aws:codebuild:*:*:project/${this.codeBuildProjectName}*`,
              ],
            },
            {
              effect: 'Allow',
              actions: [
                'codedeploy:CreateDeployment',
                'codedeploy:GetApplication',
                'codedeploy:GetApplicationRevision',
                'codedeploy:GetDeployment',
                'codedeploy:RegisterApplicationRevision',
                'codedeploy:GetDeploymentConfig',
              ],
              resources: [
                `arn:aws:codedeploy:*:*:application:${this.codeDeployApplicationName}`,
                `arn:aws:codedeploy:*:*:deploymentgroup:${this.codeDeployApplicationName}/${this.codeDeployDeploymentGroupName}`,
                'arn:aws:codedeploy:*:*:deploymentconfig:*',
              ],
            },
            {
              effect: 'Allow',
              actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:GetBucketVersioning',
                's3:PutObjectAcl',
                's3:PutObject',
              ],
              resources: [
                this.pipelineArtifactBucket.arn,
                `${this.pipelineArtifactBucket.arn}/*`,
              ],
            },
            {
              effect: 'Allow',
              actions: ['iam:PassRole'],
              resources: ['*'],
              condition: [
                {
                  variable: 'iam:PassedToService',
                  test: 'StringEqualsIfExists',
                  values: ['ecs-tasks.amazonaws.com'],
                },
              ],
            },
            {
              effect: 'Allow',
              actions: ['ecs:RegisterTaskDefinition'],
              resources: ['*'],
            },
          ],
          provider: this.config.provider,
        },
      ).json,
    });

    return role;
  }

  private getArtifactStore = () => [
    {
      location: this.pipelineArtifactBucket.bucket,
      type: 'S3',
      encryptionKey: { id: this.s3KmsAlias.arn, type: 'KMS' },
    },
  ];

  /**
   * Get the source code from GitHub.
   * @private
   */
  private getSourceStage = () => ({
    name: 'Source',
    action: [
      {
        name: 'GitHub_Checkout',
        category: 'Source',
        owner: 'AWS',
        provider: 'CodeStarSourceConnection',
        version: '1',
        outputArtifacts: ['SourceOutput'],
        configuration: {
          ConnectionArn: this.config.source.codeStarConnectionArn,
          FullRepositoryId: this.config.source.repository,
          BranchName: this.config.source.branchName,
          DetectChanges: 'false',
        },
        namespace: 'SourceVariables',
      },
    ],
  });

  /**
   * Get a stage that deploys the infrastructure and ECS service.
   * @private
   */
  private getDeployStage = (): CodepipelineStage => ({
    name: 'Deploy',
    action: [this.getDeployCdkAction(), this.getDeployEcsAction()],
  });

  /**
   * Get the CDK for Terraform deployment step that runs `terraform apply`.
   * @private
   */
  private getDeployCdkAction = (): CodepipelineStageAction => ({
    name: 'Deploy_CDK',
    category: 'Build',
    owner: 'AWS',
    provider: 'CodeBuild',
    inputArtifacts: ['SourceOutput'],
    outputArtifacts: ['CodeBuildOutput'],
    version: '1',
    configuration: {
      ProjectName: this.codeBuildProjectName,
      EnvironmentVariables: `[${JSON.stringify({
        name: 'GIT_BRANCH',
        value: '#{SourceVariables.BranchName}',
      })}]`,
    },
    runOrder: 1,
  });

  /**
   * Get the ECS CodeDeploy step that does a blue/green deployment.
   * @private
   */
  private getDeployEcsAction = (): CodepipelineStageAction => ({
    name: 'Deploy_ECS',
    category: 'Deploy',
    owner: 'AWS',
    provider: 'CodeDeployToECS',
    inputArtifacts: ['CodeBuildOutput'],
    version: '1',
    configuration: {
      ApplicationName: this.codeDeployApplicationName,
      DeploymentGroupName: this.codeDeployDeploymentGroupName,
      TaskDefinitionTemplateArtifact: 'CodeBuildOutput',
      TaskDefinitionTemplatePath: this.taskDefinitionTemplatePath,
      AppSpecTemplateArtifact: 'CodeBuildOutput',
      AppSpecTemplatePath: this.appSpecTemplatePath,
    },
    runOrder: 2,
  });
}
