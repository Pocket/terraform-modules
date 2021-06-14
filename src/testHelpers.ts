import { Resource, TerraformStack } from 'cdktf';

// used to test individual static functions within component classes
// generates a basic/empty construct Resource to provide context
export class TestResource extends Resource {
  constructor(scope: TerraformStack, name: string) {
    super(scope, name);
  }
}
