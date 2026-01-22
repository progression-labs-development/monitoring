import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as random from "@pulumi/random";

export interface GlitchTipOptions {
  cluster: aws.ecs.Cluster;
  vpc: awsx.ec2.Vpc;
  alb: awsx.lb.ApplicationLoadBalancer;
  tags: Record<string, string>;
  stack: string;
}

export interface GlitchTipOutputs {
  url: pulumi.Output<string>;
  dsn: pulumi.Output<string>;
}

export function createGlitchTip(options: GlitchTipOptions): GlitchTipOutputs {
  const { cluster, vpc, alb, tags, stack } = options;
  const name = `glitchtip-${stack}`;

  // Generate secret key
  const secretKey = new random.RandomPassword(`${name}-secret-key`, {
    length: 50,
    special: false,
  });

  // Security group for GlitchTip services
  const securityGroup = new aws.ec2.SecurityGroup(`${name}-sg`, {
    name: `${name}-sg`,
    vpcId: vpc.vpcId,
    description: "Security group for GlitchTip services",
    ingress: [
      // Web UI
      { protocol: "tcp", fromPort: 8000, toPort: 8000, cidrBlocks: ["0.0.0.0/0"] },
      // PostgreSQL (internal only)
      { protocol: "tcp", fromPort: 5432, toPort: 5432, cidrBlocks: ["10.0.0.0/16"] },
      // Redis (internal only)
      { protocol: "tcp", fromPort: 6379, toPort: 6379, cidrBlocks: ["10.0.0.0/16"] },
    ],
    egress: [
      { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
    ],
    tags: { ...tags, Name: `${name}-sg` },
  });

  // RDS subnet group
  const dbSubnetGroup = new aws.rds.SubnetGroup(`${name}-db-subnet`, {
    name: `${name}-db-subnet`,
    subnetIds: vpc.privateSubnetIds,
    tags: { ...tags, Name: `${name}-db-subnet` },
  });

  // RDS PostgreSQL for GlitchTip
  const dbPassword = new random.RandomPassword(`${name}-db-password`, {
    length: 32,
    special: false,
  });

  const db = new aws.rds.Instance(`${name}-db`, {
    identifier: `${name}-db`,
    engine: "postgres",
    engineVersion: "15",
    instanceClass: "db.t3.micro",
    allocatedStorage: 20,
    dbName: "glitchtip",
    username: "glitchtip",
    password: dbPassword.result,
    dbSubnetGroupName: dbSubnetGroup.name,
    vpcSecurityGroupIds: [securityGroup.id],
    skipFinalSnapshot: true,
    publiclyAccessible: false,
    tags,
  });

  // ElastiCache Redis for GlitchTip
  const redisSubnetGroup = new aws.elasticache.SubnetGroup(`${name}-redis-subnet`, {
    name: `${name}-redis-subnet`,
    subnetIds: vpc.privateSubnetIds,
    tags,
  });

  const redis = new aws.elasticache.Cluster(`${name}-redis`, {
    clusterId: `${name}-redis`,
    engine: "redis",
    nodeType: "cache.t3.micro",
    numCacheNodes: 1,
    port: 6379,
    subnetGroupName: redisSubnetGroup.name,
    securityGroupIds: [securityGroup.id],
    tags,
  });

  // CloudWatch log group
  const logGroup = new aws.cloudwatch.LogGroup(`${name}-logs`, {
    name: `/ecs/${name}`,
    retentionInDays: 30,
    tags,
  });

  // IAM roles
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

  // ALB target group for GlitchTip
  const targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
    name: `${name}-tg`,
    port: 8000,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: vpc.vpcId,
    healthCheck: {
      enabled: true,
      path: "/_health/",
      port: "8000",
      protocol: "HTTP",
      healthyThreshold: 2,
      unhealthyThreshold: 3,
      timeout: 5,
      interval: 30,
    },
    tags,
  });

  // ALB listener for GlitchTip
  const listener = new aws.lb.Listener(`${name}-listener`, {
    loadBalancerArn: alb.loadBalancer.arn,
    port: 8000,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "forward",
        targetGroupArn: targetGroup.arn,
      },
    ],
    tags,
  });

  // Build DATABASE_URL from RDS outputs
  const databaseUrl = pulumi.interpolate`postgres://glitchtip:${dbPassword.result}@${db.endpoint}/glitchtip`;

  // Build REDIS_URL from ElastiCache outputs
  const redisUrl = pulumi.interpolate`redis://${redis.cacheNodes[0].address}:6379`;

  // Task definition for GlitchTip web
  const webTaskDefinition = new aws.ecs.TaskDefinition(`${name}-web-task`, {
    family: `${name}-web`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "512",
    memory: "1024",
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi
      .all([databaseUrl, redisUrl, secretKey.result])
      .apply(([dbUrl, rUrl, secret]) =>
        JSON.stringify([
          {
            name: "glitchtip-web",
            image: "glitchtip/glitchtip:latest",
            essential: true,
            portMappings: [
              { containerPort: 8000, hostPort: 8000, protocol: "tcp" },
            ],
            environment: [
              { name: "DATABASE_URL", value: dbUrl },
              { name: "REDIS_URL", value: rUrl },
              { name: "SECRET_KEY", value: secret },
              { name: "PORT", value: "8000" },
              { name: "GLITCHTIP_DOMAIN", value: `http://${name}.example.com` },
              { name: "DEFAULT_FROM_EMAIL", value: "noreply@example.com" },
              { name: "EMAIL_URL", value: "consolemail://" },
              { name: "ENABLE_OPEN_USER_REGISTRATION", value: "true" },
            ],
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": `/ecs/${name}`,
                "awslogs-region": aws.config.region,
                "awslogs-stream-prefix": "web",
              },
            },
          },
        ])
      ),
    tags,
  });

  // Task definition for GlitchTip worker
  const workerTaskDefinition = new aws.ecs.TaskDefinition(`${name}-worker-task`, {
    family: `${name}-worker`,
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    cpu: "512",
    memory: "1024",
    executionRoleArn: executionRole.arn,
    taskRoleArn: taskRole.arn,
    containerDefinitions: pulumi
      .all([databaseUrl, redisUrl, secretKey.result])
      .apply(([dbUrl, rUrl, secret]) =>
        JSON.stringify([
          {
            name: "glitchtip-worker",
            image: "glitchtip/glitchtip:latest",
            essential: true,
            command: ["./bin/run-celery-with-beat.sh"],
            environment: [
              { name: "DATABASE_URL", value: dbUrl },
              { name: "REDIS_URL", value: rUrl },
              { name: "SECRET_KEY", value: secret },
            ],
            logConfiguration: {
              logDriver: "awslogs",
              options: {
                "awslogs-group": `/ecs/${name}`,
                "awslogs-region": aws.config.region,
                "awslogs-stream-prefix": "worker",
              },
            },
          },
        ])
      ),
    tags,
  });

  // ECS Service for web
  const webService = new aws.ecs.Service(`${name}-web-service`, {
    name: `${name}-web`,
    cluster: cluster.arn,
    taskDefinition: webTaskDefinition.arn,
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
        containerName: "glitchtip-web",
        containerPort: 8000,
      },
    ],
    tags,
  });

  // ECS Service for worker
  const workerService = new aws.ecs.Service(`${name}-worker-service`, {
    name: `${name}-worker`,
    cluster: cluster.arn,
    taskDefinition: workerTaskDefinition.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    networkConfiguration: {
      assignPublicIp: false,
      subnets: vpc.privateSubnetIds,
      securityGroups: [securityGroup.id],
    },
    tags,
  });

  return {
    url: pulumi.interpolate`http://${alb.loadBalancer.dnsName}:8000`,
    dsn: pulumi.interpolate`http://key@${alb.loadBalancer.dnsName}:8000/1`,
  };
}
