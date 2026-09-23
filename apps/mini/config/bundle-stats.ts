import fs from 'node:fs';
import path from 'node:path';
import type { Compiler, StatsModule } from 'webpack';

/**
 * Writes the module list of a build to `.bundle-stats/<platform>.json` (resolved path, size,
 * output files). `scripts/size-report.mjs` reads it to prove there is one
 * copy of react, react-reconciler and @tarojs/runtime, and to explain where the bytes go.
 */
export class BundleStatsPlugin {
  constructor(private readonly outFile: string) {}

  apply(compiler: Compiler): void {
    compiler.hooks.done.tap('BundleStatsPlugin', (stats) => {
      const json = stats.toJson({
        all: false,
        modules: true,
        nestedModules: true,
        chunks: true,
        ids: true,
        modulesSpace: Infinity,
        nestedModulesSpace: Infinity,
      });
      const chunkFiles = new Map<string | number, string[]>();
      for (const chunk of json.chunks ?? []) {
        if (chunk.id !== undefined) chunkFiles.set(chunk.id, [...(chunk.files ?? [])]);
      }
      // A concatenated module lists its parts under `modules`; only the outer one knows
      // its chunks, so the parts inherit them.
      const modules: { path: string; size: number; files: string[] }[] = [];
      const walk = (list: StatsModule[] | undefined, inherited: (string | number)[]) => {
        for (const module of list ?? []) {
          const chunks = module.chunks?.length ? module.chunks : inherited;
          if (module.modules) {
            walk(module.modules, chunks);
          } else if (typeof module.nameForCondition === 'string') {
            modules.push({
              path: module.nameForCondition,
              size: module.size ?? 0,
              files: chunks.flatMap((id) => chunkFiles.get(id) ?? []),
            });
          }
        }
      };
      walk(json.modules, []);
      fs.mkdirSync(path.dirname(this.outFile), { recursive: true });
      fs.writeFileSync(this.outFile, `${JSON.stringify({ modules }, null, 1)}\n`);
    });
  }
}
