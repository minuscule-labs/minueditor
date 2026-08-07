import { useEffect, useState, type FormEvent } from 'react'
import type {
  EditorComment,
  EditorCommentAnchor,
  EditorCommentsConfig,
} from '../types'

interface CommentPanelProps {
  config: EditorCommentsConfig
  activeId: string | null
  activeGroupIds: readonly string[]
  draftAnchor: EditorCommentAnchor | null
  onSelect: (comment: EditorComment | null) => void
  onSelectWithinGroup: (comment: EditorComment) => void
  onDraftAnchor: (anchor: EditorCommentAnchor) => void
  onCancelDraft: () => void
}

export function CommentPanel({
  config,
  activeId,
  activeGroupIds,
  draftAnchor,
  onSelect,
  onSelectWithinGroup,
  onDraftAnchor,
  onCancelDraft,
}: CommentPanelProps) {
  const active = config.items.find((comment) => comment.id === activeId) ?? null
  const relatedComments = active && !active.anchor.detached
    ? config.items.filter((comment) => (
        comment.id !== active.id &&
        !comment.anchor.detached &&
        (
          activeGroupIds.includes(comment.id) ||
          (comment.anchor.from < active.anchor.to && comment.anchor.to > active.anchor.from)
        )
      ))
    : []
  const CommentTimestamp = ({ comment }: { comment: EditorComment }) => {
    const timestamp = comment.updatedAt ?? comment.createdAt
    if (!timestamp) return null
    const formatted = config.formatTimestamp?.(timestamp, comment)
      ?? (() => {
        const date = new Date(timestamp)
        return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
      })()
    return <> · <time dateTime={timestamp}>{formatted}</time></>
  }
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBody(active?.body ?? '')
    setError(null)
  }, [active?.body, active?.id, draftAnchor])

  async function run(action: () => void | Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Comment action failed')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const nextBody = body.trim()
    if (!nextBody) return

    if (draftAnchor && config.onCreate) {
      await run(async () => {
        const created = await config.onCreate?.({ body: nextBody, anchor: draftAnchor })
        onCancelDraft()
        if (created) onSelect(created)
        setBody('')
      })
      return
    }

    if (active && config.onUpdate && nextBody !== active.body) {
      await run(async () => {
        await config.onUpdate?.(active.id, { body: nextBody })
      })
    }
  }

  return (
    <aside className="me-comment-panel" aria-label="Comments">
      <header className="me-comment-panel__header">
        <strong>Comments</strong>
        {(active || draftAnchor) ? (
          <button
            type="button"
            className="me-comment-panel__close"
            aria-label="Close comment"
            onClick={() => {
              onCancelDraft()
              onSelect(null)
            }}
          >×</button>
        ) : null}
      </header>

      {draftAnchor ? (
        <form className="me-comment-panel__form" onSubmit={submit}>
          <blockquote className="me-comment-panel__quote">{draftAnchor.quote}</blockquote>
          <textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Leave a comment…"
            aria-label="Comment text"
            disabled={busy}
          />
          <div className="me-comment-panel__actions">
            <button type="button" onClick={onCancelDraft} disabled={busy}>Cancel</button>
            <button type="submit" disabled={busy || !body.trim() || !config.onCreate}>Comment</button>
          </div>
        </form>
      ) : active ? (
        <div className="me-comment-panel__body">
          <div className="me-comment-panel__meta">
            <span>
              {active.author?.name ?? active.author?.type ?? 'Comment'}
              <CommentTimestamp comment={active} />
            </span>
            <span>{active.status}</span>
          </div>
          {active.anchor.detached ? (
            <div className="me-comment-panel__detached" role="status">The commented text has changed or could not be reattached.</div>
          ) : (
            <blockquote className="me-comment-panel__quote">{active.anchor.quote}</blockquote>
          )}
          <form className="me-comment-panel__form" onSubmit={submit}>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-label="Comment text"
              disabled={busy}
            />
            <div className="me-comment-panel__actions">
              <button type="submit" disabled={busy || !body.trim() || body.trim() === active.body || !config.onUpdate}>Save</button>
              {config.onUpdate ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => config.onUpdate!(active.id, {
                    status: active.status === 'resolved' ? 'open' : 'resolved',
                  }))}
                >{active.status === 'resolved' ? 'Reopen' : 'Resolve'}</button>
              ) : null}
              {config.onDelete ? (
                <button
                  type="button"
                  className="me-comment-panel__delete"
                  disabled={busy}
                  onClick={() => run(async () => {
                    await config.onDelete!(active.id)
                    onSelect(null)
                  })}
                >Delete</button>
              ) : null}
            </div>
          </form>
          {relatedComments.length ? (
            <div className="me-comment-panel__related" aria-label="Other comments on this passage">
              <strong>Other comments on this passage</strong>
              {relatedComments.map((comment) => (
                <button type="button" key={comment.id} onClick={() => onSelectWithinGroup(comment)}>
                  <small>
                    {comment.author?.name ?? comment.author?.type ?? 'Comment'} · {comment.status}
                    <CommentTimestamp comment={comment} />
                  </small>
                  <span className="me-comment-panel__anchor-preview">{comment.anchor.quote}</span>
                  <span>{comment.body}</span>
                </button>
              ))}
            </div>
          ) : null}
          {config.onCreate && !active.anchor.detached ? (
            <button
              type="button"
              className="me-comment-panel__add-related"
              onClick={() => onDraftAnchor(active.anchor)}
            >Add another comment on this text</button>
          ) : null}
        </div>
      ) : (
        <div className="me-comment-panel__list">
          {config.items.length ? config.items.map((comment) => (
            <button
              type="button"
              key={comment.id}
              className="me-comment-panel__item"
              onClick={() => onSelect(comment)}
            >
              <small>
                {comment.author?.name ?? comment.author?.type ?? 'Comment'} ·{' '}
                {comment.anchor.detached ? 'Detached' : comment.status}
                <CommentTimestamp comment={comment} />
              </small>
              {!comment.anchor.detached ? (
                <span className="me-comment-panel__anchor-preview">{comment.anchor.quote}</span>
              ) : null}
              <span>{comment.body}</span>
            </button>
          )) : (
            <p>No comments yet. Select text to add one.</p>
          )}
        </div>
      )}

      {error ? <div className="me-comment-panel__error" role="alert">{error}</div> : null}
    </aside>
  )
}
