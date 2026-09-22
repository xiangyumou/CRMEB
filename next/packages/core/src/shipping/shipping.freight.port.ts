import type { DbOrTx } from '@shop/db';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { toId } from '../kernel/ids';
import { registerFreightPort, type FreightLine, type FreightQuote } from '../order/ports';
import { resolveCatalogPort } from '../order';
import { tradeConfig } from '../system';
import {
  computeFreight,
  type FreightInputLine,
  type FreightTemplateRules,
} from './shipping.freight.rules';
import * as cityRepo from './shipping.repo';
import * as repo from './shipping.template.repo';

/**
 * The `FreightPort` B1 quotes through.
 *
 * Until F2 registers this, `fallbackFreightQuote` in `order.pricing.ts` answers
 * every quote and every 运费模板 line costs nothing. Registration is a side
 * effect of importing `@shop/core/shipping` (see `index.ts`), which
 * `@shop/core/domains` does for the app and the worker.
 *
 * Two seams worth naming:
 *
 *  - **the line's freight mode.** `FreightLine` carries a
 *    `freightTemplateId` and nothing else, so a free line and a fixed-postage
 *    line look identical to the port. Until CR-1-f2 lands, the skus are re-read
 *    through the registered `CatalogPort` — one query on a table checkout has
 *    just read — and `freightMode` / `fixedFreight` come from there.
 *  - **the address.** A region rule may name a province, a city or a district,
 *    so the address's division is expanded into its ancestor chain and the
 *    narrowest matching rule wins.
 */

export const freightPort = {
  async quote(
    db: DbOrTx,
    ctx: Ctx,
    input: { addressCityId: number | null; lines: readonly FreightLine[] },
  ): Promise<FreightQuote> {
    const empty = { totalFen: 0, perLine: input.lines.map(() => 0) };
    if (input.lines.length === 0) return empty;

    const [cityPath, modes, config] = await Promise.all([
      cityPathOf(db, input.addressCityId),
      freightModesOf(db, input.lines),
      ctx.config.get(tradeConfig),
    ]);

    const lines: FreightInputLine[] = input.lines.map((line, index) => {
      const mode = modes.get(line.skuId);
      return {
        index,
        skuId: line.skuId,
        quantity: line.quantity,
        weight: line.weight,
        volume: line.volume,
        amountFen: line.amountFen,
        mode: mode?.mode ?? (line.freightTemplateId === null ? 'free' : 'template'),
        fixedFreightFen: mode?.fixedFreightFen ?? 0,
        templateId: line.freightTemplateId,
      };
    });

    const templateIds = [
      ...new Set(
        lines
          .filter((line) => line.mode === 'template' && line.templateId !== null)
          .map((line) => line.templateId as number),
      ),
    ];
    const templates = await loadTemplates(db, templateIds);

    const result = computeFreight({
      lines,
      cityPath,
      templates,
      // The setting is in 元 ("0 表示不启用满额包邮"); everything else here is 分.
      freeThresholdFen: config.freeShippingThreshold * 100,
      goodsTotalFen: lines.reduce((sum, line) => sum + line.amountFen, 0),
    });

    if (result.undeliverable.length > 0) {
      throw new DomainError('SHIPPING_NOT_DELIVERABLE', {
        details: {
          skuIds: result.undeliverable.map((entry) => toId(entry.skuId)),
          templateIds: [...new Set(result.undeliverable.map((entry) => entry.templateId))].map(
            toId,
          ),
        },
      });
    }
    return { totalFen: result.totalFen, perLine: result.perLine };
  },
};

/** Idempotent; called from `index.ts` and safe to call again from a test. */
export function registerShippingFreightPort(): void {
  registerFreightPort(freightPort);
}

// ---------------------------------------------------------------------------
// the two lookups
// ---------------------------------------------------------------------------

/** The address's division and its ancestors, most specific first. */
async function cityPathOf(db: DbOrTx, addressCityId: number | null): Promise<number[]> {
  if (addressCityId === null) return [];
  return cityRepo.cityAncestry(db, addressCityId);
}

interface LineMode {
  mode: 'free' | 'fixed' | 'template';
  fixedFreightFen: number;
}

/** CR-1-f2's local adapter. Deleted the day `FreightLine` carries the mode itself. */
async function freightModesOf(
  db: DbOrTx,
  lines: readonly FreightLine[],
): Promise<Map<number, LineMode>> {
  const out = new Map<number, LineMode>();
  const skus = await resolveCatalogPort().getSkusForSale(
    db,
    lines.map((line) => line.skuId),
  );
  for (const [skuId, sku] of skus) {
    out.set(skuId, {
      mode: sku.freightMode,
      fixedFreightFen:
        sku.freightMode === 'fixed' ? Math.round(Number(sku.fixedFreight ?? '0') * 100) : 0,
    });
  }
  return out;
}

async function loadTemplates(
  db: DbOrTx,
  templateIds: number[],
): Promise<Map<number, FreightTemplateRules>> {
  const out = new Map<number, FreightTemplateRules>();
  if (templateIds.length === 0) return out;

  const [regions, freeRules, noDelivery] = await Promise.all([
    repo.listRegions(db, templateIds),
    repo.listFreeRules(db, templateIds),
    repo.listNoDeliveryCities(db, templateIds),
  ]);
  const heads = await Promise.all(templateIds.map((id) => repo.findTemplate(db, id)));

  for (const head of heads) {
    if (head === null) continue;
    out.set(head.id, {
      templateId: head.id,
      chargeMode: head.chargeMode,
      hasFreeRules: head.hasFreeRules,
      hasNoDeliveryRules: head.hasNoDeliveryRules,
      regions: (regions.get(head.id) ?? []).map((entry) => ({
        isFallback: entry.region.isFallback,
        cityIds: new Set(entry.cityIds),
        firstUnit: Number(entry.region.firstUnit),
        firstPriceFen: fen(entry.region.firstPrice),
        additionalUnit: Number(entry.region.additionalUnit),
        additionalPriceFen: fen(entry.region.additionalPrice),
      })),
      freeRules: (freeRules.get(head.id) ?? []).map((entry) => ({
        cityIds: new Set(entry.cityIds),
        minUnits: entry.rule.minUnits === null ? null : Number(entry.rule.minUnits),
        minAmountFen: entry.rule.minAmount === null ? null : fen(entry.rule.minAmount),
      })),
      noDeliveryCityIds: new Set(noDelivery.get(head.id) ?? []),
    });
  }
  return out;
}

/** `money` columns are `'12.34'` strings; the engine counts in 分. */
function fen(value: string): number {
  return Math.round(Number(value) * 100);
}
