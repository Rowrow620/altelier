import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../errors';

export function SaveProfileDialog({ name, onSave, onClose }: {
  name: string;
  onSave: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    input.current.select();
    return () => element.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby="save-profile-heading"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="fixed inset-0 m-auto w-[calc(100%-3rem)] max-w-sm rounded-xl border border-line bg-panel p-5 text-white backdrop:bg-black/80">
      <form className="space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          await onSave(value);
          onClose();
        } catch (cause) {
          setError(errorMessage(cause, 'Could not save the profile.'));
        } finally {
          setBusy(false);
        }
      }}>
        <h2 id="save-profile-heading" className="text-lg font-semibold">Save profile</h2>
        <label className="grid gap-1.5 text-sm text-muted">
          Profile name
          <input ref={input} value={value} onChange={(event) => setValue(event.target.value)}
            maxLength={100} required disabled={busy} className="ui-field select-text" />
        </label>
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="ui-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ui-button ui-button--primary" disabled={busy || !value.trim()}>Save</button>
        </div>
      </form>
    </dialog>
  );
}
