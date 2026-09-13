import { h } from '../core/dom.js'
import { debounce } from '../core/scheduler.js'

export function row(label, control, { note, badges = [], stack = false } = {}) {
  return h('div', { class: ['row', stack && 'stack'] }, h('div', { class: 'label' }, label, ...badges, note && h('small', { text: note })), control)
}

export function badge(text, cls = '') {
  return h('span', { class: `badge ${cls}`, text })
}

export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'group' })
  for (const [val, label] of options) {
    const b = h('button', { type: 'button', 'data-mode': val, 'aria-pressed': String(val === value), text: label })
    b.addEventListener('click', () => {
      for (const x of wrap.children) x.setAttribute('aria-pressed', String(x === b))
      onChange(val)
    })
    wrap.append(b)
  }
  return wrap
}

export function toggle(checked, onChange) {
  const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': String(!!checked) })
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-checked') !== 'true'
    b.setAttribute('aria-checked', String(next))
    onChange(next)
  })
  return b
}

export function select(options, value, onChange) {
  const s = h('select', null, options.map(([v, l]) => h('option', { value: v, text: l, selected: v === value })))
  s.addEventListener('change', () => onChange(s.value))
  return s
}

export function range({ min, max, step = 1, unit = '', placeholder }, value, onChange) {
  const set = value !== undefined && value !== null && value !== ''
  const input = h('input', { type: 'range', min, max, step, value: set ? value : placeholder ?? min })
  const val = h('span', { class: ['val', set && 'set'], text: set ? `${value}${unit}` : 'auto' })
  const reset = h('button', { type: 'button', class: ['reset', set && 'on'], title: 'Zurücksetzen', text: '↺' })
  const push = debounce(() => onChange(Number(input.value)), 30, 120)
  input.addEventListener('input', () => {
    val.textContent = `${input.value}${unit}`
    val.classList.add('set')
    reset.classList.add('on')
    push()
  })
  reset.addEventListener('click', () => {
    input.value = placeholder ?? min
    val.textContent = 'auto'
    val.classList.remove('set')
    reset.classList.remove('on')
    onChange(null)
  })
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, input, val, reset)
}

export function color(value, fallback, onChange) {
  const input = h('input', { type: 'color', value: value || fallback || '#000000' })
  const reset = h('button', { type: 'button', class: ['reset', value && 'on'], title: 'Zurücksetzen', text: '↺' })
  const push = debounce(() => onChange(input.value), 40, 150)
  input.addEventListener('input', () => {
    reset.classList.add('on')
    push()
  })
  reset.addEventListener('click', () => {
    reset.classList.remove('on')
    input.value = fallback || '#000000'
    onChange(null)
  })
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, input, reset)
}

export function number(value, onChange, { min, max, step = 1, placeholder = '' } = {}) {
  const input = h('input', { type: 'number', min, max, step, placeholder, value: value ?? '' })
  const push = debounce(() => onChange(input.value === '' ? null : Number(input.value)), 300)
  input.addEventListener('input', push)
  return input
}

export function lines(values, onChange, placeholder = '') {
  const ta = h('textarea', { placeholder, spellcheck: 'false' })
  ta.value = (values || []).join('\n')
  const push = debounce(() => onChange(ta.value.split('\n').map((s) => s.trim()).filter(Boolean)), 500)
  ta.addEventListener('input', push)
  ta.addEventListener('blur', () => push.flush())
  return ta
}

export function textarea(value, onChange, placeholder = '') {
  const ta = h('textarea', { placeholder, spellcheck: 'false' })
  ta.value = value || ''
  const push = debounce(() => onChange(ta.value), 500)
  ta.addEventListener('input', push)
  ta.addEventListener('blur', () => push.flush())
  return ta
}

export function chips(options, values, onChange) {
  const cur = new Set(values)
  const wrap = h('div', { class: 'chips' })
  for (const [v, l] of options) {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(cur.has(v)), text: l })
    b.addEventListener('click', () => {
      if (cur.has(v)) cur.delete(v)
      else cur.add(v)
      b.setAttribute('aria-pressed', String(cur.has(v)))
      onChange(options.map(([x]) => x).filter((x) => cur.has(x)))
    })
    wrap.append(b)
  }
  return wrap
}

export function btn(label, onClick, cls = '') {
  const b = h('button', { type: 'button', class: `btn ${cls}`, text: label })
  b.addEventListener('click', onClick)
  return b
}

// generische einstellung aus feature manifest
export function settingControl(def, value, onChange) {
  switch (def.type) {
    case 'toggle':
      return toggle(value, onChange)
    case 'select':
      return select(def.options, value, onChange)
    case 'multi':
      return chips(def.options, value, onChange)
    case 'range':
      return range({ ...def, placeholder: def.default }, value, (v) => onChange(v ?? def.default))
    case 'text':
      return textarea(value, onChange)
    default:
      return h('span', { class: 'muted', text: String(value) })
  }
}
