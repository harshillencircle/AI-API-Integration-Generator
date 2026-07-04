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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSpec = loadSpec;
exports.parseSpecContent = parseSpecContent;
exports.slimSpec = slimSpec;
exports.formatDisplayName = formatDisplayName;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
async function loadSpec(input) {
    let content;
    let filename;
    if (input.startsWith('http://') || input.startsWith('https://')) {
        const response = await fetch(input);
        if (!response.ok) {
            throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
        }
        content = await response.text();
        const urlPath = new URL(input).pathname;
        filename = urlPath.split('/').pop() || 'spec';
    }
    else {
        const resolvedPath = path.resolve(input);
        if (!(await fs.pathExists(resolvedPath))) {
            throw new Error(`File not found: ${resolvedPath}`);
        }
        content = await fs.readFile(resolvedPath, 'utf-8');
        filename = path.basename(input);
    }
    const format = detectFormat(content);
    return { content, format, filename };
}
/**
 * Builds a SpecInfo directly from in-memory content (pasted text or an
 * uploaded file's contents) instead of reading from disk/URL — used by the
 * web app where there is no filesystem to read from.
 */
function parseSpecContent(content, filename = 'spec') {
    return { content, format: detectFormat(content), filename };
}
function detectFormat(content) {
    // Try JSON first
    try {
        const parsed = JSON.parse(content);
        if (parsed.openapi || parsed.swagger) {
            return 'openapi';
        }
        // Postman collection v2 / v2.1
        if (parsed.info?.schema?.includes('schema.getpostman.com') ||
            (parsed.info && Array.isArray(parsed.item))) {
            return 'postman';
        }
        // GraphQL introspection result
        if (parsed.data?.__schema || parsed.__schema) {
            return 'graphql-introspection';
        }
        return 'unknown';
    }
    catch {
        // Not JSON — try text/YAML markers
        if (content.match(/^openapi:|^swagger:/m))
            return 'openapi';
        if (content.match(/^type\s+Query\s*\{/m) ||
            content.match(/^type\s+Mutation\s*\{/m) ||
            content.match(/^schema\s*\{/m)) {
            return 'graphql-sdl';
        }
        return 'unknown';
    }
}
/**
 * Strips verbose fields (descriptions >80 chars, examples, extensions) from
 * JSON specs to reduce token count for providers with tight free-tier limits.
 * Preserves all structural information needed for code generation.
 */
function slimSpec(spec) {
    if (spec.format !== 'openapi' && spec.format !== 'postman')
        return spec;
    try {
        const parsed = JSON.parse(spec.content);
        const slimmed = dropVerbose(parsed);
        // Compact JSON — no whitespace — minimises token count
        return { ...spec, content: JSON.stringify(slimmed) };
    }
    catch {
        return spec;
    }
}
function dropVerbose(val) {
    if (Array.isArray(val))
        return val.map(dropVerbose);
    if (val && typeof val === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            if (k === 'example' || k === 'examples' || k.startsWith('x-'))
                continue;
            if (k === 'description' && typeof v === 'string' && v.length > 80) {
                out[k] = v.slice(0, 77) + '...';
            }
            else {
                out[k] = dropVerbose(v);
            }
        }
        return out;
    }
    return val;
}
function formatDisplayName(format) {
    const names = {
        openapi: 'OpenAPI / Swagger',
        postman: 'Postman Collection',
        'graphql-sdl': 'GraphQL SDL',
        'graphql-introspection': 'GraphQL Introspection JSON',
        unknown: 'Unknown (will attempt generation)',
    };
    return names[format];
}
//# sourceMappingURL=index.js.map