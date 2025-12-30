export async function logInteraction(_input: {
  type: string;
  actorId?: string;
  targetId?: string | number;
  meta?: Record<string, any>;
}): Promise<void> {
  // no-op on TV
}
