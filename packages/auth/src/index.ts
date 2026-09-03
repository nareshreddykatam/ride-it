/**
 * Root barrel. `middleware.ts` is deliberately excluded — import it from
 * "@ride-it/auth/middleware" instead. It depends on next/server (edge
 * runtime) and has no business being pulled into a Client Component bundle.
 */
export * from "./types";
export * from "./context";
export * from "./hooks";
export * from "./phone-otp";
export * from "./email-otp";
export * from "./identifier";
export * from "./identity-linking";
export * from "./admin-auth";
