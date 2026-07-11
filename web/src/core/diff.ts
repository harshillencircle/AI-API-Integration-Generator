import type { EndpointModel, NormalizedSpec, ParamModel, PropertyModel, SchemaModel } from './template/model';

export type ChangeSeverity = 'breaking' | 'safe' | 'warning';

export interface FieldChange {
  kind: 'added' | 'removed' | 'changed' | 'possible-rename';
  property: string;
  renamedTo?: string;
  severity: ChangeSeverity;
  detail: string;
}

export interface SchemaChange {
  kind: 'added' | 'removed' | 'changed';
  name: string;
  severity: ChangeSeverity;
  fields: FieldChange[];
}

export interface EndpointChange {
  kind: 'added' | 'removed' | 'changed';
  operationId: string;
  method?: string;
  path?: string;
  severity: ChangeSeverity;
  details: string[];
}

export interface ChangeReport {
  endpoints: EndpointChange[];
  schemas: SchemaChange[];
  summary: { breaking: number; warning: number; safe: number };
}

/** Small edit-distance check used only to flag likely renames — never auto-applied. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function looksLikeRename(removed: PropertyModel, added: PropertyModel): boolean {
  if (removed.tsType !== added.tsType) return false;
  const distance = levenshtein(removed.name.toLowerCase(), added.name.toLowerCase());
  return distance <= 3 || removed.name.toLowerCase().includes(added.name.toLowerCase()) ||
    added.name.toLowerCase().includes(removed.name.toLowerCase());
}

function diffProperties(oldProps: PropertyModel[], newProps: PropertyModel[]): FieldChange[] {
  const oldMap = new Map(oldProps.map((p) => [p.name, p]));
  const newMap = new Map(newProps.map((p) => [p.name, p]));
  const changes: FieldChange[] = [];

  const removedOnly: PropertyModel[] = [];
  const addedOnly: PropertyModel[] = [];

  for (const [name, oldProp] of oldMap) {
    const newProp = newMap.get(name);
    if (!newProp) {
      removedOnly.push(oldProp);
      continue;
    }
    if (oldProp.tsType !== newProp.tsType) {
      changes.push({
        kind: 'changed',
        property: name,
        severity: 'breaking',
        detail: `type changed from \`${oldProp.tsType}\` to \`${newProp.tsType}\``,
      });
    } else if (!oldProp.required && newProp.required) {
      changes.push({
        kind: 'changed',
        property: name,
        severity: 'breaking',
        detail: 'became required',
      });
    } else if (oldProp.required && !newProp.required) {
      changes.push({
        kind: 'changed',
        property: name,
        severity: 'safe',
        detail: 'became optional',
      });
    }
  }

  for (const [name, newProp] of newMap) {
    if (!oldMap.has(name)) addedOnly.push(newProp);
  }

  // Pair up removed/added properties that look like renames instead of reporting them separately.
  const pairedAdded = new Set<string>();
  for (const removed of removedOnly) {
    const match = addedOnly.find((a) => !pairedAdded.has(a.name) && looksLikeRename(removed, a));
    if (match) {
      pairedAdded.add(match.name);
      changes.push({
        kind: 'possible-rename',
        property: removed.name,
        renamedTo: match.name,
        severity: 'warning',
        detail: `possibly renamed to \`${match.name}\` (same type \`${removed.tsType}\`) — verify before relying on this`,
      });
    } else {
      changes.push({
        kind: 'removed',
        property: removed.name,
        severity: 'breaking',
        detail: 'field removed',
      });
    }
  }

  for (const added of addedOnly) {
    if (pairedAdded.has(added.name)) continue;
    changes.push({
      kind: 'added',
      property: added.name,
      severity: added.required ? 'breaking' : 'safe',
      detail: added.required ? 'new required field' : 'new optional field',
    });
  }

  return changes;
}

function diffSchemas(oldSchemas: Map<string, SchemaModel>, newSchemas: Map<string, SchemaModel>): SchemaChange[] {
  const changes: SchemaChange[] = [];

  for (const [name, oldSchema] of oldSchemas) {
    const newSchema = newSchemas.get(name);
    if (!newSchema) {
      changes.push({ kind: 'removed', name, severity: 'breaking', fields: [] });
      continue;
    }
    if (oldSchema.kind !== newSchema.kind) {
      changes.push({
        kind: 'changed',
        name,
        severity: 'breaking',
        fields: [{ kind: 'changed', property: '(schema kind)', severity: 'breaking', detail: `changed from ${oldSchema.kind} to ${newSchema.kind}` }],
      });
      continue;
    }
    const fields = diffProperties(oldSchema.properties ?? [], newSchema.properties ?? []);
    if (fields.length) {
      const severity: ChangeSeverity = fields.some((f) => f.severity === 'breaking')
        ? 'breaking'
        : fields.some((f) => f.severity === 'warning')
          ? 'warning'
          : 'safe';
      changes.push({ kind: 'changed', name, severity, fields });
    }
  }

  for (const [name] of newSchemas) {
    if (!oldSchemas.has(name)) {
      changes.push({ kind: 'added', name, severity: 'safe', fields: [] });
    }
  }

  return changes;
}

function diffParams(oldParams: ParamModel[], newParams: ParamModel[], label: string): string[] {
  const oldMap = new Map(oldParams.map((p) => [p.name, p]));
  const newMap = new Map(newParams.map((p) => [p.name, p]));
  const details: string[] = [];

  for (const [name, oldParam] of oldMap) {
    const newParam = newMap.get(name);
    if (!newParam) {
      details.push(`${label} param \`${name}\` removed`);
    } else if (oldParam.tsType !== newParam.tsType) {
      details.push(`${label} param \`${name}\` type changed from \`${oldParam.tsType}\` to \`${newParam.tsType}\``);
    } else if (!oldParam.required && newParam.required) {
      details.push(`${label} param \`${name}\` became required`);
    }
  }
  for (const [name, newParam] of newMap) {
    if (!oldMap.has(name) && newParam.required) {
      details.push(`${label} param \`${name}\` added and required`);
    }
  }

  return details;
}

function endpointSeverity(details: string[]): ChangeSeverity {
  const breakingMarkers = ['removed', 'became required', 'added and required', 'type changed'];
  return details.some((d) => breakingMarkers.some((m) => d.includes(m))) ? 'breaking' : 'safe';
}

function diffEndpoints(oldEndpoints: EndpointModel[], newEndpoints: EndpointModel[]): EndpointChange[] {
  const oldMap = new Map(oldEndpoints.map((e) => [e.operationId, e]));
  const newMap = new Map(newEndpoints.map((e) => [e.operationId, e]));
  const changes: EndpointChange[] = [];

  for (const [operationId, oldEp] of oldMap) {
    const newEp = newMap.get(operationId);
    if (!newEp) {
      changes.push({
        kind: 'removed',
        operationId,
        method: oldEp.method,
        path: oldEp.path,
        severity: 'breaking',
        details: [`${oldEp.method.toUpperCase()} ${oldEp.path || '(graphql)'} removed`],
      });
      continue;
    }

    const details: string[] = [];
    if (oldEp.method !== newEp.method) details.push(`method changed from ${oldEp.method.toUpperCase()} to ${newEp.method.toUpperCase()}`);
    if (oldEp.path !== newEp.path) details.push(`path changed from \`${oldEp.path}\` to \`${newEp.path}\``);
    if (oldEp.responseType !== newEp.responseType) {
      details.push(`response type changed from \`${oldEp.responseType}\` to \`${newEp.responseType}\``);
    }
    if (oldEp.requestBodyType !== newEp.requestBodyType) {
      if (!oldEp.requestBodyType && newEp.requestBodyType) details.push('request body added');
      else if (oldEp.requestBodyType && !newEp.requestBodyType) details.push('request body removed');
      else details.push(`request body type changed from \`${oldEp.requestBodyType}\` to \`${newEp.requestBodyType}\``);
    }
    details.push(...diffParams(oldEp.pathParams, newEp.pathParams, 'path'));
    details.push(...diffParams(oldEp.queryParams, newEp.queryParams, 'query'));

    if (details.length) {
      changes.push({
        kind: 'changed',
        operationId,
        method: newEp.method,
        path: newEp.path,
        severity: endpointSeverity(details),
        details,
      });
    }
  }

  for (const [operationId, newEp] of newMap) {
    if (!oldMap.has(operationId)) {
      changes.push({
        kind: 'added',
        operationId,
        method: newEp.method,
        path: newEp.path,
        severity: 'safe',
        details: [`${newEp.method.toUpperCase()} ${newEp.path || '(graphql)'} added`],
      });
    }
  }

  return changes;
}

/**
 * Compares two normalized specs (old vs new — same format, both already run through the
 * same normalizer) and reports what changed. Endpoints match by operationId, schemas by
 * name; a removed+added property pair with the same type and a close name is flagged as
 * a possible rename ('warning'), never silently merged or auto-applied.
 */
export function diffSpecs(oldSpec: NormalizedSpec, newSpec: NormalizedSpec): ChangeReport {
  const endpoints = diffEndpoints(oldSpec.endpoints, newSpec.endpoints);
  const schemas = diffSchemas(oldSpec.schemas, newSpec.schemas);

  let breaking = 0;
  let warning = 0;
  let safe = 0;
  for (const e of endpoints) {
    if (e.severity === 'breaking') breaking++;
    else if (e.severity === 'warning') warning++;
    else safe++;
  }
  for (const s of schemas) {
    if (s.severity === 'breaking') breaking++;
    else if (s.severity === 'warning') warning++;
    else safe++;
  }

  return { endpoints, schemas, summary: { breaking, warning, safe } };
}
