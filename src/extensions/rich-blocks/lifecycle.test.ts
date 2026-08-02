import { describe, expect, it, vi } from 'vitest'
import { startAsyncBlockRender } from './lifecycle'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('async rich-block lifecycle', () => {
  it('applies the current render result', async () => {
    const apply = vi.fn()
    const fail = vi.fn()
    startAsyncBlockRender({
      render: async () => 'rendered',
      apply,
      fail,
    })

    await tick()
    expect(apply).toHaveBeenCalledWith('rendered')
    expect(fail).not.toHaveBeenCalled()
  })

  it('cancels stale results even when the renderer cannot abort its promise', async () => {
    const pending = deferred<string>()
    const apply = vi.fn()
    const fail = vi.fn()
    let signal: AbortSignal | null = null
    const cancel = startAsyncBlockRender({
      render: async (nextSignal) => {
        signal = nextSignal
        return pending.promise
      },
      apply,
      fail,
    })

    await tick()
    cancel()
    pending.resolve('stale')
    await tick()

    expect((signal as AbortSignal | null)?.aborted).toBe(true)
    expect(apply).not.toHaveBeenCalled()
    expect(fail).not.toHaveBeenCalled()
  })

  it('reports active render failures', async () => {
    const error = new Error('failed')
    const fail = vi.fn()
    startAsyncBlockRender({
      render: async () => { throw error },
      apply: vi.fn(),
      fail,
    })

    await tick()
    expect(fail).toHaveBeenCalledWith(error)
  })
})
