export interface GenerationOptions {
  input: string;
  output: string;
  baseUrl?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GenerationResult {
  files: GeneratedFile[];
  outputDir: string;
  duration: number;
}
