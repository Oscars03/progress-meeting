'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';
import { submitFeedbackAction } from './actions';
import { FEEDBACK_CATEGORIES, FEEDBACK_MAX_LENGTH } from './categories';
import { IMAGE_TYPES, MAX_IMAGE_EDGE, checkImage } from '@/lib/uploads';

/**
 * Shrink a picture before it is sent.
 *
 * A screenshot off a phone is several megabytes of pixels nobody will look at
 * at full size, and the slow part of sending feedback should not be the part
 * the sender did not ask for. Anything already small enough is passed through
 * untouched rather than re-encoded, which would only lose quality.
 *
 * If any of this fails -- an animated GIF, a browser without canvas, an image
 * that will not decode -- the original is sent. The size limit still applies
 * on the server, so the worst case is a refusal with a reason, not a silent
 * loss.
 */
async function shrink(file: File): Promise<File> {
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_EDGE) {
      bitmap.close();
      return file;
    }

    const scale = MAX_IMAGE_EDGE / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function FeedbackForm() {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<string>('problem');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // The file and its preview together, because they are made and thrown away
  // at the same moment. An effect watching the file to produce the URL would
  // be a setState inside an effect, which renders twice and fails lint --
  // see CLAUDE.md. Picking a file is an event, so the URL is made in the
  // event.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const left = FEEDBACK_MAX_LENGTH - body.length;

  /**
   * Drop whatever is held. An object URL is a handle the browser keeps alive
   * until it is told otherwise, so the old one is always released.
   */
  const clearPicked = () => {
    setPicked((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    // The input keeps its own value, so picking the same file again would
    // fire no change event and look like nothing happened.
    if (fileInput.current) fileInput.current.value = '';
  };

  const pick = async (file: File | null) => {
    setMessage(null);
    if (!file) {
      clearPicked();
      return;
    }

    const smaller = await shrink(file);
    const problem = checkImage(smaller);
    if (problem) {
      setMessage({ kind: 'error', text: t(problem) });
      clearPicked();
      return;
    }

    const url = URL.createObjectURL(smaller);
    setPicked((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { file: smaller, url };
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      // FormData rather than an object: this carries a file, and a server
      // action takes one natively only this way.
      const form = new FormData();
      form.set('body', body);
      form.set('category', category);
      if (picked) form.set('image', picked.file);

      const res = await submitFeedbackAction(form);
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setBody('');
      clearPicked();
      setMessage({ kind: 'ok', text: t('feedback.thanks') });
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4"
    >
      <h3 className="text-lg font-semibold text-gray-900">{t('feedback.writeTitle')}</h3>

      {message && (
        <p
          className={`p-3 rounded-lg text-sm border ${
            message.kind === 'ok'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
          role="status"
        >
          {message.text}
        </p>
      )}

      {/* Radios rather than a select: three options are quicker to hit than to
          open, and on a phone a select is a modal wheel for no reason. */}
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t('feedback.category')}</legend>
        {FEEDBACK_CATEGORIES.map((value) => (
          <label
            key={value}
            className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition ${
              category === value
                ? 'bg-blue-600 border-blue-600 text-white font-medium'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="category"
              value={value}
              checked={category === value}
              onChange={() => setCategory(value)}
              className="sr-only"
            />
            {t(`feedback.category.${value}` as 'feedback.category.problem')}
          </label>
        ))}
      </fieldset>

      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={FEEDBACK_MAX_LENGTH}
          required
          placeholder={t('feedback.placeholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
        />
        {/* Only near the limit: a counter on an empty box is noise. */}
        {left < 200 && (
          <p className="text-xs text-gray-500 mt-1 text-right tabular-nums">{left}</p>
        )}
      </div>

      {/* A picture, because "this screen looks wrong" is a sentence that takes
          a paragraph to write and a screenshot to settle. */}
      <div>
        <input
          ref={fileInput}
          id="feedback-image"
          type="file"
          accept={IMAGE_TYPES.join(',')}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="sr-only"
        />

        {picked ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={picked.url}
              alt={picked.file.name}
              className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
            />
            <div className="min-w-0 text-sm">
              <p className="truncate text-gray-700">{picked.file.name}</p>
              <p className="text-xs text-gray-500 tabular-nums">
                {Math.round(picked.file.size / 1024)} KB
              </p>
              <button
                type="button"
                onClick={clearPicked}
                className="mt-1 text-xs text-red-700 hover:underline"
              >
                {t('feedback.removeImage')}
              </button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="feedback-image"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            {t('feedback.addImage')}
          </label>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending || !body.trim()}
        className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending && <Spinner className="h-4 w-4" />}
        {t('feedback.send')}
      </button>
    </form>
  );
}
