"use client";

import { useEffect, useId, useRef } from "react";

export type Confirmation = { title: string; description: string; label: string; destructive?: boolean; onConfirm: () => void };

export function ConfirmAction({ confirmation, onCancel }: { confirmation: Confirmation | null; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (confirmation && !element?.open) element?.showModal();
    if (!confirmation && element?.open) element.close();
  }, [confirmation]);

  return <dialog ref={dialog} className="workspace-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={(event) => { event.preventDefault(); onCancel(); }}
    onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel(); } }}>
    <h2 id={titleId} className="dialog-heading">{confirmation?.title}</h2>
    <p id={descriptionId} className="dialog-description">{confirmation?.description}</p>
    <div className="dialog-actions">
      <button type="button" className="action secondary" autoFocus onClick={onCancel}>Отмена</button>
      <button type="button" className={`action ${confirmation?.destructive ? "danger" : "primary"}`} onClick={() => { const action = confirmation?.onConfirm; onCancel(); action?.(); }}>{confirmation?.label}</button>
    </div>
  </dialog>;
}
