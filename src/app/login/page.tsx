'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [initMessage, setInitMessage] = useState('');

  const handleInitDb = async () => {
    setInitLoading(true);
    setInitMessage('');
    try {
      const res = await fetch('/api/db-init', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setInitMessage('✅ ' + data.message);
        setEmail('admin@test.com');
        setPassword('password');
      } else {
        setInitMessage('❌ ' + (data.message || 'เกิดข้อผิดพลาด'));
      }
    } catch (error) {
      const err = error as Error;
      setInitMessage('❌ ' + (err?.message || 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ'));
    } finally {
      setInitLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (res?.error) {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบ</h1>
        <p className="text-sm text-gray-500">Weekly Progress Meeting System</p>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            อีเมล
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@test.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            รหัสผ่าน
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm disabled:opacity-50"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-gray-200"></div>
        <span className="flex-shrink mx-3 text-gray-400 text-xs">หรือ</span>
        <div className="flex-grow border-t border-gray-200"></div>
      </div>

      <button
        type="button"
        onClick={() => signIn('google', { callbackUrl })}
        className="w-full flex items-center justify-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 rounded-lg transition text-sm"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        เข้าสู่ระบบด้วย Google
      </button>

      <div className="pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-2">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">บัญชีทดสอบเริ่มต้น (Password: password):</p>
        </div>
        <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 space-y-1">
          <p>• ผู้ดูแลระบบ: <code className="text-blue-600 font-mono">admin@test.com</code></p>
          <p>• อาจารย์: <code className="text-blue-600 font-mono">prof1@test.com</code></p>
          <p>• นักศึกษา: <code className="text-blue-600 font-mono">student1@test.com</code></p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            disabled={initLoading}
            onClick={handleInitDb}
            className="w-full text-center text-xs py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition disabled:opacity-50"
          >
            {initLoading ? '⏳ กำลังติดตั้งฐานข้อมูลใน Google Sheet...' : '⚡ คลิกเพื่อสร้างโครงสร้างฐานข้อมูล & ข้อมูลทดสอบ (Init DB)'}
          </button>
          {initMessage && (
            <p className={`mt-1.5 text-center text-xs ${initMessage.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
              {initMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Suspense fallback={<div className="text-gray-500 text-sm">กำลังโหลด...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
