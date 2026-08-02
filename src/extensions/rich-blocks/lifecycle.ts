export type AsyncBlockRenderOptions<T> = {
  render: (signal: AbortSignal) => Promise<T>
  apply: (result: T) => void
  fail: (error: unknown) => void
}

/**
 * Run one cancellable async rich-block render. The underlying renderer may not
 * support AbortSignal, but stale results are never applied after cancellation.
 */
export function startAsyncBlockRender<T>(options: AsyncBlockRenderOptions<T>): () => void {
  const controller = new AbortController()
  let active = true

  void Promise.resolve()
    .then(() => options.render(controller.signal))
    .then((result) => {
      if (!active || controller.signal.aborted) return
      options.apply(result)
    })
    .catch((error: unknown) => {
      if (!active || controller.signal.aborted) return
      options.fail(error)
    })

  return () => {
    active = false
    controller.abort()
  }
}
