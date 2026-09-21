'use client';

import { Button, Input, Modal, Rate, Space, Typography, message } from 'antd';
import { useState } from 'react';
import {
  catalogAdminReviewBatchSetStatus,
  catalogAdminReviewCreate,
  catalogAdminReviewDelete,
  catalogAdminReviewList,
  catalogAdminReviewReply,
  catalogAdminReviewReplyUpdate,
  catalogAdminReviewSetStatus,
} from '@shop/contracts/catalog/catalog.review.contract';
import { adminReviewForm, type AdminProductReview } from '@shop/contracts/catalog/schemas';

import { useRouteMutation } from '@/admin/api/hooks';
import { ConfirmButton } from '@/admin/kit/confirm-button';
import { ModalForm, useFormModal } from '@/admin/kit/form/modal-form';
import { PageContainer } from '@/admin/kit/page-container';
import { StatusTag } from '@/admin/kit/status-tag';
import { idColumn, imageColumn, instantColumn, textColumn } from '@/admin/kit/table/columns';
import { CrudTable } from '@/admin/kit/table/crud-table';
import { Can } from '@/admin/session/can';

import { BOOL_OPTIONS, REVIEW_RATING_OPTIONS, REVIEW_STATUS, reviewFields } from '../catalog-enums';

/**
 * 商品评价.
 *
 * Moderation is the job this page exists for, so the status filter and the
 * batch action are the two things in reach: select a screenful of 待审核 and
 * publish them in one request, which is a single conditional UPDATE server-side
 * and reports how many rows it actually moved.
 *
 * Replying is a modal rather than an inline cell, because a reply is prose and
 * an operator rewriting one wants to see what they wrote last time.
 */
export function ProductReviewsPage() {
  const seed = useFormModal<AdminProductReview>();
  const [replying, setReplying] = useState<AdminProductReview | null>(null);

  const setStatus = useRouteMutation(catalogAdminReviewSetStatus, {
    invalidate: [catalogAdminReviewList],
    successMessage: '已更新状态',
  });

  const batchSetStatus = useRouteMutation(catalogAdminReviewBatchSetStatus, {
    invalidate: [catalogAdminReviewList],
  });

  return (
    <PageContainer subTitle="买家评价与虚拟评价；隐藏只是不展示，删除不可恢复">
      <CrudTable
        route={catalogAdminReviewList}
        scrollX={1500}
        filters={[
          { kind: 'text', name: 'keyword', label: '内容/昵称' },
          { kind: 'text', name: 'productId', label: '商品 ID' },
          {
            kind: 'select',
            name: 'status',
            label: '状态',
            multiple: true,
            options: Object.entries(REVIEW_STATUS).map(([value, option]) => ({
              value,
              label: option.label,
            })),
          },
          { kind: 'select', name: 'rating', label: '评分', options: REVIEW_RATING_OPTIONS },
          { kind: 'select', name: 'hasReply', label: '是否已回复', options: BOOL_OPTIONS },
          { kind: 'select', name: 'hasImages', label: '是否有图', options: BOOL_OPTIONS },
        ]}
        toolbar={
          <Can permission="catalog:review:write">
            <Button type="primary" onClick={() => seed.show()}>
              添加虚拟评价
            </Button>
          </Can>
        }
        batchActions={({ selectedRowKeys, clear }) => (
          <Can permission="catalog:review:write">
            <Space>
              {(['published', 'hidden'] as const).map((status) => (
                <Button
                  key={status}
                  size="small"
                  loading={batchSetStatus.isPending}
                  onClick={() =>
                    batchSetStatus.mutate(
                      {
                        body: { reviewIds: selectedRowKeys.map(String), status },
                      },
                      {
                        onSuccess: (result) => {
                          void message.success(`已更新 ${result.updated} 条`);
                          clear();
                        },
                      },
                    )
                  }
                >
                  批量{REVIEW_STATUS[status].label.replace('已', '')}
                </Button>
              ))}
            </Space>
          </Can>
        )}
        columns={[
          idColumn<AdminProductReview>({ sortable: true }),
          imageColumn<AdminProductReview>({ title: '商品', dataIndex: 'productImageUrl' }),
          textColumn<AdminProductReview>({
            title: '商品名称',
            dataIndex: 'productName',
            ellipsis: true,
            width: 180,
          }),
          textColumn<AdminProductReview>({
            title: '规格',
            dataIndex: 'specText',
            placeholder: '单规格',
            width: 120,
            ellipsis: true,
          }),
          textColumn<AdminProductReview>({
            title: '用户',
            dataIndex: 'authorNickname',
            width: 120,
            ellipsis: true,
          }),
          {
            title: '评分',
            key: 'productScore',
            width: 130,
            sorter: true,
            render: (_value: unknown, row: AdminProductReview) => (
              <Space direction="vertical" size={0}>
                <Rate disabled value={row.productScore} style={{ fontSize: 12 }} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  服务 {row.serviceScore} 分
                </Typography.Text>
              </Space>
            ),
          },
          {
            title: '评价内容',
            key: 'content',
            render: (_value: unknown, row: AdminProductReview) => (
              <Space direction="vertical" size={2} style={{ maxWidth: 360 }}>
                <Typography.Text ellipsis={{ tooltip: row.content ?? '' }}>
                  {row.content?.trim() ? row.content : '（无文字）'}
                </Typography.Text>
                {row.images.length > 0 ? (
                  <Space size={4} wrap>
                    {row.images.slice(0, 4).map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 3 }}
                      />
                    ))}
                    {row.images.length > 4 ? (
                      <Typography.Text type="secondary">+{row.images.length - 4}</Typography.Text>
                    ) : null}
                  </Space>
                ) : null}
                {row.replyContent ? (
                  <Typography.Text type="secondary" ellipsis={{ tooltip: row.replyContent }}>
                    商家回复：{row.replyContent}
                  </Typography.Text>
                ) : null}
              </Space>
            ),
          },
          {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_value: unknown, row: AdminProductReview) => (
              <StatusTag value={row.status} map={REVIEW_STATUS} />
            ),
          },
          instantColumn<AdminProductReview>({
            title: '评价时间',
            dataIndex: 'createdAt',
            sortable: true,
          }),
          {
            title: '操作',
            key: '__actions__',
            width: 210,
            fixed: 'right' as const,
            render: (_value: unknown, row: AdminProductReview) => (
              <Space size={4} wrap>
                <Can permission="catalog:review:write">
                  <Button type="link" size="small" onClick={() => setReplying(row)}>
                    {row.replyContent ? '改回复' : '回复'}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    loading={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        params: { id: row.id },
                        body: { status: row.status === 'published' ? 'hidden' : 'published' },
                      })
                    }
                  >
                    {row.status === 'published' ? '隐藏' : '显示'}
                  </Button>
                </Can>
                <ConfirmButton
                  route={catalogAdminReviewDelete}
                  input={{ params: { id: row.id } }}
                  title="确认删除该评价？"
                  description="删除后商品的评分统计会重新计算，且不可恢复。"
                  invalidate={[catalogAdminReviewList]}
                  successMessage="已删除"
                  permission="catalog:review:delete"
                  buttonProps={{ type: 'link', size: 'small', danger: true }}
                >
                  删除
                </ConfirmButton>
              </Space>
            ),
          },
        ]}
      />

      <ModalForm
        {...seed.props}
        title="添加虚拟评价"
        width={760}
        columns={2}
        schema={adminReviewForm}
        fields={reviewFields}
        route={catalogAdminReviewCreate}
        invalidate={[catalogAdminReviewList]}
        successMessage="已添加"
      />

      <ReplyModal review={replying} onClose={() => setReplying(null)} />
    </PageContainer>
  );
}

/**
 * 回复评价.
 *
 * Create and update are separate routes because they are separate events for
 * the buyer — the first reply notifies, an edit does not — so which one to call
 * is decided by whether a reply already exists, not by a flag in the body.
 */
function ReplyModal({
  review,
  onClose,
}: {
  review: AdminProductReview | null;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [seen, setSeen] = useState<AdminProductReview | null>(null);

  // Adopt the row's existing reply when the modal opens on a different row.
  if (seen !== review) {
    setSeen(review);
    setContent(review?.replyContent ?? '');
  }

  const isUpdate = Boolean(review?.replyContent);
  const reply = useRouteMutation(
    isUpdate ? catalogAdminReviewReplyUpdate : catalogAdminReviewReply,
    {
      invalidate: [catalogAdminReviewList],
      successMessage: '已回复',
      onSuccess: onClose,
    },
  );

  return (
    <Modal
      open={review !== null}
      title={isUpdate ? '修改回复' : '回复评价'}
      okText="提交"
      confirmLoading={reply.isPending}
      onCancel={onClose}
      onOk={() => {
        const trimmed = content.trim();
        if (!trimmed || !review) {
          void message.warning('请填写回复内容');
          return;
        }
        reply.mutate({ params: { id: review.id }, body: { content: trimmed } });
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          {review?.content?.trim() ? review.content : '买家没有留下文字评价。'}
        </Typography.Text>
        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="感谢支持！"
        />
      </Space>
    </Modal>
  );
}
