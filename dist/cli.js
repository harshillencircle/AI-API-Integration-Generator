#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const pipeline_1 = require("./generators/pipeline");
const logger_1 = require("./utils/logger");
const program = new commander_1.Command();
program
    .name('apigen')
    .description('AI-powered API integration generator — turns OpenAPI / Postman / GraphQL specs\n' +
    'into TypeScript types, Axios services, React Query hooks, and Zod schemas.')
    .version('1.0.0');
program
    .command('generate', { isDefault: true })
    .description('Generate TypeScript integration code from an API spec')
    .requiredOption('-i, --input <path>', 'Path or URL to the API spec (OpenAPI JSON/YAML, Postman Collection, GraphQL SDL)')
    .requiredOption('-o, --output <dir>', 'Output directory for the generated files')
    .option('-b, --base-url <url>', 'Override the base URL from the spec')
    .option('-p, --provider <name>', 'AI provider: anthropic | gemini | groq | ollama  (default: env PROVIDER or "anthropic")')
    .option('-m, --model <model>', 'Override the default model for the chosen provider')
    .option('-v, --verbose', 'Show detailed progress and raw output on errors')
    .action(async (opts) => {
    console.log(chalk_1.default.bold.cyan('\n  AI API Integration Generator') + chalk_1.default.dim('  v1.0.0\n'));
    try {
        const result = await (0, pipeline_1.generateIntegration)({
            input: opts.input,
            output: opts.output,
            baseUrl: opts.baseUrl,
            providerName: opts.provider,
            model: opts.model,
            verbose: opts.verbose,
        });
        console.log('\n' + chalk_1.default.bold.green('  Generation complete!\n'));
        console.log(chalk_1.default.bold('  Files generated:'));
        for (const file of result.files) {
            const size = (file.content.length / 1024).toFixed(1);
            console.log(`    ${chalk_1.default.dim('•')} ${chalk_1.default.cyan(file.path)} ${chalk_1.default.dim(`(${size} KB)`)}`);
        }
        console.log(`\n  ${chalk_1.default.bold('Output:')}  ${chalk_1.default.underline(result.outputDir)}`);
        console.log(`  ${chalk_1.default.bold('Time:')}    ${(result.duration / 1000).toFixed(1)}s`);
        console.log('\n' + chalk_1.default.dim('  Install peer deps in your project:'));
        console.log(chalk_1.default.dim('    npm install axios zod @tanstack/react-query\n'));
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error(message);
        if (message.includes('GEMINI_API_KEY')) {
            console.log('\n' + chalk_1.default.yellow('  Get a free Gemini key:'));
            console.log('    https://aistudio.google.com/app/apikey\n');
        }
        else if (message.includes('GROQ_API_KEY')) {
            console.log('\n' + chalk_1.default.yellow('  Get a free Groq key:'));
            console.log('    https://console.groq.com\n');
        }
        else if (message.includes('ANTHROPIC_API_KEY')) {
            console.log('\n' + chalk_1.default.yellow('  Or switch to a free provider:'));
            console.log('    PROVIDER=gemini  →  https://aistudio.google.com/app/apikey');
            console.log('    PROVIDER=groq    →  https://console.groq.com\n');
        }
        process.exit(1);
    }
});
program.parse(process.argv);
//# sourceMappingURL=cli.js.map