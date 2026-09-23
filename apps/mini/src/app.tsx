import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useLaunch } from '@tarojs/taro';
import { ApiClientProvider } from '@shop/api-client/react';
import { api } from '@/data/api';
import { createQueryClient, installQueryAdapters } from '@/data/query-client';
import { startSession } from '@/session/session';
import './app.scss';

const queryClient = createQueryClient();
installQueryAdapters();

/**
 * The app shell: providers, and the silent `wx.login` on launch (the session is ready, or
 * asking for a phone number, by the time a page needs it).
 */
function App({ children }: PropsWithChildren) {
  useLaunch(() => void startSession());
  return (
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={api}>{children}</ApiClientProvider>
    </QueryClientProvider>
  );
}

export default App;
