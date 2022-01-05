import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { codepipeline, iam, kms, s3 } from '@cdktf/provider-aws';
import crypto from 'crypto';

export interface PocketECSCodePipelineProps {
  prefix: string;
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
  tags?: { [key: string]: string };
}

export class PocketECSCodePipeline extends Resource {
  protected static DEFAULT_TASKDEF_PATH = 'taskdef.json';
  protected static DEFAULT_APPSPEC_PATH = 'appspec.json';

  public readonly codePipeline: codepipeline.Codepipeline;
  protected readonly pipelineArtifactBucket: s3.S3Bucket;
  protected readonly s3KmsAlias: kms.DataAwsKmsAlias;
  protected readonly pipelineRole: iam.IamRole;

  protected readonly codeBuildProjectName: string;
  protected readonly codeDeployApplicationName: string;
  protected readonly codeDeployDeploymentGroupName: string;
  protected readonly taskDefinitionTemplatePath: string;
  protected readonly appSpecTemplatePath: string;

  constructor(
    scope: Construct,
    name: string,
    protected config: PocketECSCodePipelineProps
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

  protected getPipelineName = () => `${this.config.prefix}-CodePipeline`;

  protected getCodeBuildProjectName = () =>
    this.config.codeBuildProjectName ?? this.config.prefix;

  protected getCodeDeployApplicationName = () =>
    this.config.codeDeploy?.applicationName ?? `${this.config.prefix}-ECS`;

  protected getCodeDeployDeploymentGroupName = () =>
    this.config.codeDeploy?.deploymentGroupName ?? `${this.config.prefix}-ECS`;

  protected getTaskDefinitionTemplatePath = () =>
    this.config.codeDeploy?.taskDefPath ??
    PocketECSCodePipeline.DEFAULT_TASKDEF_PATH;

  protected getAppSpecTemplatePath = () =>
    this.config.codeDeploy?.appSpecPath ??
    PocketECSCodePipeline.DEFAULT_APPSPEC_PATH;

  protected createS3KmsAlias() {
    return new kms.DataAwsKmsAlias(this, 'kms_s3_alias', {
      name: 'alias/aws/s3',
    });
  }

  /**
   * Create a CodePipeline that runs CodeBuild and ECS CodeDeploy
   * @protected
   */
  protected createCodePipeline(): codepipeline.Codepipeline {
    return new codepipeline.Codepipeline(this, 'codepipeline', {
      name: this.getPipelineName(),
      roleArn: this.pipelineRole.arn,
      artifactStore: this.getArtifactStore(),
      stage: [this.getSourceStage(), this.getDeployStage()],
      tags: this.config.tags,
    });
  }

  /**
   * Create CodePipeline artifact s3 bucket
   * @protected
   */
  protected createArtifactBucket() {
    const prefixHash = crypto
      .createHash('md5')
      .update(this.config.prefix)
      .digest('hex');

    return new s3.S3Bucket(this, 'codepipeline-bucket', {
      bucket: `pocket-codepipeline-${prefixHash}`,
      acl: 'private',
      forceDestroy: true,
      tags: this.config.tags,
    });
  }

  /**
   * Creates a CodePipeline role.
   * @protected
   */
  protected createPipelineRole() {
    const role = new iam.IamRole(this, 'codepipeline-role', {
      name: `${this.config.prefix}-CodePipelineRole`,
      assumeRolePolicy: new iam.DataAwsIamPolicyDocument(
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
        }
      ).json,
    });

    new iam.IamRolePolicy(this, 'codepipeline-role-policy', {
      name: `${this.config.prefix}-CodePipeline-Role-Policy`,
      role: role.id,
      policy: new iam.DataAwsIamPolicyDocument(
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
                `arn:aws:codebuild:*:*:project/${this.codeBuildProjectName}`,
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
        }
      ).json,
    });

    return role;
  }

  protected getArtifactStore = () => [
    {
      location: this.pipelineArtifactBucket.bucket,
      type: 'S3',
      encryptionKey: { id: this.s3KmsAlias.arn, type: 'KMS' },
    },
  ];

  protected getSourceStage = () => ({
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

  protected getDeployStage = () => ({
    name: 'Deploy',
    action: [this.getDeployCdkAction(), this.getDeployEcsAction()],
  });

  protected getDeployCdkAction = () => ({
    name: 'CodeBuild',
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

  protected getDeployEcsAction = () => ({
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
