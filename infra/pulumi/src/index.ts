import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { createSignoz } from "./components/signoz";
import { createGlitchTip } from "./components/glitchtip";

// Configuration
const config = new pulumi.Config();
const domain = config.get("domain") || "monitoring.example.com";

// Get current stack name (dev, stag, prod)
const stack = pulumi.getStack();

// Common tags
const tags = {
  Project: "monitoring",
  Environment: stack,
  ManagedBy: "pulumi",
};

// Create VPC for observability services
const vpc = new awsx.ec2.Vpc("monitoring-vpc", {
  cidrBlock: "10.0.0.0/16",
  numberOfAvailabilityZones: 2,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: { ...tags, Name: `monitoring-vpc-${stack}` },
});

// Create ECS Cluster
const cluster = new aws.ecs.Cluster("monitoring-cluster", {
  name: `monitoring-${stack}`,
  settings: [
    {
      name: "containerInsights",
      value: "enabled",
    },
  ],
  tags,
});

// Create Application Load Balancer
const alb = new awsx.lb.ApplicationLoadBalancer("monitoring-alb", {
  name: `monitoring-alb-${stack}`,
  subnetIds: vpc.publicSubnetIds,
  tags,
});

// Create SigNoz services
const signoz = createSignoz({
  cluster,
  vpc,
  alb,
  tags,
  stack,
});

// Create GlitchTip services
const glitchtip = createGlitchTip({
  cluster,
  vpc,
  alb,
  tags,
  stack,
});

// Exports
export const vpcId = vpc.vpcId;
export const clusterArn = cluster.arn;
export const albDnsName = alb.loadBalancer.dnsName;
export const signozUrl = signoz.url;
export const glitchtipUrl = glitchtip.url;
export const otelEndpoint = signoz.otelEndpoint;
