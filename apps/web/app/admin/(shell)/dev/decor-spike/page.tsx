import type { Metadata } from 'next';

import { DecorSpikeLoader } from './decor-spike-loader';

export const metadata: Metadata = { title: '装修编辑器试验' };

export default function DecorSpikePage() {
  return <DecorSpikeLoader />;
}
