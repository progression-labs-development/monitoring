export interface PushWebhookCommit {
  id: string;
  message: string;
  timestamp: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
  added: string[];
  removed: string[];
  modified: string[];
}

export interface PushWebhookPayload {
  ref: string;
  before: string;
  after: string;
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
  };
  pusher: {
    name: string;
    email: string;
  };
  sender: {
    login: string;
  };
  commits: PushWebhookCommit[];
  installation?: {
    id: number;
  };
}
