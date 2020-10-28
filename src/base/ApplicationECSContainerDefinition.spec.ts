import { expect } from 'chai';
import {
  ApplicationECSContainerDefinitionProps,
  buildDefinitionJSON,
} from './ApplicationECSContainerDefinition';

describe('ApplicationECSContainerDefinition', () => {
  describe('buildDefinitionJSON', () => {
    let config: ApplicationECSContainerDefinitionProps;

    beforeEach(() => {
      config = {
        containerImage: 'testImage',
        logGroup: 'bowlingGroup',
        hostPort: 3000,
        containerPort: 4000,
        name: 'lebowski',
        repositoryCredentialsParam: 'someArn',
      };
    });

    it('builds JSON without env vars', () => {
      const result = buildDefinitionJSON(config);

      expect(result).to.contain('"awslogs-group": "bowlingGroup"');
      expect(result).to.contain('"hostPort": 3000');
      expect(result).to.contain('"containerPort": 4000');
      expect(result).to.contain('"image": "testImage"');
      expect(result).to.contain('"name": "lebowski"');
      expect(result).to.contain('"credentialsParameter": "someArn"');
      expect(result).to.contain('"environment": []');
      expect(result).to.contain('"secrets": null');
    });

    it('builds JSON with env vars', () => {
      config.envVars = [
        {
          name: 'dude',
          value: 'abides',
        },
        {
          name: 'letsgo',
          value: 'bowling',
        },
      ];

      const result = buildDefinitionJSON(config);

      expect(result).to.contain(
        `"environment": ${JSON.stringify(config.envVars)}`
      );
    });

    it('builds JSON with secret env vars', () => {
      config.secretEnvVars = [
        {
          name: 'dude',
          valueFrom: 'abides',
        },
        {
          name: 'letsgo',
          valueFrom: 'bowling',
        },
      ];

      const result = buildDefinitionJSON(config);

      expect(result).to.contain(
        `"secrets": ${JSON.stringify(config.secretEnvVars)}`
      );
    });

    it('builds JSON with a command', () => {
      config.command = ['go to in-n-out', 'go bowling'];

      const result = buildDefinitionJSON(config);

      expect(result).to.contain(`"command": ["go to in-n-out","go bowling"]`);
    });
  });
});
