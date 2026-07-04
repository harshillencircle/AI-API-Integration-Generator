export type ProviderName = 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'ollama';
export interface AIProvider {
    streamGenerate(systemPrompt: string, userPrompt: string, model: string): AsyncIterable<string>;
    maxTokens: number;
}
export interface ProviderConfig {
    provider: AIProvider;
    defaultModel: string;
    providerName: ProviderName;
    displayName: string;
    chunked: boolean;
}
/**
 * Returns providers ordered by preference.
 *
 * If `apiKeyOverride` is supplied (e.g. a key the caller pasted into the web
 * UI for a single request), it is used directly and process.env is never
 * consulted — this keeps multi-tenant/serverless callers isolated from the
 * server's own .env keys.
 */
export declare function getAvailableProviders(providerOverride?: string, apiKeyOverride?: string): ProviderConfig[];
//# sourceMappingURL=provider.d.ts.map