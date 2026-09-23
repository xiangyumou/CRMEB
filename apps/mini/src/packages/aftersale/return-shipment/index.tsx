import { useMemo, useState } from 'react';
import { Text, View } from '@tarojs/components';
import type { RefundDetail } from '@shop/contracts/refund/schemas';
import type { ExpressCompany } from '@shop/contracts/shipping/schemas';
import { isApiError } from '@shop/api-client';
import { useApiClient, useInvalidateRoutes, useRouteQuery } from '@shop/api-client/react';
import { copyText, goBack, navigate, subscribe, useRouteParams } from '@/platform';
import { LoginCard } from '@/session/login-card';
import { useSignedIn } from '@/session/session';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Cell, CellGroup } from '@/ui/cell';
import { Radio } from '@/ui/choice';
import { Empty } from '@/ui/empty';
import { ErrorBlock } from '@/ui/error-block';
import { toast } from '@/ui/feedback';
import { Field } from '@/ui/field';
import { PageShell } from '@/ui/page-shell';
import { Pressable } from '@/ui/pressable';
import { Sheet } from '@/ui/sheet';
import { CellSkeleton } from '@/ui/skeleton';
import { REFUND_READS } from '../shared/actions';
import { awaitsReturn } from '../shared/refund';
import './index.scss';

/** How many companies the picker lists at once; the rest are a search away (there are ~1100). */
export const PICKER_LIMIT = 30;

/** The companies to list for a search: by name or code, the server's order kept. */
export function matchCompanies(
  companies: readonly ExpressCompany[],
  query: string,
  limit = PICKER_LIMIT,
): ExpressCompany[] {
  const words = query.trim().toLowerCase();
  const hits = words
    ? companies.filter(
        (company) =>
          company.name.toLowerCase().includes(words) || company.code.toLowerCase().includes(words),
      )
    : companies;
  return hits.slice(0, limit);
}

/** A waybill number as couriers print it: letters, digits and dashes, no spaces. */
export function cleanTrackingNo(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * 填写退货物流 (`refundReturnShipment`, `packages/aftersale/return-shipment/index?id=`). For a
 * 退货退款 the merchant approved: where to send it (copyable), then the courier (picked from
 * `GET /api/v1/express-companies`), the waybill number and an optional phone. Submitting asks
 * for the refund notices (C08) and goes back to the request.
 */
export default function ReturnShipmentPage() {
  const { id = '' } = useRouteParams('refundReturnShipment');
  return (
    <PageShell title="填写退货物流" withBar>
      <LoginCard
        reason="登录后填写退货物流"
        redirect={{ route: 'refundReturnShipment', params: { id } }}
      >
        {id ? <Body id={id} /> : <Empty image="order" title="没有找到这个售后单" />}
      </LoginCard>
    </PageShell>
  );
}

function Body({ id }: { id: string }) {
  const signedIn = useSignedIn();
  const detail = useRouteQuery('refund.myDetail', { params: { id } }, { enabled: signedIn });
  if (detail.isError) {
    return <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />;
  }
  if (!detail.data) return <CellSkeleton rows={4} />;
  if (!awaitsReturn(detail.data)) {
    return (
      <Empty
        image="order"
        title={detail.data.returnTrackingNo ? '退货物流已填写' : '这个售后单无需寄回商品'}
        actions={
          <Button
            variant="outline"
            size="md"
            onClick={() => void navigate({ route: 'refund', params: { id } }, { replace: true })}
          >
            查看售后详情
          </Button>
        }
      />
    );
  }
  return <Form refund={detail.data} />;
}

function Form({ refund }: { refund: RefundDetail }) {
  const client = useApiClient();
  const invalidate = useInvalidateRoutes();
  const companies = useRouteQuery('shipping.expressCompanyOptions');
  const [company, setCompany] = useState<ExpressCompany | null>(null);
  const [picking, setPicking] = useState(false);
  const [trackingNo, setTrackingNo] = useState('');
  const [phone, setPhone] = useState(refund.returnPhone ?? '');
  const [submitting, setSubmitting] = useState(false);
  const address = refund.returnAddress;

  const submit = async (expressCompanyId: string, waybill: string) => {
    const digits = phone.trim();
    try {
      await client.call('refund.submitReturnShipment', {
        params: { id: refund.id },
        body: { expressCompanyId, trackingNo: waybill, ...(digits ? { phone: digits } : {}) },
      });
    } catch (error) {
      if (isApiError(error, 'refund.submitReturnShipment')) {
        if (error.code === 'REFUND_RETURN_NOT_EXPECTED' || error.code === 'REFUND_NOT_ACTIONABLE') {
          toast.text('这个售后单当前无需填写退货物流');
          await invalidate(...REFUND_READS);
          return;
        }
      }
      throw error;
    }
    toast.success('退货物流已提交');
    await invalidate(...REFUND_READS);
    await goBack();
  };

  const onSubmit = () => {
    if (submitting) return;
    if (!company) {
      toast.text('请选择快递公司');
      return;
    }
    const waybill = cleanTrackingNo(trackingNo);
    if (!waybill) {
      toast.text('请填写快递单号');
      return;
    }
    if (phone.trim() && !/^1\d{10}$/.test(phone.trim())) {
      toast.text('请填写正确的手机号');
      return;
    }
    // In the tap, before anything is awaited (C08).
    const asked = subscribe('returnShipment');
    setSubmitting(true);
    submit(company.id, waybill)
      .catch((error: unknown) => {
        toast.text(
          error instanceof Error && error.message ? error.message : '提交失败，请稍后重试',
        );
      })
      .finally(() => {
        setSubmitting(false);
        return asked;
      });
  };

  return (
    <View className="return-shipment" id="return-shipment">
      {address ? (
        <Card
          title="寄回地址"
          extra={
            <Pressable
              label="复制退货地址"
              className="return-shipment__link"
              onClick={() => void copyText(`${address.name} ${address.phone} ${address.address}`)}
            >
              复制
            </Pressable>
          }
        >
          <Text className="return-shipment__line">
            {address.name} {address.phone}
          </Text>
          <Text className="return-shipment__line return-shipment__line--muted">
            {address.address}
          </Text>
        </Card>
      ) : null}

      <CellGroup>
        <Cell
          title="快递公司"
          required
          value={company?.name ?? <Text className="return-shipment__placeholder">请选择</Text>}
          label={company ? `快递公司 ${company.name}` : '选择快递公司'}
          onClick={() => setPicking(true)}
        />
      </CellGroup>
      <View className="return-shipment__fields">
        <Field
          id="return-shipment-tracking"
          label="快递单号"
          required
          value={trackingNo}
          maxLength={64}
          placeholder="请填写快递单号"
          onChange={setTrackingNo}
        />
        <Field
          id="return-shipment-phone"
          label="联系电话"
          type="tel"
          value={phone}
          placeholder="选填，便于商家联系"
          onChange={setPhone}
        />
      </View>
      <Text className="return-shipment__hint">请保留快递底单，商家签收后将为你退款</Text>

      <View className="return-shipment__bar">
        <Button
          id="return-shipment-submit"
          variant="primary"
          size="lg"
          block
          loading={submitting}
          onClick={onSubmit}
        >
          提交
        </Button>
      </View>

      <CompanySheet
        visible={picking}
        companies={companies.data?.items}
        error={companies.isError ? companies.error : null}
        onRetry={() => void companies.refetch()}
        selected={company?.id}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          setCompany(picked);
          setPicking(false);
        }}
      />
    </View>
  );
}

function CompanySheet({
  visible,
  companies,
  error,
  onRetry,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  companies: readonly ExpressCompany[] | undefined;
  error: unknown;
  onRetry: () => void;
  selected: string | undefined;
  onClose: () => void;
  onPick: (company: ExpressCompany) => void;
}) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => matchCompanies(companies ?? [], query), [companies, query]);
  return (
    <Sheet visible={visible} onClose={onClose} title="选择快递公司" height="tall">
      <Field label="搜索快递公司" value={query} placeholder="输入名称搜索" onChange={setQuery} />
      <View className="return-shipment__companies">
        {error ? (
          <ErrorBlock error={error} onRetry={onRetry} compact />
        ) : !companies ? (
          <CellSkeleton rows={5} />
        ) : shown.length === 0 ? (
          <Text className="return-shipment__hint">没有找到，换个名称试试</Text>
        ) : (
          shown.map((item) => (
            <Radio
              key={item.id}
              label={item.name}
              checked={selected === item.id}
              className="return-shipment__company"
              onChange={() => onPick(item)}
            />
          ))
        )}
        {companies && shown.length === PICKER_LIMIT ? (
          <Text className="return-shipment__hint">没有你用的快递？输入名称搜索</Text>
        ) : null}
      </View>
    </Sheet>
  );
}
