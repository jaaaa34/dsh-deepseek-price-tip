import assert from 'node:assert/strict'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(HERE, '..', 'data')

const SAMPLE_PAGE = `
| 模型  | deepseek-flash(1) | deepseek-v4-pro |
| 模型版本 | DeepSeek-V4.1-Flash-1017 | DeepSeek-V4-Pro-0813 |
| 价格(2) | 百万tokens输入  <br>（缓存命中） | 空闲时段 | 0.02元 | 0.15元 |
| 高峰时段 | 0.04元 | 0.30元 |
| 百万tokens输入  <br>（缓存未命中） | 空闲时段 | 1元  | 4.5元 |
| 高峰时段 | 2元  | 9.0元 |
| 百万tokens输出 | 空闲时段 | 4元  | 13.5元 |
| 高峰时段 | 8元  | 27.0元 |
| 并发限制(3) | 2500 | 500 |

(2) 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。
`

/**
 * Build the smallest Host context the plugin needs.
 * @returns {{ ctx: any, routes: Map<string, any>, tools: Map<string, any> }}
 */
function fakeContext() {
  const routes = new Map()
  const tools = new Map()
  const services = {
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route)
          return async () => {}
        },
      },
    },
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => {}
      },
    },
    web: {
      async fetch() {
        return {
          url: 'https://api-docs.deepseek.com/quick_start/pricing',
          statusCode: 200,
          body: { kind: 'text', content: SAMPLE_PAGE },
          truncated: false,
        }
      },
    },
  }
  const ctx = {
    logger: { warn() {} },
    get(name) {
      return services[name]
    },
    effect(callback) {
      const dispose = callback()
      return dispose
    },
    inject(deps, callback) {
      for (const dep of deps) if (!(dep in services)) return
      callback(ctx)
    },
  }
  return { ctx, routes, tools }
}

test('the Host half registers both routes and the agent tool', async () => {
  rmSync(DATA_DIR, { recursive: true, force: true })
  const { ctx, routes, tools } = fakeContext()
  apply(ctx, {})
  // Let the asynchronous cache read settle before touching the routes.
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.deepEqual([...routes.keys()].sort(), [
    '/api/deepseek-price-tip/refresh',
    '/api/deepseek-price-tip/status',
  ])
  assert.ok(tools.has('deepseek_price_tip'))

  const statusResponse = await routes.get('/api/deepseek-price-tip/status').fetch(
    new Request('http://localhost/api/deepseek-price-tip/status'),
  )
  const status = await statusResponse.json()
  assert.equal(status.ok, true)
  assert.equal(status.currency, 'CNY')
  assert.equal(status.models.length, 2)
  assert.equal(status.models[0].id, 'deepseek-flash')
  assert.ok(status.peakWindows.length >= 1)
  assert.ok(status.holiday.known)

  const tool = tools.get('deepseek_price_tip')
  const value = await tool.execute({ action: 'status' }, { signal: new AbortController().signal })
  const rendered = tool.output.render({ action: 'status' }, value)
  assert.equal(rendered[0].type, 'text')
  assert.match(rendered[0].text, /DeepSeek official API pricing/)
  assert.match(rendered[0].text, /deepseek-flash/)

  const refreshResponse = await routes.get('/api/deepseek-price-tip/refresh').fetch(
    new Request('http://localhost/api/deepseek-price-tip/refresh', { method: 'POST' }),
  )
  const refreshed = await refreshResponse.json()
  assert.equal(refreshed.refreshed, true)
  assert.equal(refreshed.source.origin, 'remote')
  assert.equal(refreshed.currency, 'CNY')
  assert.deepEqual(refreshed.models[1].cacheHit, { peak: 0.3, offPeak: 0.15 })

  rmSync(DATA_DIR, { recursive: true, force: true })
})

test('a refresh failure keeps the previous table and reports the reason', async () => {
  rmSync(DATA_DIR, { recursive: true, force: true })
  const realFetch = globalThis.fetch
  const { ctx, routes } = fakeContext()
  ctx.get('web').fetch = async () => {
    throw new Error('network down')
  }
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  try {
    apply(ctx, {})
    await new Promise((resolve) => setTimeout(resolve, 30))
    const response = await routes.get('/api/deepseek-price-tip/refresh').fetch(
      new Request('http://localhost/api/deepseek-price-tip/refresh', { method: 'POST' }),
    )
    const payload = await response.json()
    assert.equal(payload.refreshed, false)
    assert.match(payload.refreshError, /network down/)
    assert.equal(payload.models.length, 2)
    assert.match(payload.source.lastError.message, /network down/)
  } finally {
    globalThis.fetch = realFetch
    rmSync(DATA_DIR, { recursive: true, force: true })
  }
})
