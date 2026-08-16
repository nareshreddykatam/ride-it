import type { Subscription, SubscriptionPlan } from "@ride-it/types";
import { apiFetch } from "./http";

export const subscriptionsApi = {
  getPlans: () =>
    apiFetch<Array<{ plan: SubscriptionPlan; amount: number; currency: "INR" }>>(
      "/subscriptions/plans"
    ),

  getActiveSubscription: () => apiFetch<Subscription | null>("/subscriptions/active"),

  purchase: (plan: SubscriptionPlan) =>
    apiFetch<{ subscription: Subscription; paymentUrl: string }>("/subscriptions/purchase", {
      method: "POST",
      body: { plan },
    }),
};
