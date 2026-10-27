import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';

export default async function ReportPage() {
  const [actor, t] = await Promise.all([requirePageSession(), getT()]);
  const isAdmin = actor.role === 'admin';
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`;

  return (
    <div className="space-y-6">
      <PageHeader title={t('report.title')} />

      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4">{t('report.weeklyTitle')}</h3>
        <p className="text-gray-600 mb-6">{t('report.body')}</p>

        {isAdmin ? (
          <a
            href={sheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            {t('report.openSheet')}
          </a>
        ) : (
          <p className="text-sm text-gray-500">{t('common.sheetAdminOnly')}</p>
        )}
      </div>
    </div>
  );
}
