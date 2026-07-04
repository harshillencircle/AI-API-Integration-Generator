import type { SpecInfo } from '../parsers/index';
import type { GeneratedFile } from '../types';
export declare function buildSystemPrompt(): string;
export declare function buildGenerationPrompt(spec: SpecInfo, baseUrl?: string): string;
export declare function buildChunk1Prompt(spec: SpecInfo, baseUrl?: string): string;
export declare function buildChunk2Prompt(spec: SpecInfo, typesContent: string, baseUrl?: string): string;
export declare function buildChunk3Prompt(resourceSignatures: string, allFilePaths: string, baseUrl?: string): string;
export declare function buildSingleResourcePrompt(resourceName: string, resourceSignatures: string, typesContent: string, baseUrl?: string): string;
export declare function parseGeneratedFiles(response: string): Array<{
    path: string;
    content: string;
}>;
export declare function extractServiceSignatures(serviceFiles: GeneratedFile[]): string;
//# sourceMappingURL=prompts.d.ts.map