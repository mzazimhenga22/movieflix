import { useEffect, useMemo, useState } from 'react';
import type { CallSession } from '@/lib/calls/types';
import { listenToActiveCallsForUser } from '@/lib/calls/callService';

export const useIncomingCall = (userId?: string | null) => {
  const [calls, setCalls] = useState<CallSession[]>([]);

  useEffect(() => {
    if (!userId) {
      setCalls([]);
      return;
    }
    const unsubscribe = listenToActiveCallsForUser(userId, setCalls);
    return () => unsubscribe();
  }, [userId]);

  const incomingCall = useMemo(() => {
    if (!userId) return null;
    return (
      calls.find((call) => {
        if (!call) return false;
        if (call.initiatorId === userId) return false;
        if (!call.members?.includes(userId)) return false;
        if (call.status === 'ended' || call.status === 'declined') return false;

        // Group calls are first-to-answer; if someone else already accepted, stop showing as incoming.
        if (call.isGroup && call.acceptedBy && call.acceptedBy !== userId) {
          return false;
        }

        const timeoutMillis =
          (call as any)?.ringTimeoutAt && typeof (call as any).ringTimeoutAt?.toMillis === 'function'
            ? (call as any).ringTimeoutAt.toMillis()
            : null;
        if (typeof timeoutMillis === 'number' && Date.now() > timeoutMillis && call.status !== 'active') {
          return false;
        }

        const participant = call.participants?.[userId];
        if (participant && ['declined', 'left'].includes(participant.state)) {
          return false;
        }
        return true;
      }) ?? null
    );
  }, [calls, userId]);

  return incomingCall;
};

export default useIncomingCall;
