export type FloatCreditsEarnedEvent = {
  amount: number;
  description: string;
  earnedAt: number;
};

type Listener = (event: FloatCreditsEarnedEvent) => void;

const listeners = new Set<Listener>();

export function subscribeToFloatCreditsEarned(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitFloatCreditsEarned({
  amount,
  description,
}: {
  amount: number;
  description: string;
}) {
  const event = { amount, description, earnedAt: Date.now() };
  for (const listener of listeners) {
    listener(event);
  }
}
