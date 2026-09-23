import type { PropsWithChildren } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient, installQueryAdapters } from '@/data/query-client';
import './app.scss';

const queryClient = createQueryClient();
installQueryAdapters();

/** The app shell: providers only. Taro renders every page as a child of this component. */
function App({ children }: PropsWithChildren) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export default App;
