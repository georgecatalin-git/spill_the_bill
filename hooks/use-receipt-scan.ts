import { useCallback, useEffect, useState } from 'react';

import { parseReceipt, type ParsedReceipt } from '@/lib/receipt';

export type ReceiptScanState =
  | { status: 'loading' }
  | { status: 'ready'; receipt: ParsedReceipt }
  | { status: 'error' };

/**
 * Reads a receipt photo through the configured parser.
 *
 * The screen only sees loading / ready / error, so replacing the mock parser
 * with a real service needs no change here or in the UI.
 */
export function useReceiptScan(imageUri: string | undefined) {
  const [state, setState] = useState<ReceiptScanState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!imageUri) {
      setState({ status: 'error' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    parseReceipt(imageUri)
      .then((receipt) => {
        if (!cancelled) setState({ status: 'ready', receipt });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [imageUri, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { state, retry };
}
