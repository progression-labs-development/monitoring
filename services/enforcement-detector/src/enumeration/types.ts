export interface LiveResource {
  cloud: "aws" | "gcp";
  type: string;
  id: string;
  name: string;
  details?: string;
}

export type Classification = "MANAGED" | "ROGUE" | "PROVIDER-MANAGED";

export interface ClassifiedResource extends LiveResource {
  classification: Classification;
}
