class MockRepository {
  name: string;
  repositoryId: string;

  constructor(name: string, args: Record<string, unknown>) {
    this.name = name;
    this.repositoryId = args.repositoryId as string;
  }
}

export const artifactregistry = {
  Repository: MockRepository,
};
