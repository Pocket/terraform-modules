import {Resource, TerraformOutput} from 'cdktf';
import {
    DataAwsCallerIdentity,
    DataAwsRegion,
    DataAwsSsmParameter,
    DataAwsSubnetIds,
    DataAwsVpc
} from '../../.gen/providers/aws';
import {Construct} from 'constructs';

export class PocketVPC extends Resource {
    public readonly vpc: DataAwsVpc;

    public readonly region: string;
    public readonly accountId: string;
    public readonly privateSubnetIds: string[];
    public readonly publicSubnetIds: string[];

    constructor(scope: Construct, name: string) {
        super(scope, name);

        const vpcSSMParam = new DataAwsSsmParameter(scope, `${name}_vpc_ssm_param`, {
            name: "/Shared/Vpc"
        });

        this.vpc = new DataAwsVpc(scope, `${name}_vpc`, {
            filter: [
                {
                    name: 'vpc-id',
                    values: [
                        vpcSSMParam.value
                    ]
                }
            ]
        });

        const privateString = new DataAwsSsmParameter(scope, `${name}_private_subnets`, {
            name: "/Shared/PrivateSubnets"
        });

        const privateSubnets = new DataAwsSubnetIds(scope, `${name}_private_subnet_ids`, {
            vpcId: this.vpc.id!,
            filter: [
                {
                    name: "subnetIds",
                    values: privateString.value.split(',')
                }
            ]
        });
        this.privateSubnetIds = privateSubnets.ids;

        const publicString = new DataAwsSsmParameter(scope, `${name}_public_subnets`, {
            name: "/Shared/PublicSubnets"
        });

        const publicSubnets = new DataAwsSubnetIds(scope, `${name}_public_subnet_ids`, {
            vpcId: this.vpc.id!,
            filter: [
                {
                    name: "subnetIds",
                    values: publicString.value.split(',')
                }
            ]
        });
        this.publicSubnetIds = publicSubnets.ids;

        const identity = new DataAwsCallerIdentity(scope, `${name}_current_identity`);
        this.accountId = identity.accountId;

        const region = new DataAwsRegion(scope, "current_region");
        this.region = region.name;

        /**
         * Adding terraform outputs for native terraform modules
         */
        new TerraformOutput(this, `${name}_region`, {
            value: this.region
        });

        new TerraformOutput(this, `${name}_account_id`, {
            value: this.accountId
        });

        new TerraformOutput(this, `${name}_private_subnet_ids`, {
            value: this.privateSubnetIds
        });

        new TerraformOutput(this, `${name}_public_subnet_ids`, {
            value: this.publicSubnetIds
        });
    }
}
