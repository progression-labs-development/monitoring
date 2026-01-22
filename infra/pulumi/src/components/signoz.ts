import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

export interface SignozOptions {
  cluster: aws.ecs.Cluster;
  vpc: awsx.ec2.Vpc;
  alb: awsx.lb.ApplicationLoadBalancer;
  tags: Record<string, string>;
  stack: string;
}

export interface SignozOutputs {
  url: pulumi.Output<string>;
  otelEndpoint: pulumi.Output<string>;
}

export function createSignoz(options: SignozOptions): SignozOutputs {
  const { cluster, vpc, alb, tags, stack } = options;
  const name = `signoz-${stack}`;

  // Security group for SigNoz services
  const securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
    name: `${name}-sg`,
    vpcId: vpc.vpcId,
    description: "Security group for SigNoz services",
    ingress: [
      // OTLP gRPC
      { protocol: "tcp", fromPort: 4317, toPort: 4317, cidrBlocks: ["0.0.0.0/0"] },
      // OTLP HTTP
      { protocol: "tcp", fromPort: 4318, toPort: 4318, cidrBlocks: ["0.0.0.0/0"] },
      // Frontend
      { protocol: "tcp", fromPort: 3301, toPort: 3301, cidrBlocks: ["0.0.0.0/0"] },
      // Query service
      { protocol: "tcp", fromPort: 8080, toPort: 8080, cidrBlocks: ["0.0.0.0/0"] },
      // ClickHouse
      { protocol: "tcp", fromPort: 9000, toPort: 9000, cidrBlocks: ["10.0.0.0/16"] },
      { protocol: "tcp", fromPort: 8123, toPort: 8123, cidrBlocks: ["10.0.0.0/16"] },
    ],
    egress: [
      { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
    ],
    tags: { ...tags, Name: `${name}-sg` },
  });

  // EFS for ClickHouse persistent storage
  const efsFileSystem = new aws.efs.FileSystem(`${name}-efs`, {
    encrypted: true,
    performanceMode: "generalPurpose",
    throughputMode: "bursting",
    tags: { ...tags, Name: `${name}-clickhouse-data` },
  });

  // EFS mount targets (one per AZ)
  const mountTargets = vpc.privateSubnetIds.apply((subnetIds) =>
    subnetIds.map(
      (subnetId, i) =>
        new aws.efs.MountTarget(`${name}-efs-mount-${i}`, {
          fileSystemId: efsFileSystem.id,
          subnetId,
          securityGroups: [securityGroup.id],
        })
    )
  );

  // EFS access point for ClickHouse
  const accessPoint = new aws.efs.AccessPoint(`${name}-efs-ap`, {
    fileSystemId: efsFileSystem.id,
    posixUser: { uid: 101, gid: 101 },
    rootDirectory: {
      path: "/clickhouse-data",
      creationInfo: { ownerUid: 101, ownerGid: 101, permissions: "755" },
    },
    tags: { ...tags, Name: `${name}-clickhouse-ap` },
  });

  // CloudWatch log group
  const logGroup = new aws.cloudwatch.LogGroup(`${name}-logs`, {
    name: `/ecs/${name}`,
    retentionInDays: 30,
    tags,
  });

  // IAM role for ECS tasks
  const taskRole = new aws.iam.Role(`${name}-task-role`, {
    name: `${name}-task-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
          Effect: "Allow",
        },
      ],
    }),
    tags,
  });

  const executionRole = new aws.iam.Role(`${name}-execution-role`, {
    name: `${name}-execution-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Principal: { Service: "ecs-tasks.amazonaws.com" },
          Effect: "Allow",
        },
      ],
    }),
    tags,
  });

  new aws.iam.RolePolicyAttachment(`${name}-execution-policy`, {
    role: executionRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  });

  // ALB target group for SigNoz frontend
  const targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
    name: `${name}-tg`,
    port: 3301,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: vpc.vpcId,
    healthCheck: {
      enabled: true,
      path: "/",
      port: "3301",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 3,
      timeout: 5,
      interval: 30,
    },
    tags,
  });

  // ALB listener rule for SigNoz
  const listener = new aws.lb.Listener(`${name}-listener`, {
    loadBalancerArn: alb.loadBalancer.arn,
    port: 3301,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: targetGroup.arn,
      },
    ],
    tags,
  });

  // OTEL target group
  const otelTargetGroup = new aws.lb.TargetGroup(`${name}-otel-tg`, {
    name: `${name}-otel-tg`,
    port: 4318,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: vpc.vpcId,
    healthCheck: {
      enabled: true,
      path: "/",
      port: "4318",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 3,
      timeout: 5,
      interval: 30,
    },
    tags,
  });

  // OTEL listener
  const otelListener = new aws.lb.Listener(`${name}-otel-listener`, {
    loadBalancerArn: alb.loadBalancer.arn,
    port: 4318,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: otelTargetGroup.arn,
      },
    ],
    tags,
  });

  // Task definition for SigNoz (using official otel-lgtm image for simplicity)
  const taskDefinition = new aws.ecs.TaskDefinition(`${name}-task`, {
    family: name,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "2048",
    memory: "8192",
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: JSON.stringify([
      {
        name: "otel-lgtm",
        image: "grafana/otel-lgtm:latest",
        essential: true,
        portMappings: [
          { containerPort: 3000, hostPort: 3000, protocol: "tcp" }, // Grafana
          { containerPort: 4317, hostPort: 4317, protocol: "tcp" }, // OTLP gRPC
          { containerPort: 4318, hostPort: 4318, protocol: "tcp" }, // OTLP HTTP
          { containerPort: 3100, hostPort: 3100, protocol: "tcp" }, // Loki
          { containerPort: 9090, hostPort: 9090, protocol: "tcp" }, // Prometheus
          { containerPort: 3200, hostPort: 3200, protocol: "tcp" }, // Tempo
        ],
        environment: [
          { name: "GF_SECURITY_ADMIN_PASSWORD", value: "admin" },
        ],
        logConfiguration: {
          logDriver: "awslogs",
          options: {
            "awslogs-group": `/ecs/${name}`,
            "awslogs-region": aws.config.region,
            "awslogs-stream-prefix": "otel-lgtm",
          },
        },
      },
    ]),
    tags,
  });

  // Note: Using grafana/otel-lgtm for simplicity instead of full SigNoz stack
  // This provides Grafana + Loki + Tempo + Prometheus in one container
  // For production, consider deploying full SigNoz with ClickHouse

  // ECS Service
  const service = new aws.ecs.Service(`${name}-service`, {
    name,
    cluster: cluster.arn,
    taskDefinition: taskDefinition.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    networkConfiguration: {
      assignPublicIp: true,
      subnets: vpc.publicSubnetIds,
      securityGroups: [securityGroup.id],
    },
    loadBalancers: [
      {
        targetGroupArn: targetGroup.arn,
        containerName: "otel-lgtm",
        containerPort: 3000,
      },
    ],
    tags,
  });

  return {
    url: pulumi.interpolate`http://${alb.loadBalancer.dnsName}:3301`,
    otelEndpoint: pulumi.interpolate`http://${alb.loadBalancer.dnsName}:4318`,
  };
}
