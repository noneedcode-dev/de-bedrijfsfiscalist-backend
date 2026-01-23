/**
 * Scripted Supabase Mock Helper
 * 
 * Provides a table-aware, operation-aware mock for Supabase client
 * that returns scripted results in sequence for multi-query test flows.
 * 
 * Usage:
 * const script = {
 *   documents: [
 *     { data: { id: '1', name: 'doc1' }, error: null },
 *     { data: { id: '1', name: 'updated' }, error: null },
 *   ],
 *   document_folders: [
 *     { data: { id: 'f1', name: 'folder1' }, error: null },
 *   ],
 *   'rpc:claim_jobs': [
 *     { data: { id: 'job1' }, error: null },
 *   ],
 * };
 * const mockClient = createScriptedSupabaseClient(script);
 */

export interface ScriptedResult {
  data: any;
  error: any;
  count?: number;
}

export interface ScriptedResults {
  [tableOrRpc: string]: ScriptedResult[];
}

class ScriptedQueryBuilder {
  private table: string;
  private script: ScriptedResults;

  constructor(table: string, script: ScriptedResults) {
    this.table = table;
    this.script = script;
  }

  // Chainable query builder methods
  select(columns?: string): this {
    return this;
  }

  insert(data: any): this {
    return this;
  }

  update(data: any): this {
    return this;
  }

  delete(): this {
    return this;
  }

  upsert(data: any): this {
    return this;
  }

  eq(column: string, value: any): this {
    return this;
  }

  neq(column: string, value: any): this {
    return this;
  }

  gt(column: string, value: any): this {
    return this;
  }

  gte(column: string, value: any): this {
    return this;
  }

  lt(column: string, value: any): this {
    return this;
  }

  lte(column: string, value: any): this {
    return this;
  }

  like(column: string, pattern: string): this {
    return this;
  }

  ilike(column: string, pattern: string): this {
    return this;
  }

  is(column: string, value: any): this {
    return this;
  }

  in(column: string, values: any[]): this {
    return this;
  }

  contains(column: string, value: any): this {
    return this;
  }

  containedBy(column: string, value: any): this {
    return this;
  }

  match(query: Record<string, any>): this {
    return this;
  }

  not(column: string, operator: string, value: any): this {
    return this;
  }

  or(filters: string): this {
    return this;
  }

  filter(column: string, operator: string, value: any): this {
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    return this;
  }

  limit(count: number): this {
    return this;
  }

  range(from: number, to: number): this {
    return this;
  }

  // Terminal methods - consume next result from script queue
  private getNextResult(): ScriptedResult {
    const queue = this.script[this.table];
    if (!queue || queue.length === 0) {
      // Default: empty array for list queries
      return { data: [], error: null };
    }
    return queue.shift()!;
  }

  // Make builder thenable for direct await
then(resolve?: any, reject?: any): Promise<any> {
  const result = this.getNextResult();
  // ❌ Supabase reject etmez — hep resolve eder
  // ✅ Bu yüzden reject yolunu kullanmıyoruz
  return Promise.resolve(result).then(resolve, reject);
}

  single(): Promise<ScriptedResult> {
    const result = this.getNextResult();
    // If data is array, return first item or null
    if (Array.isArray(result.data)) {
      return Promise.resolve({
        data: result.data.length > 0 ? result.data[0] : null,
        error: result.error,
        count: result.count,
      });
    }
    return Promise.resolve(result);
  }

  maybeSingle(): Promise<ScriptedResult> {
    return this.single();
  }
}

export function createScriptedSupabaseClient(script: ScriptedResults) {
  return {
    from(table: string) {
      return new ScriptedQueryBuilder(table, script);
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error: null }),
    },
    rpc: async (fnName: string, params?: any) => {
      // For RPC calls, use a special 'rpc:fnName' key in script
      const key = `rpc:${fnName}`;
      const queue = script[key];
      if (!queue || queue.length === 0) {
        return { data: null, error: null };
      }
      return queue.shift()!;
    },
  };
}
