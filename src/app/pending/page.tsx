import Link from 'next/link';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-6 text-center">
        <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-2 border border-amber-100">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
          รอการอนุมัติ
          <br />
          <span className="text-lg font-medium text-gray-600">Pending Approval</span>
        </h1>
        
        <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100">
          <p>
            บัญชีของคุณถูกสร้างขึ้นเรียบร้อยแล้ว ไม่มีอะไรผิดพลาด
            <br />
            <span className="text-gray-500">Your account was created successfully; nothing went wrong.</span>
          </p>
          <div className="border-t border-gray-200"></div>
          <p>
            ผู้ดูแลระบบจำเป็นต้องอนุมัติบัญชีของคุณก่อนจึงจะเข้าใช้งานได้ โดยระบบได้แจ้งให้ผู้ดูแลระบบทราบแล้ว
            <br />
            <span className="text-gray-500">An admin must approve your account before you can use it. They have been notified.</span>
          </p>
          <div className="border-t border-gray-200"></div>
          <p>
            โปรดรอการอนุมัติ ซึ่งอาจใช้เวลาประมาณ 1-2 วันทำการ
            <br />
            <span className="text-gray-500">Please wait for approval, which typically takes 1-2 working days.</span>
          </p>
        </div>

        <div className="pt-2">
          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm"
          >
            ตรวจสอบอีกครั้ง / Check again
          </Link>
        </div>
      </div>
    </div>
  );
}
