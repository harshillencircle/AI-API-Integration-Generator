import { loadSpec } from '../parsers/index';
import type { GenerationOptions, GenerationResult, GeneratedFile } from '../types';
export interface RunGenerationOptions {
    baseUrl?: string;
    providerName?: string;
    model?: string;
    /** Per-request API key (e.g. pasted into the web UI). Bypasses process.env
     *  entirely when set, so a serverless request never touches server keys. */
    apiKey?: string;
    verbose?: boolean;
}
export interface RunGenerationResult {
    files: GeneratedFile[];
    providerName: string;
    duration: number;
}
/**
 * Runs spec → AI → parsed files, with auto-fallback across providers.
 * Does not touch the filesystem — callers decide what to do with the result
 * (CLI writes to disk, the web app returns it as JSON).
 */
export declare function runGeneration(rawSpec: Awaited<ReturnType<typeof loadSpec>>, options: RunGenerationOptions): Promise<RunGenerationResult>;
export declare function generateIntegration(options: GenerationOptions): Promise<GenerationResult>;
//# sourceMappingURL=pipeline.d.ts.map