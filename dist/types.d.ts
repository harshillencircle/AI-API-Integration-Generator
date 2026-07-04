export interface GenerationOptions {
    input: string;
    output: string;
    baseUrl?: string;
    providerName?: string;
    model?: string;
    verbose?: boolean;
}
export interface GeneratedFile {
    path: string;
    content: string;
}
export interface GenerationResult {
    files: GeneratedFile[];
    outputDir: string;
    duration: number;
    provider?: string;
}
//# sourceMappingURL=types.d.ts.map