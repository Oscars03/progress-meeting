import { redirect } from 'next/navigation';

/**
 * The weekly history moved to the meeting page, as its second tab, where
 * somebody looking for last week's minutes would look. This address stays so
 * old links and bookmarks still arrive there.
 */
export default function OldHistoryPage() {
  redirect('/meetings/history');
}
