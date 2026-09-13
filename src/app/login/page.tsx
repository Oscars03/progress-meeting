import LoginClient from './login-client';
import { allowedSignupDomains } from '@/lib/signup-policy';

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  // No permitted domain means self-registration is closed, so the form would
  // only ever be able to reject people. Hide it rather than tease it.
  const signupDomains = allowedSignupDomains();

  return (
    // dvh, not screen: on phones 100vh includes the collapsing browser toolbar,
    // which pushes the bottom of the card below the fold.
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <LoginClient googleEnabled={googleEnabled} signupDomains={signupDomains} />
    </div>
  );
}
