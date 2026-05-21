export interface AudioMapping {
  target: string;
}

export interface AudioRules {
  acceptable: string[];
  mappings: Record<string, AudioMapping> & {
    default: AudioMapping;
  };
}

export interface FallbackRules {
  container: string;
  video: {
    target: string;
  };
  audio: AudioRules;
}

export interface UserSettings {
  lang: 'pt-BR' | 'en-US';
}

export type SupportDecision = boolean | string;

export interface ClientSupportRules {
  video: Record<string, SupportDecision>;
  audio: Record<string, SupportDecision>;
  containers: Record<string, SupportDecision>;
}

export interface JellyfinSupportMatrix {
  metadata: {
    version: string;
    description: string;
  };
  clients: Record<string, ClientSupportRules>;
}
