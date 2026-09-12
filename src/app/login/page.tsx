import LoginClient from './login-client';

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <LoginClient googleEnabled={googleEnabled} />
    </div>
  );
}
