import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageScanTokenCreate } from '@shop/contracts/storage/storage.admin.contract';

import { resetApiConfig } from '@/admin/api/config';
import { on, respondWithError, stubRoutes } from '@/test/api';
import { renderAdmin } from '@/test/render';

import { ScanUploadModal } from './scan-upload-modal';

afterEach(() => {
  resetApiConfig();
});

describe('扫码上传', () => {
  it('says the code could not be had instead of spinning forever', async () => {
    stubRoutes([
      on(storageScanTokenCreate, () =>
        respondWithError(500, { code: 'INTERNAL', message: '服务暂时不可用' }),
      ),
    ]);
    renderAdmin(<ScanUploadModal onClose={vi.fn()} categoryId={undefined} />);

    expect(await screen.findByText('二维码获取失败')).toBeInTheDocument();
    expect(document.querySelector('.ant-spin')).toBeNull();
  });
});
