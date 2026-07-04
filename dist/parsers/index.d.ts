export type SpecFormat = 'openapi' | 'postman' | 'graphql-sdl' | 'graphql-introspection' | 'unknown';
export interface SpecInfo {
    content: string;
    format: SpecFormat;
    filename: string;
}
export declare function loadSpec(input: string): Promise<SpecInfo>;
/**
 * Builds a SpecInfo directly from in-memory content (pasted text or an
 * uploaded file's contents) instead of reading from disk/URL — used by the
 * web app where there is no filesystem to read from.
 */
export declare function parseSpecContent(content: string, filename?: string): SpecInfo;
/**
 * Strips verbose fields (descriptions >80 chars, examples, extensions) from
 * JSON specs to reduce token count for providers with tight free-tier limits.
 * Preserves all structural information needed for code generation.
 */
export declare function slimSpec(spec: SpecInfo): SpecInfo;
export declare function formatDisplayName(format: SpecFormat): string;
//# sourceMappingURL=index.d.ts.map