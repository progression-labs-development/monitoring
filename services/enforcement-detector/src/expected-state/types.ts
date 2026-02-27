export interface ExclusionPattern {
  type: string;
  description: string;
  match: "name-prefix" | "name-exact" | "id-contains" | "details-contains";
  value: string;
}

export interface ExpectedResource {
  type: string;
  id: string;
  name: string;
  urn: string;
  pulumiType: string;
}

export interface StackDeclaration {
  name: string;
  cloud: "aws" | "gcp" | "azure";
  account: string;
  region: string;
  resources: ExpectedResource[];
}

export interface ExpectedState {
  version: number;
  generatedAt: string;
  gitSha?: string;
  stacks: StackDeclaration[];
  exclusions: {
    aws: ExclusionPattern[];
    gcp: ExclusionPattern[];
    azure: ExclusionPattern[];
  };
}
