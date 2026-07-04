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
exports.getAvailableProviders = getAvailableProviders;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// ── Anthropic ────────────────────────────────────────────────────────────────
class AnthropicProvider {
    maxTokens = 64000;
    client;
    constructor(apiKey) { this.client = new sdk_1.default({ apiKey }); }
    async *streamGenerate(system, user, model) {
        const stream = await this.client.messages.stream({
            model, max_tokens: this.maxTokens, thinking: { type: 'adaptive' },
            system, messages: [{ role: 'user', content: user }],
        });
        for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                yield event.delta.text;
            }
        }
    }
}
// ── Google Gemini (native SDK) ────────────────────────────────────────────────
class GeminiProvider {
    maxTokens = 8192;
    genai;
    constructor(apiKey) { this.genai = new generative_ai_1.GoogleGenerativeAI(apiKey); }
    async *streamGenerate(system, user, model) {
        const genModel = this.genai.getGenerativeModel({
            model, systemInstruction: system,
            generationConfig: { maxOutputTokens: this.maxTokens },
        });
        const result = await genModel.generateContentStream(user);
        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text)
                yield text;
        }
    }
}
// ── OpenAI-compatible (Groq, OpenRouter, Ollama) ──────────────────────────────
class OpenAICompatibleProvider {
    maxTokens;
    client;
    constructor(apiKey, baseURL, maxTokens, headers = {}) {
        this.client = new openai_1.default({ apiKey, baseURL, defaultHeaders: headers });
        this.maxTokens = maxTokens;
    }
    async *streamGenerate(system, user, model) {
        const stream = await this.client.chat.completions.create({
            model, max_tokens: this.maxTokens, stream: true,
            messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        });
        for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content;
            if (text)
                yield text;
        }
    }
}
function buildConfig(name, apiKey) {
    switch (name) {
        case 'anthropic':
            return {
                provider: new AnthropicProvider(apiKey ?? process.env.ANTHROPIC_API_KEY),
                defaultModel: 'claude-opus-4-8', providerName: 'anthropic',
                displayName: 'Anthropic (claude-opus-4-8)', chunked: false,
            };
        case 'openrouter':
            return {
                // llama-3.3-70b is free, large, and good at code
                provider: new OpenAICompatibleProvider(apiKey ?? process.env.OPENROUTER_API_KEY, 'https://openrouter.ai/api/v1', 8000, { 'HTTP-Referer': 'https://github.com/ai-api-integration-generator' }),
                defaultModel: 'meta-llama/llama-3.3-70b-instruct:free', providerName: 'openrouter',
                displayName: 'OpenRouter (llama-3.3-70b — FREE)', chunked: true,
            };
        case 'groq':
            // gpt-oss-20b on Groq: keep max_tokens low to stay under per-request limit
            return {
                provider: new OpenAICompatibleProvider(apiKey ?? process.env.GROQ_API_KEY, 'https://api.groq.com/openai/v1', 3000),
                defaultModel: 'openai/gpt-oss-20b', providerName: 'groq',
                displayName: 'Groq (gpt-oss-20b — FREE)', chunked: true,
            };
        case 'gemini':
            return {
                provider: new GeminiProvider(apiKey ?? process.env.GEMINI_API_KEY),
                defaultModel: 'gemini-2.0-flash', providerName: 'gemini',
                displayName: 'Google Gemini (gemini-2.0-flash — FREE)', chunked: true,
            };
        case 'ollama': {
            const baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
            const model = process.env.OLLAMA_MODEL || 'llama3.1';
            return {
                provider: new OpenAICompatibleProvider('ollama', baseURL, 8000),
                defaultModel: model, providerName: 'ollama',
                displayName: `Ollama (${model} — local/FREE)`, chunked: true,
            };
        }
    }
}
/**
 * Returns providers ordered by preference.
 *
 * If `apiKeyOverride` is supplied (e.g. a key the caller pasted into the web
 * UI for a single request), it is used directly and process.env is never
 * consulted — this keeps multi-tenant/serverless callers isolated from the
 * server's own .env keys.
 */
function getAvailableProviders(providerOverride, apiKeyOverride) {
    if (providerOverride && apiKeyOverride) {
        const name = providerOverride.toLowerCase();
        return [buildConfig(name, apiKeyOverride)];
    }
    if (providerOverride) {
        const name = providerOverride.toLowerCase();
        const keyNeeded = {
            anthropic: process.env.ANTHROPIC_API_KEY,
            groq: process.env.GROQ_API_KEY,
            gemini: process.env.GEMINI_API_KEY,
            openrouter: process.env.OPENROUTER_API_KEY,
        };
        if (name in keyNeeded && !keyNeeded[name]) {
            throw new Error(`"${name}" selected but ${name.toUpperCase()}_API_KEY is missing from .env`);
        }
        return [buildConfig(name)];
    }
    const order = ['anthropic', 'openrouter', 'groq', 'gemini', 'ollama'];
    const hasKey = {
        anthropic: !!process.env.ANTHROPIC_API_KEY,
        openrouter: !!process.env.OPENROUTER_API_KEY,
        groq: !!process.env.GROQ_API_KEY,
        gemini: !!process.env.GEMINI_API_KEY,
        ollama: !!(process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL),
    };
    const available = order.filter((n) => hasKey[n]).map((n) => buildConfig(n));
    if (available.length === 0) {
        throw new Error('No API keys in .env. Add at least one:\n\n' +
            '  OPENROUTER_API_KEY=...  FREE → openrouter.ai\n' +
            '  GROQ_API_KEY=...        FREE → console.groq.com\n' +
            '  GEMINI_API_KEY=...      FREE → aistudio.google.com\n' +
            '  ANTHROPIC_API_KEY=...   PAID → console.anthropic.com\n');
    }
    return available;
}
//# sourceMappingURL=provider.js.map