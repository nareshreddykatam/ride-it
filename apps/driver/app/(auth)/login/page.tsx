import { Suspense } from "react";
import { isE2ETestModeEnabled } from "@ride-it/supabase/e2e";
import { LoginForm } from "./login-form";
import { E2ETestLoginButton } from "./e2e-test-login-button";

/**
 * Server Component deliberately -- see the Passenger app's identical
 * page.tsx for the full explanation. RIDE_IT_E2E_TEST_MODE is checked
 * server-side; the E2E button is genuinely absent from production HTML,
 * not merely hidden.
 *
 * Suspense boundary: LoginForm reads useSearchParams() (to surface a
 * ?error=wrong_app redirect from middleware), which the App Router
 * requires to be wrapped in Suspense.
 */
export default function LoginPage() {
  const e2eEnabled = isE2ETestModeEnabled();

  return (
    <Suspense fallback={null}>
      <LoginForm>
        {e2eEnabled && <E2ETestLoginButton role="driver" homePath="/dashboard" />}
      </LoginForm>
    </Suspense>
  );
}
