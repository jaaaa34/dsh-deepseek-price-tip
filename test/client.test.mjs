import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ReactStub = {
  createElement: () => null,
  Fragment: Symbol('Fragment'),
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useCallback: (callback) => callback,
  memo: (component) => component,
}

const ReactDOMStub = { createPortal: () => null }

const styleRecords = []

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      globalThis.__capturedDefinition = definition
    },
  },
}
globalThis.document = {
  createElement() {
    const record = {
      dataset: {},
      textContent: '',
      removed: false,
      remove() {
        this.removed = true
      },
    }
    styleRecords.push(record)
    return record
  },
  head: { appendChild() {} },
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
}

await import('../client.js')

test('the Client half registers one dock entry and both locale dictionaries', () => {
  const definition = globalThis.__capturedDefinition
  assert.equal(definition.id, '@local/deepseek-price-tip')

  const plugin = definition.factory((name) => {
    if (name === 'react') return ReactStub
    if (name === 'react-dom') return ReactDOMStub
    throw new Error(`unexpected module ${name}`)
  })
  assert.deepEqual(plugin.inject, ['slots', 'locale'])

  /** @type {Map<string, Record<string, string>>} */
  const dictionaries = new Map()
  /** @type {{ options: any, component: unknown } | null} */
  let registration = null
  const effects = []
  const ctx = {
    effect(callback) {
      const dispose = callback()
      effects.push(dispose)
      return dispose
    },
    locale: {
      register(_ns, locale, dictionary) {
        dictionaries.set(locale, dictionary)
        return () => {}
      },
    },
    slots: {
      inject(key, callback) {
        assert.equal(key, 'conversation.composer.dock')
        callback()
      },
      register(options, component) {
        registration = { options, component }
        return () => {}
      },
    },
  }

  plugin.apply(ctx)

  assert.deepEqual([...dictionaries.keys()].sort(), ['en', 'zh'])
  assert.ok(registration !== null)
  assert.equal(registration.options.id, 'deepseek-price-tip')
  assert.equal(registration.options.name, 'conversation.composer.dock')
  assert.equal(registration.options.locale, 'deepseekPriceTip')
  assert.equal(typeof registration.component, 'function')

  const zhKeys = Object.keys(dictionaries.get('zh')).sort()
  const enKeys = Object.keys(dictionaries.get('en')).sort()
  assert.deepEqual(zhKeys, enKeys)

  // Every literal t('key') in the module must exist in both dictionaries.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const used = new Set([...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1]))
  for (const key of used) {
    assert.ok(dictionaries.get('zh')[key] !== undefined, `missing zh key ${key}`)
    assert.ok(dictionaries.get('en')[key] !== undefined, `missing en key ${key}`)
  }
  for (const prefix of ['reason.', 'source.', 'day.', 'tier.']) {
    assert.ok(zhKeys.some((key) => key.startsWith(prefix)), `missing ${prefix}* keys`)
  }
  for (const key of ['panel.unit.CNY', 'panel.unit.USD']) {
    assert.ok(dictionaries.get('zh')[key] !== undefined, `missing zh key ${key}`)
    assert.ok(dictionaries.get('en')[key] !== undefined, `missing en key ${key}`)
  }

  // Regression: the discount line rendered "50%%" because the formatter
  // appended "%" and the locale template appended it a second time. The
  // template owns the sign; the formatter returns a bare integer.
  for (const locale of ['zh', 'en']) {
    const template = dictionaries.get(locale)['panel.discount']
    assert.equal(template.split('{percent}').length - 1, 1, `${locale} uses {percent} exactly once`)
    assert.equal(template.split('%').length - 1, 1, `${locale} template keeps exactly one %`)
  }
  const formatter = source.match(/function formatPercent\(discount\) \{\s*return ([^\n]+)/)
  assert.ok(formatter !== null, 'formatPercent is present')
  assert.equal(formatter[1].includes('%'), false, 'formatPercent must not append a percent sign')

  // The style effect owns its cleanup.
  const styleDispose = effects[0]
  assert.equal(typeof styleDispose, 'function')
  styleDispose()
  assert.equal(styleRecords[0].removed, true)
})
