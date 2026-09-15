// anfragen an externe dienste nur ueber den userscript manager
// die seite selbst darf wegen csp nicht nach aussen

export function hasGmRequest() {
  return typeof GM_xmlhttpRequest === 'function'
}

export function gmJson(url, { method = 'GET', headers = {}, body = null, timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!hasGmRequest()) return reject(new Error('GM_xmlhttpRequest nicht verfügbar'))
    GM_xmlhttpRequest({
      url,
      method,
      headers,
      data: body,
      timeout,
      responseType: 'json',
      onload: (r) => {
        if (r.status < 200 || r.status >= 300) return reject(new Error(`HTTP ${r.status}`))
        try {
          resolve(typeof r.response === 'object' && r.response ? r.response : JSON.parse(r.responseText))
        } catch (e) {
          reject(e)
        }
      },
      onerror: () => reject(new Error('Netzwerkfehler')),
      ontimeout: () => reject(new Error('Zeitüberschreitung'))
    })
  })
}
