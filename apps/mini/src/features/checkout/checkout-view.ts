import type { PartInputOf, ResponseOf } from '@shop/api-client';
import type { ChosenAddress } from '@/platform';

export type CheckoutPreview = ResponseOf<'order.checkoutPreview'>;
export type CustomFormField = NonNullable<CheckoutPreview['customFormFields']>[number];
export type ApplicableCoupons = ResponseOf<'coupon.applicableList'>;
export type ApplicableCoupon = ApplicableCoupons['items'][number];
export type CityTree = ResponseOf<'shipping.cityTree'>;

/**
 * The shopper's coupon choice: `auto` (the default: the best usable one, as the server ranks
 * them), `none` (不使用优惠券), or one they picked.
 */
export type CouponChoice = { mode: 'auto' } | { mode: 'none' } | { mode: 'picked'; id: string };

/** The coupon to price with, once the applicable list is known; `null` for none. */
export function resolveCoupon(
  choice: CouponChoice,
  applicable: ApplicableCoupons | undefined,
): string | null {
  if (choice.mode === 'none') return null;
  if (choice.mode === 'picked') return choice.id;
  return applicable?.items.find((row) => row.usable)?.coupon.id ?? null;
}

/** `coupon.applicableList`'s lines: each priced line after the activity discounts. */
export function couponLinesOf(
  preview: CheckoutPreview,
): { productId: string; amount: string }[] | null {
  const lines = preview.lines.map((line) => ({
    productId: line.productId,
    amount: line.totalAmount,
  }));
  return lines.length > 0 ? lines : null;
}

const COUPON_REASONS: Record<string, string> = {
  COUPON_MIN_SPEND_NOT_MET: '未达到使用门槛',
  COUPON_NOT_APPLICABLE: '所选商品不可用',
  COUPON_NOT_USABLE: '暂不可用',
};

/** An unusable coupon's reason, in words (the server sends the `COUPON_*` code). */
export function couponReason(code: string | null): string {
  if (!code) return '';
  return COUPON_REASONS[code] ?? '暂不可用';
}

/** Answers keyed by field: text for most, a list for 多选. */
export type CustomAnswers = Readonly<Record<string, string | readonly string[]>>;

/** Fields the shopper can fill in here; an 图片 field has no upload purpose yet. */
export function fillable(field: CustomFormField): boolean {
  return field.type !== 'image';
}

/** The first required field left empty (or badly typed), with what to tell the shopper. */
export function customFormProblem(
  fields: readonly CustomFormField[],
  answers: CustomAnswers,
): string | null {
  for (const field of fields) {
    if (!fillable(field)) continue;
    const answer = answers[field.key];
    const empty =
      answer === undefined ||
      (typeof answer === 'string' ? answer.trim() === '' : answer.length === 0);
    if (empty) {
      if (field.required) return `请填写「${field.label}」`;
      continue;
    }
    if (
      field.type === 'number' &&
      typeof answer === 'string' &&
      !/^-?\d+(\.\d+)?$/.test(answer.trim())
    ) {
      return `「${field.label}」请填写数字`;
    }
    if (
      field.type === 'date' &&
      typeof answer === 'string' &&
      !/^\d{4}-\d{2}-\d{2}$/.test(answer.trim())
    ) {
      return `「${field.label}」请按 2026-01-31 的格式填写`;
    }
  }
  return null;
}

/** `order.create`'s `customForm`: trimmed answers, empty ones left out; `undefined` when none. */
export function customFormBody(
  fields: readonly CustomFormField[],
  answers: CustomAnswers,
): Record<string, unknown> | undefined {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const answer = answers[field.key];
    if (answer === undefined) continue;
    if (typeof answer === 'string') {
      if (answer.trim() === '') continue;
      body[field.key] = field.type === 'number' ? Number(answer.trim()) : answer.trim();
    } else if (answer.length > 0) {
      body[field.key] = [...answer];
    }
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

type Named = { id: string; name: string; children?: readonly Named[] };

/** `浙江省` and `浙江`, `杭州市` and `杭州`: WeChat's names and the seeded tree's differ in suffix. */
function sameDivision(a: string, b: string): boolean {
  const bare = (name: string) =>
    name.trim().replace(/(特别行政区|自治区|自治州|自治县|省|市|区|县|盟|地区)$/, '');
  return a.trim() === b.trim() || bare(a) === bare(b);
}

function findNamed(nodes: readonly Named[] | undefined, name: string): Named | undefined {
  return nodes?.find((node) => sameDivision(node.name, name));
}

/**
 * 导入微信地址: WeChat's address (names only) as an address form, with the division ids from
 * the city tree wherever the names match, since freight rules key on ids. What does not match
 * keeps its name alone, which the address API accepts.
 */
export function addressFormFromChosen(
  chosen: ChosenAddress,
  tree: CityTree | undefined,
): PartInputOf<'user.addressCreate', 'body'> {
  const province = tree ? findNamed(tree.items, chosen.province) : undefined;
  const city = province ? findNamed(province.children, chosen.city) : undefined;
  const district = city && chosen.district ? findNamed(city.children, chosen.district) : undefined;
  const postCode = chosen.postCode && /^\d{6}$/.test(chosen.postCode) ? chosen.postCode : undefined;
  return {
    receiverName: chosen.name.trim().slice(0, 32),
    receiverPhone: chosen.phone.trim(),
    provinceName: chosen.province,
    cityName: chosen.city,
    ...(chosen.district ? { districtName: chosen.district } : {}),
    detail: chosen.detail.trim().slice(0, 255),
    ...(postCode ? { postCode } : {}),
    ...(province ? { provinceId: province.id } : {}),
    ...(city ? { cityId: city.id } : {}),
    ...(district ? { districtId: district.id } : {}),
    isDefault: false,
  };
}

/** The receiver as `AddressCard` shows it. */
export function receiverCard(receiver: NonNullable<CheckoutPreview['receiver']>) {
  return {
    receiverName: receiver.name,
    receiverPhone: receiver.phone,
    provinceName: receiver.province,
    cityName: receiver.city,
    districtName: receiver.district,
    detail: receiver.detail,
  };
}
