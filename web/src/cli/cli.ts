#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { generateIntegration } from './pipeline';
import { logger } from './logger';

const program = new Command();

program
  .name('apigen')
  .description(
    'Template-based API integration generator — turns OpenAPI/Swagger specs,\n' +
      'Postman Collections, or GraphQL schemas into TypeScript types, Zod schemas,\n' +
      'Axios services, React Query hooks, and MSW mocks.\n' +
      'Fully deterministic: no AI, no API key, no network calls.'
  )
  .version('1.0.0');

program
  .command('generate', { isDefault: true })
  .description('Generate TypeScript integration code from an OpenAPI/Swagger spec, Postman Collection, or GraphQL schema')
  .requiredOption(
    '-i, --input <path>',
    'Path or URL to the spec: OpenAPI/Swagger, Postman Collection, or GraphQL (SDL or introspection JSON)'
  )
  .requiredOption('-o, --output <dir>', 'Output directory for the generated files')
  .option('-b, --base-url <url>', 'Override the base URL from the spec')
  .action(async (opts) => {
    console.log(chalk.bold.cyan('\n  AI API Integration Generator') + chalk.dim('  v1.0.0\n'));

    try {
      const result = await generateIntegration({
        input: opts.input,
        output: opts.output,
        baseUrl: opts.baseUrl,
      });

      console.log('\n' + chalk.bold.green('  Generation complete!\n'));
      console.log(chalk.bold('  Files generated:'));
      for (const file of result.files) {
        const size = (file.content.length / 1024).toFixed(1);
        console.log(`    ${chalk.dim('•')} ${chalk.cyan(file.path)} ${chalk.dim(`(${size} KB)`)}`);
      }

      console.log(`\n  ${chalk.bold('Output:')}  ${chalk.underline(result.outputDir)}`);
      console.log(`  ${chalk.bold('Time:')}    ${(result.duration / 1000).toFixed(1)}s`);
      console.log('\n' + chalk.dim('  Install peer deps in your project:'));
      console.log(chalk.dim('    npm install axios zod @tanstack/react-query msw\n'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(message);
      process.exit(1);
    }
  });

program.parse(process.argv);
