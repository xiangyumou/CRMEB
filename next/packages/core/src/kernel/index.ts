/**
 * The domain kernel: the primitives every domain is built from.
 *
 * Orchestrator-owned after the `rewrite-p0-freeze` tag — a stream that needs
 * something here files a CR rather than adding to it, because ten streams copy
 * these patterns and a fork of `Money` or of `withTx` would be a disaster.
 */
export * from './clock';
export * from './context';
export * from './errors';
export * from './ids';
export * from './logger';
export * from './money';
export * from './queue';
export * from './rate-limit';
export * from './storage';
export * from './tx';
export {
  listUnresolvedJobs,
  recordFailedJob,
  resolveFailedJob,
  type FailedJobInput,
} from './failed-jobs.repo';
export {
  allConfigGroups,
  createConfigService,
  defineConfigGroup,
  getConfigGroup,
  memoryConfigCache,
  pruneUnknownKeys,
  resetConfigRegistry,
  type ConfigCache,
  type ConfigFieldType,
  type ConfigFieldUi,
  type ConfigGroupDef,
  type ConfigService,
} from './config-registry';
