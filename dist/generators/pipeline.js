"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runGeneration = runGeneration;
exports.generateIntegration = generateIntegration;
const chalk_1 = __importDefault(require("chalk"));
const path = __importStar(require("path"));
const provider_1 = require("../ai/provider");
const prompts_1 = require("../ai/prompts");
const index_1 = require("../parsers/index");
const file_writer_1 = require("../writers/file-writer");
const logger_1 = require("../utils/logger");
const FREE_PROVIDERS = new Set(['gemini', 'groq', 'openrouter', 'ollama']);
// ── Streaming helper ──────────────────────────────────────────────────────────
async function stream(provider, system, user, model, label) {
    console.log(chalk_1.default.dim('─'.repeat(60)));
    process.stdout.write(chalk_1.default.dim(`  [${label}] `));
    let full = '';
    const seenFiles = new Set();
    for await (const text of provider.streamGenerate(system, user, model)) {
        full += text;
        const pat = /<generated-file path="([^"]+)">/g;
        let m;
        while ((m = pat.exec(full)) !== null) {
            if (!seenFiles.has(m[1])) {
                seenFiles.add(m[1]);
                process.stdout.write(`\n  ${chalk_1.default.green('→')} ${chalk_1.default.bold(m[1])}`);
            }
        }
        if (text.includes('</generated-file>'))
            process.stdout.write(` ${chalk_1.default.dim('✓')}`);
    }
    process.stdout.write('\n');
    return full;
}
// ── Single-call generation (Anthropic — no token limits) ─────────────────────
async function generateSingle(cfg, spec, baseUrl) {
    const r = await stream(cfg.provider, (0, prompts_1.buildSystemPrompt)(), (0, prompts_1.buildGenerationPrompt)(spec, baseUrl), cfg.defaultModel, 'generating all files');
    return (0, prompts_1.parseGeneratedFiles)(r);
}
// ── 3-pass chunked generation (free providers) ────────────────────────────────
async function generateChunked(cfg, model, spec, baseUrl) {
    const sys = (0, prompts_1.buildSystemPrompt)();
    // ── Pass 1: types.ts + schemas.ts ──────────────────────────────────────────
    const r1 = await stream(cfg.provider, sys, (0, prompts_1.buildChunk1Prompt)(spec, baseUrl), model, 'pass 1/3 — types & schemas');
    const files1 = (0, prompts_1.parseGeneratedFiles)(r1);
    if (files1.length === 0)
        throw new Error('Pass 1 returned no files.');
    // ── Pass 2: client.ts + {resource}/service.ts ─────────────────────────────
    const typesContent = files1.find((f) => f.path === 'types.ts')?.content ?? '';
    const r2 = await stream(cfg.provider, sys, (0, prompts_1.buildChunk2Prompt)(spec, typesContent, baseUrl), model, 'pass 2/3 — client & services');
    const files2 = (0, prompts_1.parseGeneratedFiles)(r2);
    if (files2.length === 0)
        throw new Error('Pass 2 returned no files.');
    // ── Pass 3: {resource}/hooks.ts + index.ts + README.md ───────────────────
    const serviceFiles = files2.filter((f) => f.path.endsWith('service.ts'));
    const signatures = (0, prompts_1.extractServiceSignatures)(serviceFiles);
    // Build the full list of export paths for the barrel index
    const allPaths = [
        ...files1.map((f) => f.path),
        ...files2.map((f) => f.path),
        // placeholder hook paths — model will derive these from the signatures
    ].join('\n');
    const r3 = await stream(cfg.provider, sys, (0, prompts_1.buildChunk3Prompt)(signatures, allPaths, baseUrl), model, 'pass 3/3 — hooks & docs');
    const files3 = (0, prompts_1.parseGeneratedFiles)(r3);
    if (files3.length === 0)
        throw new Error('Pass 3 returned no files.');
    // Merge all files, dedup by path (last write wins)
    const merged = new Map();
    for (const f of [...files1, ...files2, ...files3]) {
        merged.set(f.path, f);
    }
    return Array.from(merged.values());
}
/**
 * Runs spec → AI → parsed files, with auto-fallback across providers.
 * Does not touch the filesystem — callers decide what to do with the result
 * (CLI writes to disk, the web app returns it as JSON).
 */
async function runGeneration(rawSpec, options) {
    const startTime = Date.now();
    logger_1.logger.step(2, 'Detecting available providers...');
    const providers = (0, provider_1.getAvailableProviders)(options.providerName, options.apiKey);
    logger_1.logger.success(`Available: ${providers.map((p) => chalk_1.default.cyan(p.providerName)).join(chalk_1.default.dim(' → '))}`);
    let lastError = null;
    for (const cfg of providers) {
        const model = options.model ?? cfg.defaultModel;
        const spec = FREE_PROVIDERS.has(cfg.providerName) ? (0, index_1.slimSpec)(rawSpec) : rawSpec;
        if (options.verbose) {
            const raw = (rawSpec.content.length / 1024).toFixed(1);
            const slim = (spec.content.length / 1024).toFixed(1);
            logger_1.logger.dim(`  Spec: ${raw} KB${spec !== rawSpec ? ` → slimmed ${slim} KB` : ''} | mode: ${cfg.chunked ? '3-pass chunked' : 'single call'}`);
        }
        logger_1.logger.step(3, `Trying ${chalk_1.default.cyan(cfg.displayName)} — ${chalk_1.default.dim(model)}`);
        try {
            const generatedFiles = cfg.chunked
                ? await generateChunked(cfg, model, spec, options.baseUrl)
                : await generateSingle(cfg, spec, options.baseUrl);
            console.log(chalk_1.default.dim('─'.repeat(60)));
            logger_1.logger.success(`${chalk_1.default.cyan(cfg.providerName)} succeeded — ${generatedFiles.length} files`);
            return {
                files: generatedFiles,
                providerName: cfg.providerName,
                duration: Date.now() - startTime,
            };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn(`${chalk_1.default.cyan(cfg.providerName)} failed — ${chalk_1.default.dim(msg.split('\n')[0].slice(0, 100))}`);
            lastError = err instanceof Error ? err : new Error(msg);
        }
    }
    throw lastError ?? new Error('All providers failed.');
}
// ── Main entry (CLI) ──────────────────────────────────────────────────────────
async function generateIntegration(options) {
    // Step 1: Load spec
    logger_1.logger.step(1, `Loading spec: ${chalk_1.default.cyan(options.input)}`);
    const rawSpec = await (0, index_1.loadSpec)(options.input);
    logger_1.logger.success(`Format detected: ${chalk_1.default.bold((0, index_1.formatDisplayName)(rawSpec.format))}`);
    const result = await runGeneration(rawSpec, {
        baseUrl: options.baseUrl,
        providerName: options.providerName,
        model: options.model,
        verbose: options.verbose,
    });
    // Step 4: Write
    logger_1.logger.step(4, `Writing to: ${chalk_1.default.cyan(options.output)}`);
    await (0, file_writer_1.writeGeneratedFiles)(result.files, options.output);
    return {
        files: result.files,
        outputDir: path.resolve(options.output),
        duration: result.duration,
        provider: result.providerName,
    };
}
//# sourceMappingURL=pipeline.js.map