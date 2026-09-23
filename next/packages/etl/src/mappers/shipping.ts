/**
 * 运费模板 — `eb_shipping_templates` and its three child tables → the shipping
 * schema, plus the operator's edits to `eb_express`.
 *
 * | Legacy                              | New                                    |
 * | ----------------------------------- | -------------------------------------- |
 * | `eb_shipping_templates`             | `shipping_templates`                   |
 * | `eb_shipping_templates_region`      | `shipping_template_regions` + cities   |
 * | `eb_shipping_templates_free`        | `shipping_template_free_rules` + cities|
 * | `eb_shipping_templates_no_delivery` | `shipping_template_no_delivery_cities` |
 * | `eb_express`                        | `express_companies` (overrides only)   |
 *
 * A pure function: rows in, rows and a report out.
 *
 * **The `uniqid` grouping becomes rows.** Legacy repeated `(province_id,
 * city_id)` on every rule row and tied them together with a 32-character
 * string; one rule covering eight cities was eight rows that only a string
 * scan could reassemble. Here the rule is one row and the cities are a join
 * table, so the mapper groups by `uniqid` (falling back to the row's own id
 * when the column is empty, which some hand-edited installs have).
 *
 * **`city_id = 0` is the fallback rule.** Legacy wrote a single row with both
 * ids zero to mean 「默认全国」; the new schema says so with `isFallback` and a
 * partial unique index. A template with no such row gets one synthesised at
 * zero cost, because `computeFreight` needs somewhere to land and the legacy
 * calculator treated a missing default as free.
 *
 * **Cities and couriers are seed data, not migration output.** `cities` and the
 * 1101 rows of `express_companies` are seeded from the reference extract
 * (`@shop/db/seed`) with their legacy ids, so this mapper emits *overrides*
 * for the courier list — the sort order and the enable flag an operator
 * actually changed — and never the carrier catalogue itself. Every electronic
 * waybill credential column (`account`, `key`, `net_name`, `partner_*`) is
 * dropped: they are secrets, they belong to a feature that is out of scope, and
 * the new table has no column for them.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_shipping_templates`. `add_time` is unix seconds. */
export interface LegacyShippingTemplate {
  id: number;
  name: string;
  /** 1 件数, 2 重量, 3 体积. */
  type: number;
  /** 指定包邮 on/off. */
  appoint: number;
  /** 指定不送达 on/off. */
  no_delivery: number;
  sort: number;
  add_time: number;
}

/** `eb_shipping_templates_region`. Decimals arrive as strings from MySQL. */
export interface LegacyShippingRegion {
  id: number;
  province_id: number;
  temp_id: number;
  city_id: number;
  first: string;
  first_price: string;
  continue: string;
  continue_price: string;
  type: number;
  uniqid: string;
}

/** `eb_shipping_templates_free`. */
export interface LegacyShippingFree {
  id: number;
  province_id: number;
  temp_id: number;
  city_id: number;
  /** 包邮件数 in the template's charge unit. */
  number: string;
  /** 包邮金额. */
  price: string;
  type: number;
  uniqid: string;
}

/** `eb_shipping_templates_no_delivery`. */
export interface LegacyShippingNoDelivery {
  id: number;
  province_id: number;
  temp_id: number;
  city_id: number;
  uniqid: string;
}

/** `eb_express`, of which only four columns survive. */
export interface LegacyExpress {
  id: number;
  code: string;
  name: string;
  sort: number;
  /** 是否显示 — what the 发货 picker filtered on. */
  is_show: number;
  status: number;
}

// ---------------------------------------------------------------------------
// new row shapes
// ---------------------------------------------------------------------------

export type ChargeMode = 'quantity' | 'weight' | 'volume';

export interface ShippingTemplateRow {
  id: number;
  name: string;
  chargeMode: ChargeMode;
  hasFreeRules: boolean;
  hasNoDeliveryRules: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: null;
}

export interface ShippingRegionRow {
  /** Stable within one migration run; the real id comes from the sequence. */
  key: string;
  templateId: number;
  isFallback: boolean;
  firstUnit: string;
  firstPrice: string;
  additionalUnit: string;
  additionalPrice: string;
  cityIds: number[];
}

export interface ShippingFreeRuleRow {
  key: string;
  templateId: number;
  minUnits: string | null;
  minAmount: string | null;
  cityIds: number[];
}

export interface ShippingNoDeliveryRow {
  templateId: number;
  cityId: number;
}

/** Only the columns an operator can change; the rest of the row is seeded. */
export interface ExpressCompanyOverrideRow {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  isEnabled: boolean;
}

export interface ShippingMigrationReport {
  templates: number;
  regions: number;
  /** Templates that had no `city_id = 0` row and were given a zero-cost fallback. */
  templatesFallbackSynthesised: number;
  /** Templates that had more than one fallback row; the first won. */
  templatesFallbackDuplicated: number;
  freeRules: number;
  /** Free rules with neither a quantity nor an amount threshold. Dropped. */
  freeRulesWithoutThreshold: number;
  noDeliveryCities: number;
  /** Child rows whose `temp_id` names no template. Dropped. */
  orphanedChildRows: number;
  expressCompanies: number;
  expressCompaniesDisabled: number;
}

export interface ShippingMigrationInput {
  templates?: readonly LegacyShippingTemplate[];
  regions?: readonly LegacyShippingRegion[];
  free?: readonly LegacyShippingFree[];
  noDelivery?: readonly LegacyShippingNoDelivery[];
  express?: readonly LegacyExpress[];
}

export interface ShippingMigrationOutput {
  templates: ShippingTemplateRow[];
  regions: ShippingRegionRow[];
  freeRules: ShippingFreeRuleRow[];
  noDeliveryCities: ShippingNoDeliveryRow[];
  expressCompanies: ExpressCompanyOverrideRow[];
  report: ShippingMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

export function chargeModeOf(type: number): ChargeMode {
  if (type === 2) return 'weight';
  if (type === 3) return 'volume';
  return 'quantity';
}

/**
 * The narrowest division the row names.
 *
 * Legacy carried `(province_id, city_id)` on every row: a province-wide rule
 * left `city_id = 0`. Both zero means "everywhere", which is the fallback.
 */
export function cityIdOf(row: { province_id: number; city_id: number }): number | null {
  if (row.city_id > 0) return row.city_id;
  if (row.province_id > 0) return row.province_id;
  return null;
}

/** A decimal string MySQL handed over, normalised and floored at zero. */
function decimalOf(raw: string): string {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '0.00';
}

/** `null` when the threshold is unset, which legacy wrote as `0.00`. */
function thresholdOf(raw: string): string | null {
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : null;
}

function groupKey(templateId: number, uniqid: string, rowId: number): string {
  return uniqid.trim() === '' ? `${templateId}:row:${rowId}` : `${templateId}:${uniqid.trim()}`;
}

export function mapShipping(input: ShippingMigrationInput): ShippingMigrationOutput {
  const templates: ShippingTemplateRow[] = [];
  const regions: ShippingRegionRow[] = [];
  const freeRules: ShippingFreeRuleRow[] = [];
  const noDeliveryCities: ShippingNoDeliveryRow[] = [];
  const expressCompanies: ExpressCompanyOverrideRow[] = [];

  let templatesFallbackSynthesised = 0;
  let templatesFallbackDuplicated = 0;
  let freeRulesWithoutThreshold = 0;
  let orphanedChildRows = 0;
  let expressCompaniesDisabled = 0;

  for (const row of input.templates ?? []) {
    const createdAt = row.add_time > 0 ? new Date(row.add_time * 1000) : new Date(0);
    templates.push({
      id: row.id,
      name: row.name,
      chargeMode: chargeModeOf(row.type),
      hasFreeRules: row.appoint === 1,
      hasNoDeliveryRules: row.no_delivery === 1,
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    });
  }
  const templateIds = new Set(templates.map((row) => row.id));

  // --- priced regions --------------------------------------------------------
  const regionByKey = new Map<string, ShippingRegionRow>();
  const fallbackSeen = new Set<number>();

  for (const row of input.regions ?? []) {
    if (!templateIds.has(row.temp_id)) {
      orphanedChildRows += 1;
      continue;
    }
    const cityId = cityIdOf(row);
    const isFallback = cityId === null;
    if (isFallback) {
      if (fallbackSeen.has(row.temp_id)) {
        templatesFallbackDuplicated += 1;
        continue;
      }
      fallbackSeen.add(row.temp_id);
    }

    const key = groupKey(row.temp_id, row.uniqid, row.id);
    let rule = regionByKey.get(key);
    if (rule === undefined) {
      rule = {
        key,
        templateId: row.temp_id,
        isFallback,
        firstUnit: decimalOf(row.first),
        firstPrice: decimalOf(row.first_price),
        additionalUnit: decimalOf(row.continue),
        additionalPrice: decimalOf(row.continue_price),
        cityIds: [],
      };
      regionByKey.set(key, rule);
      regions.push(rule);
    }
    if (cityId !== null && !rule.cityIds.includes(cityId)) rule.cityIds.push(cityId);
  }

  // Every template needs somewhere to land: `computeFreight` falls back to the
  // fallback rule, and the legacy calculator charged nothing when there was none.
  for (const template of templates) {
    if (fallbackSeen.has(template.id)) continue;
    templatesFallbackSynthesised += 1;
    regions.push({
      key: `${template.id}:fallback`,
      templateId: template.id,
      isFallback: true,
      firstUnit: '1.00',
      firstPrice: '0.00',
      additionalUnit: '0.00',
      additionalPrice: '0.00',
      cityIds: [],
    });
  }

  // --- free-shipping rules ---------------------------------------------------
  const freeByKey = new Map<string, ShippingFreeRuleRow>();
  for (const row of input.free ?? []) {
    if (!templateIds.has(row.temp_id)) {
      orphanedChildRows += 1;
      continue;
    }
    const key = groupKey(row.temp_id, row.uniqid, row.id);
    let rule = freeByKey.get(key);
    if (rule === undefined) {
      const minUnits = thresholdOf(row.number);
      const minAmount = thresholdOf(row.price);
      if (minUnits === null && minAmount === null) {
        // `shipping_template_free_rules_needs_threshold` would refuse it, and a
        // rule that is free above zero of nothing is free shipping by accident.
        freeRulesWithoutThreshold += 1;
        continue;
      }
      rule = { key, templateId: row.temp_id, minUnits, minAmount, cityIds: [] };
      freeByKey.set(key, rule);
      freeRules.push(rule);
    }
    const cityId = cityIdOf(row);
    if (cityId !== null && !rule.cityIds.includes(cityId)) rule.cityIds.push(cityId);
  }

  // --- no-delivery cities ----------------------------------------------------
  const seenNoDelivery = new Set<string>();
  for (const row of input.noDelivery ?? []) {
    if (!templateIds.has(row.temp_id)) {
      orphanedChildRows += 1;
      continue;
    }
    const cityId = cityIdOf(row);
    if (cityId === null) continue; // "never deliver anywhere" is not a template
    const pair = `${row.temp_id}:${cityId}`;
    if (seenNoDelivery.has(pair)) continue; // the composite primary key would refuse it
    seenNoDelivery.add(pair);
    noDeliveryCities.push({ templateId: row.temp_id, cityId });
  }

  // --- courier overrides -----------------------------------------------------
  for (const row of input.express ?? []) {
    const isEnabled = row.is_show === 1;
    if (!isEnabled) expressCompaniesDisabled += 1;
    expressCompanies.push({
      id: row.id,
      code: row.code,
      name: row.name,
      sortOrder: row.sort,
      isEnabled,
    });
  }

  return {
    templates,
    regions,
    freeRules,
    noDeliveryCities,
    expressCompanies,
    report: {
      templates: templates.length,
      regions: regions.length,
      templatesFallbackSynthesised,
      templatesFallbackDuplicated,
      freeRules: freeRules.length,
      freeRulesWithoutThreshold,
      noDeliveryCities: noDeliveryCities.length,
      orphanedChildRows,
      expressCompanies: expressCompanies.length,
      expressCompaniesDisabled,
    },
  };
}

// ---------------------------------------------------------------------------
// the loadable shape
// ---------------------------------------------------------------------------

/**
 * `mapShipping`'s rules, made loadable: ids assigned, cities split out into
 * their join tables, and every city the dictionary lacks dropped and counted.
 *
 * `mapShipping` returns a rule with its cities inline (`cityIds`) and a `key`
 * that is only stable within one call, because that is the natural shape of
 * the regrouping. The schema wants the rule as a row with an id and the
 * cities as rows pointing at it, and the runner inserts rows exactly as they
 * are — so this function is the bridge, and it is still pure.
 *
 * **The ids are assigned here, 1…n in the mapper's order**, and the inputs are
 * sorted by their legacy id first. `shipping_template_regions` has no legacy id
 * to carry (one legacy row per city became one rule for many), so the id is a
 * function of the snapshot: the same dump gives the same ids, twice, which is
 * what "load twice and compare" needs, and the runner then moves the sequence
 * past them.
 *
 * **A city the seeded dictionary does not have is dropped and counted**
 * (`citiesDroppedUnknown`), the same rule `mapUsers` follows for an address
 * (CR-3-j): the join tables' `city_id` is a real foreign key, and one unknown
 * city would otherwise roll back every template, rule and courier override
 * with it. A priced rule or free rule that loses **every** city it had is
 * dropped too (`rulesDroppedNoKnownCity`) — left with no cities it would read
 * as "applies nowhere" at best and as a second fallback at worst.
 */
export interface ShippingLoadInput extends ShippingMigrationInput {
  /** `cities.id` as seeded. Omitted, every city is taken on trust (unit tests). */
  knownCityIds?: ReadonlySet<number>;
  /**
   * `express_companies` as the target holds it — the seed, on a first run.
   * The overrides are upserted by id, and the table is unique on `code` too,
   * so a legacy courier whose code another seeded id already has would fail
   * the whole run. It is left to the seed and counted instead. Omitted, no
   * collision is assumed (unit tests).
   */
  seededExpress?: readonly { id: number; code: string }[];
}

export interface ShippingRegionLoadRow {
  id: number;
  templateId: number;
  isFallback: boolean;
  firstUnit: string;
  firstPrice: string;
  additionalUnit: string;
  additionalPrice: string;
}

export interface ShippingFreeRuleLoadRow {
  id: number;
  templateId: number;
  minUnits: string | null;
  minAmount: string | null;
}

export interface ShippingLoadReport extends ShippingMigrationReport {
  /** City links (priced, free or no-delivery) naming a city the dictionary lacks. */
  citiesDroppedUnknown: number;
  /** Rules whose every city was unknown. */
  rulesDroppedNoKnownCity: number;
  /**
   * Courier overrides whose `code` a different seeded id already holds. Legacy
   * ids follow the installer, as the seed does, so this is an operator-added
   * courier colliding with a stock one; the stock row stays as seeded.
   */
  expressDroppedCodeTaken: number;
}

export interface ShippingLoadOutput {
  templates: ShippingTemplateRow[];
  regions: ShippingRegionLoadRow[];
  regionCities: { regionId: number; cityId: number }[];
  freeRules: ShippingFreeRuleLoadRow[];
  freeRuleCities: { freeRuleId: number; cityId: number }[];
  noDeliveryCities: ShippingNoDeliveryRow[];
  expressCompanies: ExpressCompanyOverrideRow[];
  report: ShippingLoadReport;
}

function byId<T extends { id: number }>(rows: readonly T[] | undefined): T[] {
  return [...(rows ?? [])].sort((a, b) => a.id - b.id);
}

export function loadShipping(input: ShippingLoadInput): ShippingLoadOutput {
  const mapped = mapShipping({
    templates: byId(input.templates),
    regions: byId(input.regions),
    free: byId(input.free),
    noDelivery: byId(input.noDelivery),
    express: byId(input.express),
  });
  const known = input.knownCityIds;
  const isKnown = (cityId: number): boolean => known === undefined || known.has(cityId);

  let citiesDroppedUnknown = 0;
  let rulesDroppedNoKnownCity = 0;
  /** The cities a rule keeps, or `null` when it had some and kept none. */
  const keptCities = (cityIds: readonly number[]): number[] | null => {
    const kept = cityIds.filter(isKnown);
    citiesDroppedUnknown += cityIds.length - kept.length;
    return cityIds.length > 0 && kept.length === 0 ? null : kept;
  };

  const regions: ShippingRegionLoadRow[] = [];
  const regionCities: { regionId: number; cityId: number }[] = [];
  for (const rule of mapped.regions) {
    const cities = keptCities(rule.cityIds);
    if (cities === null) {
      rulesDroppedNoKnownCity += 1;
      continue;
    }
    const id = regions.length + 1;
    regions.push({
      id,
      templateId: rule.templateId,
      isFallback: rule.isFallback,
      firstUnit: rule.firstUnit,
      firstPrice: rule.firstPrice,
      additionalUnit: rule.additionalUnit,
      additionalPrice: rule.additionalPrice,
    });
    for (const cityId of cities) regionCities.push({ regionId: id, cityId });
  }

  const freeRules: ShippingFreeRuleLoadRow[] = [];
  const freeRuleCities: { freeRuleId: number; cityId: number }[] = [];
  for (const rule of mapped.freeRules) {
    const cities = keptCities(rule.cityIds);
    if (cities === null) {
      rulesDroppedNoKnownCity += 1;
      continue;
    }
    const id = freeRules.length + 1;
    freeRules.push({
      id,
      templateId: rule.templateId,
      minUnits: rule.minUnits,
      minAmount: rule.minAmount,
    });
    for (const cityId of cities) freeRuleCities.push({ freeRuleId: id, cityId });
  }

  const noDeliveryCities = mapped.noDeliveryCities.filter((row) => {
    if (isKnown(row.cityId)) return true;
    citiesDroppedUnknown += 1;
    return false;
  });

  const seededIdByCode = new Map((input.seededExpress ?? []).map((row) => [row.code, row.id]));
  let expressDroppedCodeTaken = 0;
  const expressCompanies = mapped.expressCompanies.filter((row) => {
    const holder = seededIdByCode.get(row.code);
    if (holder === undefined || holder === row.id) return true;
    expressDroppedCodeTaken += 1;
    return false;
  });

  return {
    templates: mapped.templates,
    regions,
    regionCities,
    freeRules,
    freeRuleCities,
    noDeliveryCities,
    expressCompanies,
    report: {
      ...mapped.report,
      expressCompanies: expressCompanies.length,
      regions: regions.length,
      freeRules: freeRules.length,
      noDeliveryCities: noDeliveryCities.length,
      citiesDroppedUnknown,
      rulesDroppedNoKnownCity,
      expressDroppedCodeTaken,
    },
  };
}
