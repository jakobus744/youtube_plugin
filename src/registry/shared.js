// seitenuebergreifende registry bausteine

export const SH = ['show', 'hide']
export const SDH = ['show', 'dim', 'hide']
export const SDC = ['show', 'dim', 'collapse']
export const SDCH = ['show', 'dim', 'collapse', 'hide']

export const MODE_LABELS = { show: 'Normal', dim: 'Dimmen', collapse: 'Einklappen', hide: 'Aus' }

export const attrName = (id) => `data-ytx-d-${id.replace(/\./g, '-')}`

export const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))
