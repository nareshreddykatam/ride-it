import { Suspense } from "react";
import { isE2ETestModeEnabled } from "@ride-it/supabase/e2e";
import { LoginForm } from "./login-form";
import { E2ETestLoginButton } from "./e2e-test-login-button";

/**
 * Server Component deliberately: RIDE_IT_E2E_TEST_MODE is read here,
 * server-side, so that when it's unset (always the case in production)
 * <E2ETestLoginButton /> is never included in the render tree at all --
 * not hidden by CSS, not disabled, genuinely absent from the HTML and
 * from what gets sent to the client for this request. LoginForm carries
 * the real, unmodified phone-OTP flow exactly as before this phase.
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
        {e2eEnabled && <E2ETestLoginButton role="passenger" homePath="/home" />}
      </LoginForm>
    </Suspense>
  );
}
