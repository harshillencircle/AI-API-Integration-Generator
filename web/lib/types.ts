export type SpecFormat =
  | 'openapi'
  | 'postman'
  | 'graphql-sdl'
  | 'graphql-introspection'
  | 'unknown';

export interface SpecInfo {
  content: string;
  format: SpecFormat;
  filename: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerateRequest {
  specContent?: string;
  specUrl?: string;
  filename?: string;
  baseUrl?: string;
}

export interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
}
