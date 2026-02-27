import { EC2Client, DescribeInstancesCommand, DescribeSecurityGroupsCommand, DescribeVpcsCommand } from "@aws-sdk/client-ec2";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { RDSClient, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import { ECSClient, ListClustersCommand, ListServicesCommand, ListTasksCommand } from "@aws-sdk/client-ecs";
import { ElastiCacheClient, DescribeCacheClustersCommand } from "@aws-sdk/client-elasticache";
import { SecretsManagerClient, ListSecretsCommand } from "@aws-sdk/client-secrets-manager";
import { IAMClient, ListRolesCommand } from "@aws-sdk/client-iam";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import type { LiveResource } from "./types";

export interface AwsEnumerationOptions {
  region: string;
}

export async function validateAwsCredentials(region: string): Promise<{ account: string } | null> {
  try {
    const sts = new STSClient({ region });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return { account: identity.Account ?? "unknown" };
  } catch {
    return null;
  }
}

export async function enumerateAws(options: AwsEnumerationOptions): Promise<LiveResource[]> {
  const resources: LiveResource[] = [];
  const opts = { region: options.region };

  const collectors: Array<() => Promise<void>> = [
    // EC2 Instances
    async () => {
      const ec2 = new EC2Client(opts);
      const instances = await ec2.send(new DescribeInstancesCommand({}));
      for (const reservation of instances.Reservations ?? []) {
        for (const inst of reservation.Instances ?? []) {
          if (inst.State?.Name === "terminated") continue;
          const nameTag = inst.Tags?.find((t) => t.Key === "Name")?.Value ?? "";
          resources.push({
            cloud: "aws",
            type: "ec2-instance",
            id: inst.InstanceId ?? "unknown",
            name: nameTag,
            details: `state=${inst.State?.Name}, type=${inst.InstanceType}`,
          });
        }
      }
    },

    // VPCs
    async () => {
      const ec2 = new EC2Client(opts);
      const vpcs = await ec2.send(new DescribeVpcsCommand({}));
      for (const vpc of vpcs.Vpcs ?? []) {
        const nameTag = vpc.Tags?.find((t) => t.Key === "Name")?.Value ?? "";
        resources.push({
          cloud: "aws",
          type: "vpc",
          id: vpc.VpcId ?? "unknown",
          name: nameTag,
          details: `isDefault=${vpc.IsDefault}, cidr=${vpc.CidrBlock}`,
        });
      }
    },

    // Security Groups
    async () => {
      const ec2 = new EC2Client(opts);
      const sgs = await ec2.send(new DescribeSecurityGroupsCommand({}));
      for (const sg of sgs.SecurityGroups ?? []) {
        resources.push({
          cloud: "aws",
          type: "security-group",
          id: sg.GroupId ?? "unknown",
          name: sg.GroupName ?? "",
          details: `vpc=${sg.VpcId}`,
        });
      }
    },

    // S3 Buckets
    async () => {
      const s3 = new S3Client(opts);
      const buckets = await s3.send(new ListBucketsCommand({}));
      for (const b of buckets.Buckets ?? []) {
        resources.push({
          cloud: "aws",
          type: "s3-bucket",
          id: b.Name ?? "unknown",
          name: b.Name ?? "",
        });
      }
    },

    // RDS
    async () => {
      const rds = new RDSClient(opts);
      const dbs = await rds.send(new DescribeDBInstancesCommand({}));
      for (const db of dbs.DBInstances ?? []) {
        resources.push({
          cloud: "aws",
          type: "rds-instance",
          id: db.DBInstanceArn ?? "unknown",
          name: db.DBInstanceIdentifier ?? "",
          details: `engine=${db.Engine}, status=${db.DBInstanceStatus}`,
        });
      }
    },

    // Lambda
    async () => {
      const lambda = new LambdaClient(opts);
      const fns = await lambda.send(new ListFunctionsCommand({}));
      for (const fn of fns.Functions ?? []) {
        resources.push({
          cloud: "aws",
          type: "lambda-function",
          id: fn.FunctionArn ?? "unknown",
          name: fn.FunctionName ?? "",
          details: `runtime=${fn.Runtime}`,
        });
      }
    },

    // ECS Clusters + Services + Tasks
    async () => {
      const ecs = new ECSClient(opts);
      const clusters = await ecs.send(new ListClustersCommand({}));
      for (const arn of clusters.clusterArns ?? []) {
        resources.push({
          cloud: "aws",
          type: "ecs-cluster",
          id: arn,
          name: arn.split("/").pop() ?? "",
        });
        try {
          const services = await ecs.send(new ListServicesCommand({ cluster: arn }));
          for (const svcArn of services.serviceArns ?? []) {
            resources.push({
              cloud: "aws",
              type: "ecs-service",
              id: svcArn,
              name: svcArn.split("/").pop() ?? "",
              details: `cluster=${arn.split("/").pop()}`,
            });
          }
        } catch { /* empty cluster */ }
        try {
          const tasks = await ecs.send(new ListTasksCommand({ cluster: arn }));
          for (const taskArn of tasks.taskArns ?? []) {
            resources.push({
              cloud: "aws",
              type: "ecs-task",
              id: taskArn,
              name: taskArn.split("/").pop() ?? "",
              details: `cluster=${arn.split("/").pop()}`,
            });
          }
        } catch { /* empty cluster */ }
      }
    },

    // ElastiCache
    async () => {
      const ec = new ElastiCacheClient(opts);
      const caches = await ec.send(new DescribeCacheClustersCommand({}));
      for (const c of caches.CacheClusters ?? []) {
        resources.push({
          cloud: "aws",
          type: "elasticache-cluster",
          id: c.ARN ?? "unknown",
          name: c.CacheClusterId ?? "",
          details: `engine=${c.Engine}, status=${c.CacheClusterStatus}`,
        });
      }
    },

    // Secrets Manager
    async () => {
      const sm = new SecretsManagerClient(opts);
      const secrets = await sm.send(new ListSecretsCommand({}));
      for (const s of secrets.SecretList ?? []) {
        resources.push({
          cloud: "aws",
          type: "secret",
          id: s.ARN ?? "unknown",
          name: s.Name ?? "",
        });
      }
    },

    // IAM Roles
    async () => {
      const iam = new IAMClient(opts);
      const roles = await iam.send(new ListRolesCommand({}));
      for (const r of roles.Roles ?? []) {
        resources.push({
          cloud: "aws",
          type: "iam-role",
          id: r.Arn ?? "unknown",
          name: r.RoleName ?? "",
          details: `path=${r.Path}`,
        });
      }
    },
  ];

  const results = await Promise.allSettled(collectors.map((c) => c()));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("AWS enumeration error:", result.reason);
    }
  }

  return resources;
}
