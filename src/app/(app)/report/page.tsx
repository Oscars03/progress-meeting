export default function ReportPage() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold">รายงาน (Report)</h2>
      
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4">รายงานสรุปรายสัปดาห์</h3>
        <p className="text-gray-600 mb-6">
          เนื่องจากข้อมูลทั้งหมดถูกบันทึกแบบ Single Source of Truth ลงใน Google Sheets 
          คุณสามารถเปิดดูรายงานสรุปทั้งหมดผ่านหน้า Sheet "Report" ได้โดยตรง ซึ่งสามารถใช้สูตรหรือ 
          Pivot Table ในการประมวลผลข้อมูล และ Export เป็น PDF ได้ทันที
        </p>
        
        <a 
          href={sheetUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-medium"
        >
          เปิดชีตสรุป (Weekly Report)
        </a>
      </div>
    </div>
  );
}
