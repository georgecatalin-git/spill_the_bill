import { useCallback, useEffect, useState } from 'react';

import { parseReceipt, type ParsedReceipt } from '@/lib/receipt';
import { ReceiptError } from '@/lib/receipt/claude-parser';

export type ReceiptScanState =
  | { status: 'loading' }
  | { status: 'ready'; receipt: ParsedReceipt }
  /** Written for the admin to read: why it failed decides what they do next. */
  | { status: 'error'; message: string };

const GENERIC_ERROR = "We couldn't read this receipt.";

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
      setState({ status: 'error', message: 'There is no photo to read.' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    parseReceipt(imageUri)
      .then((receipt) => {
        if (!cancelled) setState({ status: 'ready', receipt });
      })
      .catch((caught) => {
        if (cancelled) return;

        // Only messages the parser wrote for people are shown. Anything else —
        // a native image error, an unexpected throw — could carry internals.
        setState({
          status: 'error',
          message: caught instanceof ReceiptError ? caught.message : GENERIC_ERROR,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [imageUri, attempt]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  return { state, retry };
}
